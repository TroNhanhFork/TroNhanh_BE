const { chatWithAIStreaming } = require("../service/aiService");
const { buildAIContext } = require("./aiDataController");

exports.chat = async (req, res) => {
  const { message } = req.body;
  const user = req.user;
console.log("User info:", req.user);
const role = req.user?.role || "guest";
console.log("Determined role:", role);

  if (!message) return res.status(400).send("Message is required");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");

  try {
    // 🧠 Tách phần xử lý dữ liệu sang aiDataController
    const promptContext = await buildAIContext(role, user, message);
const systemRule = `
Bạn là AI của hệ thống Trọ Nhanh.
Bạn *tuyệt đối không được bịa*.
Chỉ trả lời dựa trên dữ liệu được truyền vào.
Nếu không có dữ liệu ⇒ phải nói “Không tìm thấy dữ liệu phù hợp”.
`;



    // 🎯 Gọi AI sinh phản hồi
    await chatWithAIStreaming(systemRule + "\n" + promptContext, message, (chunk) =>
      res.write(chunk)
    );

    res.end();
  } catch (err) {
    console.error("AI Chat error:", err);
    res.status(500).send("Lỗi server AI");
  }
};