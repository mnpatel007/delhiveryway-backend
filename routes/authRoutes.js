const express = require('express');
const router = express.Router();
const {
    signup,
    login,
    googleLogin,
    verifyEmail,
    forgotPassword,
    resetPassword,
    getProfile,
    updateProfile,
    changePassword,
    getCurrentTermsForCustomer,
    acceptTermsForCustomer
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Public routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/google', googleLogin);
router.get('/verify-email', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.put('/change-password', protect, changePassword);

// Customer Terms routes
router.get('/terms/current', protect, getCurrentTermsForCustomer);
router.post('/terms/accept', protect, acceptTermsForCustomer);

module.exports = router;