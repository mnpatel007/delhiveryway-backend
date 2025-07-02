const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const {
    createProduct,
    getProductsByShop,
    getVendorProducts
} = require('../controllers/productController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.post('/', protect, restrictTo('vendor'), createProduct);
router.get('/shop/:shopId', getProductsByShop);
router.get('/vendors', protect, restrictTo('vendor'), getVendorProducts);
// existing routes...
// POST /, GET /shop/:id, GET /vendors

// ✅ GET product by ID
router.get('/:id', protect, restrictTo('vendor', 'customer'), async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.status(200).json(product);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch product', error: err.message });
    }
});

// ✅ PUT update product
router.put('/:id', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const { name, description, price } = req.body;
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { name, description, price },
            { new: true }
        );
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.status(200).json(product);
    } catch (err) {
        res.status(500).json({ message: 'Failed to update product', error: err.message });
    }
});

router.delete('/:id', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // ✅ Optional: Check ownership before deleting
        const Shop = require('../models/Shop');
        const shop = await Shop.findById(product.shopId);

        if (!shop || shop.vendorId.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to delete this product' });
        }

        await product.deleteOne();
        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (err) {
        console.error('❌ Product deletion failed:', err); // <-- SEE this in terminal
        res.status(500).json({ message: 'Server error during product delete', error: err.message });
    }
});





module.exports = router;
