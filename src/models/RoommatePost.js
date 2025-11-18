// models/RoommatePost.js
const mongoose = require('mongoose');
const BoardingHouse = require('./BoardingHouse');

const roommatePostSchema = new mongoose.Schema({
  boardingHouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BoardingHouse',
    required: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  intro: String, // giới thiệu bản thân
  // NOTE: previous default 'Any' was not in enum and could cause validation errors
  // Change default to 'other' to match allowed enum values
  genderPreference: { type: String, enum: ['male', 'female', 'other'], default: 'other' },
  note: String,
  habits: [String], // ví dụ: ["Clean", "Quiet", "Smoker"]
  images: [String], // paths to uploaded images, e.g. "/uploads/roommate/....jpg"
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('RoommatePost', roommatePostSchema);
