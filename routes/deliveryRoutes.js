const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const { protect, adminProtect } = require('../middleware/authMiddleware');

// Public routes (or protected by user auth if needed, but usually public for cart calculation)
router.post('/calculate-fee', deliveryController.calculateFee);
router.post('/calculate-fees-bulk', deliveryController.calculateFeesBulk);

// Admin routes for discounts
router.get('/discounts', protect, adminProtect, deliveryController.getAllDiscounts);
router.post('/discounts', protect, adminProtect, deliveryController.createDiscount);
router.put('/discounts/:id', protect, adminProtect, deliveryController.updateDiscount);
router.delete('/discounts/:id', protect, adminProtect, deliveryController.deleteDiscount);
router.patch('/discounts/:id/toggle', protect, adminProtect, deliveryController.toggleDiscountStatus);

module.exports = router;