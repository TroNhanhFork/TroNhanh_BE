const mongoose = require('mongoose')

const reviewSchema = new mongoose.Schema(
  {
    boardingHouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BoardingHouse',
      required: true
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true
    },
    user: {
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
      name: String,
      avatar: String,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5, // Đổi từ 10 thành 5
    },
    comment: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
    },
    weeksAgo: {
      type: Number,
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }
  // { _id: false } // avoid nested review _id
);

module.exports = mongoose.model('Review', reviewSchema);
