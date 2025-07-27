const express = require('express');
const router = express.Router();
const {
    placeOrder,
    getCustomerOrders,
    updateOrderStatus,
    getOrderById
} = require('../controllers/OrderController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Place a new order (Customer only)
router.post('/', protect, restrictTo('customer'), placeOrder);

// Get all orders placed by the logged-in customer
router.get('/customer', protect, restrictTo('customer'), getCustomerOrders);

// Update order status (used by vendor or customer actions)
router.put('/:id', protect, updateOrderStatus);

// Get single order by ID (used to restore state after refresh)
router.get('/:orderId', protect, getOrderById);

module.exports = router;
