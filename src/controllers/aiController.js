const { chatWithAIStreaming } = require("../service/aiService");
const axios = require('axios');

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

exports.generateBoardingHouseDescription = async (req, res) => {
  try {
    const { name, location, rooms, amenities } = req.body;

    const roomsInfo = rooms && rooms.length > 0 
      ? rooms.map((r, idx) => `- Phòng ${r.roomNumber || idx + 1}: Diện tích ${r.area || 'N/A'}m², Giá ${r.price ? Number(r.price).toLocaleString() : 'N/A'} VND/tháng, Sức chứa ${r.capacity || 'N/A'} người`).join('\n')
      : 'Chưa có thông tin phòng';

    const amenitiesInfo = amenities && amenities.length > 0
      ? amenities.join(', ')
      : 'Chưa có thông tin tiện nghi';

    const locationInfo = location 
      ? `${location.street || ''}${location.street ? ', ' : ''}${location.district || ''}${location.district ? ', ' : ''}${location.city || ''}`
      : 'Chưa có địa chỉ cụ thể';

    const prompt = `Bạn là một chuyên viên marketing bất động sản chuyên nghiệp. Hãy viết một bài giới thiệu nhà trọ hấp dẫn, văn chương và chi tiết dựa trên thông tin sau:

Tên nhà trọ: ${name || 'N/A'}
Địa chỉ: ${locationInfo}

Thông tin phòng:
${roomsInfo}

Tiện nghi:
${amenitiesInfo}

Yêu cầu:
1. Viết một đoạn mô tả dài từ 150-250 từ
2. Sử dụng ngôn ngữ thu hút, chân thành và chuyên nghiệp
3. Nhấn mạnh vào vị trí thuận lợi, tiện nghi hiện đại và không gian sống thoải mái
4. Tạo cảm giác ấm cúng, an toàn cho người thuê
5. Kết thúc bằng lời mời chào đến tham quan
6. Viết bằng tiếng Việt, văn phong tự nhiên, không quá hoa mỹ
7. Không sử dụng markdown, không xuống dòng quá nhiều
8. Tập trung vào lợi ích thực tế cho người thuê

Hãy viết mô tả:`;

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyD2GrsL_-3A0tlHSj4YzOVHHgLIxVIZHqs';
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/text-bison-001:generateText?key=${GEMINI_API_KEY}`;

    const response = await axios.post(
      GEMINI_API_URL,
      {
        prompt: {
          text: prompt
        },
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 512
      },
      {
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );

    const candidates = response.data?.candidates;
    if (candidates && candidates.length > 0) {
      const output = candidates[0].output || candidates[0].content?.[0]?.text || candidates[0].content?.parts?.[0]?.text;
      if (output) {
        return res.status(200).json({ description: output.trim() });
      }
    }

    throw new Error('Không nhận được phản hồi hợp lệ từ API');
  } catch (error) {
    console.error('Error generating description:', error);
    res.status(500).json({
      message: error.response?.data?.error?.message || 'Không thể tạo mô tả. Vui lòng thử lại sau.'
    });
  }
};
