const express = require('express');
const router = express.Router();
const termsController = require('../controllers/termsController');
const { protect, adminProtect } = require('../middleware/authMiddleware');

// Public/Customer routes
// Serve current terms publicly so anonymous visitors can preview the Terms & Conditions
router.get('/current', termsController.getCurrentTerms);
// Accept route requires authentication so we can record which user accepted
router.post('/accept', protect, termsController.acceptTerms);

// Admin routes
router.post('/create', adminProtect, termsController.createTerms);
router.get('/all', adminProtect, termsController.getAllTerms);
router.get('/:termsId/details', adminProtect, termsController.getTermsAcceptanceDetails);
router.get('/:termsId/count', adminProtect, termsController.getLiveAcceptanceCount);
router.delete('/:termsId', adminProtect, termsController.deleteTerms);

module.exports = router;
