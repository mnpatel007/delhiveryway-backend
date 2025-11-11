const express = require('express');
const router = express.Router();
const termsController = require('../controllers/termsController');
const { protect, adminProtect } = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Public/Customer routes
router.get('/current', protect, termsController.getCurrentTerms);
router.post('/accept', protect, termsController.acceptTerms);

// Debug route to test if terms routes are working
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Terms routes are working!',
        timestamp: new Date().toISOString()
    });
});

// Admin routes
router.post('/create', adminProtect, termsController.createTerms);
router.get('/all', adminProtect, termsController.getAllTerms);
router.get('/:termsId/details', adminProtect, termsController.getTermsAcceptanceDetails);
router.get('/:termsId/count', adminProtect, termsController.getLiveAcceptanceCount);

module.exports = router;