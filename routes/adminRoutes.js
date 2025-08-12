const express = require('express');
const router = express.Router();
const {
    adminLogin,
    getDashboardStats,
    getAllUsers,
    getAllShops,
    getAllOrders,
    getAllShoppers,
    getAllProducts,
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

// Test route for debugging auth
router.get('/test-auth', adminProtect, (req, res) => {
    res.json({
        success: true,
        message: 'Admin authentication working',
        user: req.user
    });
});

// Debug route to check token
router.get('/debug-token', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const jwt = require('jsonwebtoken');

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json({
            success: true,
            token: token ? 'Token exists' : 'No token',
            decoded,
            jwtSecret: process.env.JWT_SECRET ? 'JWT Secret exists' : 'No JWT Secret'
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message,
            token: token ? 'Token exists but invalid' : 'No token',
            jwtSecret: process.env.JWT_SECRET ? 'JWT Secret exists' : 'No JWT Secret'
        });
    }
});

// Protected admin routes
router.get('/dashboard', adminProtect, getDashboardStats);
router.get('/users', adminProtect, getAllUsers);
router.get('/shops', adminProtect, getAllShops);
router.get('/products', adminProtect, getAllProducts);
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