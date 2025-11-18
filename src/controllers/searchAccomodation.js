const BoardingHouse = require('../models/BoardingHouse');

// [Imports của bạn: BoardingHouse, v.v...]

exports.SearchBoardingHouseNoUsingAI = async (req, res) => {
    try {
        // 1. Lấy 'area' từ query
        const { district, street, addressDetail, area } = req.query;

        // 2. Tạo query $match ban đầu cho BoardingHouse
        const query = {
            approvedStatus: "approved",
            status: { $ne: "Unavailable" },
        };

        if (district) query["location.district"] = district;
        if (street) query["location.street"] = { $regex: street, $options: "i" };
        if (addressDetail)
            query["location.addressDetail"] = { $regex: addressDetail, $options: "i" };

        // 3. Khởi tạo pipeline
        const pipeline = [
            // Stage 1: Lọc các BoardingHouse khớp query
            { $match: query },

            // Stage 2: Lấy tất cả 'rooms' liên quan
            {
                $lookup: {
                    from: "rooms", // Tên collection của Room
                    localField: "_id",
                    foreignField: "boardingHouseId",
                    as: "rooms",
                },
            },
        ];

        // 4. Xây dựng bộ lọc động cho Room (luôn lọc 'Available')
        const roomFilters = [
            { $eq: ["$$room.status", "Available"] }
        ];

        // Thêm bộ lọc 'area' nếu có
        if (area) {
            // Chuyển "20-30" thành [20, 30]
            const [min, max] = area.split('-').map(Number);

            if (!isNaN(min) && !isNaN(max)) {
                // Thêm điều kiện $gte (lớn hơn hoặc bằng min) và $lte (nhỏ hơn hoặc bằng max)
                roomFilters.push({ $gte: ["$$room.area", min] });
                roomFilters.push({ $lte: ["$$room.area", max] });
            }
        }

        // 5. Thêm các stage còn lại vào pipeline

        // Stage 3: Thay thế mảng 'rooms' bằng mảng đã lọc
        pipeline.push({
            $addFields: {
                rooms: {
                    $filter: {
                        input: "$rooms",
                        as: "room",
                        cond: { $and: roomFilters }, // Áp dụng TẤT CẢ các bộ lọc phòng
                    },
                },
            },
        });

        // Stage 4: Lọc bỏ các BoardingHouse không còn phòng nào sau khi lọc
        // (ví dụ: nhà có phòng 10m², nhưng user lọc 20-30m²)
        pipeline.push({
            $match: {
                "rooms.0": { $exists: true }, // Giữ lại nếu mảng 'rooms' có ít nhất 1 phần tử
            },
        });

        // Stage 5: Thêm các trường tính toán (dựa trên mảng 'rooms' ĐÃ ĐƯỢC LỌC)
        pipeline.push({
            $addFields: {
                // Đếm số phòng KHỚP VỚI BỘ LỌC
                availableRoomsCount: { $size: "$rooms" },

                // Lấy min/max Price TỪ CÁC PHÒNG KHỚP
                minPrice: { $min: "$rooms.price" },
                maxPrice: { $max: "$rooms.price" },

                // Lấy min/max Area TỪ CÁC PHÒNG KHỚP
                minArea: { $min: "$rooms.area" },
                maxArea: { $max: "$rooms.area" },
            },
        });

        // Stage 6: Dọn dẹp mảng 'rooms' không cần thiết
        pipeline.push({
            $project: {
                rooms: 0,
            },
        });

        // 6. Thực thi pipeline
        const results = await BoardingHouse.aggregate(pipeline);

        res.json(results);

    } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ error: "Search error", detail: err.message });
    }
};