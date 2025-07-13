const mongoose = require('mongoose');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['customer', 'vendor', 'admin'], required: true },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    googleId: { type: String, unique: true, sparse: true },  // <-- added googleId here
    resetPasswordToken: String,
    resetPasswordExpires: Date,

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);