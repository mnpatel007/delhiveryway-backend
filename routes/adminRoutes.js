const express = require('express');
const router = express.Router();
const {
    adminLogin,
    getDashboardStats,
    getAllUsers,
    getAllShops,
    createShop,
    updateShop,
    updateShopVisibility,
    getAllOrders,
    getAllShoppers,
    getAllProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    updateUserStatus,
    updateShopStatus,
    updateOrderStatus,
    cancelOrderWithReason,
    updateShopperStatus,
    deleteUser,
    deleteShop,
    deletePersonalShopper,
    getAnalytics
} = require('../controllers/adminController');
const { adminProtect } = require('../middleware/authMiddleware');

// Import bulk product routes
const bulkProductRoutes = require('./bulkProductRoutes');

// Public admin routes
router.post('/login', adminLogin);
router.post('/logout', (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

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
router.post('/shops', adminProtect, createShop);
router.get('/products', adminProtect, getAllProducts);
router.post('/products', adminProtect, createProduct);
router.get('/orders', adminProtect, getAllOrders);
router.get('/shoppers', adminProtect, getAllShoppers);

// Shopper performance analytics
const { getShopperPerformance, getShopperDetailedPerformance } = require('../controllers/shopperPerformanceController');
router.get('/shoppers/performance', adminProtect, getShopperPerformance);
router.get('/shoppers/:shopperId/performance', adminProtect, getShopperDetailedPerformance);
router.get('/analytics', adminProtect, getAnalytics);

// Update operations
router.put('/users/:userId/status', adminProtect, updateUserStatus);
router.put('/shops/:shopId', adminProtect, updateShop);
router.put('/shops/:shopId/status', adminProtect, updateShopStatus);
router.put('/shops/:shopId/visibility', adminProtect, updateShopVisibility);
router.put('/orders/:orderId/status', adminProtect, updateOrderStatus);
router.put('/orders/:orderId/cancel', adminProtect, cancelOrderWithReason);
router.put('/shoppers/:shopperId', adminProtect, updateShopperStatus);
router.put('/products/:productId', adminProtect, updateProduct);

// Delete operations
router.delete('/users/:userId', adminProtect, deleteUser);
router.delete('/shops/:shopId', adminProtect, deleteShop);
router.delete('/products/:productId', adminProtect, deleteProduct);
router.delete('/shoppers/:shopperId', adminProtect, deletePersonalShopper);

// Bulk product operations
router.use('/products', bulkProductRoutes);

// Terms and Conditions routes
const {
    getCurrentTerms,
    acceptTerms,
    createTerms,
    getAllTerms,
    getTermsAcceptanceDetails,
    getLiveAcceptanceCount
} = require('../controllers/adminController');

// Terms routes (accessible to both customers and admins)
router.get('/terms/current', adminProtect, getCurrentTerms);
router.post('/terms/accept', adminProtect, acceptTerms);

// Admin-only terms routes
router.post('/terms/create', adminProtect, createTerms);
router.get('/terms/all', adminProtect, getAllTerms);
router.get('/terms/:termsId/details', adminProtect, getTermsAcceptanceDetails);
router.get('/terms/:termsId/count', adminProtect, getLiveAcceptanceCount);

// Test route for terms
router.get('/terms/test', (req, res) => {
    res.json({
        success: true,
        message: 'Terms routes are working!',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;