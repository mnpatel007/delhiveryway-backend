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
const { adminProtect } = require('../middleware/authMiddleware');

// Public admin routes
router.post('/login', adminLogin);

// Protected admin routes
router.get('/dashboard', adminProtect, getDashboardStats);
router.get('/users', adminProtect, getAllUsers);
router.get('/shops', adminProtect, getAllShops);
router.get('/orders', adminProtect, getAllOrders);
router.get('/shoppers', adminProtect, getAllShoppers);
router.get('/analytics', adminProtect, getAnalytics);

// Update operations
router.put('/users/:userId/status', adminProtect, updateUserStatus);
router.put('/shops/:shopId/status', adminProtect, updateShopStatus);
router.put('/orders/:orderId/status', adminProtect, updateOrderStatus);

// Delete operations
router.delete('/users/:userId', adminProtect, deleteUser);
router.delete('/shops/:shopId', adminProtect, deleteShop);

module.exports = router;