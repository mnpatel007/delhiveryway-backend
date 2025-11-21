const express = require('express');
const router = express.Router();
const termsController = require('../controllers/termsController');
const { protect, adminProtect } = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Public/Customer routes
// Serve current terms publicly so anonymous visitors can preview the Terms & Conditions
router.get('/current', termsController.getCurrentTerms);
// Accept route requires authentication so we can record which user accepted
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