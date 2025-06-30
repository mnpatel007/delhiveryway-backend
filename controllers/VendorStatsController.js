const Shop = require('../models/Shop');
const Product = require('../models/Product');
const Order = require('../models/Order');

exports.getVendorStats = async (req, res) => {
    try {
        const vendorId = req.user.id;

        // Get all shops owned by this vendor
        const shops = await Shop.find({ vendorId }).select('_id');
        const shopIds = shops.map(shop => shop._id);

        // Count products under those shops
        const totalProducts = await Product.countDocuments({ shopId: { $in: shopIds } });

        // Count orders that include those shops' products
        const totalOrders = await Order.countDocuments({
            'items.shopId': { $in: shopIds }
        });

        res.json({
            totalShops: shops.length,
            totalProducts,
            totalOrders
        });
    } catch (err) {
        console.error('❌ Vendor stats error:', err);
        res.status(500).json({ message: 'Failed to load stats' });
    }
};
