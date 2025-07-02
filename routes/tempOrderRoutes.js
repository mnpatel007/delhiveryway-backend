const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { createTempOrder } = require('../controllers/tempOrderController');

router.post('/', protect, restrictTo('customer'), createTempOrder);

module.exports = router;
