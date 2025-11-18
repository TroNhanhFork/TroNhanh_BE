const mongoose = require('mongoose')

const ReportSchema = new mongoose.Schema({
    reporterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        require: true,
    },
    reportedUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        require: false,
    },
    // Thêm các trường liên quan đến accommodation và booking
    accommodationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Accommodation",
        require: false,
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Booking",
        require: false,
    },
    type: {
        type: String,
        require: true,
    },
    content: {
        type: String,
        require: true,
    },
    adminFeedback: {
        type: String,
        default: "",
    },

    status: {
        type: String,
        enum: ['Pending', 'Reviewed', 'Approved', 'Rejected'],
        default: 'Pending'
    },

    createAt: {
        type: Date,
        default: Date.now
    }
})

module.exports = mongoose.model('Report', ReportSchema)