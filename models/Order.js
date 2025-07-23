const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
    },
    shopId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shop',
    },
    name: String,
    price: Number,
    quantity: Number,
    shopName: String
});

const orderSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    items: [orderItemSchema],
    totalAmount: {
        type: Number,
        required: true,
        default: 0,
    },
    deliveryCharge: {
        type: Number,
        required: true,
        default: 0,
    },
    address: {
        type: String,
        required: true,
    },
    customerLocation: {
        lat: { type: Number },
        lng: { type: Number }
    },
    deliveryBoyStartLocation: {
        lat: { type: Number },
        lng: { type: Number }
    },
    deliveryBoyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DeliveryBoy',
    },
    status: {
        type: String,
        enum: ['pending_vendor', 'confirmed_by_vendor', 'confirmed', 'pending', 'preparing', 'out for delivery', 'picked up', 'delivered', 'staged', 'cancelled'],
        default: 'pending',
    },
    reason: {
        type: String,
        default: '',
    },
    paymentStatus: {
        type: String,
        enum: ['unpaid', 'paid', 'refunded'],
        default: 'unpaid',
    },
    paymentIntentId: {
        type: String, // This is necessary to issue refunds
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
