const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// ✅ Create a new product (Vendor only)
router.post('/', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const product = new Product({ ...req.body, vendorId: req.user.id });
        await product.save();
        res.status(201).json(product);
    } catch (err) {
        console.error('❌ Error creating product:', err.message);
        res.status(500).json({ message: 'Failed to create product', error: err.message });
    }
});

// ✅ Get all products for a shop
router.get('/shop/:id', async (req, res) => {
    try {
        const products = await Product.find({ shopId: req.params.id });
        res.status(200).json(products);
    } catch (err) {
        console.error('❌ Error fetching shop products:', err.message);
        res.status(500).json({ message: 'Failed to fetch shop products', error: err.message });
    }
});

// ✅ Get all products for the logged-in vendor
router.get('/vendors', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const products = await Product.find({ vendorId: req.user.id }).populate('shopId');
        res.status(200).json(products);
    } catch (err) {
        console.error('❌ Error fetching vendor products:', err.message);
        res.status(500).json({ message: 'Failed to fetch vendor products', error: err.message });
    }
});

// ✅ Get product by ID (for customer + vendor)
router.get('/:id', protect, restrictTo('vendor', 'customer'), async (req, res) => {
    try {
        const productId = req.params.id;
        console.log('➡️ Fetching product by ID:', productId);

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ message: 'Invalid product ID format' });
        }

        const product = await Product.findById(productId).populate('shopId');

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json(product);

    } catch (err) {
        console.error('❌ Error fetching product by ID:', err.message);
        res.status(500).json({ message: 'Failed to fetch product', error: err.message });
    }
});

module.exports = router;
