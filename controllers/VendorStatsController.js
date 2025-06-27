const Shop = require('../models/Shop');
const Product = require('../models/Product');
const Order = require('../models/Order');

exports.getVendorStats = async (req, res) => {
    try {
        const vendorId = req.user._id;

        const shops = await Shop.find({ vendor: vendorId });
        const shopIds = shops.map(shop => shop._id.toString());

        const products = await Product.find({ shopId: { $in: shopIds } });
        const productIds = products.map(p => p._id.toString());

        const orders = await Order.find({
            'items.productId': { $in: productIds }
        });

        res.json({
            totalShops: shops.length,
            totalProducts: products.length,
            totalOrders: orders.length
        });
    } catch (err) {
        console.error('Vendor stats error:', err);
        res.status(500).json({ message: 'Failed to load stats' });
    }
};
