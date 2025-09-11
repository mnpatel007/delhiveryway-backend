const express = require('express');
const router = express.Router();
const { sendContactMessage } = require('../controllers/contactController');

// Public route to send a contact message
router.post('/', sendContactMessage);

module.exports = router;

