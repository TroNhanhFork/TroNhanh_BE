const axios = require("axios");
const crypto = require("crypto");
const Payment = require("../models/Payment");
const MembershipPackage = require("../models/MembershipPackage");
const Booking = require("../models/Booking");
const Boarding = require("../models/BoardingHouse");
const User = require("../models/User");
const Membership = require("../models/Membership");
const Room = require("../models/Room");
const PAYOS_SANDBOX_API = "https://api-merchant.payos.vn/v2/payment-requests";
const PAYOS_PROD_API = "https://api-merchant.payos.vn/v2/payment-requests";

exports.createPaymentUrl = async (req, res) => {
  try {
    const { packageId, userId, bookingId, type } = req.body;
    if (!userId || !type)
      return res
        .status(400)
        .json({ message: "Missing required fields (userId, type)" });

    let amount = 0,
      description = "",
      finalBookingId = bookingId,
      userMembershipId = null,
      membershipPackageId = null;

    // Lấy user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    // Xử lý theo type
    if (type === "membership") {
      if (!packageId)
        return res
          .status(400)
          .json({ message: "packageId is required for membership purchase" });

      const membershipPackage = await MembershipPackage.findById(packageId);
      if (!membershipPackage || !membershipPackage.isActive)
        return res
          .status(404)
          .json({ message: "Membership package not found or inactive." });

      amount = membershipPackage.price;
      description = `Buy Membership: ${membershipPackage.packageName}`;
      membershipPackageId = membershipPackage._id;

      // Kiểm tra pending membership
      const existingMembership = await Membership.findOne({
        ownerId: userId,
        packageId,
        status: "Pending",
      });
      if (existingMembership)
        return res
          .status(400)
          .json({
            message: "You already have a pending membership for this package.",
          });

      // Tạo Pending membership với startDate = now, endDate = startDate + duration
      const now = new Date();
      const durationMs =
        (membershipPackage.duration || 0) * 24 * 60 * 60 * 1000;
      const endDate = new Date(now.getTime() + durationMs);

      const userMembership = await Membership.create({
        ownerId: userId,
        packageId: membershipPackage._id,
        type: membershipPackage.packageName,
        price: amount,
        status: "Pending",
        startDate: now,
        endDate: endDate,
      });
      userMembershipId = userMembership._id;
    } else if (type === "booking") {
      if (!bookingId)
        return res
          .status(400)
          .json({ message: "bookingId is required for booking payment" });
      const booking = await Booking.findById(bookingId);
      if (!booking)
        return res.status(404).json({ message: "Booking not found." });

      amount = booking.totalPrice;
      description = `Pay for Booking #${booking.bookingCode || booking._id}`;
    } else {
      return res.status(400).json({ message: "Invalid payment type" });
    }

    // Sandbox test
    const useSandbox = process.env.PAYOS_USE_SANDBOX === "true";
    const testAmount =
      useSandbox && process.env.PAYOS_TEST_AMOUNT
        ? parseInt(process.env.PAYOS_TEST_AMOUNT, 10)
        : null;
    if (testAmount && !isNaN(testAmount)) amount = testAmount;

    const orderCode = Math.floor(Date.now() / 1000);

    // URLs
    const baseReturnUrl =
      user.role === "owner"
        ? process.env.PAYOS_RETURN_URL_OWNER
        : process.env.PAYOS_RETURN_URL;
    const baseCancelUrl =
      user.role === "owner"
        ? process.env.PAYOS_CANCEL_URL_OWNER
        : process.env.PAYOS_CANCEL_URL;
    const returnUrl = `${baseReturnUrl}&orderCode=${orderCode}&type=${type}${finalBookingId ? `&bookingId=${finalBookingId}` : ""
      }`;
    const cancelUrl = `${baseCancelUrl}&type=${type}&orderCode=${orderCode}`;


    // Signature
    const rawSignature = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description.slice(
      0,
      25
    )}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
    const signature = crypto
      .createHmac("sha256", process.env.PAYOS_CHECKSUM_KEY)
      .update(rawSignature)
      .digest("hex");

    const payload = {
      orderCode,
      amount,
      description: description.slice(0, 25),
      cancelUrl,
      returnUrl,
      signature,
    };
    const PAYOS_API = useSandbox ? PAYOS_SANDBOX_API : PAYOS_PROD_API;

    const response = await axios.post(PAYOS_API, payload, {
      headers: {
        "x-client-id": process.env.PAYOS_CLIENT_ID,
        "x-api-key": process.env.PAYOS_API_KEY,
      },
    });

    const checkoutUrl = response.data?.data?.checkoutUrl;
    if (!checkoutUrl) {
      console.log("📩 PayOS raw response:", response.data);
      throw new Error("PayOS response invalid: no checkoutUrl returned");
    }

    // ExpiredAt 15 phút
    const expiredAt = new Date(Date.now() + 15 * 60000);

    // Tạo Payment record
    await Payment.create({
      ownerId: userId,
      userMembershipId,
      membershipPackageId,
      bookingId: finalBookingId,
      title: description,
      amount,
      status: "Pending",
      orderCode,
      expiredAt,
    });

    return res.json({ url: checkoutUrl });
  } catch (error) {
    console.error("❌ PayOS Error:", error.response?.data || error.message);
    return res.status(500).json({
      message: "Failed to create PayOS payment",
      details: error.response?.data || error.message,
    });
  }
};

