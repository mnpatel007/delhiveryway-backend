const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
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
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        coordinates: {
            lat: Number,
            lng: Number
        }
    },
    profilePicture: String,
    isVerified: {
        type: Boolean,
        default: true  // Set to true by default for now
    },
    verificationToken: String,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    role: {
        type: String,
        enum: ['customer', 'vendor', 'admin'],
        default: 'customer'
    },
    totalOrders: {
        type: Number,
        default: 0
    },
    favoriteShops: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shop'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);