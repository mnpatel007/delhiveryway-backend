const express = require('express');
const router = express.Router();
const orderController = require('../controllers/OrderController');
const authMiddleware = require('../middleware/authMiddleware');
const shopperAuthMiddleware = require('../middleware/shopperAuthMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Place a new order (Customer only)
router.post('/', authMiddleware.protect, authMiddleware.restrictTo('customer'), orderController.placeOrder);

// Get all orders placed by the logged-in customer
router.get('/customer', authMiddleware.protect, authMiddleware.restrictTo('customer'), orderController.getCustomerOrders);

// Get order statistics for customer
router.get('/customer/stats', authMiddleware.protect, authMiddleware.restrictTo('customer'), orderController.getOrderStats);

// Update order status (used by shopper or admin) - with file upload support
router.put('/:id/status', authMiddleware.protect, upload.single('billImage'), orderController.updateOrderStatus);

// Cancel order (Customer or Admin)
router.put('/:id/cancel', authMiddleware.protect, orderController.cancelOrder);

// Approve bill (Customer only)
router.put('/:id/approve-bill', authMiddleware.protect, authMiddleware.restrictTo('customer'), orderController.approveBill);

// Reject bill (Customer only)
router.put('/:id/reject-bill', authMiddleware.protect, authMiddleware.restrictTo('customer'), orderController.rejectBill);

// Rate order (Customer only)
router.put('/:id/rate', authMiddleware.protect, authMiddleware.restrictTo('customer'), orderController.rateOrder);

// Revise order items (Shopper only)
router.put('/:id/revise', authMiddleware.protect, authMiddleware.restrictTo('shopper'), orderController.reviseOrderItems);

// Approve revised order (Customer only)
router.post('/:id/approve-revision', authMiddleware.protect, authMiddleware.restrictTo('customer'), orderController.approveRevisedOrder);

// Get single order by ID
router.get('/:orderId', authMiddleware.protect, orderController.getOrderById);

module.exports = router;
