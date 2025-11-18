// TroNhanh_BE/src/controllers/vnpayController.js
const moment = require("moment");
const qs = require("qs");
const crypto = require("crypto");
const vnpayConfig = require("../config/vnpayConfig");
const url = require("url");
const Payment = require("../models/Payment");
const MembershipPackage = require("../models/MembershipPackage");
const Booking = require("../models/Booking");
const Accommodation = require("../models/BoardingHouse");

function sortAndBuildSignData(obj) {
  let keys = Object.keys(obj).sort();
  let signData = "";
  keys.forEach((key, index) => {
    let encodedValue = encodeURIComponent(obj[key]).replace(/%20/g, "+");
    signData += `${key}=${encodedValue}`;
    if (index < keys.length - 1) signData += "&";
  });
  return signData;
}

exports.createPaymentUrl = async (req, res) => {
  let ipAddr = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  if (ipAddr === "::1") ipAddr = "127.0.0.1";

  const { vnp_TmnCode, vnp_HashSecret, vnp_Url, vnp_ReturnUrl } = vnpayConfig;
  const { amount, packageId, userId, bookingId, type } = req.body;

  const date = new Date();
  const createDate = moment(date).format("YYYYMMDDHHmmss");
  const orderId = moment(date).format("DDHHmmss");

  // encode type and ids in orderInfo
  let orderInfoRaw;
  if (type === "booking") {
    orderInfoRaw = `type=booking|bookingId=${bookingId}|userId=${userId}`;
  } else {
    orderInfoRaw = `type=membership|packageId=${packageId}|userId=${userId}`;
  }
  const orderInfo = Buffer.from(orderInfoRaw).toString("base64");

  const paramsForSign = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: orderId,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "other",
    vnp_Amount: Math.round(amount) * 100,
    vnp_ReturnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
  };

  const signData = sortAndBuildSignData(paramsForSign);
  const hmac = crypto.createHmac("sha512", vnp_HashSecret);
  const secureHash = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  const finalParams = {
    ...paramsForSign,
    vnp_SecureHash: secureHash,
  };

  const paymentUrl = `${vnp_Url}?${qs.stringify(finalParams, {
    encode: true,
  })}`;

  res.json({ url: paymentUrl });
};

exports.vnpayReturn = async (req, res) => {
  const vnp_HashSecret = vnpayConfig.vnp_HashSecret;

  const parsedUrl = url.parse(req.originalUrl, true);
  const query = parsedUrl.query;
  const secureHash = query.vnp_SecureHash;

  const inputData = { ...query };
  delete inputData.vnp_SecureHash;
  delete inputData.vnp_SecureHashType;

  const signData = sortAndBuildSignData(inputData);
  const hmac = crypto.createHmac("sha512", vnp_HashSecret);
  const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  // parse type and ids from orderInfo
  let packageId = "";
  let userId = "";
  let bookingId = "";
  let type = "";

  try {
    const orderInfoDecoded = Buffer.from(
      query.vnp_OrderInfo,
      "base64"
    ).toString("utf-8");
    const parts = orderInfoDecoded.split("|").reduce((acc, part) => {
      const [k, v] = part.split("=");
      acc[k] = v;
      return acc;
    }, {});
    type = parts.type;
    packageId = parts.packageId;
    userId = parts.userId;
    bookingId = parts.bookingId;
  } catch (err) {
    console.error("❌ Lỗi giải mã orderInfo:", err);
  }

  if (secureHash === signed && query.vnp_ResponseCode === "00") {

    try {
      if (type === "membership") {
        const membershipPackage = await MembershipPackage.findById(packageId);

        if (!membershipPackage) {
          console.error("❌ Không tìm thấy gói membership.");
        } else {
          // Tạo payment record
          await Payment.create({
            ownerId: userId,
            membershipPackageId: packageId,
            vnpayTransactionId: query.vnp_TransactionNo || query.vnp_TxnRef,
            title: `Thanh toán gói ${membershipPackage.packageName}`,
            description: `Thanh toán gói ${membershipPackage.packageName} thành công qua VNPay`,
            amount: membershipPackage.price,
            status: "Paid",
            createAt: new Date(),
          });

          // Cập nhật isMembership trong User collection
          await User.findByIdAndUpdate(userId, {
            isMembership: 'active'
          });
        }
        return res.redirect(
          `https://tronhanh-fe.onrender.com/owner/membership-result?success=true&packageId=${packageId}`
        );
      } else if (type === "booking") {
        // update booking status to paid
        const updatedBooking = await Booking.findByIdAndUpdate(bookingId, {
          status: "paid",
          paymentInfo: {
            vnpayTransactionId: query.vnp_TransactionNo || query.vnp_TxnRef,
            amount: query.vnp_Amount / 100,
            paidAt: new Date(),
          },
        }, { new: true });

        // Update accommodation status and customerId after successful booking payment
        if (updatedBooking) {
          try {
            const accommodationUpdate = await Accommodation.findByIdAndUpdate(
              updatedBooking.propertyId,
              {
                customerId: updatedBooking.userId,
                status: "Booked"
              },
              { new: true }
            );
          } catch (accommodationError) {
            console.error("❌ Lỗi khi cập nhật accommodation:", accommodationError);
          }
        } else {
          console.log("❌ Không tìm thấy booking sau khi update");
        } console.log("✅ Đã cập nhật trạng thái booking thành paid.");
        return res.redirect(
          `https://tronhanh-fe.onrender.com/customer/booking-result?success=true&bookingId=${bookingId}`
        );
      }
    } catch (err) {
      console.error("❌ Lỗi khi lưu payment/booking:", err);
    }
  } else {
    console.log("❌ Callback chữ ký SAI");
    if (type === "membership") {
      return res.redirect(
        "https://tronhanh-fe.onrender.com/owner/membership-result?success=false"
      );
    } else if (type === "booking") {
      return res.redirect("https://tronhanh-fe.onrender.com/booking-result?success=false");
    } else {
      return res.redirect("https://tronhanh-fe.onrender.com/");
    }
  }
};

// Test function to manually update accommodation after booking
exports.testUpdateAccommodation = async (req, res) => {
  try {
    const { bookingId } = req.body;

    console.log("🧪 Testing accommodation update for bookingId:", bookingId);

    // Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    console.log("📋 Found booking:", booking);

    // Update accommodation
    const accommodationUpdate = await Accommodation.findByIdAndUpdate(
      booking.propertyId,
      {
        customerId: booking.userId,
        status: "Booked"
      },
      { new: true }
    );

    console.log("🏠 Updated accommodation:", accommodationUpdate);

    res.status(200).json({
      message: "Test update successful",
      booking,
      accommodation: accommodationUpdate
    });
  } catch (error) {
    console.error("❌ Test error:", error);
    res.status(500).json({ message: "Test failed", error: error.message });
  }
};