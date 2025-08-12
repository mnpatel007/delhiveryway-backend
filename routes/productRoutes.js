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

// Public routes
router.get('/shop/:shopId', getShopProducts);
router.get('/search', searchProducts);
router.get('/:id', optionalAuth, getProductById);

// Vendor routes
router.post('/', protect, restrictTo('vendor'), createProduct);
router.get('/vendor/my-products', protect, restrictTo('vendor'), getVendorProducts);
router.put('/:id', protect, restrictTo('vendor'), updateProduct);
router.delete('/:id', protect, restrictTo('vendor'), deleteProduct);
router.patch('/:id/toggle-status', protect, restrictTo('vendor'), toggleProductStatus);

module.exports = router;
