const express = require('express');
const { acceptOrder, updateOrderStatus, getActiveOrders, getAvailableOrders } = require('../controllers/shopperOrderController');
const { authenticateShopper } = require('../middleware/shopperAuthMiddleware');

const router = express.Router();

// All routes require shopper authentication
router.use(authenticateShopper);

// Order management routes
router.post('/accept', acceptOrder);
router.put('/status', updateOrderStatus);
router.get('/active', getActiveOrders);
router.get('/available', getAvailableOrders);

module.exports = router;