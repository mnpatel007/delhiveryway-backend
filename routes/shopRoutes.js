const express = require('express');
const router = express.Router();
const {
    createShop,
    getVendorShops,
    getAllShops,
    getShopById
} = require('../controllers/shopController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.post('/', protect, restrictTo('vendor'), createShop);
router.get('/vendor', protect, restrictTo('vendor'), getVendorShops);
router.get('/', getAllShops);
router.get('/:id', getShopById);

// DELETE a shop by vendor
router.delete('/:id', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const Shop = require('../models/Shop');
        const Product = require('../models/Product');

        const shop = await Shop.findOne({ _id: req.params.id, vendorId: req.user.id });
        if (!shop) {
            return res.status(404).json({ message: 'Shop not found or not authorized' });
        }

        // Delete all products under this shop
        await Product.deleteMany({ shopId: shop._id });

        // Delete the shop
        await Shop.deleteOne({ _id: shop._id });

        res.status(200).json({ message: 'Shop and its products deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete shop', error: err.message });
    }
});

module.exports = router;
