// services/aiService.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const chatWithAIStreaming = async (systemPrompt, userMessage, onChunk, model = "gemini-2.5-flash-lite") => {
  if (!systemPrompt || !userMessage) {
    throw new Error("Thiếu systemPrompt hoặc userMessage");
  }

  const modelInstance = genAI.getGenerativeModel({ model });

  const contents = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "user", parts: [{ text: userMessage }] }
  ];

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const result = await modelInstance.generateContentStream({ contents });

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) onChunk(text);
      }

      return;

    } catch (err) {
      console.error(`❌ Gemini API Stream error attempt ${attempt + 1}:`, err);


      if (err.status === 503 && attempt < maxRetries - 1) {
        console.warn(`⚠️ Gemini quá tải → Thử lại (${attempt + 1}/${maxRetries})...`);
        await new Promise((res) => setTimeout(res, 1500));
        attempt++;
        continue;
      }

      throw new Error("Lỗi khi gọi Gemini API");
    }
  }
};

module.exports = { chatWithAIStreaming };
