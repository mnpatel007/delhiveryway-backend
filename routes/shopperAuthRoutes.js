const express = require('express');
const { registerShopper, loginShopper, updateOnlineStatus } = require('../controllers/shopperAuthController');
const { authenticateShopper } = require('../middleware/shopperAuthMiddleware');

const router = express.Router();

// Public routes
router.post('/register', registerShopper);
router.post('/login', loginShopper);

// Protected routes
router.put('/status', authenticateShopper, updateOnlineStatus);

module.exports = router;