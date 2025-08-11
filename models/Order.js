const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    },
    name: String,
    price: Number,
    quantity: Number,
    notes: String
});

const orderSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    personalShopperId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PersonalShopper'
    },
    shopId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shop',
        required: true
    },
    items: [orderItemSchema],
    orderValue: {
        subtotal: {
            type: Number,
            required: true
        },
        deliveryFee: {
            type: Number,
            default: 0
        },
        serviceFee: {
            type: Number,
            default: 0
        },
        taxes: {
            type: Number,
            default: 0
        },
        total: {
            type: Number,
            required: true
        }
    },
    actualBill: {
        amount: Number,
        photo: String,
        uploadedAt: Date
    },
    deliveryAddress: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        coordinates: {
            lat: Number,
            lng: Number
        },
        instructions: String
    },
    status: {
        type: String,
        enum: [
            'pending_shopper',
            'accepted_by_shopper', 
            'shopper_at_shop',
            'shopping_in_progress',
            'bill_uploaded',
            'bill_approved',
            'out_for_delivery',
            'delivered',
            'cancelled',
            'refunded'
        ],
        default: 'pending_shopper'
    },
    timeline: [{
        status: String,
        timestamp: {
            type: Date,
            default: Date.now
        },
        note: String
    }],
    payment: {
        method: {
            type: String,
            enum: ['cash', 'online', 'card'],
            default: 'cash'
        },
        status: {
            type: String,
            enum: ['pending', 'paid', 'refunded'],
            default: 'pending'
        },
        transactionId: String
    },
    ratings: {
        customerRating: {
            rating: Number,
            review: String,
            ratedAt: Date
        },
        shopperRating: {
            rating: Number,
            review: String,
            ratedAt: Date
        }
    },
    estimatedDeliveryTime: Date,
    actualDeliveryTime: Date,
    specialInstructions: String,
    cancellationReason: String
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);