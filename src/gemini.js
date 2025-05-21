import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

//! Chat model (Gemini Pro)  without history
// export const chatModel = async (prompt) => {
//   const response = await genAI.models.generateContent({
//     model: "gemini-2.0-flash",
//     contents: prompt,
//   });
//   return response.text;
// };
const chat = genAI.chats.create({
  model: "gemini-2.0-flash",
  history: [],
});

export const chatModel = async (prompt, history = []) => {
  try {
    const result = await chat.sendMessage({ message: prompt });
    return {
      text: result.text,
      history: chat.getHistory(), // Return updated history
    };
  } catch (error) {
    console.error("Error in chat model:", error);
    throw error;
  }
};

//  Batch embedding
export async function embedText(text) {
  const response = await genAI.models.embedContent({
    model: "gemini-embedding-exp-03-07",
    contents: text,
    config: {
      taskType: "SEMANTIC_SIMILARITY",
    },
  });
  // console.log("embeddingResponse", response.embeddings[0].values);
  return response.embeddings[0].values;
}
