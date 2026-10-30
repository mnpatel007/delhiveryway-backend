const express = require('express');
const router = express.Router();
const {
  getProfile,
  updateConsent,
  updateTimings,
  getCommission,
  updateCommission,
  getMonthlyStats,
  getAvailableShops,
  getShopOrders,
  updateOrderStatus,
  getVendorStatus,
  claimShop,
  applyAsPartner,
} = require('../controllers/shopOwnerController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Public routes
router.get('/available-shops', getAvailableShops);

router.use(protect);

// Reachable by any signed-in account, because this is how someone who is
// currently only a customer becomes a partner: see where they stand, ask for
// access, and redeem the code an admin issued them.
router.get('/status', getVendorStatus);
router.post('/apply', applyAsPartner);
router.post('/claim', claimShop);

// Everything below needs the vendor capability, which arrives with the claim.
router.use(restrictTo('vendor'));

router.get('/profile', getProfile);
router.put('/consent', updateConsent);
router.put('/timings', updateTimings);
router.get('/commission', getCommission);
router.put('/commission', updateCommission);
router.get('/monthly-stats', getMonthlyStats);

// Order management routes
router.get('/orders', getShopOrders);
router.put('/orders/:id/status', updateOrderStatus);

module.exports = router;
