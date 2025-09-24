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

// Test active notices route
router.get('/test-active', async (req, res) => {
    try {
        const Notice = require('../models/Notice');
        const allNotices = await Notice.find({});
        const activeNotices = await Notice.getActiveNotices();

        res.json({
            success: true,
            message: 'Active notices test',
            totalNotices: allNotices.length,
            activeNotices: activeNotices.length,
            notices: activeNotices.map(n => ({
                title: n.title,
                isActive: n.isActive,
                startDate: n.startDate,
                endDate: n.endDate
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
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