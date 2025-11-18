const mongoose = require('mongoose')

const MemberShipSchema = new mongoose.Schema({
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPackage', required: true },

    type: {
        type: String,
        enum: ['Bronze','Silver', 'Gold', 'Diamond'],
        default: 'Silver'
    },
    price: {
        type: Number,
        min: 0
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive', 'Suspended', 'Expired', 'Pending'],
        default: 'Pending'
    },
    
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
       
    }
})

module.exports = mongoose.model('MemberShip', MemberShipSchema)