// backend/models/DeliveryRecord.js
const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema({
    lat: Number,
    lng: Number,
    address: String
}, { _id: false });

const deliveryRecordSchema = new mongoose.Schema({
    // basic refs
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    deliveryBoyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // fixed earning
    earning: { type: Number, default: 30 },

    // locations
    shopLocation: pointSchema,
    customerLocation: pointSchema,
    driverLocationHistory: [pointSchema],

    // status
    status: {
        type: String,
        enum: ['accepted', 'pickedUp', 'delivered', 'cancelled'],
        default: 'accepted'
    },

    // timestamps
    acceptedAt: { type: Date, default: Date.now },
    pickedUpAt: Date,
    deliveredAt: Date
}, { timestamps: true });

module.exports = mongoose.model('DeliveryRecord', deliveryRecordSchema);