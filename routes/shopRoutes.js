const express = require('express');
const router = express.Router();
const {
    createShop,
    getVendorShops,
    getAllShops,
    getShopById,
    updateShop,
    deleteShop,
    toggleShopStatus,
    getShopStats
} = require('../controllers/shopController');
const { protect, restrictTo, optionalAuth } = require('../middleware/authMiddleware');

// Public routes
router.get('/', getAllShops);
router.get('/:id', optionalAuth, getShopById);

// Vendor routes
router.post('/', protect, restrictTo('vendor'), createShop);
router.get('/vendor/my-shops', protect, restrictTo('vendor'), getVendorShops);
router.put('/:id', protect, restrictTo('vendor'), updateShop);
router.delete('/:id', protect, restrictTo('vendor'), deleteShop);
router.patch('/:id/toggle-status', protect, restrictTo('vendor'), toggleShopStatus);
router.get('/:id/stats', protect, restrictTo('vendor'), getShopStats);

module.exports = router;
