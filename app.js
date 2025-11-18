const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const socketIo = require("socket.io");
require("dotenv").config();
const crypto = require("crypto");
const Payment = require("./src/models/Payment");
const Booking = require("./src/models/Booking");
const http = require('http');
const { Server } = require("socket.io");
require("./src/service/cancelExpiredBookings");

const PORT = process.env.PORT;
const app = express();
const server = http.createServer(app);

// ------------ conflicted socket.io code ----------
// const server = http.createServer(app);
// const io = new Server(server, { 
//     cors: {
//         origin: "*", 
//         methods: ["GET", "POST"]
//     }
// });
// app.use((req, res, next) => {
//   req.io = io;
//   next();
// });
// io.on('connection', (socket) => {
//   console.log('A user connected');

//   // Cho user tham gia một "phòng" riêng, đặt tên bằng userId của họ
//   // Client sẽ gửi sự kiện này sau khi kết nối
//   socket.on('joinUserRoom', (userId) => {
//     if (userId) {
//       socket.join(userId);
//       console.log(`User ${userId} joined room ${userId}`);
//     }
//   });

//   socket.on('disconnect', () => {
//     console.log('User disconnected');
//   });
// });

// --- Socket.IO setup ---
const onlineUsers = new Map();
const busyUsers = new Set();

const allowedOrigins = [
  "https://tronhanh-fe.onrender.com",              // React Local
  "http://localhost:5173",              // Vite Local (nếu có dùng)
  "https://tronhanh-fe.onrender.com",   // Frontend đã Deploy của bạn
  process.env.FRONTEND_URL              // Biến môi trường (nếu có)
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 25000,
  pingInterval: 20000,
});

// Configure CORS for express to accept requests from the front-end and allow credentials
// (important when FE sends fetch(..., { credentials: 'include' }))
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use("/uploads", express.static("uploads"));

// Make io accessible in routes/controllers
app.set("io", io);

function broadcastOnlineUsers(io) {
  io.emit("online-users", Array.from(onlineUsers.keys()));
}

// Middleware to attach userId from handshake
io.use((socket, next) => {
  const userId = socket.handshake.auth?.userId;
  if (userId) {
    socket.data.userId = userId;
  }
  next();
});

