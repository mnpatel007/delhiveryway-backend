const express = require('express');
const router = express.Router();
const {
  createShop,
  getVendorShops,
  getAllShops,
  getShopById,
  updateShop,
  toggleShopStatus,
  getShopStats,
} = require('../controllers/shopController');
const { protect, restrictTo, optionalAuth } = require('../middleware/authMiddleware');
const { getClosureStatus } = require('../controllers/globalClosureController');
const { serveMenuPdf } = require('../controllers/shopMenuFileController');
const { getPublicOffers } = require('../controllers/shopOfferController');

// Public routes
router.get('/closure-status', getClosureStatus);
router.get('/', getAllShops);
// Declared before /:id so the PDF route is not swallowed by it.
router.get('/:id/menu-pdf', serveMenuPdf);
router.get('/:id/offers', getPublicOffers);
router.get('/:id', optionalAuth, getShopById);

// Vendor routes
router.post('/', protect, restrictTo('vendor'), createShop);
router.get('/vendor/my-shops', protect, restrictTo('vendor'), getVendorShops);
router.put('/:id', protect, restrictTo('vendor'), updateShop);
router.patch('/:id/toggle-status', protect, restrictTo('vendor'), toggleShopStatus);
router.get('/:id/stats', protect, restrictTo('vendor'), getShopStats);

module.exports = router;
