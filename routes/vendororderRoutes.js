const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Shop = require('../models/Shop');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { protect, restrictTo } = require('../middleware/authMiddleware');

// GET all vendor orders
router.get('/', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const vendorId = req.user.id;
        const shops = await Shop.find({ vendorId });
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

// PUT update order status and trigger refund if cancelled
router.put('/:id', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const { status, reason } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        if (status === 'cancelled') {
            // fallback for older/test orders with no paymentIntent
            if (!order.paymentIntentId) {
                order.status = 'cancelled';
                order.reason = reason || 'No reason provided';
                await order.save();

                // emit to customer
                const io = req.app.get('io');
                if (io) {
                    io.to(order.customerId.toString()).emit('orderCancelled', {
                        orderId: order._id,
                        reason: order.reason,
                        refund: false
                    });
                }

                return res.status(200).json({ message: 'Order cancelled (no payment to refund)', order });
            }

            // process refund
            const refund = await stripe.refunds.create({
                payment_intent: order.paymentIntentId
            });

            order.status = 'cancelled';
            order.reason = reason || 'No reason provided';
            await order.save();

            // emit to customer
            const io = req.app.get('io');
            if (io) {
                io.to(order.customerId.toString()).emit('orderCancelled', {
                    orderId: order._id,
                    reason: order.reason,
                    refund: true
                });
            }

            return res.json({ message: 'Order cancelled and refund issued', refund });
        }

        // status update (non-cancelled)
        order.status = status;
        await order.save();
        res.json({ message: 'Order status updated', order });

    } catch (err) {
        console.error('❌ Error updating order status or issuing refund:', err);
        res.status(500).json({ message: 'Failed to update order or refund' });
    }
});

module.exports = router;
