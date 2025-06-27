// backend/models/Product.js

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: String,
    price: Number,
    description: String,
    image: String,
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true } // ✅ Required
});


module.exports = mongoose.model('Product', productSchema);