io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id);

  // If userId was provided at connect time, mark online immediately
  if (socket.data.userId) {
    const userId = socket.data.userId;
    onlineUsers.set(userId, socket.id);
    broadcastOnlineUsers(io);
    socket.join(`user:${userId}`);
    socket.emit("user-added", { ok: true, socketId: socket.id });
    console.log(`👤 User ${userId} is now online with socket ${socket.id}`);
  }

  // Fallback: legacy add-user event
  socket.on("add-user", (userId) => {
    if (!userId) return;
    onlineUsers.set(userId, socket.id);
    socket.data.userId = userId;
    socket.join(`user:${userId}`);
    socket.emit("user-added", { ok: true, socketId: socket.id });
    console.log(`👤 User ${userId} added with socket ${socket.id}`);
    broadcastOnlineUsers(io);
  });

  // ===== CHAT EVENTS =====

  // Join a chat room
  socket.on("joinRoom", (roomId) => {
    if (!roomId) return;
    socket.join(`room:${roomId}`);
    console.log(`🚪 User ${socket.data.userId} joined room ${roomId}`);
    socket.to(`room:${roomId}`).emit("user-joined", {
      userId: socket.data.userId,
      roomId,
    });
  });

  // Leave a chat room
  socket.on("leaveRoom", (roomId) => {
    if (!roomId) return;
    socket.leave(`room:${roomId}`);
    console.log(`🚪 User ${socket.data.userId} left room ${roomId}`);
    socket.to(`room:${roomId}`).emit("user-left", {
      userId: socket.data.userId,
      roomId,
    });
  });

  // Send message to room
  socket.on("sendMessage", ({ roomId, message }) => {
    if (!roomId || !message) return;
    const payload = {
      roomId,
      message,
      senderId: socket.data.userId,
      createdAt: new Date().toISOString(),
    };
    console.log(`💬 Message sent to room ${roomId} by user ${socket.data.userId}`);
    io.to(`room:${roomId}`).emit("newMessage", payload);
  });

  // Typing indicator
  socket.on("typing", ({ roomId, isTyping }) => {
    if (!roomId) return;
    socket.to(`room:${roomId}`).emit("typing", {
      userId: socket.data.userId,
      roomId,
      isTyping: !!isTyping,
    });
  });

  // ===== WEBRTC SIGNALING EVENTS =====

  // WebRTC Offer
  socket.on("webrtc-offer", ({ toUserId, roomId, offer }) => {
    if (!offer) return;
    console.log(`📞 WebRTC offer from ${socket.data.userId}`);

    if (toUserId) {
      const targetSocket = onlineUsers.get(toUserId);
      if (targetSocket) {
        io.to(targetSocket).emit("webrtc-offer", {
          fromUserId: socket.data.userId,
          offer,
        });
      } else {
        socket.emit("user-offline", { toUserId });
      }
    } else if (roomId) {
      socket.to(`room:${roomId}`).emit("webrtc-offer", {
        fromUserId: socket.data.userId,
        roomId,
        offer,
      });
    }

    busyUsers.add(socket.userId);
    io.to(toUserId).emit("webrtc-offer", { fromUserId: socket.userId, offer });
  });

  // WebRTC Answer
  socket.on("webrtc-answer", ({ toUserId, roomId, answer }) => {
    if (!answer) return;
    console.log(`📞 WebRTC answer from ${socket.data.userId}`);

    if (toUserId) {
      const targetSocket = onlineUsers.get(toUserId);
      if (targetSocket) {
        io.to(targetSocket).emit("webrtc-answer", {
          fromUserId: socket.data.userId,
          answer,
        });
      }
    } else if (roomId) {
      socket.to(`room:${roomId}`).emit("webrtc-answer", {
        fromUserId: socket.data.userId,
        roomId,
        answer,
      });
    }
  });

  // WebRTC ICE Candidate
  socket.on("webrtc-ice-candidate", ({ toUserId, roomId, candidate }) => {
    if (!candidate) return;
    console.log(`🧊 ICE candidate from ${socket.data.userId}`);

    if (toUserId) {
      const targetSocket = onlineUsers.get(toUserId);
      if (targetSocket) {
        io.to(targetSocket).emit("webrtc-ice-candidate", {
          fromUserId: socket.data.userId,
          candidate,
        });
      }
    } else if (roomId) {
      socket.to(`room:${roomId}`).emit("webrtc-ice-candidate", {
        fromUserId: socket.data.userId,
        roomId,
        candidate,
      });
    }
  });

  // End call
  socket.on("end-call", ({ toUserId, roomId }) => {
    console.log(`📴 Call ended by ${socket.data.userId}`);

    if (toUserId) {
      const targetSocket = onlineUsers.get(toUserId);
      if (targetSocket) {
        io.to(targetSocket).emit("end-call", {
          fromUserId: socket.data.userId,
        });
      }
    } else if (roomId) {
      socket.to(`room:${roomId}`).emit("end-call", {
        fromUserId: socket.data.userId,
        roomId,
      });
    }
  });

  // check if the caller is calling a busy receiver
  // socket.on("check-busy", ({ toUserId }) => {
  //   const targetSocket = onlineUsers.get(toUserId);
  //   if (targetSocket && busyUsers.has(toUserId)) {
  //     socket.emit("busy-response", { busy: true });
  //   } else {
  //     socket.emit("busy-response", { busy: false });
  //   }
  // });

  socket.on("end-call", ({ toUserId }) => {
    busyUsers.delete(socket.userId);
    io.to(toUserId).emit("end-call", { fromUserId: socket.userId });
  });

  // ping/pong
  socket.on("ping", () => {
    socket.emit("pong");
  });

  // Handle disconnect
  socket.on("disconnect", (reason) => {
    const userId = socket.data.userId;
    if (userId && onlineUsers.get(userId) === socket.id) {
      onlineUsers.delete(userId);
      broadcastOnlineUsers(io);
      console.log(`🔴 User ${userId} disconnected (${reason})`);
    }
    console.log("🔴 Socket disconnected:", socket.id);
  });
});

const { handlePayOSWebhook } = require("./src/controllers/payOSController");

// Dành cho PayOS xác thực URL
app.get("/api/payment/webhook", (req, res) => {
  console.log("!!!!!!!!!! BẮT ĐƯỢC REQUEST GET XÁC THỰC !!!!!!!!!!");
  res.status(200).json({ message: "DEBUG SUCCESS: GET request received!" });
});
app.post("/api/payment/webhook", express.raw({ type: "application/json" }), handlePayOSWebhook);
// app.post("/api/payment/webhook", express.raw({ type: "application/json" }), (req, res, next) => {
//   console.log("📥 Webhook route HIT!");
//   next();
// }, handlePayOSWebhook);

// Dành cho PayOS gửi dữ liệu thanh toán
// app.post("/api/payment/webhook", express.raw({ type: "application/json" }), async (req, res) => { // Thêm async ở đây
//     console.log("!!!!!!!!!! BẮT ĐƯỢC REQUEST WEBHOOK !!!!!!!!!!");

//     try {
//         const isSandbox = process.env.PAYOS_USE_SANDBOX === "true";

//         console.log("📌 Headers webhook:", req.headers);
//         console.log("📌 Raw body type:", typeof req.body, req.body instanceof Buffer);

//         // --- Signature check ---
//         if (!isSandbox) {
//             const signature = req.headers["x-signature"];
//             if (!(req.body instanceof Buffer)) {
//                 throw new Error("req.body is not a Buffer, cannot compute signature");
//             }
//             const computedSig = crypto
//                 .createHmac("sha256", process.env.PAYOS_CHECKSUM_KEY)
//                 .update(req.body)
//                 .digest("hex");
//             if (computedSig !== signature) {
//                 console.log("❌ Invalid PayOS signature");
//                 return res.status(400).json({ message: "Invalid signature" });
//             }
//         } else {
//             console.log("⚠️ Sandbox mode: skip signature check");
//         }

