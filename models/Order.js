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
    shopName: String,
    shopAddress: String
});

const orderSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    items: [orderItemSchema],
    totalAmount: {
        type: Number,
        required: [true, 'Total amount is required'],
        default: 0,
        min: [0, 'Total amount cannot be negative']
    },
    deliveryCharge: {
        type: Number,
        required: true,
        default: 0,
    },
    deliveryChargesBreakdown: {
        type: mongoose.Schema.Types.Mixed, // Stores the detailed breakdown by shop
        default: {}
    },
    address: {
        type: String,
        required: [true, 'Delivery address is required'],
        trim: true,
        minlength: [10, 'Address must be at least 10 characters']
    },
    customerLocation: {
        lat: { type: Number },
        lng: { type: Number }
    },
    deliveryBoyStartLocation: {
        lat: { type: Number },
        lng: { type: Number }
    },
    personalShopperId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PersonalShopper',
    },
    status: {
        type: String,
        enum: ['pending_shopper', 'accepted_by_shopper', 'shopping', 'bill_sent', 'bill_approved', 'out_for_delivery', 'delivered', 'cancelled'],
        default: 'pending_shopper',
    },
    billPhoto: {
        type: String, // URL to the bill photo
    },
    billAmount: {
        type: Number, // Actual amount from the bill
    },
    billApproved: {
        type: Boolean,
        default: false
    },
    shopperEarnings: {
        type: Number,
        default: 0
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
    },
    declinedBy: [{
        personalShopperId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PersonalShopper'
        },
        reason: String,
        declinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    deliveryOTP: {
        code: String,
        generatedAt: Date,
        expiresAt: Date,
        isUsed: {
            type: Boolean,
            default: false
        }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
