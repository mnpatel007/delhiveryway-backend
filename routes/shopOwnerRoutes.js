const express = require('express');
const router = express.Router();
const {
    getProfile,
    updateConsent,
    updateTimings,
    getCommission,
    updateCommission,
    getMonthlyStats
} = require('../controllers/shopOwnerController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// All routes are protected and restricted to vendor
router.use(protect);
router.use(restrictTo('vendor'));

router.get('/profile', getProfile);
router.put('/consent', updateConsent);
router.put('/timings', updateTimings);
router.get('/commission', getCommission);
router.put('/commission', updateCommission);
router.get('/monthly-stats', getMonthlyStats);

module.exports = router;
