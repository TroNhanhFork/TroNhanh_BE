// file: .../controllers/adminController.js

const BoardingHouse = require('../../models/BoardingHouse');
const Room = require('../../models/Room'); // ✅ Import thêm model Room
const User = require('../../models/User');
const AuditLog = require('../../models/AuditLog');

// UC-Admin-05: Admin xem tất cả bài đăng NHÀ TRỌ với bộ lọc và phân trang
exports.getAllBoardingHousesAdmin = async (req, res) => {
    try {
        let { page = 1, limit = 20, owner, status, fromDate, toDate, search } = req.query;

        page = parseInt(page);
        limit = Math.min(parseInt(limit), 20);

        const filter = {};
        if (owner) {
            const ownerRegex = new RegExp(owner, 'i');
            const owners = await User.find({ $or: [{ name: ownerRegex }, { email: ownerRegex }] }, '_id');
            filter.ownerId = { $in: owners.map(u => u._id) };
        }
        
        // ⛔ Lưu ý: Lọc theo status ('Available', 'Booked') không còn khả thi ở cấp độ nhà trọ
        // vì status giờ thuộc về từng phòng. Bạn có thể thêm logic phức tạp hơn bằng aggregation nếu cần.
        if (status) {
            filter.approvedStatus = status; // Có thể admin muốn lọc theo trạng thái duyệt bài
        }

        if (fromDate || toDate) {
            filter.createdAt = {};
            if (fromDate) filter.createdAt.$gte = new Date(fromDate);
            if (toDate) filter.createdAt.$lte = new Date(toDate);
        }
        if (search) {
            // ✅ Đổi từ title sang name
            filter.name = { $regex: search, $options: 'i' };
        }

        const total = await BoardingHouse.countDocuments(filter);
        const boardingHouses = await BoardingHouse.find(filter)
            .populate('ownerId', 'name email')
            // ⛔ customerId không còn tồn tại ở đây
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.status(200).json({
            total,
            page,
            pageSize: boardingHouses.length,
            boardingHouses, // Trả về toàn bộ object để linh hoạt ở frontend
        });
    } catch (err) {
        console.error('[ADMIN GET BOARDING_HOUSES ERROR]', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// UC-Admin-06: Admin xem chi tiết bài đăng NHÀ TRỌ (kèm các phòng)
exports.getBoardingHouseDetailAdmin = async (req, res) => {
    try {
        const house = await BoardingHouse.findById(req.params.id)
            .populate('ownerId', 'name email');

        if (!house) {
            return res.status(404).json({ message: 'Post no longer exists.' });
        }
        
        // ✅ Lấy thêm tất cả các phòng thuộc về nhà trọ này
        const rooms = await Room.find({ boardingHouseId: house._id });

        // Gộp kết quả
        const responseData = {
            ...house.toObject(),
            rooms: rooms
        };

        res.status(200).json(responseData);
    } catch (err) {
        console.error('[ADMIN GET BOARDING_HOUSE DETAIL ERROR]', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// UC-Admin-Approve: Admin duyệt/từ chối bài đăng NHÀ TRỌ
exports.approveBoardingHouseAdmin = async (req, res) => {
    try {
        const { approvedStatus, rejectedReason } = req.body;
        if (!['approved', 'rejected'].includes(approvedStatus)) {
            return res.status(400).json({ message: 'Invalid approvedStatus. Must be "approved" or "rejected".' });
        }
        const update = {
            approvedStatus,
            isApproved: approvedStatus === 'approved',
            approvedAt: approvedStatus === 'approved' ? new Date() : null,
            rejectedReason: approvedStatus === 'rejected' ? (rejectedReason || '') : '',
        };
        const house = await BoardingHouse.findByIdAndUpdate(
            req.params.id,
            update,
            { new: true }
        ).populate('ownerId', 'name email');

        if (!house) {
            return res.status(404).json({ message: 'Post no longer exists.' });
        }
        res.status(200).json({ message: 'Boarding house post updated.', data: house });
    } catch (err) {
        console.error('[ADMIN APPROVE BOARDING_HOUSE ERROR]', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// UC-Admin-07: Admin "xóa mềm" một bài đăng NHÀ TRỌ
exports.deleteBoardingHouseAdmin = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({ message: 'Reason for deletion is required.' });
        }

        const house = await BoardingHouse.findById(req.params.id);
        if (!house) {
            return res.status(404).json({ message: 'Post no longer exists.' });
        }
        if (house.approvedStatus === 'deleted') {
            return res.status(400).json({ message: 'Post has already been deleted.' });
        }

        const bookedRoom = await Room.findOne({ 
            boardingHouseId: house._id,
            status: 'Booked' 
        });
        if (bookedRoom) {
            return res.status(400).json({
                message: 'Cannot delete this boarding house as it has currently rented rooms. Please resolve the bookings first.'
            });
        }

        house.approvedStatus = 'deleted';
        house.deletedReason = reason;
        await house.save(); // ✅ Soft delete thành công

        // ✅ Audit log: riêng try/catch để không block client
        try {
            await AuditLog.create({
                adminId: req.user?._id,
                action: 'delete_boarding_house',
                targetBoardingHouseId: house._id,
                description: `Deleted by admin. Reason: ${reason}`,
                timestamp: new Date()
            });
        } catch (auditErr) {
            console.error('[AUDIT LOG ERROR]', auditErr);
        }

        // ✅ Trả về 200 ngay cả khi audit log fail
        res.status(200).json({ message: 'Boarding house post deleted (soft delete).', data: house });

    } catch (err) {
        console.error('[ADMIN DELETE BOARDING_HOUSE ERROR]', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};
