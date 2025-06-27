const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        shopId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Shop',
            required: true
        }
    }],
    totalAmount: {
        type: Number,
        required: true
    },
    deliveryCharge: {
        type: Number,
        default: 0
    },
    address: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'preparing', 'out for delivery', 'delivered', 'cancelled'],
        default: 'pending'
    },
    reason: {
        type: String, // ✅ Add this field
        default: ''
    },
    paymentStatus: {
        type: String,
        enum: ['unpaid', 'paid'],
        default: 'unpaid'
    }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
