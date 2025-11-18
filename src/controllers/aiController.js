const { chatWithAIStreaming, generateDescriptionFromPrompt } = require("../service/aiService");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const fetch = require("node-fetch");
const { buildAIContext } = require("../controllers/aiDataController");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// =========================
// STREAMING CHAT
// =========================
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
}

// =========================
// SENTIMENT ANALYSIS
// =========================
exports.analyzeSentiment = async (req, res) => {
  try {
    const { reviews } = req.body;

    if (!reviews || reviews.length === 0) {
      return res.status(400).json({ error: "Không có đánh giá nào được cung cấp." });
    }

    const combinedText = reviews.join("\n");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
    Bạn là một trợ lý phân tích cảm xúc (AI Sentiment Assistant).
    Nhiệm vụ của bạn là phân tích các đánh giá của người thuê về phòng trọ.
    - Với mỗi đánh giá, hãy xác định cảm xúc: Tích cực, Trung lập, hoặc Tiêu cực.
    - Sau đó, hãy tổng hợp tỉ lệ phần trăm của từng loại cảm xúc.
    - Cuối cùng, viết một đoạn tóm tắt ngắn (bằng tiếng Việt) mô tả những điểm người dùng khen và chê.

    Hãy trả lời bằng tiếng Việt, văn phong tự nhiên, dễ hiểu.

    Danh sách đánh giá:
    ${combinedText}
    `;
    const result = await model.generateContent(prompt);
    const output = result.response.text();

    res.json({ summary: output });
  } catch (error) {
    console.error("Sentiment analysis error:", error);
    res.status(500).json({ error: "Phân tích cảm xúc thất bại" });
  }
};

// =========================
// SIMPLE RECOMMENDATION
// =========================
exports.recommendSimple = async (req, res) => {
  try {
    const { filters, rooms } = req.body;

    if (!rooms || !Array.isArray(rooms) || rooms.length === 0) {
      return res.status(400).json({ error: "No rooms provided" });
    }

    const smallRooms = rooms.map(r => ({
      id: r._id || r.id,
      name: r.name || "",
      price: r.price || 0,
      district: r.location?.district || "",
      address: r.location?.addressDetail || "",
      amenities: Array.isArray(r.amenities) ? r.amenities : [],
      rating: r.rating || 0,
      summary: r.description ? r.description.slice(0, 200) : ""
    }));

    const prompt = `
Bạn là một trợ lý AI gợi ý phòng trọ. 
Dựa vào bộ lọc người dùng và danh sách phòng dưới đây, hãy chọn ra **3 phòng phù hợp nhất** (nếu có) theo thứ tự ưu tiên.

Quy tắc:
- Chỉ dựa vào thông tin trong "filters" và "rooms".
- Ưu tiên phòng thỏa yêu cầu giá (price) và vị trí (district) nếu filters có.
- Nếu nhiều phòng cùng phù hợp, ưu tiên rating cao hơn và giá rẻ hơn.
- Kết quả **phải trả về đúng JSON** (một mảng) với cấu trúc:
[ { "id": "<room id>", "reason": "<lý do ngắn (tiếng Việt)>" } ]
Không kèm bình luận khác, chỉ in JSON.

Filters:
${JSON.stringify(filters || {}, null, 2)}

Rooms (một số trường rút gọn):
${JSON.stringify(smallRooms, null, 2)}
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    let recommended;

    try {
      recommended = JSON.parse(text);
      if (!Array.isArray(recommended)) throw new Error("Not array");
    } catch {
      const jsonMatch = text.match(/\[.*\]/s);
      if (jsonMatch) {
        recommended = JSON.parse(jsonMatch[0]);
      } else {
        console.error("AI recommend output:", text);
        return res.status(500).json({ error: "AI returned non-JSON result" });
      }
    }

    return res.json({ recommended });
  } catch (err) {
    console.error("recommendSimple error:", err);
    res.status(500).json({ error: "Recommendation failed" });
  }
};

// =========================
// NEARBY PLACES
// =========================
exports.nearbyPlaces = async (req, res) => {
  const { lat, lng, keyword } = req.query;
  if (!lat || !lng || !keyword) return res.json([]);

  try {
    const apiKey = process.env.GEOAPIFY_KEY;
    const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(
      keyword
    )}&filter=circle:${lng},${lat},20000&limit=20&apiKey=${apiKey}`;

    const response = await axios.get(url);
    const data = response.data;

    const places = (data.features || []).map((f) => ({
      name: f.properties.name || f.properties.fclass || "Unknown",
      lat: f.properties.lat,
      lng: f.properties.lon,
    }));

    console.log("Fetched nearby places:", places);
    res.json(places);
  } catch (err) {
    console.error("Nearby Places Error:", err);
    res.status(500).json([]);
  }
};

// =========================
// ROUTE FROM -> TO
// =========================
exports.route = async (req, res) => {
  const { fromLat, fromLng, toLat, toLng } = req.query;
  if (!fromLat || !fromLng || !toLat || !toLng)
    return res.status(400).json({ error: "fromLat/fromLng/toLat/toLng required" });

  try {
    const apiKey = process.env.GEOAPIFY_KEY;
    const url = `https://api.geoapify.com/v1/routing?waypoints=${fromLat},${fromLng}|${toLat},${toLng}&mode=walk&apiKey=${apiKey}`;

    const response = await axios.get(url);
    const data = response.data;

    // Lấy coordinates cho Polyline
    const routeCoords =
      data.features?.[0]?.geometry?.coordinates?.map(([lon, lat]) => [lat, lon]) || [];

    res.json({
      features: [
        {
          geometry: { coordinates: routeCoords },
        },
      ],
    });
  } catch (err) {
    console.error("Route Error:", err);
    res.status(500).json({ features: [] });
  }
};


// =========================
// OPTIONAL: GOOGLE PLACES (fallback nếu muốn)
// =========================
exports.getLocation = async (req, res) => {
  const { lat, lng, type } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: "lat/lng required" });

  try {
    const radius = 2000; // 2 km
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json`,
      {
        params: {
          key: process.env.GOOGLE_PLACES_KEY,
          location: `${lat},${lng}`,
          radius,
          type: type || "supermarket",
          language: "vi"
        },
      }
    );

    res.json(response.data.results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

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

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY không được cấu hình trong .env');
    }

    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await axios.post(
      GEMINI_API_URL,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );

    const candidates = response.data?.candidates;
    if (candidates && candidates.length > 0) {
      const content = candidates[0]?.content;
      const output = content?.parts?.[0]?.text;
      
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
