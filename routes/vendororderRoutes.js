const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Shop = require('../models/Shop');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// GET all orders that belong to the current vendor's shops
router.get('/', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const vendorId = req.user.id;
        const shops = await Shop.find({ vendorId: vendorId });
        if (!shops.length) return res.json([]);

        const shopIds = shops.map(shop => shop._id);
        const orders = await Order.find({ 'items.shopId': { $in: shopIds } })
            .populate('items.productId')
            .populate('customerId');

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
                totalAmount: order.totalAmount,
                customer: {
                    name: order.customerId?.name || 'Customer'
                }
            };
        }).filter(order => order.items.length > 0);

        res.json(filteredOrders);
    } catch (err) {
        console.error('❌ Error in vendor orders route:', err);
        res.status(500).json({ message: 'Error fetching vendor orders' });
    }
});

// PUT update order status (no refund logic here)
router.put('/:id', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const { status, reason } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        order.status = status;
        if (status === 'cancelled') {
            order.reason = reason || 'No reason provided';
        }

        await order.save();
        res.json({ message: 'Order status updated', order });
    } catch (err) {
        console.error('❌ Error updating order status:', err);
        res.status(500).json({ message: 'Error updating order status' });
    }
});

module.exports = router;
