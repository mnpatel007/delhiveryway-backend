const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const deliveryBoySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters'],
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    phone: {
        type: String,
        match: [/^[6-9]\d{9}$/, 'Please enter a valid 10-digit phone number']
    },
    vehicleType: {
        type: String,
        enum: {
            values: ['bike', 'bicycle', 'scooter', 'car'],
            message: 'Vehicle type must be bike, bicycle, scooter, or car'
        },
        default: 'bike'
    },
    vehicleNumber: {
        type: String,
        uppercase: true,
        trim: true
    },
    isOnline: { type: Boolean, default: false },
    currentLocation: {
        lat: {
            type: Number,
            min: [-90, 'Latitude must be between -90 and 90'],
            max: [90, 'Latitude must be between -90 and 90']
        },
        lng: {
            type: Number,
            min: [-180, 'Longitude must be between -180 and 180'],
            max: [180, 'Longitude must be between -180 and 180']
        },
        address: { type: String },
        lastUpdated: { type: Date, default: Date.now }
    },
    totalEarnings: {
        type: Number,
        default: 0,
        min: [0, 'Total earnings cannot be negative']
    },
    totalDeliveries: {
        type: Number,
        default: 0,
        min: [0, 'Total deliveries cannot be negative']
    },
    rating: {
        type: Number,
        default: 5.0,
        min: [1, 'Rating must be between 1 and 5'],
        max: [5, 'Rating must be between 1 and 5']
    },
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