/**
 * PayOS không gọi callback trực tiếp như VNPay,
 * nên bạn nên dùng webhook PayOS để xác nhận thanh toán thành công.
 * Tuy nhiên, nếu bạn chỉ cần redirect + query success/fail (test/demo),
 * bạn có thể xử lý qua `returnUrl` như VNPayReturn trước đây.
 */

exports.payosReturn = async (req, res) => {
  try {
    console.log("🔁 PayOS user is returning with query:", req.query);

    // Lấy tất cả các query params mà PayOS trả về
    const queryParams = req.query;

    // Xác định trang frontend cần chuyển hướng đến
    // Dựa trên thông tin em có, hoặc mặc định
    // Ví dụ: em có thể thêm một param 'type' vào returnUrl lúc tạo
    // Ở đây ta dùng URL cơ sở từ .env
    let baseFrontendUrl = process.env.PAYOS_RETURN_URL; // Ví dụ: http://localhost:3000/customer/booking-result
    if (queryParams.userId) {
      const user = await User.findById(queryParams.userId);
      if (user && user.role === "owner") {
        baseFrontendUrl = process.env.PAYOS_RETURN_URL_OWNER;
      }
    }

    // Xây dựng lại URL của frontend với đầy đủ thông tin
    const redirectUrl = new URL(baseFrontendUrl);

    // Gắn tất cả các query params từ PayOS vào URL để redirect
    // Frontend sẽ tự đọc các params này (success, orderCode, bookingCode, etc.)
    for (const key in queryParams) {
      redirectUrl.searchParams.set(key, queryParams[key]);
    }

    // Chuyển hướng người dùng về frontend
    return res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error("❌ PayOS return error:", error);
    // Nếu có lỗi, chuyển về một trang lỗi chung
    const errorRedirectUrl = new URL(process.env.PAYOS_CANCEL_URL);
    errorRedirectUrl.searchParams.set("error", "processing_return_url");
    return res.redirect(errorRedirectUrl.toString());
  }
};

