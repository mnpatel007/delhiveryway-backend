const express = require('express');
const { acceptOrder, updateOrderStatus, getActiveOrders, getAvailableOrders, getShopperEarnings, getCompletedOrders, updateLocation } = require('../controllers/shopperOrderController');
const { authenticateShopper } = require('../middleware/shopperAuthMiddleware');

const router = express.Router();

// All routes require shopper authentication
router.use(authenticateShopper);

// Order management routes
router.post('/orders/accept', acceptOrder);
router.put('/orders/status', updateOrderStatus);
router.put('/orders/location', updateLocation);
router.get('/orders/active', getActiveOrders);
router.get('/orders/available', getAvailableOrders);
router.get('/orders/completed', getCompletedOrders);

// Earnings routes
router.get('/earnings', getShopperEarnings);

module.exports = router;