//         // --- Parse dữ liệu webhook ---
//         let data;
//         if (req.body instanceof Buffer) {
//             data = JSON.parse(req.body.toString());
//         } else if (typeof req.body === "object") {
//             data = req.body;
//         } else {
//             throw new Error("Invalid request body");
//         }

//         console.log("📌 Webhook data:", data);
//         if (!data || !data.data) {
//             console.log("⚠️ Webhook received but data or data.data is missing. Ignoring.");
//             return res.status(200).json({ message: "Webhook received but no relevant data to process." });
//         }
//         const { orderCode, code, desc } = data.data;

//         // Code logic nghiệp vụ của em
//         const payment = await Payment.findOne({ orderCode });
//         if (!payment) {
//             console.log(`⚠️ Payment with orderCode ${orderCode} not found.`);
//             return res.status(200).json({ message: "Payment not found but webhook acknowledged." });
//         }

//         if (code === "00" || desc?.toLowerCase().includes("thành công")) {
//             payment.status = "Paid";
//             payment.completedAt = new Date();
//             await payment.save();

//             if (payment.bookingId) {
//                 await Booking.findByIdAndUpdate(payment.bookingId, { status: "paid" });
//             }
//             console.log(`✅ Payment ${orderCode} marked as PAID`);
//         } else {
//             payment.status = "Failed";
//             await payment.save();
//             console.log(`❌ Payment ${orderCode} failed`);
//         }

//         return res.status(200).json({ message: "Webhook processed successfully" });
//     } catch (error) {
//         console.error("❌ Error in PayOS webhook:", error);
//         res.status(500).json({ message: "Internal server error" });
//     }
//     // =================== XÓA DÒNG NÀY ĐI ===================
//     // res.status(200).json({ message: "DEBUG SUCCESS: Webhook received!" }); // Dòng này bị thừa
//     // =======================================================
// });

// Sau đó mới dùng JSON cho các route khác
app.use(express.json());
app.use("/uploads", express.static("uploads"));

//Connect DB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

//Routes
//Accomodation, User,...

app.get("/", (req, res) => {
  res.send("Welcome to TRO-NHANH");
});

//  Auth routes
const authRoutes = require("./src/routes/authRoutes");
app.use("/api/auth", authRoutes);

//  Profile routes
const profileRoutes = require("./src/routes/profileRoutes");
app.use("/api/customer", profileRoutes);


app.use("/api/owner", (req, res, next) => {
  next();
});

//  Owner routes
const ownerRoutes = require("./src/routes/ownerRoutes");
app.use("/api/owner", ownerRoutes);

//  BoardingHouse routes
const boardingHouseRoutes = require("./src/routes/boardingHouseRoutes");
app.use("/api/boarding-houses", boardingHouseRoutes);

// Room routes
const roomRoutes = require("./src/routes/roomRoutes");
app.use("/api/rooms", roomRoutes);

// Contract routes
const contractRoutes = require("./src/routes/contractRoutes");
app.use("/api/contracts", contractRoutes);

// AI Contract Generator routes
const aiContractRoutes = require('./src/routes/aiContractRoutes');
app.use('/api/ai', aiContractRoutes);

// Booking routes
const bookingRoutes = require("./src/routes/bookingRoutes");
app.use("/api/bookings", bookingRoutes);

//  Favorite routes
const favoriteRoutes = require("./src/routes/favoritesRoutes");
app.use("/api/favorites", favoriteRoutes);

// Chat Routes
const chatRoutes = require("./src/routes/chatRoutes");
app.use("/api/chats", chatRoutes);

// Message Routes
const messageRoutes = require("./src/routes/messageRoutes");
app.use("/api/messages", messageRoutes);

//  Roommate routes
const roommateRoutes = require("./src/routes/roommateRoutes");
app.use("/api/roommates", roommateRoutes);

//  Report routes
const reportRoutes = require("./src/routes/reportRoutes");
app.use("/api/reports", reportRoutes);

//  Admin routes
const adminRoutes = require("./src/routes/adminRoutes");
app.use("/api/admin", adminRoutes);

//  Membership routes
const membershipRoutes = require("./src/routes/membershipRoutes");
app.use("/api/membership-packages", membershipRoutes);

//  Payment routes
const paymentRoutes = require("./src/routes/paymentRoutes");
app.use("/api/payment", paymentRoutes);

// Ai routes
const aiRoutes = require("./src/routes/aiRoutes")
app.use("/api/ai", aiRoutes);

// Image Moderation Test routes
const imageModerationTestRoutes = require("./src/routes/imageModerationTestRoutes");
app.use("/api/test", imageModerationTestRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!");
});

const visitRequestRoutes = require('./src/routes/visitRequestRoutes');
app.use('/api/visit-requests', visitRequestRoutes);

server.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});