// ✅ vendororderRoutes.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Shop = require('../models/Shop');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// GET all orders that belong to the current vendor's shops
router.get('/', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const vendorId = req.user.id;
        console.log('📦 Vendor ID:', vendorId);

        const shops = await Shop.find({ vendorId });
        if (!shops.length) {
            console.log('⚠️ No shops found for vendor');
            return res.json([]);
        }

        const shopIds = shops.map(shop => shop._id);
        console.log('🏪 Shop IDs:', shopIds);

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
                },
                totalAmount: order.totalAmount
            };
        }).filter(order => order.items.length > 0);

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

            // ✅ Refund
            if (order.paymentIntentId) {
                try {
                    await stripe.refunds.create({
                        payment_intent: order.paymentIntentId
                    });
                    console.log(`✅ Refund processed for PaymentIntent: ${order.paymentIntentId}`);
                } catch (refundErr) {
                    console.error('❌ Error processing refund:', refundErr.message);
                    return res.status(500).json({ message: 'Refund failed, but order cancelled' });
                }
            }
        } else {
            order.status = status;
        }

        await order.save();
        res.json({ message: 'Order status updated', order });

    } catch (err) {
        console.error('❌ Error updating order status:', err.message);
        res.status(500).json({ message: 'Error updating order status' });
    }
});

module.exports = router;
