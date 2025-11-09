const express = require('express');
const router = express.Router();
const {
    createProduct,
    getShopProducts,
    getVendorProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    toggleProductStatus,
    searchProducts
} = require('../controllers/productController');
const { protect, restrictTo, optionalAuth } = require('../middleware/authMiddleware');

// Public routes - no auth required
router.get('/shop/:shopId', (req, res, next) => {
    console.log('🌐 Public route /shop/:shopId accessed');
    console.log('🌐 Headers:', req.headers.authorization ? 'Has auth' : 'No auth');
    next();
}, getShopProducts);
router.get('/test/:shopId', async (req, res) => {
    const Product = require('../models/Product');
    const { shopId } = req.params;
    const products = await Product.find({ shopId });
    res.json({ shopId, totalProducts: products.length, products });
});
router.get('/all', async (req, res) => {
    const Product = require('../models/Product');
    const products = await Product.find({}).populate('shopId', 'name');
    res.json({ totalProducts: products.length, products });
});
router.get('/search', searchProducts);
router.get('/:id', optionalAuth, getProductById);

// Vendor routes
router.post('/', protect, restrictTo('vendor'), createProduct);
router.get('/vendor/my-products', protect, restrictTo('vendor'), getVendorProducts);
router.put('/:id', protect, restrictTo('vendor'), updateProduct);
router.delete('/:id', protect, restrictTo('vendor'), deleteProduct);
router.patch('/:id/toggle-status', protect, restrictTo('vendor'), toggleProductStatus);

module.exports = router;
