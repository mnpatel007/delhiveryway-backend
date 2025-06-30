const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { getVendorStats } = require('../controllers/VendorStatsController');

router.get('/stats', protect, restrictTo('vendor'), getVendorStats);

module.exports = router;
