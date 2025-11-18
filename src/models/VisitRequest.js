// models/VisitRequest.js
const mongoose = require('mongoose');

const visitRequestSchema = new mongoose.Schema({
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
  ownerId: { // Chủ nhà
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', 
    required: true
  },
  requestedDateTime: { 
    type: Date,
    required: true
  },
  message: {
    type: String,
    trim: true,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected'],
    default: 'pending'
  },
  ownerNotes: { 
    type: String,
    trim: true,
    maxlength: 500
  }
}, { timestamps: true }); 

module.exports = mongoose.model('VisitRequest', visitRequestSchema);