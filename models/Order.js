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
    deliveryBoyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DeliveryBoy',
    },
    status: {
        type: String,
        enum: ['pending_vendor', 'confirmed_by_vendor', 'confirmed', 'pending', 'preparing', 'assigned', 'out_for_delivery', 'picked_up', 'in_transit', 'delivered', 'staged', 'cancelled'],
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
    },
    declinedBy: [{
        deliveryBoyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DeliveryBoy'
        },
        reason: String,
        declinedAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
