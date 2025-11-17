const cron = require("node-cron");
const Booking = require("../models/Booking");
const Room = require("../models/Room"); // ✅ Import Room model

// Thời gian hết hạn booking: 15 phút (tính bằng ms) - Có thể nên đặt trong .env
const EXPIRATION_TIME = parseInt(process.env.BOOKING_EXPIRATION_TIME_MS || 15 * 60 * 1000); // Lấy từ biến môi trường hoặc mặc định

// Cron job chạy mỗi phút
cron.schedule("0 * * * *", async () => {
  const now = new Date();
  console.log(`\n🕒 [${now.toLocaleTimeString("vi-VN")}] Running Booking Expiry Check...`);

  try {
    // Tìm các booking đang chờ duyệt (pending_approval) và đã quá hạn
    const expiredBookings = await Booking.find({
      contractStatus: "pending_approval", // ✅ Trạng thái đúng cần kiểm tra
      createdAt: { $lt: new Date(now.getTime() - EXPIRATION_TIME) } // Tìm những booking tạo trước thời điểm hết hạn
    }).select('_id roomId contractStatus createdAt'); // Chỉ lấy các trường cần thiết

    const totalExpired = expiredBookings.length;

    if (totalExpired > 0) {
      console.log(`   🟡 Found ${totalExpired} expired booking requests.`);
      let cancelledCount = 0;
      let roomReopenedCount = 0;

      for (const booking of expiredBookings) {
        // ✅ Cập nhật booking -> cancelled_by_system (hoặc trạng thái tương tự)
        const updatedBooking = await Booking.findByIdAndUpdate(
          booking._id,
          { contractStatus: "cancelled_by_system" }, // Đặt trạng thái mới
          { new: true } // Không cần thiết nếu không dùng kết quả
        );

        if (updatedBooking) {
          cancelledCount++;
          // ✅ Mở lại phòng (Cập nhật model Room bằng roomId)
          if (booking.roomId) { // Kiểm tra roomId tồn tại
            const updatedRoom = await Room.findByIdAndUpdate(
              booking.roomId,
              {
                status: "Available", // Mở lại phòng
                customerId: null,   // Xóa người thuê tiềm năng
              },
              { new: true } // Không cần thiết nếu không dùng kết quả
            );
            if (updatedRoom) {
              roomReopenedCount++;
            } else {
              console.warn(`   ⚠️ Could not find or reopen Room ID: ${booking.roomId} for Booking ID: ${booking._id}`);
            }
          } else {
            console.warn(`   ⚠️ Booking ID: ${booking._id} is missing roomId.`);
          }
        } else {
          console.warn(`   ⚠️ Failed to cancel Booking ID: ${booking._id}`);
        }
      }
      console.log(`   ❌ Cancelled: ${cancelledCount} bookings.`);
      console.log(`   🔓 Rooms reopened: ${roomReopenedCount}.`);

    } else {
      console.log("   ✅ No expired booking requests found.");
    }

  } catch (error) {
    console.error("🔥 Error in booking cleanup cron job:", error);
  }
});

console.log("✅ Booking expiry cron job started (chạy mỗi đầu giờ)");