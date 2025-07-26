const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const deliveryBoySchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    vehicleType: {
        type: String,
        enum: ['bike', 'bicycle', 'scooter', 'car'],
        default: 'bike'
    },
    vehicleNumber: { type: String },
    isOnline: { type: Boolean, default: false },
    currentLocation: {
        lat: { type: Number },
        lng: { type: Number },
        address: { type: String },
        lastUpdated: { type: Date, default: Date.now }
    },
    totalEarnings: { type: Number, default: 0 },
    totalDeliveries: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 },
    isVerified: { type: Boolean, default: false },
    documents: {
        license: { type: String },
        aadhar: { type: String },
        vehicleRC: { type: String }
    }
}, { timestamps: true });

deliveryBoySchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

module.exports = mongoose.model('DeliveryBoy', deliveryBoySchema);
