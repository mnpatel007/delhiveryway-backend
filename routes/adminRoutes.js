const express = require('express');
const router = express.Router();
const {
    adminLogin,
    getDashboardStats,
    getAllUsers,
    getAllShops,
    getAllOrders,
    getAllShoppers,
    updateUserStatus,
    updateShopStatus,
    updateOrderStatus,
    deleteUser,
    deleteShop,
    getAnalytics
} = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Public admin routes
router.post('/login', adminLogin);

// Protected admin routes
router.get('/dashboard', protect, restrictTo('admin'), getDashboardStats);
router.get('/users', protect, restrictTo('admin'), getAllUsers);
router.get('/shops', protect, restrictTo('admin'), getAllShops);
router.get('/orders', protect, restrictTo('admin'), getAllOrders);
router.get('/shoppers', protect, restrictTo('admin'), getAllShoppers);
router.get('/analytics', protect, restrictTo('admin'), getAnalytics);

// Update operations
router.put('/users/:userId/status', protect, restrictTo('admin'), updateUserStatus);
router.put('/shops/:shopId/status', protect, restrictTo('admin'), updateShopStatus);
router.put('/orders/:orderId/status', protect, restrictTo('admin'), updateOrderStatus);

// Delete operations
router.delete('/users/:userId', protect, restrictTo('admin'), deleteUser);
router.delete('/shops/:shopId', protect, restrictTo('admin'), deleteShop);

module.exports = router;