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
const {
  listProducts,
  createProduct,
  updateProduct,
  removeProduct,
} = require('../controllers/vendorProductController');
const {
  uploadMiddleware,
  getMenuPdfInfo,
  uploadMenuPdf,
  deleteMenuPdf,
} = require('../controllers/shopMenuFileController');
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

// Menu management routes. Each handler resolves the shop from the signed-in
// vendor, so these only ever reach that vendor's own items.
router.get('/products', listProducts);
router.post('/products', createProduct);
router.patch('/products/:id', updateProduct);
router.delete('/products/:id', removeProduct);

// The shop's menu PDF. Customers open it through the public shop route.
router.get('/menu-pdf', getMenuPdfInfo);
router.post('/menu-pdf', uploadMiddleware, uploadMenuPdf);
router.delete('/menu-pdf', deleteMenuPdf);

// Order management routes
router.get('/orders', getShopOrders);
router.put('/orders/:id/status', updateOrderStatus);

module.exports = router;
