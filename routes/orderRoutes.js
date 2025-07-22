const express = require('express');
const router = express.Router();
const {
    placeOrder,
    getCustomerOrders,
    updateOrderStatus,
    acceptOrderByDeliveryBoy,
    completeOrderByDeliveryBoy
} = require('../controllers/OrderController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Place a new order (Customer only)
router.post('/', protect, restrictTo('customer'), placeOrder);

// Get all orders placed by the logged-in customer
router.get('/customer', protect, restrictTo('customer'), getCustomerOrders);

// Update order status (used by vendor or customer actions)
router.put('/:id', protect, updateOrderStatus);

// Delivery boy accepts an order
router.put('/:id/accept', protect, restrictTo('delivery'), acceptOrderByDeliveryBoy);

// Delivery boy completes an order
router.put('/:id/complete', protect, restrictTo('delivery'), completeOrderByDeliveryBoy);

module.exports = router;
