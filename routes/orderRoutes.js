const express = require('express');
const router = express.Router();
const {
    placeOrder,
    getCustomerOrders,
    updateOrderStatus,
    getOrderById,
    cancelOrder,
    approveBill,
    rejectBill,
    rateOrder,
    getOrderStats
} = require('../controllers/OrderController');
const { protect, restrictTo, optionalAuth } = require('../middleware/authMiddleware');

// Place a new order (Customer only)
router.post('/', protect, restrictTo('customer'), placeOrder);

// Get all orders placed by the logged-in customer
router.get('/customer', protect, restrictTo('customer'), getCustomerOrders);

// Get order statistics for customer
router.get('/customer/stats', protect, restrictTo('customer'), getOrderStats);

// Update order status (used by shopper or admin)
router.put('/:id/status', protect, updateOrderStatus);

// Cancel order (Customer or Admin)
router.put('/:id/cancel', protect, cancelOrder);

// Approve bill (Customer only)
router.put('/:id/approve-bill', protect, restrictTo('customer'), approveBill);

// Reject bill (Customer only)
router.put('/:id/reject-bill', protect, restrictTo('customer'), rejectBill);

// Rate order (Customer only)
router.put('/:id/rate', protect, restrictTo('customer'), rateOrder);

// Get single order by ID
router.get('/:orderId', protect, getOrderById);

module.exports = router;
