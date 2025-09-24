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
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/adminMiddleware');

// Public routes (for customers)
router.get('/active', getActiveNotices);

// Protected routes (require authentication)
router.post('/:id/view', authenticateToken, markAsViewed);

// Admin only routes
router.get('/', authenticateToken, requireAdmin, getAllNotices);
router.post('/', authenticateToken, requireAdmin, createNotice);
router.put('/:id', authenticateToken, requireAdmin, updateNotice);
router.delete('/:id', authenticateToken, requireAdmin, deleteNotice);

module.exports = router;