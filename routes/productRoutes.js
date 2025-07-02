const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// CREATE product (only vendors)
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

// GET products for a specific shop (public)
router.get('/shop/:id', async (req, res) => {
    try {
        const products = await Product.find({ shopId: req.params.id });
        res.status(200).json(products);
    } catch (err) {
        res.status(500).json({ message: 'Failed to get products by shop', error: err.message });
    }
});

// GET all vendor products (only vendor)
router.get('/vendors', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const products = await Product.find({ vendorId: req.user.id });
        res.status(200).json(products);
    } catch (err) {
        res.status(500).json({ message: 'Failed to get vendor products', error: err.message });
    }
});

// ✅ GET product by ID (vendor + customer)
router.get('/:id', protect, restrictTo('vendor', 'customer'), async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('shopId');
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
