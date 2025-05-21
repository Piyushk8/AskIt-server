
# 📚 AskIT

**AskIT PDF** is an AI-powered document Q\&A system that allows users to upload PDF documents and interact with them in natural language. It uses Google's Gemini models, LangChain, and Qdrant to provide highly contextual answers, backed by relevant document sources.

---
## Demo video

https://github.com/user-attachments/assets/0ab8fe3e-3e1a-4e53-8056-5ee9eaec1d4e



## 💪 Features

* **Natural Language Q\&A**: Chat with your PDF using simple, everyday language.
* **Retrieval-Augmented Generation (RAG)**: Ensures relevant answers by combining vector similarity search with LLM responses.
* **Source Citations**: Highlights which part of the PDF was used for each response.
* **Session-based Conversations**: Each chat is tied to a unique session, ensuring scoped responses.
* **Job Queue with Status Polling**: Processes large PDFs asynchronously and tracks progress.
* **Multi-page Support**: Upload and query documents with many pages.
* **Clean UI/UX**: Built with Next.js and Tailwind for modern frontend experience.

---

## 🤖 Tech Stack

### Backend

* **Node.js + Express**: REST API server
* **BullMQ + Redis**: Job queue to manage background PDF processing
* **LangChain**: Manages document loading, text splitting, and embeddings
* **Qdrant**: Vector database for similarity search
* **Gemini Flash 2.0**: Google LLM for question answering

### Frontend

* **Next.js (React)**: SPA for document upload and chatting
* **Tailwind CSS**: For styling
* **Axios**: For API communication

---

## 📂 Folder Structure

```bash
/backend
  |- index.js              # Express server
  |- gemini.js             # Embedding + chat with Gemini
  |- queue.js              # BullMQ job config
  |- worker.js             # PDF processing jobs
  |- utils/
      |- cleanup.js        # Auto-deletes uploaded PDFs after processing

/frontend
  |- app/
      |- upload.tsx        # Upload page
      |- chat/[sessionId]  # Session-based chat interface
  |- components/
      |- Message.tsx       # Renders user/assistant messages
```

---

## 🚜 How it Works

1. **User Uploads PDF**:

   * File is sent to backend and enqueued in BullMQ.

2. **Background Processing**:

   * PDF is loaded, split into overlapping chunks.
   * Gemini generates embeddings which are stored in Qdrant.

3. **Job Status Polling**:

   * Frontend polls `/status/:sessionId` until processing is done.

4. **Ask Questions**:

   * Frontend sends questions to `/ask/:sessionId`.
   * Most relevant chunks are retrieved from Qdrant.
   * Gemini generates a final response using retrieved context.

5. **Cleanup**:

   * Processed PDF files are removed automatically to save space.

---

## 🚀 Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/your-username/Askit.git
```

### 2. Install Dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3. Start Redis (Docker recommended)

```bash
docker run -p 6379:6379 redis
```

### 4. Start Backend

```bash
cd backend
node index.js
```

### 5. Start Frontend

```bash
cd frontend
npm run dev
```

---

## 📅 Roadmap

* [x] Single PDF session chat
* [ ] Multi-document chat
* [ ] File type support (e.g. DOCX)
* [ ] User authentication and session tracking
* [ ] PDF download of chat transcript

---
