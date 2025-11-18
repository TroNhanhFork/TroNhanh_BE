const Report = require('../models/Report')
const User = require('../models/User');
const Booking = require('../models/Booking');
const BoardingHouse = require('../models/BoardingHouse')
exports.createReport = async (req, res) => {
  try {
    const { type, content, accommodationId, bookingId, reportedUserId } = req.body;
    const reporterId = req.user.id;


    if (reportedUserId) {
      const existingReport = await Report.findOne({ reportedUserId, reporterId });
      if (existingReport) {
        return res.status(400).json({ message: "You have already reported this user." });
      }
    }

    const reportData = {
      reporterId,
      reporterId,
      type,
      content,
    };

    if (accommodationId) reportData.accommodationId = accommodationId;
    if (bookingId) reportData.bookingId = bookingId;
    if (reportedUserId) reportData.reportedUserId = reportedUserId;

    const report = new Report(reportData);
    await report.save();

    res.status(201).json(report);
  } catch (error) {
    console.error("❌ Error creating report:", error);
    res.status(500).json({ message: "Failed to create report" });
  }
};



exports.getMyReports = async (req, res) => {
  try {
    console.log("🔍 Getting reports for user:", req.user);
    console.log("🔍 User ID:", req.user?.id);

    const reports = await Report.find({ reporterId: req.user.id })
      .populate('accommodationId', 'title location status')
      .populate('bookingId', 'checkInDate checkOutDate totalPrice status')
      .populate('reportedUserId', 'name email')
      .sort({ createAt: -1 });

    console.log("✅ Found reports:", reports.length);
    res.json(reports);
  } catch (error) {
    console.error("❌ Error in getMyReports:", error);
    res.status(500).json({ message: "Server error" });
  }
};
exports.getOwners = async (req, res) => {
  try {
    const owners = await User.find({ role: 'owner' }).select('_id name role avatar');
    res.status(200).json(owners);
  } catch (error) {
    console.error("Failed to fetch owners:", error);
    res.status(500).json({ message: "Failed to fetch owners" });
  }
};
exports.checkBookingHistory = async (req, res) => {
  try {
    const reporterId = req.user?.id;
    const { reportedUserId } = req.query;

    if (!reporterId) {
      return res.status(401).json({ message: "Unauthorized: Missing user info" });
    }

    if (!reportedUserId) {
      return res.status(400).json({ message: "Missing reportedUserId in query params" });
    }

    // Tìm tất cả accommodation thuộc owner bị báo cáo
    const properties = await BoardingHouse.find({ ownerId: reportedUserId }).select("_id");
    console.log("🏠 Properties:", properties);
    const propertyIds = properties.map(p => p._id);

    if (propertyIds.length === 0) {
      return res.status(200).json({ hasHistory: false });
    }



    const booking = await Booking.findOne({
      userId: reporterId,
      boardingHouseId: { $in: propertyIds },
      status: { $in: ["paid", "approved"] },
    });


    return res.status(200).json({ hasHistory: !!booking });
  } catch (error) {
    console.error("Error checking booking history:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};