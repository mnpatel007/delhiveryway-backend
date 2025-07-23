const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    description: String,
    location: {
        lat: { type: Number },
        lng: { type: Number }
    },
    image: String
}, { timestamps: true });

module.exports = mongoose.model('Shop', shopSchema);
