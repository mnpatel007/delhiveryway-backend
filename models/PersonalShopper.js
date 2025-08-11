const mongoose = require('mongoose');

const personalShopperSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    phone: {
        type: String,
        required: true
    },
    isOnline: {
        type: Boolean,
        default: false
    },
    currentLocation: {
        latitude: Number,
        longitude: Number,
        address: String
    },
    rating: {
        type: Number,
        default: 5.0,
        min: 1,
        max: 5
    },
    totalOrders: {
        type: Number,
        default: 0
    },
    earnings: {
        type: Number,
        default: 0
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    documents: {
        idProof: String,
        photo: String
    },
    bankDetails: {
        accountNumber: String,
        ifscCode: String,
        accountHolderName: String
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('PersonalShopper', personalShopperSchema);