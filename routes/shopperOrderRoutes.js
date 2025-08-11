const express = require('express');
const { acceptOrder, updateOrderStatus, getActiveOrders } = require('../controllers/shopperOrderController');
const { authenticateShopper } = require('../middleware/shopperAuthMiddleware');

const router = express.Router();

// All routes require shopper authentication
router.use(authenticateShopper);

// Order management routes
router.post('/accept', acceptOrder);
router.put('/status', updateOrderStatus);
router.get('/active', getActiveOrders);

module.exports = router;