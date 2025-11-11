const express = require('express');
const router = express.Router();
const termsController = require('../controllers/termsController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Public/Customer routes
router.get('/current', authMiddleware, termsController.getCurrentTerms);
router.post('/accept', authMiddleware, termsController.acceptTerms);

// Admin routes
router.post('/create', authMiddleware, adminMiddleware, termsController.createTerms);
router.get('/all', authMiddleware, adminMiddleware, termsController.getAllTerms);
router.get('/:termsId/details', authMiddleware, adminMiddleware, termsController.getTermsAcceptanceDetails);
router.get('/:termsId/count', authMiddleware, adminMiddleware, termsController.getLiveAcceptanceCount);

module.exports = router;