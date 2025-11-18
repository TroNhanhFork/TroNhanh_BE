const mongoose = require("mongoose");
const BookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  boardingHouseId: { type: mongoose.Schema.Types.ObjectId, ref: "BoardingHouse" },
  roomId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Room' },
  guestInfo: {
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
    purpose: String,
    startDate: Date,
    leaseDuration: String,
    guests: Number,
  },
  status: { type: String, default: "pending" },
  paymentInfo: Object,
  expiresAt: { type: Date },
  contractStatus: {
    type: String,
    enum: ['pending_approval', 'approved', 'rejected', 'cancelled_by_tenant', 'payment_pending', 'paid', 'completed'], // Thêm các trạng thái
    default: 'pending_approval',
    required: true,
    index: true
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  tenantSignature: {
    type: String, 
    default: null,
  },
  contractSignedDate: {
    type: Date,
    default: null,
  },
  approvedAt: Date,
  rejectedAt: Date,
  createdAt: { type: Date, default: Date.now },
});
module.exports = mongoose.model("Booking", BookingSchema);