const express = require('express');
const router = express.Router();
const {
    getAllNotices,
    getActiveNotices,
    createNotice,
    updateNotice,
    deleteNotice,
    markAsViewed
} = require('../controllers/noticeController');
const { protect, optionalAuth, adminProtect } = require('../middleware/authMiddleware');

// Test route
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'Notice routes working!' });
});

// Public routes (for customers)
router.get('/active', getActiveNotices);

// Protected routes (require authentication)
router.post('/:id/view', optionalAuth, markAsViewed);

// Admin only routes
router.get('/', adminProtect, getAllNotices);
router.post('/', adminProtect, createNotice);
router.put('/:id', adminProtect, updateNotice);
router.delete('/:id', adminProtect, deleteNotice);

module.exports = router;