exports.handlePayOSWebhook = async (req, res) => {
  try {
    console.log("🔔 [Webhook Received] Raw body:", req.body);
    console.log("🚀 Webhook route triggered!");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body?.toString?.() || req.body);
    const isSandbox = process.env.PAYOS_USE_SANDBOX === "true";

    // Xác thực signature (bỏ qua Sandbox)
    if (!isSandbox) {
      const signature = req.headers["x-signature"];
      if (!(req.body instanceof Buffer))
        throw new Error("req.body is not a Buffer");
      const computedSig = crypto
        .createHmac("sha256", process.env.PAYOS_CHECKSUM_KEY)
        .update(req.body)
        .digest("hex");
      if (computedSig !== signature)
        return res.status(400).json({ message: "Invalid signature" });
    }

    // Lấy payload
    const data =
      req.body instanceof Buffer ? JSON.parse(req.body.toString()) : req.body;
    if (!data?.data)
      return res.status(200).json({ message: "No relevant data" });

    const { orderCode } = data.data;
    const code = data.data.code || data.code; // PayOS sandbox hoặc thực tế
    const desc = data.data.desc || data.desc;

    console.log("Webhook payload:", data);

    // Tìm payment
    const payment = await Payment.findOne({ orderCode });
    if (!payment || payment.status !== "Pending")
      return res.status(200).json({ message: "Webhook ignored" });

    // Expired check
    if (payment.expiredAt && new Date() > payment.expiredAt) {
      payment.status = "Expired";
      await payment.save();
      return res.status(200).json({ message: "Payment expired" });
    }
    const status = data.data.status?.toUpperCase();
    console.log("Status ", status)

    if (code === "00" || status == "PAID" || desc?.toLowerCase().includes("success")) {
      payment.status = "Paid";
      payment.completedAt = new Date();
      await payment.save();
      console.log("Paymen saved ", status)

      // Xử lý booking nếu có
      if (payment.bookingId) {
        const updatedBooking = await Booking.findByIdAndUpdate(
          payment.bookingId,
          {
            status: "paid",
            contractStatus: "paid"
          },
          { new: true }
        );
        if (updatedBooking) {
          // ✅ Cập nhật phòng của booking sang "Booked"
          await Room.findByIdAndUpdate(updatedBooking.roomId, {
            status: "Booked",
            customerId: updatedBooking.userId,
          });
        }
      }

      // Xử lý membership nếu có
      if (payment.membershipPackageId && payment.ownerId) {
        // Lấy gói membership (cần thiết cho thông tin duration, type, price)
        const membershipPackage = await MembershipPackage.findById(
          payment.membershipPackageId
        );
        if (!membershipPackage) {
          console.error(
            `Webhook Error: MembershipPackage ${payment.membershipPackageId} not found.`
          );
          throw new Error(
            "MembershipPackage not found during webhook processing"
          );
        }

        const now = new Date();
        const durationMs =
          (membershipPackage.duration || 0) * 24 * 60 * 60 * 1000;

        // Tìm Active membership CÙNG LOẠI (packageName)
        const existingActive = await Membership.findOne({
          ownerId: payment.ownerId,
          type: membershipPackage.packageName, // Quan trọng: kiểm tra theo 'type' (ví dụ: 'Bronze')
          status: "Active",
        });

        if (existingActive) {
          // 1. GIA HẠN: Nếu đã có gói Active cùng loại, gia hạn endDate
          existingActive.endDate = new Date(
            // Lấy thời gian hết hạn hiện tại, hoặc 'now' nếu nó đã hết hạn, rồi cộng thêm
            Math.max(
              existingActive.endDate?.getTime() || now.getTime(),
              now.getTime()
            ) + durationMs
          );
          // Đảm bảo packageId được cập nhật (nếu logic của bạn cho phép nâng cấp/thay đổi gói)
          existingActive.packageId = membershipPackage._id;
          await existingActive.save(); // Xóa Pending membership (nếu nó tồn tại) vì đã gia hạn

          if (payment.userMembershipId) {
            await Membership.findByIdAndDelete(payment.userMembershipId);
          }
        } else {
          // 2. KÍCH HOẠT HOẶC TẠO MỚI: Nếu không có gói Active
          // Thử tìm 'Pending' membership đã được tạo lúc thanh toán
          let pendingMembership = null;
          if (payment.userMembershipId) {
            pendingMembership = await Membership.findById(
              payment.userMembershipId
            );
          }

          if (pendingMembership && pendingMembership.status === "Pending") {
            // 2a. Kích hoạt 'Pending' thành 'Active'
            pendingMembership.status = "Active";
            pendingMembership.startDate = now;
            pendingMembership.endDate = new Date(now.getTime() + durationMs); // Cập nhật lại thông tin gói (để đảm bảo)
            pendingMembership.packageId = membershipPackage._id;
            pendingMembership.type = membershipPackage.packageName;
            pendingMembership.price = membershipPackage.price;
            await pendingMembership.save();
          } else {
            // 2b. Tạo mới 'Active' (dự phòng trường hợp không tìm thấy pending)
            await Membership.create({
              ownerId: payment.ownerId,
              packageId: membershipPackage._id, // packageId được cung cấp
              type: membershipPackage.packageName,
              price: membershipPackage.price,
              status: "Active",
              startDate: now,
              endDate: new Date(now.getTime() + durationMs),
            });
          }
        } // Cập nhật trạng thái user

        await User.findByIdAndUpdate(payment.ownerId, {
          isMembership: "active",
        });
      }
    } else {
      // Thanh toán thất bại
      payment.status = "Failed";
      await payment.save();

      if (payment.userMembershipId) {
        await Membership.findByIdAndUpdate(payment.userMembershipId, {
          status: "Inactive",
        });
      }
    }

    return res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error("❌ Error in PayOS webhook:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.cancelPayment = async (req, res) => {
  try {
    const { orderCode } = req.body;
    const payment = await Payment.findOne({ orderCode });
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    if (payment.status === "Pending") {
      payment.status = "Cancelled";
      await payment.save();

      // Nếu là membership pending
      if (payment.userMembershipId) {
        await Membership.findByIdAndUpdate(payment.userMembershipId, {
          status: "Cancelled",
        });
      }

      // Nếu là booking pending
      if (payment.bookingId) {
        await Booking.findByIdAndUpdate(payment.bookingId, { status: "cancelled" });
      }
    }

    return res.status(200).json({ message: "Payment cancelled successfully" });
  } catch (err) {
    console.error("Cancel payment error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
