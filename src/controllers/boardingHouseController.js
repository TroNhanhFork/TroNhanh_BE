/**
 * Tên file đề xuất: boardingHouseController.js
 * * Controller này quản lý tất cả logic liên quan đến Nhà Trọ (BoardingHouse) và các thực thể liên quan như Phòng (Room) và Đánh giá (Review).
 * - Các hàm CRUD cho BoardingHouse.
 * - Các hàm quản lý Review cho BoardingHouse.
 * - Các hàm thống kê dành cho chủ trọ (Owner).
 */

const BoardingHouse = require("../models/BoardingHouse");
const Room = require('../models/Room');
const Payment = require("../models/Payment");
const MembershipPackage = require("../models/MembershipPackage");
const User = require('../models/User');
const Review = require('../models/Reviews');
const RoommatePost = require('../models/RoommatePost');
const Booking = require('../models/Booking');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;

// ================================================================
// SECTION: QUẢN LÝ NHÀ TRỌ (BOARDING HOUSE)
// ================================================================

/**
 * @description Tạo một nhà trọ mới cùng với các phòng của nó.
 * @route POST /api/boarding-houses
 */

exports.createBoardingHouse = async (req, res) => {
    try {
        // Phần 1: Validation giữ nguyên...
        const { ownerId } = req.body;
        const latestPayment = await Payment.findOne({ ownerId, status: "Paid" })
            .sort({ createAt: -1 })
            .populate("membershipPackageId");

        // Phần 2: Thực thi ghi dữ liệu nhưng không dùng transaction
        const { name, description, amenities } = req.body;
        const location = JSON.parse(req.body.location || "{}");
        const rooms = JSON.parse(req.body.rooms || "[]");
        const photosMap = (() => {
            if (!req.body.photosMap) return null;
            try { return JSON.parse(req.body.photosMap); } catch (e) { return null; }
        })();
        let uploadedFiles = [];
        if (req.files) {
            if (req.files.photos) uploadedFiles = uploadedFiles.concat(req.files.photos);
            if (req.files.files) uploadedFiles = uploadedFiles.concat(req.files.files);
        }
        const photoPaths = uploadedFiles.map((file) => `/uploads/accommodation/${file.filename}`) || [];

        const newBoardingHouse = new BoardingHouse({
            ownerId, name, description, location, amenities, photos: photoPaths,
        });
        // Bỏ { session }
        const savedHouse = await newBoardingHouse.save();

        if (rooms && Array.isArray(rooms) && rooms.length > 0) {
            // Map uploaded files to rooms using photosMap or fallback by matching roomNumber in originalname
            const filePathBase = '/uploads/accommodation/';
            const roomDocs = rooms.map(room => {
                const key = String(room.roomNumber || '');
                const roomPhotos = [];

                if (photosMap && photosMap[key] && Array.isArray(photosMap[key])) {
                    photosMap[key].forEach(origName => {
                        const f = uploadedFiles.find(u => u.originalname === origName);
                        if (f) roomPhotos.push(filePathBase + f.filename);
                    });
                } else {
                    // fallback: include uploaded files whose originalname contains the roomNumber
                    uploadedFiles.forEach(u => {
                        if (room.roomNumber && u.originalname.includes(String(room.roomNumber))) {
                            roomPhotos.push(filePathBase + u.filename);
                        }
                    });
                }

                return {
                    ...room,
                    boardingHouseId: savedHouse._id,
                    photos: roomPhotos,
                };
            });
            // Bỏ { session }
            await Room.insertMany(roomDocs);
        }

        res.status(201).json({ message: "Nhà trọ và các phòng đã được tạo thành công!", data: savedHouse });

    } catch (err) {
        console.error("[CREATE BOARDING HOUSE ERROR]", err);
        res.status(500).json({ message: "Lỗi máy chủ khi tạo nhà trọ." });
    }
};

/**
 * @description Cập nhật thông tin cơ bản của một nhà trọ.
 * @route PUT /api/boarding-houses/:id
 */
