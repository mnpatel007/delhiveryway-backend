const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    description: String,
    location: String,
    image: String
}, { timestamps: true });

module.exports = mongoose.model('Shop', shopSchema);
