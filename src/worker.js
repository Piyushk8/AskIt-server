import { tryCatch, Worker } from "bullmq";
import { QdrantVectorStore } from "@langchain/qdrant";
import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";
import { embedText } from "./gemini.js";

export class GeminiEmbeddings {
  constructor() {
    this.requestQueue = [];
    this.processing = false;
    this.maxRetries = 5;
    this.baseDelay = 1000; // Base delay in ms before retrying
  }

  // Helper to sleep
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Rate-limited embedding with retries
  async rateLimitedEmbed(text) {
    let retries = 0;

    while (retries <= this.maxRetries) {
      try {
        return await embedText(text);
      } catch (error) {
        if (
          error.toString().includes("429") ||
          error.toString().includes("RESOURCE_EXHAUSTED")
        ) {
          retries++;
          // Exponential backoff with jitter
          const delay =
            this.baseDelay * Math.pow(2, retries) + Math.random() * 1000;
          console.log(
            `Rate limited. Retrying in ${Math.round(
              delay / 1000
            )} seconds (attempt ${retries}/${this.maxRetries})`
          );
          await this.sleep(delay);
        } else {
          // For other errors, throw immediately
          throw error;
        }
      }
    }

    throw new Error(
      `Failed to embed text after ${this.maxRetries} retries due to rate limiting`
    );
  }

  // This is the method LangChain expects for embedding documents
  async embedDocuments(documents) {
    // Process one document at a time with rate limiting
    const results = [];
    for (const doc of documents) {
      // Add a small delay between requests to respect rate limits
      await this.sleep(200);
      results.push(await this.rateLimitedEmbed(doc));
    }
    return results;
  }

  // This is the method for embedding a single query
  async embedQuery(text) {
    return this.rateLimitedEmbed(text);
  }
}

const worker = new Worker(
  "file-upload-queue",
  async (job) => {
    try {
      console.log(`Job: ${job.id} started`, job.data);
      const data = job.data;

      // await new Promise((resolve) => setTimeout(resolve, 20000));
      // console.log("processing done")
      const loader = new PDFLoader(data.path);
      const docs = await loader.load();

      const textSplitter = new CharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const splitDocs = await textSplitter.splitDocuments(docs);
      console.log(`Document split into ${splitDocs.length} chunks`);

      const embeddings = new GeminiEmbeddings();

      const vectorStore = await QdrantVectorStore.fromExistingCollection(
        embeddings,
        {
          url: "http://localhost:6333",
          collectionName: `Collection_${data?.sessionId}`,
        }
      );

      const batchSize = 1; //To Process one document at a time
      let successCount = 0;

      for (let i = 0; i < splitDocs.length; i += batchSize) {
        try {
          const batch = splitDocs.slice(i, i + batchSize);
          await vectorStore.addDocuments(batch);
          successCount += batch.length;
          console.log(
            `Added batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
              splitDocs.length / batchSize
            )}, processed ${successCount}/${splitDocs.length} documents`
          );

          // Adding a pause between batches
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.error(
            `Error processing batch starting at index ${i}:`,
            error
          );
        }
      }

      console.log(
        `Job ${job.id} completed. Successfully added ${successCount} out of ${splitDocs.length} documents to vector store`
      );
      return {
        success: true,
        processedCount: successCount,
        totalCount: splitDocs.length,
      };
    } catch (error) {
      console.error("Error in job execution:", error);
      throw error;
    }
  },
  {
    concurrency: 1,
    connection: {
      host: "localhost",
      port: "6379",
    },
  }
);

// Handle worker events
worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed with error:`, err);
});

console.log("Worker started and listening for jobs...");
