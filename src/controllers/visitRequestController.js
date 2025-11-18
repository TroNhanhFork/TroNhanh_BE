// controllers/visitRequestController.js
const VisitRequest = require("../models/VisitRequest");
const BoardingHouse = require("../models/BoardingHouse");
const emitPendingCountToOwner = async (io, ownerId) => {
  try {
    // Đếm số lượng request 'pending' của owner đó
    const count = await VisitRequest.countDocuments({ ownerId, status: "pending" });

    // Gửi event *mới* với con số count chính xác
    if (io) {
      io.to(ownerId.toString()).emit("owner_pending_count_update", { count });
      console.log(`✅ Emitted pending count (${count}) to owner ${ownerId}`);
    }
  } catch (error) {
    console.error("Error emitting pending count:", error);
  }
};
// 1. API: Khách hàng tạo yêu cầu xem trọ
exports.createVisitRequest = async (req, res) => {
  try {
    // KIỂM TRA ĐẦU TIÊN
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({ message: "Authentication failed. User not found." });
    }
    const customerId = req.user.id;
    const { boardingHouseId, ownerId, requestedDateTime, message } = req.body;

    if (!boardingHouseId || !ownerId || !requestedDateTime) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    if (customerId.toString() === ownerId.toString()) {
      return res.status(400).json({
        message: "You cannot schedule a visit for your own property.",
      });
    }
    if (new Date(requestedDateTime) < new Date()) {
      return res
        .status(400)
        .json({ message: "Requested date and time must be in the future." });
    }

    const newRequest = new VisitRequest({
      boardingHouseId,
      customerId,
      ownerId,
      requestedDateTime,
      message,
      status: "pending",
    });

    await newRequest.save();
   if (req.io) {
  // Gửi thông báo popup
  req.io.to(ownerId).emit("new_visit_request", {
    message: `Bạn có lịch hẹn mới từ ${req.user.name || "một khách hàng"}`,
    requestId: newRequest._id,
  });
  // Gửi số lượng count mới
  await emitPendingCountToOwner(req.io, ownerId); 
}
    res.status(201).json(newRequest);
  } catch (error) {
    console.error("Error creating visit request:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 2. API: Khách hàng xem các lịch hẹn của mình
exports.getCustomerVisitRequests = async (req, res) => {
  try {
    // KIỂM TRA ĐẦU TIÊN
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({ message: "Authentication failed. User not found." });
    }
    const customerId = req.user.id;

    const requests = await VisitRequest.find({ customerId })
      .populate("boardingHouseId", "name photos location price")
      .populate("ownerId", "name avatar")
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    console.error("Error fetching customer requests:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 3. API: Chủ nhà xem các lịch hẹn gửi đến mình
exports.getOwnerVisitRequests = async (req, res) => {
  try {
    // KIỂM TRA ĐẦU TIÊN
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({ message: "Authentication failed. User not found." });
    }
    const ownerId = req.user.id;

    const requests = await VisitRequest.find({ ownerId })
      .populate("boardingHouseId", "title location")
      .populate("customerId", "name avatar email phone")
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    console.error("Error fetching owner requests:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 4. API: Chủ nhà phản hồi (chấp nhận/từ chối) lịch hẹn
exports.respondToVisitRequest = async (req, res) => {
  try {
    // KIỂM TRA ĐẦU TIÊN
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({ message: "Authentication failed. User not found." });
    }
    const ownerId = req.user.id;
    const { id } = req.params;
    const { status, ownerNotes } = req.body;

    if (!status || !["confirmed", "rejected"].includes(status)) {
      return res.status(400).json({
        message: 'Invalid status. Must be "confirmed" or "rejected".',
      });
    }

    const request = await VisitRequest.findById(id);

    if (!request) {
      return res.status(404).json({ message: "Visit request not found." });
    }

    if (request.ownerId.toString() !== ownerId.toString()) {
      return res
        .status(403)
        .json({ message: "Forbidden. You are not the owner of this request." });
    }

    if (request.status !== "pending") {
      return res
        .status(400)
        .json({ message: `This request has already been ${request.status}.` });
    }

    request.status = status;
    if (ownerNotes) {
      request.ownerNotes = ownerNotes;
    }

    const updatedRequest = await request.save();
    if (req.io) {
  console.log(`✅ Emitting 'visit_request_update' to customer room: ${request.customerId}`);
  req.io.to(request.customerId.toString()).emit("visit_request_update", {
    message: `Lịch hẹn của bạn đã được ${updatedRequest.status}`,
    requestId: updatedRequest._id,
    status: updatedRequest.status,
  });

  await emitPendingCountToOwner(req.io, ownerId);
}

    res.status(200).json(updatedRequest);
  } catch (error) {
    console.error("Error responding to visit request:", error);
    res.status(500).json({ message: "Server error" });
  }
};
exports.getPendingVisitRequestCount = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      
      return res.status(401).json({ message: "Authentication failed." });
    }
    const ownerId = req.user.id;

    const count = await VisitRequest.countDocuments({
      ownerId,
      status: "pending",
    });

    res.status(200).json({ count });
  } catch (error) {
    console.error("Error fetching pending count:", error);
    res.status(500).json({ message: "Server error" });
  }
};
