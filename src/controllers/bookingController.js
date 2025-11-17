const Booking = require("../models/Booking");
const BoardingHouse = require("../models/BoardingHouse");
const Room = require('../models/Room');
const Payment = require("../models/Payment");
const Notification = require("../models/Notification"); // Thêm import còn thiếu
const mongoose = require('mongoose')

exports.createBooking = async (req, res) => {
  try {
    const { userId, boardingHouseId, guestInfo, startDate, leaseDuration, guests } =
      req.body;

    // Check if the BoardingHouse is approved and available
    const property = await BoardingHouse.findOne({
      _id: boardingHouseId,
      approvedStatus: "approved",
      status: "Available"
    });
    if (!property) {
      return res
        .status(400)
        .json({ message: "BoardingHouse is not available for booking." });
    }
    const existingBooking = await Booking.findOne({
      userId,
      boardingHouseId,
      status: "pending",
    });

    if (existingBooking) {
      const minutesSince = (Date.now() - existingBooking.createdAt) / (1000 * 60);
      if (minutesSince < 15) {
        return res.status(400).json({
          message: "You already have a pending booking for this accommodation. Please complete payment or wait 15 minutes."
        });
      } else {
        existingBooking.status = "cancelled";
        await existingBooking.save();
      }
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const booking = await Booking.create({
      userId,
      boardingHouseId,
      guestInfo,
      status: "pending",
    });
    res.status(201).json(booking);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Checkout function to make BoardingHouse available again
exports.checkoutBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Update booking status to completed
    await Booking.findByIdAndUpdate(bookingId, {
      status: "completed"
    });

    // Make BoardingHouse available again
    await BoardingHouse.findByIdAndUpdate(booking.propertyId, {
      customerId: null,
      status: "Available"
    });

    console.log("✅ Customer checked out, BoardingHouse is now available again.");
    res.status(200).json({ message: "Checkout successful" });
  } catch (err) {
    console.error("❌ Error during checkout:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Add this function to manually update BoardingHouse after successful payment
exports.updateBoardingHouseAfterPayment = async (req, res) => {
  try {
    const { bookingId } = req.body;

    // Find the booking
    const booking = await Booking.findOne({
      _id: bookingId,
      status: "paid"
    });

    if (!booking) {
      return res.status(404).json({
        message: "Paid booking not found"
      });
    }

    // SỬA LỖI: Đổi tên biến 'BoardingHouse' thành 'updatedBoardingHouse' để tránh xung đột với tên Model
    const updatedBoardingHouse = await BoardingHouse.findByIdAndUpdate(
      booking.propertyId,
      {
        customerId: booking.userId,
        status: "Booked"
      },
      { new: true }
    );

    if (!updatedBoardingHouse) {
      return res.status(404).json({
        message: "BoardingHouse not found"
      });
    }

    res.status(200).json({
      message: "BoardingHouse updated successfully",
      BoardingHouse: updatedBoardingHouse, // Trả về nhà trọ đã update
      booking
    });

  } catch (error) {
    console.error("Error updating BoardingHouse:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// Get user's booking for specific BoardingHouse
exports.getUserBookingForBoardingHouse = async (req, res) => {
  try {
    const { userId, boardingHouseId } = req.params;

    // 🔹 1. Lấy tất cả roomId của boarding house này
    const rooms = await Room.find({ boardingHouseId }).select("_id");
    const roomIds = rooms.map((r) => r._id);

    if (roomIds.length === 0) {
      return res.status(404).json({ message: "No rooms found in this boarding house" });
    }

    // 🔹 2. Kiểm tra xem user có booking nào thuộc các phòng đó không (dựa trên status)
    const booking = await Booking.findOne({
      userId,
      roomId: { $in: roomIds },
      status: { $in: ["Pending", "Cancel", "paid"] },
    })
      .populate("boardingHouseId", "name location photos")
      .populate("roomId", "roomNumber price area");

    if (!booking) {
      return res.status(404).json({ message: "No booking found for this user in this house" });
    }

    // 🔹 3. Xác định displayStatus cho frontend
    const displayStatus =
      booking.status === "paid"
        ? "Paid"
        : booking.status === "approved" || booking.status === "pending"
          ? "Pending"
          : "Other";

    // 🔹 4. Trả về kết quả
    res.status(200).json({
      ...booking.toObject(),
      displayStatus,
    });
  } catch (error) {
    console.error("Error getting user booking for boarding house:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getUserBookingHistory = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    console.log(`Getting booking history for user: ${userId}`);

    const bookings = await Booking.aggregate([
      // 1. Lọc booking của user
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      // 2. Sắp xếp theo mới nhất
      { $sort: { createdAt: -1 } },
      // 3. Join với collection 'payments'
      {
        $lookup: {
          from: 'payments',
          localField: '_id',
          foreignField: 'bookingId',
          as: 'paymentDetails'
        }
      },
      // 4. Join với collection 'rooms'
      {
        $lookup: {
          from: 'rooms',
          localField: 'roomId',
          foreignField: '_id',
          as: 'roomDetails'
        }
      },
      // 5. Join với collection 'boardinghouses'
      {
        $lookup: {
          from: 'boardinghouses',
          localField: 'boardingHouseId',
          foreignField: '_id',
          as: 'houseDetails'
        }
      },
      // 6. Lấy object đầu tiên từ mảng join
      {
        $project: {
          _id: 1,
          contractStatus: 1,
          status: 1,
          rejectionReason: 1,
          createdAt: 1,
          guestInfo: 1,
          room: { $arrayElemAt: ['$roomDetails', 0] },
          boardingHouse: { $arrayElemAt: ['$houseDetails', 0] },
          paymentInfo: { $arrayElemAt: ['$paymentDetails', 0] }
        }
      },
      // 7. Thêm các trường tính toán và convert kiểu
      {
        $addFields: {
          checkInDate: '$guestInfo.startDate',
          checkOutDate: {
            $cond: {
              if: { $and: ['$guestInfo.startDate', '$guestInfo.leaseDuration'] },
              then: {
                $add: [
                  { $toDate: '$guestInfo.startDate' }, // convert startDate sang Date
                  {
                    $multiply: [
                      { $toInt: '$guestInfo.leaseDuration' }, // convert leaseDuration sang số
                      30 * 24 * 60 * 60 * 1000 // 1 tháng = 30 ngày
                    ]
                  }
                ]
              },
              else: null
            }
          },
          guests: { $ifNull: ['$guestInfo.guests', 1] },
          totalPrice: {
            $ifNull: [
              { $toDouble: '$paymentInfo.amount' },
              {
                $multiply: [
                  { $toDouble: '$room.price' }, // convert room.price sang số
                  { $toInt: { $ifNull: ['$guestInfo.leaseDuration', 1] } } // convert leaseDuration
                ]
              }
            ]
          },
          payosOrderCode: '$paymentInfo.orderCode'
        }
      }
    ]);

    res.status(200).json(bookings);
  } catch (error) {
    console.error("Error getting user booking history:", error);
    res.status(500).json({ message: 'Server error' });
  }
};


exports.getUserBookingRequest = async (req, res) => {
  try {
    // 1. Lấy userId từ req.user (Logic từ HEAD, bảo mật hơn)
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    console.log(`Getting booking history for user: ${userId}`);

    // 2. Lấy tất cả booking, dùng .lean() (Logic từ 2 nhánh)
    // Populate theo schema mới (từ HEAD)
    const bookings = await Booking.find({ userId: userId })
      .populate({
        path: 'boardingHouseId',
        select: 'name photos location',
      })
      .populate({
        path: 'roomId',
        select: 'roomNumber price area'
      })
      .sort({ createdAt: -1 })
      .lean();

    // 3. "LÀM GIÀU" DỮ LIỆU (Logic từ nhánh 5f05a64...)
    const enrichedBookings = await Promise.all(
      bookings.map(async (booking) => {
        // Với mỗi booking, tìm bản ghi Payment tương ứng
        const payment = await Payment.findOne({ bookingId: booking._id })
          .select('orderCode amount')
          .lean();

        // Thêm thông tin thanh toán và format
        return {
          ...booking, // Giữ lại toàn bộ thông tin booking cũ
          paymentInfo: {
            payosOrderCode: payment?.orderCode,
          },
          // Format các trường khác
          checkInDate: booking.guestInfo?.startDate,
          checkOutDate: new Date(new Date(booking.guestInfo?.startDate).getTime() + (parseInt(booking.guestInfo?.leaseDuration) || 1) * 24 * 60 * 60 * 1000),
          guests: booking.guestInfo?.guests || 1,
          // SỬA LOGIC: Dùng giá từ roomId (theo schema mới) làm fallback
          totalPrice: payment?.amount || (booking.roomId?.price * (parseInt(booking.guestInfo?.leaseDuration) || 1)),
        };
      })
    );

    // 4. Trả về dữ liệu đã được làm giàu
    res.status(200).json(enrichedBookings);

  } catch (error) {
    console.error("Error getting user booking history:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getBookingById = async (req, res) => {
  try {
    const bookingId = req.params.id; // Lấy 'id' từ URL (vd: /api/bookings/123)
    const userId = req.user.id; // Lấy từ middleware 'protect'

    const booking = await Booking.findById(bookingId)
      .populate({
        path: 'roomId',
        select: 'roomNumber price area'
      })
      .populate({
        path: 'boardingHouseId',
        select: 'name photos location ownerId' // Thêm ownerId để kiểm tra quyền
      });

    if (!booking) {
      return res.status(404).json({ message: 'Không tìm thấy đơn đặt phòng.' });
    }

    // (Bảo mật) Chỉ cho phép người thuê hoặc chủ nhà xem booking này
    const isTenant = booking.userId.toString() === userId;
    const isOwner = booking.boardingHouseId.ownerId.toString() === userId;

    if (!isTenant && !isOwner) {
      return res.status(403).json({ message: 'Bạn không có quyền xem đơn đặt phòng này.' });
    }

    // Nếu mọi thứ OK, trả về booking
    res.status(200).json(booking);

  } catch (error) {
    console.error("Error fetching booking by ID:", error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

// Get all bookings for specific BoardingHouse (for owner report)
exports.getBookingsByBoardingHouse = async (req, res) => {
  try {
    const { BoardingHouseId } = req.params;
    console.log('Getting bookings for BoardingHouse:', BoardingHouseId);

    const bookings = await Booking.find({
      propertyId: BoardingHouseId
    })
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 });

    console.log('Found bookings:', bookings.length);

    // Format data cho owner report
    const formattedBookings = bookings.map(booking => ({
      _id: booking._id,
      customerId: booking.userId, // đây là customer info
      status: booking.status,
      checkInDate: booking.guestInfo?.startDate,
      checkOutDate: new Date(new Date(booking.guestInfo?.startDate).getTime() + (parseInt(booking.guestInfo?.leaseDuration) || 1) * 24 * 60 * 60 * 1000),
      totalPrice: booking.paymentInfo?.amount || 0,
      createdAt: booking.createdAt,
      guestInfo: booking.guestInfo,
      paymentInfo: booking.paymentInfo
    }));

    res.status(200).json(formattedBookings);
  } catch (error) {
    console.error("Error getting bookings by BoardingHouse:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.requestBooking = async (req, res) => {
  const { boardingHouseId, roomId, guestInfo } = req.body; // ✅ nhận guestInfo
  const userId = req.user.id;
  const userName = req.user.name;

  if (!guestInfo) {
    return res.status(400).json({ message: 'Thiếu thông tin khách.' });
  }

  try {
    const room = await Room.findOne({ _id: roomId, boardingHouseId });
    if (!room || room.status !== 'Available') {
      return res.status(400).json({ message: 'Phòng không tồn tại hoặc đã được đặt.' });
    }

    const existingRequest = await Booking.findOne({
      userId,
      roomId,
      boardingHouseId,
      contractStatus: { $in: ['pending_approval', 'approved', 'payment_pending', 'paid'] },
      status: { $nin: ['cancel', 'cancelled'] }
    });

    if (existingRequest) {
      return res.status(400).json({ message: 'Bạn đã có yêu cầu hoặc đã đặt phòng này.' });
    }

    const newBooking = new Booking({
      userId,
      roomId,
      boardingHouseId,
      contractStatus: 'pending_approval',
      guestInfo // ✅ lưu guestInfo trực tiếp
    });

    const savedBooking = await newBooking.save();

    // Tạo notification cho chủ nhà
    const house = await BoardingHouse.findById(boardingHouseId).select('ownerId name');
    if (house && house.ownerId && room) {
      await Notification.create({
        userId: house.ownerId,
        type: 'new_booking_request',
        message: `${userName} vừa gửi yêu cầu đặt phòng ${room.roomNumber} tại ${house.name}.`,
        link: '/owner/pending-bookings',
        relatedBookingId: savedBooking._id
      });
    }

    res.status(201).json({ message: 'Yêu cầu đặt phòng đã được gửi thành công.', booking: savedBooking });

  } catch (error) {
    console.error("[REQUEST BOOKING ERROR]", error);
    res.status(500).json({ message: 'Lỗi server khi gửi yêu cầu.' });
  }
};


exports.getPendingBookings = async (req, res) => {
  try {
    const ownerId = req.user.id;
    // Tìm các nhà trọ của owner này
    const ownerHouses = await BoardingHouse.find({ ownerId }).select('_id');
    const houseIds = ownerHouses.map(h => h._id);

    // Tìm các booking đang chờ duyệt của các nhà trọ đó
    const pendingBookings = await Booking.find({
      boardingHouseId: { $in: houseIds },
      contractStatus: 'pending_approval'
    })
      .populate('userId', 'name email phone') // Lấy thông tin người thuê
      .populate('boardingHouseId', 'name location') // Lấy thông tin nhà trọ
      .populate('roomId', 'roomNumber price area') // Lấy thông tin phòng
      .sort({ createdAt: -1 });

    res.status(200).json(pendingBookings);
  } catch (error) {
    console.error("[GET PENDING BOOKINGS ERROR]", error);
    res.status(500).json({ message: 'Lỗi server khi lấy yêu cầu.' });
  }
};

exports.updateBookingApproval = async (req, res) => {
  const { bookingId } = req.params;
  const { status, reason } = req.body; // status: 'approved' hoặc 'rejected'
  const ownerId = req.user.id;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ.' });
  }
  if (status === 'rejected' && !reason) {
    return res.status(400).json({ message: 'Vui lòng cung cấp lý do từ chối.' });
  }

  try {
    const booking = await Booking.findById(bookingId).populate({
      path: 'boardingHouseId',
      select: 'ownerId' // Chỉ cần ownerId để kiểm tra quyền
    });

    if (!booking) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu đặt phòng.' });
    }
    if (booking.boardingHouseId.ownerId.toString() !== ownerId) {
      return res.status(403).json({ message: 'Bạn không có quyền duyệt yêu cầu này.' });
    }
    if (booking.contractStatus !== 'pending_approval') {
      return res.status(400).json({ message: 'Yêu cầu này đã được xử lý.' });
    }

    booking.contractStatus = status;
    if (status === 'approved') {
      booking.approvedAt = new Date();
      // KHÔNG đổi trạng thái phòng ở đây, chờ thanh toán
    } else {
      booking.rejectedAt = new Date();
      booking.rejectionReason = reason;
    }

    await booking.save();

    // TODO: Gửi thông báo đến người thuê (booking.userId) về quyết định
    // Ví dụ: await notificationService.notifyTenantBookingStatus(booking.userId, booking);

    res.status(200).json({ message: `Đã ${status === 'approved' ? 'chấp thuận' : 'từ chối'} yêu cầu.`, booking });

  } catch (error) {
    console.error("[UPDATE BOOKING APPROVAL ERROR]", error);
    res.status(500).json({ message: 'Lỗi server khi duyệt yêu cầu.' });
  }
};

exports.cancelBookingRequest = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.id;

    // ✅ SỬ DỤNG findByIdAndUpdate ĐỂ AN TOÀN HƠN
    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,          // Tìm đúng booking
        userId: userId,          // Đảm bảo đúng người dùng
        contractStatus: 'pending_approval' // Đảm bảo đúng trạng thái có thể hủy
      },
      {
        // Chỉ cập nhật trường này
        status: 'cancel',
        contractStatus: 'cancelled_by_tenant'
      },
      { new: true } // Trả về document đã được cập nhật
    );

    // --- Validation ---
    if (!updatedBooking) {
      // Lý do không tìm thấy có thể là:
      // 1. Sai bookingId
      // 2. Không phải booking của user này
      // 3. Booking không còn ở trạng thái 'pending_approval'
      // --> Kiểm tra lại booking gốc để biết lý do chính xác (tùy chọn)
      const existingBooking = await Booking.findById(bookingId);
      if (!existingBooking) {
        return res.status(404).json({ message: 'Không tìm thấy yêu cầu đặt phòng.' });
      } else if (existingBooking.userId.toString() !== userId) {
        return res.status(403).json({ message: 'Bạn không có quyền hủy yêu cầu này.' });
      } else if (existingBooking.contractStatus !== 'pending_approval') {
        return res.status(400).json({ message: 'Không thể hủy yêu cầu đã được xử lý.' });
      } else {
        // Lỗi không xác định khác
        return res.status(500).json({ message: 'Không thể cập nhật yêu cầu.' });
      }
    }

    res.status(200).json({ message: 'Đã hủy yêu cầu đặt phòng thành công.', booking: updatedBooking });

  } catch (error) {
    console.error("[CANCEL BOOKING ERROR]", error);
    res.status(500).json({ message: 'Lỗi server khi hủy yêu cầu.' });
  }
};
exports.checkOutBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // ✅ Cập nhật trạng thái booking
    booking.status = "Checked-out";
    booking.checkedOutAt = new Date();
    await booking.save();

    // ✅ Cập nhật lại phòng
    if (booking.roomId) {
      await Room.findByIdAndUpdate(booking.roomId, {
        status: "Available",
        customerId: null,
      });
    }

    return res.json({ message: "Room checked out successfully", booking });
  } catch (error) {
    console.error("Error during checkout:", error);
    res.status(500).json({ message: "Server error during checkout" });
  }
};

exports.signContract = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { signatureImageBase64 } = req.body;

    if (!signatureImageBase64) {
      return res.status(400).json({ message: "Chữ ký không được cung cấp." });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking không tìm thấy." });
    }

    // Kiểm tra xem người dùng có quyền ký không (ví dụ: là người tạo booking)
    // if (booking.userId.toString() !== req.user.id) {
    //     return res.status(403).json({ message: "Bạn không có quyền ký hợp đồng này." });
    // }

    // Lưu chữ ký vào booking hoặc tạo một collection Contract riêng
    // Ví dụ: lưu vào booking
    booking.tenantSignature = signatureImageBase64;
    booking.contractSignedDate = new Date();
    booking.status = 'Contract Signed'; // Cập nhật trạng thái

    await booking.save();

    res.status(200).json({ message: "Hợp đồng đã được ký thành công!", booking });

  } catch (error) {
    console.error("Error in signContract:", error);
    res.status(500).json({ message: "Lỗi server khi ký hợp đồng.", error: error.message });
  }
};