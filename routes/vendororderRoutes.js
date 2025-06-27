const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Shop = require('../models/Shop');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// GET all orders that belong to the current vendor's shops
router.get('/', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const vendorId = req.user.id;
        console.log('📦 Vendor ID:', vendorId);

        // Get all shops owned by this vendor
        const shops = await Shop.find({ vendorId: vendorId });
        if (!shops.length) {
            console.log('⚠️ No shops found for vendor');
            return res.json([]); // no shops, no orders
        }

        const shopIds = shops.map(shop => shop._id);
        console.log('🏪 Shop IDs:', shopIds);

        // Get all orders that include items from these shops
        const orders = await Order.find({ 'items.shopId': { $in: shopIds } })
            .populate('items.productId')
            .populate('customerId');

        console.log('🧾 Orders found:', orders.length);

        const filteredOrders = orders.map(order => {
            const vendorItems = order.items.filter(item =>
                item.shopId && shopIds.some(id => id.equals(item.shopId))
            );

            return {
                _id: order._id,
                items: vendorItems,
                status: order.status,
                address: order.address,
                createdAt: order.createdAt,
                customer: {
                    name: order.customerId?.name || 'Customer'
                }
            };
        }).filter(order => order.items.length > 0); // only return orders with this vendor's products

        console.log('✅ Filtered orders returned:', filteredOrders.length);
        res.json(filteredOrders);
    } catch (err) {
        console.error('❌ Error in vendor orders route:', err);
        res.status(500).json({ message: 'Error fetching vendor orders' });
    }
});

// PUT update order status (with optional rejection reason)
router.put('/:id', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const { status, reason } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        if (status === 'cancelled') {
            order.status = 'cancelled';
            order.reason = reason || 'No reason provided';
        } else {
            order.status = status;
        }

        await order.save();
        res.json({ message: 'Order status updated', order });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating order status' });
    }
});

module.exports = router;
