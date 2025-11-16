const { chatWithAIStreaming, generateDescriptionFromPrompt } = require("../service/aiService");

exports.chat = async (req, res) => {
  const { message, model } = req.body;
  if (!message) return res.status(400).send("Message is required");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");

  try {
    await chatWithAIStreaming(
      message,
      (chunk) => res.write(chunk),
      model
    );
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Lỗi server AI");
  }
};

/**
 * POST /api/ai/generate-contract
 * Body: { prompt: string, model?: string }
 * Returns: { result: string }
 */
exports.generateContract = async (req, res) => {
  const { prompt, model } = req.body;
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ message: 'Prompt is required' });
  }

  try {
    const description = await generateDescriptionFromPrompt(prompt, model);
    return res.status(200).json({ result: description });
  } catch (err) {
    console.error('[AI GENERATE CONTRACT ERROR]', err);
    return res.status(500).json({ message: 'Lỗi khi tạo hợp đồng bằng AI' });
  }
};
