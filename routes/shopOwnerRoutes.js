const express = require('express');
const router = express.Router();
const {
    getProfile,
    updateConsent,
    updateTimings,
    getCommission,
    updateCommission,
    getMonthlyStats,
    getAvailableShops,
    getShopOrders,
    updateOrderStatus
} = require('../controllers/shopOwnerController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Public routes
router.get('/available-shops', getAvailableShops);

// Temporary Maintenance Route (Move this to public for now)
router.post('/maintenance/fix-shop-association', async (req, res) => {
    try {
        const { email, shopName } = req.body;
        const Shop = require('../models/Shop');
        const User = require('../models/User');
        
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        
        const shop = await Shop.findOne({ name: { $regex: shopName, $options: 'i' } });
        if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });
        
        shop.vendorId = user._id;
        await shop.save();
        
        res.json({ success: true, message: `Successfully associated ${user.email} with ${shop.name}` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// All routes are protected and restricted to vendor
router.use(protect);
router.use(restrictTo('vendor'));

router.get('/profile', getProfile);
router.put('/consent', updateConsent);
router.put('/timings', updateTimings);
router.get('/commission', getCommission);
router.put('/commission', updateCommission);
router.get('/monthly-stats', getMonthlyStats);

// Order management routes
router.get('/orders', getShopOrders);
router.put('/orders/:id/status', updateOrderStatus);

module.exports = router;
