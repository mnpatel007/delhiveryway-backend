const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Shop = require('../models/Shop');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// ✅ Create a new product (Vendor only)
router.post('/', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const product = new Product({ ...req.body });
        await product.save();
        res.status(201).json(product);
    } catch (err) {
        console.error('❌ Error creating product:', err.message);
        res.status(500).json({ message: 'Failed to create product', error: err.message });
    }
});

// ✅ Get all products for a shop (public)
router.get('/shop/:id', async (req, res) => {
    try {
        const products = await Product.find({ shopId: req.params.id });
        res.status(200).json(products);
    } catch (err) {
        console.error('❌ Error fetching shop products:', err.message);
        res.status(500).json({ message: 'Failed to fetch shop products', error: err.message });
    }
});

// ✅ Get all products for the logged-in vendor (used by VendorDashboard)
router.get('/vendors', protect, restrictTo('vendor'), async (req, res) => {
    try {
        // Step 1: Get all shop IDs owned by the vendor
        const vendorShops = await Shop.find({ vendor: req.user.id });
        const shopIds = vendorShops.map(shop => shop._id);

        // Step 2: Find products whose shopId is in vendor's shops
        const products = await Product.find({ shopId: { $in: shopIds } }).populate('shopId');

        // Optional: Filter out any broken entries where shop was deleted
        const validProducts = products.filter(p => p.shopId && p.shopId._id);

        res.status(200).json(validProducts);
    } catch (err) {
        console.error('❌ Error fetching vendor products:', err.message);
        res.status(500).json({ message: 'Failed to fetch vendor products', error: err.message });
    }
});

// ✅ Get product by ID (used by edit page, customer/cart)
router.get('/:id', protect, restrictTo('vendor', 'customer'), async (req, res) => {
    try {
        const productId = req.params.id;

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

// ✅ Delete product (used by vendor dashboard)
router.delete('/:id', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json({ message: 'Product deleted' });
    } catch (err) {
        console.error('❌ Error deleting product:', err.message);
        res.status(500).json({ message: 'Failed to delete product', error: err.message });
    }
});

module.exports = router;
