import { chatModel, embedText } from "./gemini.js";
import express from "express";
import cors from "cors";
import multer from "multer";
import { Queue } from "bullmq";
import { QdrantVectorStore } from "@langchain/qdrant";
import { GeminiEmbeddings } from "./worker.js";
import { v4 as uuidv4 } from "uuid";
const queue = new Queue("file-upload-queue", {
  connection: {
    host: process.env.QueueHost,
    port: process.env.QueuePort,
  },
});
const session = new Map();
const formatDocsAsContext = (docs) => {
  return docs
    .map((doc, idx) => {
      return `Source ${idx + 1} (${
        doc.metadata?.source || "unknown"
      }):\n${doc.pageContent.trim()}`;
    })
    .join("\n\n");
};

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, "src/uploads/"),
  filename: (_, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (_, file, cb) => {
    if (
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/doc"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only PDFs/docs are allowed"));
    }
  },
});

export const app = express();
app.use(
  cors({
    origin: [process.env.Client_Url],
    credentials: true,
  })
);

app.get("/", (_, res) => res.json({ status: "All Good!" }));

app.post("/upload/pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, error: "No file uploaded" });
    }
    const sessionId = uuidv4();

    const job = await queue.add("file-ready", {
      sessionId,
      filename: req.file.originalname,
      destination: req.file.destination,
      path: req.file.path,
    });
    session.set(sessionId, job?.id);
    return res.json({ success: true, message: "uploaded", sessionId });
  } catch (error) {
    console.error("Error uploading file:", error);
    return res.status(500).json({ error: "Failed to upload file" });
  }
});

// app.get("/chat", async (req, res) => {
//   try {
//     const userQuery = req.query.message;

//     if (!userQuery || typeof userQuery !== "string") {
//       return res
//         .status(400)
//         .json({ error: "Missing or invalid query message" });
//     }

//     // 1. Initialize GeminiEmbeddings properly
//     const embeddings = new GeminiEmbeddings();

//     // 2. Qdrant retriever
//     const vectorStore = await QdrantVectorStore.fromExistingCollection(
//       embeddings,
//       {
//         url: "http://localhost:6333",
//         collectionName: "gemini-embeddings",
//       }
//     );

//     // 3. Perform similarity search
//     const docsWithScores = await vectorStore.similaritySearch(userQuery, 3);
//     // console.log(`Found ${docsWithScores.length} relevant documents`);

//     // 4. Truncate docs if too long
//     const maxDocLength = 1000; // Adjust based on model token limit
//     const truncatedDocs = docsWithScores.map((doc, i) => {
//       if (doc.pageContent.length > maxDocLength) {
//         return {
//           ...doc,
//           pageContent: doc.pageContent.substring(0, maxDocLength) + "...",
//         };
//       }
//       return doc;
//     });

//     // 5. Format context for the prompt
//     const context = truncatedDocs
//       .map((doc, i) => `[Document ${i + 1}]\n${doc.pageContent}`)
//       .join("\n\n");

//     // 6. Create the prompt
//     const SYSTEM_PROMPT = `
//     You are a helpful assistant. Answer the user's question based on this context:

//     ${context}

//     User Question: ${userQuery}
//     Instructions:
// 1. Primarily use the provided documents to answer
// 2. You may use your general knowledge to provide context and clarification
// 3. Clearly indicate when you're extrapolating beyond the documents
// 4. Cite sources where appropriate
//     `;

//     const response = await chatModel(SYSTEM_PROMPT);
//     const answer = response;
// // const docs = await .search("summarize entire PDF thoroughly", k=20);
// // const prompt = `You are a helpful assistant. Summarize this document:\n\n${docs.map(d => d.chunk).join("\n\n")}`;
// // const answer = await chatModel(prompt);

//     return res.json({
//       success: true,
//       message: answer,
//       // sources: truncatedDocs.map((doc) => ({
//       //   content: doc.pageContent,
//       //   metadata: doc.metadata,
//       // })),
//     });
//   } catch (error) {
//     console.error("Error in /chat endpoint:", error);
//     return res.status(500).json({ error: "Failed to process chat request" });
//   }
// });

const sessions = new Map();

app.post("/ask/:sessionId", async (req, res) => {
  try {
    const userQuery = req.body.message;
    const sessionId = req.params.sessionId;
    //!to be implemented
    // let sessionId = undefined;
    if (!sessionId) {
      sessionId = uuidv4(); // Generate new session ID
    }

    if (!userQuery || typeof userQuery !== "string") {
      return res
        .status(400)
        .json({ error: "Missing or invalid query message" });
    }

    // Get or initialize session history
    let history = sessions.get(sessionId) || [];

    // Retrieve relevant documents
    const embeddings = new GeminiEmbeddings();
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: process.env.Qdrant_DB_URL,
        collectionName: `Collection_${sessionId}`,
      }
    );

    const docsWithScores = await vectorStore.similaritySearch(userQuery, 3);

    const maxDocLength = 1000;
    const truncatedDocs = docsWithScores.map((doc) => {
      if (doc.pageContent.length > maxDocLength) {
        return {
          ...doc,
          pageContent: doc.pageContent.substring(0, maxDocLength) + "...",
        };
      }
      return doc;
    });

    const context = truncatedDocs
      .map((doc, i) => `${doc.pageContent}`)
      .join("\n\n");

    if (history.length === 0) {
      history.push({
        role: "system",
        parts: [
          {
            text: `You are a helpful assistant. Answer questions based on the provided documents.
          Always cite sources where appropriate and clearly indicate when you're extrapolating beyond the documents.`,
          },
        ],
      });
    }

    const prompt = `I want you to answer my question based on this context:
    
    ${context}
    
    My question is: ${userQuery}`;

    const response = await chatModel(prompt, history);

    sessions.set(sessionId, response.history);

    res.cookie("sessionId", sessionId, {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
    });

    return res.json({
      success: true,
      message: response.text,
      sessionId: sessionId,
    });
  } catch (error) {
    console.error("Error in /chat endpoint:", error);
    return res.status(500).json({ error: "Failed to process chat request" });
  }
});

app.get("/job/status/:sessionId", async (req, res) => {
  const {sessionId } = req.params;
  const jobId = session.get(sessionId);
  const job = await queue.getJob(jobId);
  console.log(sessionId,jobId,job)
  if (!job) return res.status(404).json({ status: "not_found" });

  const state = await job.getState(); // "waiting", "active", "completed", "failed"
  res.json({ status: state });
});

app.listen(8000, () =>
  console.log(`🚀 Server started on http://localhost:8000`)
);
