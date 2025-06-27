const express = require('express');
const router = express.Router();
const { getVendorStats } = require('../controllers/VendorStatsController');
const { protect } = require('../middleware/authMiddleware');

router.get('/stats', protect, getVendorStats);

module.exports = router;
