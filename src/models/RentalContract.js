const mongoose = require('mongoose');

const rentalContractSchema = new mongoose.Schema({
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    boardingHouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'BoardingHouse' },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    contractContent: String,
    signatureTenant: String, // <== THÊM DÒNG NÀY

    contractStatus: {
        type: String,
        enum: ['pending_approval', 'approved', 'rejected'],
        default: 'pending_approval'
    },

    contractTemplateId: String,
    signedAt: { type: Date, default: Date.now },

    pdfFile: String
});


module.exports = mongoose.model("RentalContract", rentalContractSchema);