exports.updateBoardingHouse = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const location = JSON.parse(req.body.location || "{}");
        const photoPaths = req.files?.photos?.map((file) => `/uploads/accommodation/${file.filename}`) || []; const amenities = JSON.parse(req.body.amenities || "[]");
        // 1. Lấy thông tin nhà trọ hiện tại TRƯỚC KHI cập nhật
        const existingHouse = await BoardingHouse.findById(id);
        if (!existingHouse) {
            // Dọn dẹp file đã tải lên nếu không tìm thấy nhà trọ
            if (req.files) {
                const cleanupPromises = req.files.map(file => fs.unlink(file.path).catch(e => console.error("Lỗi khi dọn dẹp file:", e)));
                await Promise.all(cleanupPromises);
            }
            return res.status(404).json({ message: "Không tìm thấy nhà trọ" });
        }

        // Lưu lại danh sách ảnh cũ để xử lý sau
        const oldPhotos = existingHouse.photos || [];

        const updateData = {
            name,
            description,
            amenities,
            location,
            updatedAt: Date.now(),
            approvedStatus: "pending"
        };

        // 2. Chỉ ghi đè 'photos' nếu có ảnh mới được tải lên
        if (photoPaths.length > 0) {
            updateData.photos = photoPaths;
        }

        const updated = await BoardingHouse.findByIdAndUpdate(id, updateData, { new: true });

        // 3. Nếu cập nhật DB thành công VÀ có ảnh mới, hãy xóa ảnh cũ
        if (updated && photoPaths.length > 0 && oldPhotos.length > 0) {
            const deletePromises = oldPhotos.map(photoUrl => {
                const filename = path.basename(photoUrl);
                const filePathToDelete = path.join(process.cwd(), 'public', 'uploads', 'accommodation', filename);

                // Trả về một promise để xóa file
                return fs.unlink(filePathToDelete).catch(err => {
                    // Nếu lỗi là 'ENOENT' (file không tồn tại), ta bỏ qua
                    if (err.code === 'ENOENT') {
                        console.log(`File không tồn tại, bỏ qua việc xóa: ${filePathToDelete}`);
                        return;
                    }
                    // Nếu là lỗi khác, log lại để debug
                    console.error(`Lỗi thực sự khi xóa file ${filePathToDelete}:`, err);
                });
            });

            // Đợi tất cả các tác vụ xóa hoàn thành
            await Promise.all(deletePromises);
        }

        res.status(200).json({ message: "Cập nhật nhà trọ thành công", data: updated });

    } catch (err) {
        console.error("[UPDATE BOARDING HOUSE ERROR]", err);
        // Dọn dẹp file mới tải lên nếu có lỗi xảy ra sau khi upload
        if (req.files) {
            const allUploadedFiles = Object.values(req.files || {}).flat();
            const cleanupPromises = allUploadedFiles.map(file => fs.unlink(file.path).catch(e => console.error("Lỗi khi dọn dẹp file:", e))); await Promise.all(cleanupPromises);
        }
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * @description Lấy danh sách tất cả nhà trọ (có tóm tắt thông tin phòng).
 * @route GET /api/boarding-houses
 */
exports.getAllBoardingHouses = async (req, res) => {
    try {
        const { ownerId } = req.query;
        const matchFilter = {};
        if (ownerId) {
            matchFilter.ownerId = new mongoose.Types.ObjectId(ownerId);
        } else {
            matchFilter.approvedStatus = "approved";
        }

        const boardingHouses = await BoardingHouse.aggregate([
            { $match: matchFilter },
            { $lookup: { from: 'rooms', localField: '_id', foreignField: 'boardingHouseId', as: 'rooms' } },
            {
                $addFields: {
                    availableRoomsCount: { $size: { $filter: { input: '$rooms', as: 'room', cond: { $eq: ['$$room.status', 'Available'] } } } },
                    minPrice: { $min: '$rooms.price' },
                    maxPrice: { $max: '$rooms.price' },
                    minArea: { $min: "$rooms.area" },
                    maxArea: { $max: "$rooms.area" },
                    totalRooms: { $size: '$rooms' }
                }
            },
            { $project: { rooms: 0 } }
        ]);

        await BoardingHouse.populate(boardingHouses, { path: 'ownerId', select: 'name email' });
        res.status(200).json(boardingHouses);
    } catch (err) {
        console.error("[GET ALL BOARDING HOUSES ERROR]", err);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * @description Lấy chi tiết một nhà trọ, kèm danh sách phòng và đánh giá.
 * @route GET /api/boarding-houses/:id
 */
exports.getBoardingHouseById = async (req, res) => {
    try {
        const house = await BoardingHouse.findById(req.params.id).populate(
            "ownerId",
            "name email phone"
        );
        if (!house)
            return res.status(404).json({ message: "Không tìm thấy nhà trọ" });

        // Lấy danh sách phòng
        const rooms = await Room.find({ boardingHouseId: house._id });

        // 🔥 Gắn thêm trạng thái booking cho mỗi phòng
        const roomsWithStatus = await Promise.all(
            rooms.map(async (room) => {
                const latestBooking = await Booking.findOne({ roomId: room._id })
                    .sort({ createdAt: -1 })
                    .lean();

                let bookingStatus = "Available"; // mặc định

                if (latestBooking) {
                    if (
                        latestBooking.status === "paid" &&
                        latestBooking.contractStatus === "approved"
                    ) {
                        bookingStatus = "Paid"; // ✅ đã thanh toán & được duyệt
                    } else if (
                        latestBooking.status === "pending" ||
                        latestBooking.contractStatus === "pending"
                    ) {
                        bookingStatus = "Pending"; // 🕓 chờ thanh toán hoặc chờ duyệt
                    }
                }

                return {
                    ...room.toObject(),
                    bookingStatus,
                };
            })
        );

        const reviews = await Review.find({
            boardingHouseId: req.params.id,
        })
            .populate("customerId", "name avatar")
            .sort({ createdAt: -1 });

        // Get roommate posts for this boarding house and attach to room objects
        let posts = [];
        try {
            posts = await RoommatePost.find({ boardingHouseId: house._id })
                .populate('userId', 'name avatar phone gender')
                .sort({ createdAt: -1 })
                .lean();
        } catch (err) {
            console.error('[GET BOARDING HOUSE] failed to load roommate posts', err);
        }

        const postsByRoom = posts.reduce((acc, p) => {
            if (p.roomId) acc[String(p.roomId)] = p;
            return acc;
        }, {});

        const roomsWithPosts = roomsWithStatus.map((r) => {
            const pid = postsByRoom[String(r._id)];
            return {
                ...r,
                hasRoommatePost: !!pid,
                roommatePost: pid || null,
            };
        });

        const result = { ...house.toObject(), rooms: roomsWithPosts, reviews };
        res.status(200).json(result);
    } catch (err) {
        console.error("[GET BOARDING HOUSE BY ID ERROR]", err);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * @description Xóa một nhà trọ và tất cả các phòng, đánh giá liên quan.
 * @route DELETE /api/boarding-houses/:id
 */
exports.deleteBoardingHouse = async (req, res) => {
    try {
        const houseId = req.params.id;

        console.log("👉 DELETE request for houseId:", houseId);

        // 1. Kiểm tra phòng đang được đặt
        const bookedRoom = await Room.findOne({
            boardingHouseId: houseId,
            status: "Booked"
        });

        console.log("👉 bookedRoom:", bookedRoom);

        if (bookedRoom) {
            return res.status(400).json({
                message: "Không thể xóa nhà trọ này vì đang có phòng được khách hàng đặt!"
            });
        }

        // 2. Xóa review
        console.log("👉 Deleting reviews...");
        await Review.deleteMany({ boardingHouseId: houseId });

        // 3. Xóa rooms
        console.log("👉 Deleting rooms...");
        await Room.deleteMany({ boardingHouseId: houseId });

        // 4. Xóa boarding house
        console.log("👉 Deleting house...");
        const deletedHouse = await BoardingHouse.deleteOne({ _id: houseId });

        if (deletedHouse.deletedCount === 0) {
            return res.status(404).json({
                message: "Không tìm thấy nhà trọ để xóa."
            });
        }

        res.status(200).json({
            message: "Xóa nhà trọ và tất cả các phòng thành công"
        });

    } catch (err) {
        console.error("[DELETE BOARDING HOUSE ERROR]", err);
        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
};




// ================================================================
// SECTION: QUẢN LÝ ĐÁNH GIÁ (REVIEW)
// ================================================================

/**
 * @description Gửi một đánh giá mới cho nhà trọ.
 * @route POST /api/boarding-houses/:id/reviews
 */
exports.submitReview = async (req, res) => {
    try {
        const boardingHouseId = req.params.id;
        const { rating, comment, purpose } = req.body;
        const userId = req.user.id;

        const house = await BoardingHouse.findById(boardingHouseId);
        if (!house) return res.status(404).json({ message: "Không tìm thấy nhà trọ" });

        const roomIds = (await Room.find({ boardingHouseId }).select('_id')).map(r => r._id);
        const userBooking = await Booking.findOne({ userId, roomId: { $in: roomIds }, status: { $in: ['paid', 'completed'] } });
        if (!userBooking) return res.status(403).json({ message: "Bạn chỉ có thể đánh giá nhà trọ mà bạn đã đặt phòng." });

        const existingReview = await Review.findOne({ boardingHouseId, customerId: userId });
        if (existingReview) return res.status(400).json({ message: "Bạn đã đánh giá nhà trọ này rồi." });

        const newReview = new Review({ boardingHouseId, customerId: userId, roomId: userBooking.roomId, user: userId, rating, comment, purpose });
        await newReview.save();
        const populatedReview = await Review.findById(newReview._id)
            .populate('customerId', 'name avatar')
            .populate('user', 'name avatar')
            .populate('roomId', 'roomNumber');;
        res.status(201).json({ review: populatedReview });
    } catch (error) {
        console.error("Error submitting review:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getReviews = async (req, res) => {
    try {
        const { id } = req.params;
        const reviews = await Review.find({ boardingHouseId: id })
            .populate('user', 'name avatar')
            .populate('customerId', 'name avatar')
            .populate('roomId', 'roomNumber');

        res.status(200).json({ reviews });
    } catch (error) {
        console.error("Error getting reviews:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Sửa review
exports.editReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { rating, comment, purpose } = req.body;

        // ... (Các đoạn kiểm tra giữ nguyên) ...
        if (!rating || !comment || !purpose) {
            return res.status(400).json({ message: "All fields are required." });
        }
        const review = await Review.findById(reviewId);
        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }
        if (String(review.user) !== String(req.user.id)) {
            return res.status(403).json({ message: "Not authorized to edit this review" });
        }

        review.rating = rating;
        review.comment = comment;
        review.purpose = purpose;
        await review.save();

        // THAY ĐỔI Ở ĐÂY: Populate dữ liệu trước khi gửi về
        const populatedReview = await Review.findById(review._id)
            .populate('user', 'name avatar')
            .populate('customerId', 'name avatar')
            .populate('roomId', 'roomNumber');

        res.status(200).json({ review: populatedReview }); // Trả về review đã populate

    } catch (error) {
        console.error("Error editing review:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Xóa review
exports.deleteReview = async (req, res) => {
    try {
        const { reviewId } = req.params;

        const review = await Review.findById(reviewId);
        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }

        // Chỉ cho phép user đã tạo review được xóa
        if (String(review.user) !== String(req.user.id)) {
            return res.status(403).json({ message: "Not authorized to delete this review" });
        }

        await review.deleteOne();

        res.status(200).json({ message: "Review deleted successfully" });
    } catch (error) {
        console.error("Error deleting review:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// ================================================================
// SECTION: THỐNG KÊ CHO CHỦ TRỌ (OWNER)
// ================================================================

// Hàm helper để lấy ID nhà và phòng của owner
const getOwnerProperties = async (ownerId) => {
    const houses = await BoardingHouse.find({ ownerId }).select('_id');
    const houseIds = houses.map(h => h._id);
    const rooms = await Room.find({ boardingHouseId: { $in: houseIds } }).select('_id status');
    const roomIds = rooms.map(r => r._id);
    return { houses, houseIds, rooms, roomIds };
};


/**
 * @description Lấy thống kê tổng quan cho chủ trọ.
 * @route GET /api/owner/statistics
 */
exports.getOwnerStatistics = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { houses, houseIds, rooms, roomIds } = await getOwnerProperties(ownerId);
        const totalBoardingHouses = houses.length;
        const availableRooms = rooms.filter(r => r.status === 'Available').length;


        const allBookings = await Booking.find({
            roomId: { $in: roomIds },
            status: { $in: ['paid', 'completed'] }
        })

        const bookingIds = allBookings.map(b => b._id);

        const payments = await Payment.find({
            bookingId: { $in: bookingIds },
            status: 'Paid'
        });

        const totalRevenue = payments.reduce((sum, payment) => sum + (payment?.amount || 0), 0);
        res.status(200).json({
            success: true, statistics: {
                totalBoardingHouses,
                totalRooms: rooms.length,
                availableRooms,
                bookedRooms: rooms.length - availableRooms,
                totalRevenue,
                totalBookings: allBookings.length
            }
        });
    } catch (error) {
        console.error("Error getting owner statistics:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * @description Lấy danh sách các nhà trọ của owner kèm rating trung bình.
 * @route GET /api/owner/boarding-houses/ratings
 */
exports.getOwnerBoardingHousesWithRatings = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const houses = await BoardingHouse.find({ ownerId, approvedStatus: "approved" }).select('_id name createdAt');

        const housesWithRatings = await Promise.all(
            houses.map(async (house) => {
                const reviews = await Review.find({ boardingHouseId: house._id });
                let avgRating = 0;
                if (reviews.length > 0) {
                    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
                    avgRating = (totalRating / reviews.length).toFixed(1);
                }
                return {
                    _id: house._id,
                    name: house.name,
                    averageRating: parseFloat(avgRating),
                    totalReviews: reviews.length,
                    createdAt: house.createdAt
                };
            })
        );
        res.status(200).json({ success: true, boardingHouses: housesWithRatings });
    } catch (error) {
        console.error("Error getting owner houses with ratings:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};


/**
 * @description Lấy chi tiết ratings của 1 nhà trọ cho owner.
 * @route GET /api/boarding-houses/owner/:id/ratings
 * @access Owner
 */
exports.getBoardingHouseRatingsForOwner = async (req, res) => {
    try {
        const boardingHouseId = req.params.id;
        const ownerId = req.user.id;

        // Kiểm tra nhà trọ có tồn tại và thuộc về owner không
        const boardingHouse = await BoardingHouse.findOne({
            _id: boardingHouseId,
            ownerId: ownerId
        });

        if (!boardingHouse) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy nhà trọ hoặc bạn không có quyền truy cập."
            });
        }

        // Lấy tất cả reviews cho nhà trọ này
        const reviews = await Review.find({ boardingHouseId: boardingHouseId })
            .populate('customerId', 'name email avatar')
            .sort({ createdAt: -1 });

        // Tính rating trung bình
        let avgRating = 0;
        if (reviews.length > 0) {
            const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
            avgRating = (totalRating / reviews.length).toFixed(1);
        }

        res.status(200).json({
            success: true,
            accommodationTitle: boardingHouse.name,
            ratings: reviews,
            avgRating: parseFloat(avgRating),
            totalReviews: reviews.length
        });
    } catch (error) {
        console.error("Error getting accommodation ratings:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

/**
 * @description Lấy các đặt phòng gần đây cho chủ trọ.
 * @route GET /api/owner/bookings/recent
 */
exports.getOwnerRecentBookings = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const limit = parseInt(req.query.limit) || 10;

        // 🏠 Lấy danh sách room thuộc owner
        const { roomIds } = await getOwnerProperties(ownerId);
        if (!roomIds || roomIds.length === 0) {
            return res.status(200).json({ success: true, bookings: [] });
        }

        // 🔍 Lấy các booking theo roomId
        const recentBookings = await Booking.find({ roomId: { $in: roomIds } })
            .populate("userId", "name email")
            .populate({
                path: "roomId",
                select: "roomNumber",
                populate: { path: "boardingHouseId", select: "name" },
            })
            .sort({ createdAt: -1 })
            .limit(limit);

        if (!recentBookings.length) {
            return res.status(200).json({ success: true, bookings: [] });
        }

        // 💳 Lấy danh sách payment tương ứng với các booking vừa lấy
        const bookingIds = recentBookings.map((b) => b._id);
        const payments = await Payment.find({
            bookingId: { $in: bookingIds },
            status: "Paid",
        });

        // Tạo map bookingId → payment.amount
        const paymentMap = {};
        payments.forEach((p) => {
            paymentMap[p.bookingId.toString()] = p.amount || 0;
        });

        // 🧩 Format dữ liệu trả về
        const formattedBookings = recentBookings.map((booking) => ({
            key: booking._id,
            customerName: booking.userId?.name || "N/A",
            boardingHouseName: booking.roomId?.boardingHouseId?.name || "N/A",
            roomNumber: booking.roomId?.roomNumber || "N/A",
            bookingDate: booking.createdAt,
            amount: paymentMap[booking._id.toString()] || 0,
            status: booking.status,
        }));

        res.status(200).json({ success: true, bookings: formattedBookings });
    } catch (error) {
        console.error("❌ Error getting owner recent bookings:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};


/**
 * @description Lấy các nhà trọ hàng đầu của owner (dựa trên số lượt đặt).
 * @route GET /api/owner/boarding-houses/top
 */
exports.getOwnerTopBoardingHouses = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const limit = parseInt(req.query.limit) || 5;
        const { houses } = await getOwnerProperties(ownerId);

        const stats = await Promise.all(
            houses.map(async (house) => {
                const roomsInHouse = await Room.find({ boardingHouseId: house._id }).select('_id');
                const roomIdsInHouse = roomsInHouse.map(r => r._id);

                const bookingCount = await Booking.countDocuments({ roomId: { $in: roomIdsInHouse }, status: { $in: ['paid', 'completed'] } });

                const reviews = await Review.find({ boardingHouseId: house._id });
                let avgRating = 0;
                if (reviews.length > 0) {
                    avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
                }

                return {
                    key: house._id,
                    name: house.name,
                    bookings: bookingCount,
                    rating: parseFloat(avgRating.toFixed(1))
                };
            })
        );

        const topHouses = stats.sort((a, b) => b.bookings - a.bookings).slice(0, limit);
        res.status(200).json({ success: true, topBoardingHouses: topHouses });
    } catch (error) {
        console.error("Error getting owner top houses:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * @description Lấy thông tin gói thành viên hiện tại và số bài đăng.
 * @route GET /api/owner/membership-info
 */
exports.getOwnerMembershipInfo = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const latestPayment = await Payment.findOne({ ownerId, status: "Paid" }).sort({ createAt: -1 }).populate("membershipPackageId");

        if (!latestPayment || !latestPayment.membershipPackageId) {
            return res.status(200).json({ success: true, membershipInfo: { hasActiveMembership: false } });
        }

        const membershipPackage = latestPayment.membershipPackageId;
        const expiredAt = new Date(latestPayment.createdAt.getTime() + (membershipPackage.duration || 0) * 24 * 60 * 60 * 1000);
        const isExpired = new Date() > expiredAt;

        // Đếm số lượng NHÀ TRỌ, không phải phòng trọ
        const currentPostsCount = await BoardingHouse.countDocuments({ ownerId });
        const postsAllowed = membershipPackage.postsAllowed || 0;

        res.status(200).json({
            success: true,
            membershipInfo: {
                hasActiveMembership: !isExpired,
                packageName: membershipPackage.packageName,
                postsAllowed,
                currentPostsCount,
                remainingPosts: Math.max(0, postsAllowed - currentPostsCount),
                isExpired,
                expiredAt
            }
        });
    } catch (error) {
        console.error("Error getting owner membership info:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * @description Lấy doanh thu hàng tháng của owner.
 * @route GET /api/owner/revenue/monthly
 */
exports.getOwnerMonthlyRevenue = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { months = 6 } = req.query;
        const { roomIds } = await getOwnerProperties(ownerId);
        if (!roomIds || roomIds.length === 0) {

            return res.status(200).json({ success: true, monthlyRevenue: [] });
        }

        const monthlyData = [];

        // Lặp qua 6 tháng gần nhất
        for (let i = parseInt(months) - 1; i >= 0; i--) {
            const targetDate = new Date();
            targetDate.setMonth(targetDate.getMonth() - i);

            const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
            const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);

            // Lấy tất cả booking trong tháng đó
            const monthlyBookings = await Booking.find({
                roomId: { $in: roomIds },
                status: { $in: ["paid", "completed"] },
                createdAt: { $gte: startOfMonth, $lte: endOfMonth },
            });

            const bookingIds = monthlyBookings.map(b => b._id);

            // Lấy các payments tương ứng
            const payments = await Payment.find({
                bookingId: { $in: bookingIds },
                status: "Paid",
            });

            // Tính tổng revenue tháng đó
            const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

            const monthName = targetDate.toLocaleDateString("vi-VN", {
                month: "short",
                year: "numeric",
            });

            monthlyData.push({
                month: monthName,
                monthNumber: targetDate.getMonth() + 1,
                year: targetDate.getFullYear(),
                revenue: totalRevenue,
                bookingsCount: monthlyBookings.length,
            });
        }

        res.status(200).json({ success: true, monthlyRevenue: monthlyData });
    } catch (error) {
        console.error("❌ Error getting owner monthly revenue:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Get Owner Membership Info with Boardinghouse Count
exports.getOwnerMembershipInfo = async (req, res) => {
    try {
        const ownerId = req.user.id;

        // Lấy membership hiện tại
        const latestPayment = await Payment.findOne({
            ownerId,
            status: "Paid",
        })
            .sort({ createAt: -1 })
            .populate("membershipPackageId");

        if (!latestPayment || !latestPayment.membershipPackageId) {
            return res.status(200).json({
                success: true,
                membershipInfo: {
                    hasActiveMembership: false,
                    packageName: "No Active Membership",
                    postsAllowed: 0,
                    currentPostsCount: 0,
                    remainingPosts: 0,
                    isExpired: true
                }
            });
        }

        const membershipPackage = latestPayment.membershipPackageId;
        const durationDays = membershipPackage.duration || 0;
        const createdAt = latestPayment.createdAt;
        const expiredAt = new Date(
            createdAt.getTime() + durationDays * 24 * 60 * 60 * 1000
        );

        const isExpired = new Date() > expiredAt;

        // Đếm số boarding houses hiện tại
        const currentPostsCount = await BoardingHouse.countDocuments({
            ownerId
        });

        const postsAllowed = membershipPackage.postsAllowed || 0;
        const remainingPosts = Math.max(0, postsAllowed - currentPostsCount);

        res.status(200).json({
            success: true,
            membershipInfo: {
                hasActiveMembership: !isExpired,
                packageName: membershipPackage.packageName || membershipPackage.name,
                postsAllowed,
                currentPostsCount,
                remainingPosts,
                isExpired,
                expiredAt,
                purchaseDate: createdAt
            }
        });
    } catch (error) {
        console.error("Error getting owner membership info:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


/**
 * @description Lấy các nhà trọ hàng đầu của owner (dựa trên số lượt đặt).
 * @route GET /api/boarding-houses/owner/top-accommodations
 * @access Owner
 */
exports.getOwnerTopAccommodations = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const limit = parseInt(req.query.limit) || 5;

        // Lấy tất cả nhà trọ của owner
        const ownerHouses = await BoardingHouse.find({ ownerId }).select('_id name');

        // Tính toán thống kê cho từng nhà trọ
        const houseStats = await Promise.all(
            ownerHouses.map(async (house) => {
                // Lấy tất cả các phòng thuộc nhà trọ này
                const roomsInHouse = await Room.find({ boardingHouseId: house._id }).select('_id');
                const roomIdsInHouse = roomsInHouse.map(r => r._id);

                // Đếm số lượng booking của các phòng này
                const bookingCount = await Booking.countDocuments({
                    roomId: { $in: roomIdsInHouse },
                    status: { $in: ['paid', 'completed'] }
                });

                // Tính rating trung bình
                const reviews = await Review.find({ boardingHouseId: house._id });
                let avgRating = 0;
                if (reviews.length > 0) {
                    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
                    avgRating = (totalRating / reviews.length);
                }

                return {
                    key: house._id,
                    title: house.name, // Đổi từ title sang name
                    bookings: bookingCount,
                    rating: parseFloat(avgRating.toFixed(1))
                };
            })
        );

        // Sắp xếp theo số booking giảm dần và lấy top
        const topAccommodations = houseStats
            .sort((a, b) => b.bookings - a.bookings)
            .slice(0, limit);

        res.status(200).json({
            success: true,
            accommodations: topAccommodations
        });
    } catch (error) {
        console.error("Error getting owner top accommodations:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};


/**
 * @description Lấy thông tin gói thành viên hiện tại của owner.
 * @route GET /api/boarding-houses/owner/current-membership
 * @access Owner
 */
exports.getOwnerCurrentMembership = async (req, res) => {
    try {
        const ownerId = req.user.id;

        // Lấy payment gần nhất có status "Paid"
        const latestPayment = await Payment.findOne({
            ownerId,
            status: "Paid",
        })
            .sort({ createAt: -1 })
            .populate("membershipPackageId");

        if (!latestPayment || !latestPayment.membershipPackageId) {
            return res.status(200).json({
                success: true,
                membership: {
                    packageName: "Chưa có gói thành viên",
                    isActive: false,
                }
            });
        }

        const membershipPackage = latestPayment.membershipPackageId;
        const durationDays = membershipPackage.duration || 0;
        const createdAt = latestPayment.createdAt;
        const expiredAt = new Date(
            createdAt.getTime() + durationDays * 24 * 60 * 60 * 1000
        );

        res.status(200).json({
            success: true,
            membership: {
                packageName: membershipPackage.packageName || "Unknown Package",
                isActive: new Date() <= expiredAt,
                purchaseDate: createdAt,
                expiredAt,
            }
        });
    } catch (error) {
        console.error("Error getting owner current membership:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};


exports.getBoardingHouseDetailsByBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;

        // Lấy booking theo ID
        const booking = await Booking.findById(bookingId)
            .populate("roomId")
            .populate("userId", "name email");

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        // Lấy phòng & boarding house
        const room = await Room.findById(booking.roomId).populate("boardingHouseId");
        if (!room || !room.boardingHouseId) {
            return res.status(404).json({ success: false, message: "Room or Boarding house not found" });
        }

        // Lấy payment (đã thanh toán)
        const payment = await Payment.findOne({
            bookingId: booking._id,
            status: "Paid"
        });

        const boardingHouse = room.boardingHouseId;


        res.status(200).json({
            success: true,
            boardingHouse: boardingHouse,
            room: room
        });
    } catch (error) {
        console.error("Error fetching boarding house details by booking:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};