// src/utils/buildAIContext.js
const BoardingHouse = require("../models/BoardingHouse");
const Review = require("../models/Reviews");
const Room = require("../models/Room");
const Booking = require("../models/Booking");
const MemberShip = require("../models/Membership");
const Favorite = require("../models/Favorite");
const Report = require("../models/Report");
const User = require("../models/User");
const { default: mongoose } = require("mongoose"); // Cần import mongoose để dùng _id

exports.buildAIContext = async (role, user, message) => {
  let promptContext = "";
  const lowerMsg = message.toLowerCase();  // ============================ Helper (TỐI ƯU) ============================
  /**
   * TỐI ƯU: Dùng 1 câu aggregation thay vì 1 + 2N câu query.
   * Lấy top nhà trọ (đã duyệt) có đánh giá, tính avgRating và số phòng trống.
   */

  const getTopRatedHouses = async (limit = 5) => {
    const pipeline = [
      // 1. Chỉ lấy trọ đã duyệt
      { $match: { approvedStatus: "approved" } }, // 2. "Join" với bảng Reviews
      {
        $lookup: {
          from: "reviews", // Tên collection "reviews"
          localField: "_id",
          foreignField: "boardingHouseId",
          as: "reviews",
        },
      }, // 3. "Join" với bảng Rooms
      {
        $lookup: {
          from: "rooms", // Tên collection "rooms"
          localField: "_id",
          foreignField: "boardingHouseId",
          as: "rooms",
        },
      }, // 4. Chỉ giữ lại nhà trọ có ít nhất 1 review (giống logic cũ)
      { $match: { "reviews.0": { $exists: true } } }, // 5. Thêm trường avgRating và availableRooms
      {
        $addFields: {
          avgRating: { $avg: "$reviews.rating" },
          availableRooms: {
            $size: {
              $filter: {
                input: "$rooms",
                as: "room",
                cond: { $eq: ["$$room.status", "Available"] },
              },
            },
          },
        },
      }, // 6. Sắp xếp theo rating giảm dần
      { $sort: { avgRating: -1 } }, // 7. Giới hạn số lượng
      { $limit: limit }, // 8. Xóa các mảng lớn không cần thiết
      { $project: { reviews: 0, rooms: 0 } },
    ];

    const housesWithRating = await BoardingHouse.aggregate(pipeline).exec(); // .toFixed(1) phải làm ở JS sau khi query

    return housesWithRating.map((h) => ({
      ...h,
      avgRating: h.avgRating.toFixed(1),
    }));
  };

  const getAndCleanAmenities = (arr) => {
    const parsedArray = parseAmenities(arr);
    return parsedArray.map((item) =>
      typeof item === "string" ? item.toLowerCase() : item
    );
  };
  /**
   * TỐI ƯU: Dùng 1 câu aggregation thay vì N+1 query.
   * Lấy tất cả phòng (và thông tin nhà trọ cha) khớp với bộ lọc CỨNG (giá, quận, trạng thái).
   * Bộ lọc MỀM (tiện nghi, description) sẽ được lọc bằng JS sau đó.
   */

  const getRoomsByAmenities = async (
    amenities = [],
    onlyAvailable = false,
    district = null,
    maxPrice = null
  ) => {
    // 1. Xây dựng pipeline cho Room
    const pipeline = [
      // 2. "Join" với BoardingHouse trước
      {
        $lookup: {
          from: "boardinghouses", // Tên collection "boardinghouses"
          localField: "boardingHouseId",
          foreignField: "_id",
          as: "house",
        },
      }, // 3. Bung mảng house (mỗi phòng chỉ có 1 nhà)
      { $unwind: { path: "$house", preserveNullAndEmptyArrays: false } }, // 4. Xây dựng bộ lọc "cứng" (lọc trên DB)
      {
        $match: {
          "house.approvedStatus": "approved",
          ...(onlyAvailable && { status: "Available" }),
          ...(maxPrice && { price: { $lte: maxPrice } }), // Dùng regex để tìm kiếm (tốt hơn .includes() của JS)
          ...(district && {
            "house.location.district": { $regex: district, $options: "i" },
          }),
        },
      }, // 5. Tạo cấu trúc dữ liệu phẳng giống hàm cũ
      {
        $project: {
          // Giữ lại tất cả trường của Room
          _id: 1,
          roomNumber: 1,
          price: 1,
          status: 1,
          amenities: 1,
          description: 1,
          boardingHouseId: 1, // Thêm các trường của house cần dùng
          houseName: "$house.name",
          houseLocation: "$house.location",
          houseAmenities: "$house.amenities",
          houseDescription: "$house.description",
        },
      },
    ]; // 6. Chạy 1 câu query duy nhất

    const candidateRooms = await Room.aggregate(pipeline).exec(); // 7. Chạy bộ lọc "mềm" (amenities, description) bằng JS

    if (amenities.length === 0) {
      return candidateRooms; // Không cần lọc, trả về luôn
    }

    const allRooms = candidateRooms.filter((r) => {
      const houseAmenities = getAndCleanAmenities(r.houseAmenities);
      const houseDescription = (r.houseDescription || "").toLowerCase();
      const roomAmenities = getAndCleanAmenities(r.amenities);
      const roomDescription = (r.description || "").toLowerCase();
      const fullDescription = `${houseDescription} ${roomDescription}`; // 'a' là tiện ích chuẩn, vd "máy lạnh"

      return amenities.every((a) => {
        // 1. Kiểm tra trong tiện ích (tick)
        if (roomAmenities.includes(a) || houseAmenities.includes(a)) {
          return true;
        } // 2. Lấy từ đồng nghĩa
        const synonyms = REVERSE_AMENITY_MAP[a] || [a]; // 3. Kiểm tra trong mô tả
        return synonyms.some((s) => fullDescription.includes(s));
      });
    });

    return allRooms;
  };

  const parseAmenities = (arr) => {
    if (!arr) return [];
    if (!Array.isArray(arr)) {
      try {
        return JSON.parse(arr);
      } catch (e) {
        return [];
      }
    }
    return arr.flatMap((a) => {
      if (typeof a === "string" && a.startsWith("[")) {
        try {
          return JSON.parse(a);
        } catch (e) {
          return [a];
        }
      }
      return [a];
    });
  };
  /**
   * TỐI ƯU: Dùng 1 câu aggregation thay vì N query.
   * Lấy avgRating cho các nhà trọ đã được lọc.
   */

  const getTopRatedFromFiltered = async (filteredRooms, limit = 5) => {
    // 1. Lấy ID nhà trọ (nhanh, từ JS)
    const houseIds = [
      ...new Set(
        filteredRooms.map(
          (
            r // Cần chuyển lại thành ObjectId để $match
          ) => new mongoose.Types.ObjectId(r.boardingHouseId.toString())
        )
      ),
    ];

    if (houseIds.length === 0) return []; // 2. Chạy 1 câu query duy nhất lấy rating

    const ratingResults = await Review.aggregate([
      { $match: { boardingHouseId: { $in: houseIds } } },
      {
        $group: {
          _id: "$boardingHouseId",
          avgRating: { $avg: "$rating" },
        },
      },
    ]).exec(); // 3. "Join" kết quả rating với thông tin nhà trọ (từ JS, rất nhanh)

    const housesWithRating = ratingResults.map((ratingInfo) => {
      // Tìm thông tin nhà trọ (tên, vị trí) từ mảng filteredRooms
      const houseInfo = filteredRooms.find(
        (r) => r.boardingHouseId.toString() === ratingInfo._id.toString()
      );

      return {
        name: houseInfo.houseName,
        location: houseInfo.houseLocation,
        avgRating: ratingInfo.avgRating.toFixed(1), // Làm tròn ở đây
      };
    }); // 4. Sắp xếp và trả về

    return housesWithRating
      .sort((a, b) => b.avgRating - a.avgRating)
      .slice(0, limit);
  }; // ============================ AMENITY MAPS ============================

  const AMENITY_MAP = {
    // ... (Giữ nguyên AMENITY_MAP của em) ...
    // Máy lạnh
    "máy lạnh": "máy lạnh",
    "điều hòa": "máy lạnh",
    "máy điều hòa": "máy lạnh", // Nóng lạnh

    "nóng lạnh": "máy nước nóng",
    "máy nước nóng": "máy nước nóng",
    "bình nóng lạnh": "máy nước nóng", // Vệ sinh riêng

    "wc riêng": "wc riêng",
    "vệ sinh riêng": "wc riêng",
    "toilet riêng": "wc riêng",
    "nhà tắm riêng": "wc riêng",
    "phòng tắm riêng": "wc riêng", // Bếp/Nấu ăn

    bếp: "bếp riêng",
    "nấu ăn": "bếp riêng",
    "được nấu ăn": "bếp riêng",
    "chỗ nấu ăn": "bếp riêng",
    "bếp riêng": "bếp riêng", // Gác lửng

    "gác lửng": "gác lửng",
    "có gác": "gác lửng",
    gác: "gác lửng", // Ban công

    "ban công": "ban công",
    "có ban công": "ban công", // Cửa sổ

    "cửa sổ": "cửa sổ",
    thoáng: "cửa sổ",
    "phòng thoáng": "cửa sổ",
    "thoáng mát": "cửa sổ", // =================================== // --- Nội thất trong phòng --- // =================================== // Nội thất đầy đủ

    "nội thất": "nội thất đầy đủ",
    "full nội thất": "nội thất đầy đủ",
    "đủ đồ": "nội thất đầy đủ",
    "nội thất đầy đủ": "nội thất đầy đủ", // Giường

    giường: "giường",
    "có giường": "giường", // Tủ quần áo

    "tủ quần áo": "tủ quần áo",
    "tủ đồ": "tủ quần áo", // Tủ lạnh

    "tủ lạnh": "tủ lạnh",
    "có tủ lạnh": "tủ lạnh", // Bàn ghế

    bàn: "bàn ghế",
    ghế: "bàn ghế",
    "bàn ghế": "bàn ghế",
    "bàn học": "bàn ghế",
    "bàn làm việc": "bàn ghế", // Tivi

    tivi: "tivi",
    tv: "tivi", // Sofa

    sofa: "sofa",
    "ghế sofa": "sofa", // =================================== // --- Tiện ích chung & Dịch vụ --- // =================================== // Wifi

    wifi: "wifi",
    mạng: "wifi",
    internet: "wifi", // Máy giặt

    "máy giặt": "máy giặt",
    "giặt đồ": "máy giặt",
    "chỗ giặt đồ": "máy giặt",
    "giặt sấy": "máy giặt", // Chỗ để xe

    "chỗ để xe": "chỗ để xe",
    "nhà xe": "chỗ để xe",
    "bãi xe": "chỗ để xe",
    "hầm xe": "chỗ để xe",
    "để xe": "chỗ để xe", // Giờ giấc

    "giờ giấc tự do": "giờ giấc tự do",
    "tự do": "giờ giấc tự do",
    "giờ tự do": "giờ giấc tự do",
    "không chung chủ": "không chung chủ", // Sân phơi / Sân thượng

    "sân phơi": "sân phơi",
    "chỗ phơi đồ": "sân phơi",
    "sân thượng": "sân thượng", // Thang máy

    "thang máy": "thang máy",
    "có thang máy": "thang máy",
    "cầu thang máy": "thang máy", // Bếp chung

    "bếp chung": "bếp chung",
    "khu bếp chung": "bếp chung", // Khu sinh hoạt chung

    "khu sinh hoạt chung": "khu sinh hoạt chung",
    "phòng khách chung": "khu sinh hoạt chung",
    "phòng sinh hoạt chung": "khu sinh hoạt chung", // Vệ sinh

    "dịch vụ vệ sinh": "dịch vụ vệ sinh",
    "dọn vệ sinh": "dịch vụ vệ sinh",
    "vệ sinh chung": "dịch vụ vệ sinh", // Thú cưng

    "thú cưng": "cho phép thú cưng",
    "nuôi chó": "cho phép thú cưng",
    "nuôi mèo": "cho phép thú cưng",
    "cho nuôi thú cưng": "cho phép thú cưng", // =================================== // --- An ninh --- // =================================== // An ninh (chung)

    "an ninh": "an ninh", // Một key chung // Camera

    camera: "camera an ninh",
    "camera an ninh": "camera an ninh", // Bảo vệ

    "bảo vệ": "bảo vệ",
    "có bảo vệ": "bảo vệ",
    "chú bảo vệ": "bảo vệ", // Khóa vân tay

    "vân tay": "khóa vân tay",
    "khóa vân tay": "khóa vân tay",
    "cửa vân tay": "khóa vân tay", // Thẻ từ

    "thẻ từ": "thẻ từ",
    "cửa thẻ từ": "thẻ từ",
    "khóa thẻ từ": "thẻ từ", // =================================== // --- Tiện ích cao cấp (Ít gặp) --- // =================================== // Gym

    "phòng gym": "phòng gym",
    gym: "phòng gym",
    "tập gym": "phòng gym", // Hồ bơi

    "hồ bơi": "hồ bơi",
    "bể bơi": "hồ bơi",
  };

  const REVERSE_AMENITY_MAP = {};
  for (const key in AMENITY_MAP) {
    const standardAmenity = AMENITY_MAP[key];
    if (!REVERSE_AMENITY_MAP[standardAmenity]) {
      REVERSE_AMENITY_MAP[standardAmenity] = [];
    }
    REVERSE_AMENITY_MAP[standardAmenity].push(key);
  } // ============================ EXTRACT FILTERS ============================

  const extractFilters = (msg) => {
    // msg đã là lowercase
    let maxPrice = null;
    const priceMatch = msg.match(
      /(\d+([.,]\d+)?)\s*triệu|(\d+)\s*triệu\s*rưỡi/i
    );
    if (priceMatch) {
      if (priceMatch[1]) {
        maxPrice = parseFloat(priceMatch[1].replace(",", ".")) * 1000000;
      } else if (priceMatch[3]) {
        maxPrice = (parseInt(priceMatch[3]) + 0.5) * 1000000;
      }
    } else {
      const simplePriceMatch = msg.match(/(\d+)\s*triệu/);
      if (simplePriceMatch) {
        maxPrice = parseFloat(simplePriceMatch[1]) * 1000000;
      }
    }

    let districtMatch = msg.match(
      /(quận|phường|gần|khu vực|ở|tại)\s+([\w\s\dÀ-ỹ]+?)(?=\s+(giá|triệu|có|với|dưới)|$)/i
    ); // SỬA LỖI LOGIC: Làm sạch 'quận '
    let district = districtMatch ? districtMatch[2].trim() : null;
    if (district) {
      district = district
        .replace(/^quận\s+/, "")
        .replace(/^phường\s+/, "")
        .trim();
    }

    const amenitiesSet = new Set();
    for (const keyword in AMENITY_MAP) {
      if (msg.includes(keyword)) {
        amenitiesSet.add(AMENITY_MAP[keyword]);
      }
    }
    const amenities = Array.from(amenitiesSet);
    const wantsAvailable = msg.includes("trống") || msg.includes("còn phòng");

    return { maxPrice, district, amenities, wantsAvailable };
  }; // ============================ MAIN EXECUTION ============================

  const { maxPrice, district, amenities, wantsAvailable } =
    extractFilters(lowerMsg); // === CHẠY CÁC HÀM TỐI ƯU === // 1. Lấy top nhà trọ (toàn hệ thống)

  const topHouses = await getTopRatedHouses(5); // 2. Lấy phòng đã lọc

  const filteredRooms = await getRoomsByAmenities(
    amenities,
    wantsAvailable,
    district,
    maxPrice
  ); // 3. Định dạng danh sách phòng lọc (HTML)

  let filteredResultText;
  if (!filteredRooms || filteredRooms.length === 0) {
    // (Giữ nguyên logic báo lỗi của em)
    if (amenities.length > 0 || district || maxPrice) {
      const filters = [
        ...(district ? [`ở ${district}`] : []),
        ...(maxPrice ? [`giá dưới ${maxPrice} VND`] : []),
        ...(amenities.length > 0 ? [amenities.join(", ")] : []),
      ];
      filteredResultText = `Hiện tại không có nhà trọ nào trong hệ thống phù hợp với bộ lọc (${filters.join(
        " - "
      )}) ${wantsAvailable ? " và còn phòng trống" : ""}.`;
    } else {
      filteredResultText = `Hiện tại không có phòng trống nào phù hợp với yêu cầu của bạn trong hệ thống.`;
    }
  } else {
    // (Giữ nguyên logic HTML của em)
    const top5Rooms = filteredRooms
      .sort((a, b) => a.price - b.price)
      .slice(0, 5);
    const roomListHtml = top5Rooms
      .map(
        (r) =>
          `<li><b>${r.houseName}</b> (P.${
            r.roomNumber
          }) – Giá: ${r.price.toLocaleString("vi-VN")} VND – ${
            r.houseLocation.district
          }</li>`
      )
      .join("");
    filteredResultText = `Tìm thấy <b>${filteredRooms.length}</b> phòng phù hợp. Đây là 5 phòng rẻ nhất:<ul>${roomListHtml}</ul>`;
  } // 4. Lấy top nhà trọ (từ danh sách đã lọc)

  let topRatedText = "";
  if (filteredRooms.length > 0) {
    const topRatedHousesFromFilter = await getTopRatedFromFiltered(
      filteredRooms,
      5
    ); // (Giữ nguyên logic HTML của em)

    if (topRatedHousesFromFilter.length > 0) {
      const houseListHtml = topRatedHousesFromFilter
        .map(
          (h) =>
            `<li><b>${h.name}</b> (⭐ ${h.avgRating}) – ${h.location.district}</li>`
        )
        .join("");
      topRatedText = `<ul>${houseListHtml}</ul>`;
    } else {
      topRatedText = "Không tìm thấy nhà trọ nào có đánh giá trong bộ lọc này.";
    }
  } // ============================ ROLE: GUEST ============================

  if (role === "guest") {
    const wantsTopRated = [
      "tốt nhất",
      "đánh giá cao",
      "phòng đẹp",
      "top trọ",
    ].some((k) => lowerMsg.includes(k));
    const wantsCheapest = ["giá rẻ", "rẻ nhất"].some((k) =>
      lowerMsg.includes(k)
    );
    const hasFilters = amenities.length > 0 || district || maxPrice;

    let answerParts = [];

    if (wantsTopRated) {
      answerParts.push("<b>Top nhà trọ tốt nhất phù hợp bộ lọc:</b>");
      answerParts.push(topRatedText);
    } else if (wantsCheapest || hasFilters) {
      answerParts.push(filteredResultText);
    } else {
      answerParts.push(filteredResultText);
      answerParts.push("<br><b>Hoặc top nhà trọ (toàn hệ thống):</b>"); // === SỬA LỖI LOGIC: Không dùng JSON.stringify ===
      if (topHouses.length > 0) {
        const topHouseListHtml = topHouses
          .map(
            (h) =>
              `<li><b>${h.name}</b> (⭐ ${h.avgRating}) – ${h.location.district} (${h.availableRooms} phòng trống)</li>`
          )
          .join("");
        answerParts.push(`<ul>${topHouseListHtml}</ul>`);
      } else {
        answerParts.push("Hệ thống chưa có nhà trọ nào được đánh giá.");
      } // === KẾT THÚC SỬA LỖI ===
    }
    if (lowerMsg.includes("chủ trọ") || lowerMsg.includes("owner")) {
      answerParts.push("Bạn có thể đăng nhập để xem thông tin chủ trọ.");
    }
    const answer = answerParts.join("<br>");

    promptContext = `
Bạn là trợ lý AI của ứng dụng <b>Trọ Nhanh</b>.
Người dùng là <b>Khách chưa đăng nhập</b>, họ hỏi: "${message}"

⚠️ QUAN TRỌNG:
- Chỉ được dựa vào các dữ liệu ở trên.
- Nếu thông tin không nằm trong dữ liệu → trả lời "Hiện tại không có dữ liệu phù hợp trong hệ thống."
- Không được tự bịa thêm bất kỳ thông tin nào.
🎯 Trả lời:
${answer}
`;
  } // ============================ ROLE: CUSTOMER ============================
  else if (role === "customer") {
    // Lấy dữ liệu riêng của Customer
    // (Các query này nhỏ, chỉ cho 1 user, nên giữ nguyên .find() là ổn)
    const favorites = await Favorite.find({ customerId: user.id })
      .populate("boardingHouseId")
      .lean();
    const bookings = await Booking.find({ userId: user.id })
      .populate("boardingHouseId roomId")
      .lean();
    const myReviews = await Review.find({ customerId: user.id })
      .populate("boardingHouseId roomId")
      .lean();

    const favoriteText = favorites.length
      ? favorites.map((f) => f.boardingHouseId?.name).join(", ")
      : "Chưa có trọ yêu thích.";
    const bookingText = bookings.length
      ? bookings
          .map(
            (b) =>
              `• ${b.boardingHouseId?.name || "?"} – ${
                b.roomId?.roomNumber || "?"
              } (${b.contractStatus || b.status})`
          )
          .join("<br>")
      : "Chưa có booking.";
    const myReviewsText = myReviews.length
      ? myReviews
          .map(
            (r) =>
              `• ${r.boardingHouseId?.name || "?"} – Phòng ${
                r.roomId?.roomNumber || "?"
              } – ⭐ ${r.rating}/5 – "${r.comment}"`
          )
          .join("<br>")
      : "Bạn chưa có review nào."; // Phân tích ý định

    const wantsTopRated = ["top trọ", "tốt nhất", "đánh giá cao"].some((k) =>
      lowerMsg.includes(k)
    );
    const wantsCheapest = ["giá rẻ", "rẻ nhất"].some((k) =>
      lowerMsg.includes(k)
    );
    const wantsBooking = ["booking", "trạng thái", "hợp đồng"].some((k) =>
      lowerMsg.includes(k)
    );
    const wantsMyReviews = ["review tôi", "đánh giá của tôi"].some((k) =>
      lowerMsg.includes(k)
    );
    const wantsFavorite = ["trọ yêu thích", "đã lưu"].some((k) =>
      lowerMsg.includes(k)
    );
    const wantsMembership = ["membership", "gói thành viên"].some((k) =>
      lowerMsg.includes(k)
    );
    const hasFilters = amenities.length > 0 || district || maxPrice;

    let answerParts = []; // Xây dựng logic trả lời

    if (wantsBooking) {
      answerParts.push(bookingText);
    } else if (wantsMyReviews) {
      answerParts.push(myReviewsText);
    } else if (wantsFavorite) {
      answerParts.push(favoriteText);
    } else if (wantsMembership) {
      answerParts.push(user.membership || "Bạn chưa có gói thành viên.");
    } else if (wantsTopRated) {
      answerParts.push("<b>Top nhà trọ tốt nhất phù hợp bộ lọc:</b>");
      answerParts.push(topRatedText);
    } else if (wantsCheapest || hasFilters) {
      answerParts.push(filteredResultText);
    } else {
      answerParts.push(filteredResultText); // === SỬA LỖI LOGIC: Không dùng JSON.stringify ===
      if (topHouses.length > 0) {
        const topHouseListHtml = topHouses
          .map(
            (h) =>
              `<li><b>${h.name}</b> (⭐ ${h.avgRating}) – ${h.location.district} (${h.availableRooms} phòng trống)</li>`
          )
          .join("");
        answerParts.push(`<ul>${topHouseListHtml}</ul>`);
      } else {
        answerParts.push("Hệ thống chưa có nhà trọ nào được đánh giá.");
      } // === KẾT THÚC SỬA LỖI ===
    }
    const answer = answerParts.join("<br>");

    promptContext = `
<b>Khách thuê:</b> ${user.name}<br>
Câu hỏi: "${message}"<br>

Dữ liệu từ database:
- Top nhà trọ có đánh giá cao: ${
      "" /* Đã format HTML, không cần nhét JSON vào đây */
    }
- Phòng rẻ nhất phù hợp: ${filteredResultText} 
- Trọ yêu thích: ${favoriteText}
- Booking: ${bookingText}
- Review của tôi: ${myReviewsText}

⚠️ QUAN TRỌNG:
- Chỉ được dựa vào các dữ liệu ở trên.
- Nếu thông tin không nằm trong dữ liệu → trả lời "Hiện tại không có dữ liệu phù hợp trong hệ thống."
- Không được tự bịa thêm bất kỳ thông tin nào.

🎯 Trả lời:
${answer}
`;
  } // ============================ ROLE: OWNER ============================
  else if (role === "owner") {
    // Tối ưu: Gộp các query của Owner thành 1
    const houseIds = (
      await BoardingHouse.find({ ownerId: user.id }).select("_id").lean()
    ).map((h) => h._id);

    const [membership, houses, bookings, reviews, rooms, recentReports] =
      await Promise.all([
        MemberShip.findOne({ ownerId: user.id }).populate("packageId").lean(),
        BoardingHouse.find({ _id: { $in: houseIds } }).lean(),
        Booking.find({ boardingHouseId: { $in: houseIds } })
          .populate("roomId")
          .lean(),
        Review.find({ boardingHouseId: { $in: houseIds } }).lean(),
        Room.find({ boardingHouseId: { $in: houseIds } }).lean(),
        Report.find({ boardingHouseId: { $in: houseIds } })
          .limit(3)
          .lean(),
      ]); // (Logic tính toán của em giữ nguyên)

    const activeBookings = bookings.filter(
      (b) => b.contractStatus === "approved"
    ).length;
    const avgRating = reviews.length
      ? (
          reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        ).toFixed(1)
      : "Chưa có review";
    const revenue = bookings
      .filter((b) => b.contractStatus === "approved")
      .reduce((sum, b) => sum + b.roomId?.price || 0, 0);
    const lowRatingReviews = reviews.filter((r) => r.rating < 3);

    const houseList = houses
      .map((h, i) => {
        const houseRooms = rooms.filter(
          (r) => r.boardingHouseId.toString() === h._id.toString()
        );
        const available = houseRooms.filter(
          (r) => r.status === "Available"
        ).length;
        const booked = houseRooms.filter((r) => r.status === "Booked").length;
        return `#${i + 1}. ${h.name} (${h.approvedStatus}) – ${
          h.location.district
        }, ${available} phòng trống, ${booked} đã đặt`;
      })
      .join("<br>");

    const ownerCases = [
      { keywords: ["phòng trống"], content: houseList || "Không có trọ nào." },
      {
        keywords: ["doanh thu", "hiệu suất"],
        content: `Tổng doanh thu: ${revenue.toLocaleString(
          "vi-VN"
        )} VND, Booking đã duyệt: ${activeBookings}`, // === SỬA LỖI CÚ PHÁP (xóa "s,") ===
      },
      {
        keywords: ["review thấp"],
        content: `${lowRatingReviews.length} review thấp (<3⭐)`,
      },
      {
        keywords: ["membership", "gói"],
        content: membership
          ? `${membership.type} – ${membership.status}, kết thúc: ${new Date(
              membership.endDate
            ).toLocaleDateString()}`
          : "Chưa có gói thành viên",
      },
      {
        keywords: ["báo cáo", "cảnh báo"],
        content: recentReports.length
          ? recentReports // === SỬA LỖI CÚ PHÁP (xóa "F") ===
              .map(
                (r) =>
                  `• ${r.type}: ${r.content.substring(0, 50)}... (${r.status})`
              )
              .join("<br>")
          : "Không có báo cáo",
      },
    ];

    const matched = ownerCases.find((c) =>
      c.keywords.some((k) => lowerMsg.includes(k))
    );
    const answer = matched ? matched.content : houseList || "Chưa có trọ nào.";

    promptContext = `
 <b>Chủ trọ:</b> ${user.name}<br>
 Câu hỏi: "${message}"<br>

 🎯 Trả lời:
 ${answer}
`;
  } // ============================ ROLE: ADMIN ============================
  else if (role === "admin") {
    // Tối ưu: Gộp các query của Admin bằng Promise.all
    const [
      pendingHouses,
      recentReports,
      totalUsers,
      totalHouses,
      usersByRole,
      housesByStatus,
    ] = await Promise.all([
      BoardingHouse.find({ approvedStatus: "pending" }).limit(5).lean(),
      Report.find({ status: "Pending" }).limit(5).lean(),
      User.countDocuments(),
      BoardingHouse.countDocuments(),
      User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
      BoardingHouse.aggregate([
        { $group: { _id: "$approvedStatus", count: { $sum: 1 } } },
      ]),
    ]); // (Logic tính toán của em giữ nguyên)

    const pendingText = pendingHouses.length
      ? pendingHouses
          .map((h) => `• ${h.name} – ${h.location.district}`)
          .join("<br>")
      : "Không có bài đăng chờ duyệt.";
    const reportText = recentReports.length
      ? recentReports
          .map((r) => `• ${r.type}: ${r.content.substring(0, 60)}...`)
          .join("<br>")
      : "Không có báo cáo mới.";

    const adminCases = [
      { keywords: ["bài đăng chờ duyệt"], content: pendingText },
      { keywords: ["báo cáo", "report"], content: reportText },
      {
        keywords: ["tổng quan", "statistic"],
        content: `Người dùng: ${totalUsers}, Nhà trọ: ${totalHouses}`,
      },
      {
        keywords: ["user", "role"],
        content: usersByRole.map((u) => `${u._id}: ${u.count}`).join(", "),
      },
      {
        keywords: ["nhà trọ", "trọ"],
        content: housesByStatus.map((h) => `${h._id}: ${h.count}`).join(", "),
      },
    ];

    const matched = adminCases.find((c) =>
      c.keywords.some((k) => lowerMsg.includes(k))
    );
    const answer = matched
      ? matched.content
      : `Người dùng: ${totalUsers}, Nhà trọ: ${totalHouses}`;

    promptContext = `
<b>Admin:</b> ${user.name}<br>
Câu hỏi: "${message}"<br>

🎯 Trả lời:
${answer}
`;
  }

  return promptContext;
};
