// services/aiService.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Chat với Gemini Pro và streaming phản hồi
 * @param {string} message - Tin nhắn của người dùng
 * @param {function} onChunk - Callback được gọi với mỗi chunk phản hồi
 * @param {string} model - Tên mô hình
 */
const chatWithAIStreaming = async (message, onChunk, model = "gemini-2.5-flash") => {
  try {
    const modelInstance = genAI.getGenerativeModel({ model });
    const result = await modelInstance.generateContentStream(message);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        onChunk(chunkText);
      }
    }
  } catch (err) {
    console.error("Gemini API stream error:", err);
    throw new Error("Lỗi khi gọi Gemini API");
  }
};

module.exports = { chatWithAIStreaming };
