const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Shop = require('../models/Shop');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { protect, restrictTo } = require('../middleware/authMiddleware');

// ✅ GET all orders for a vendor
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

// ✅ GET order status by ID for double-checking before popup/sound
router.get('/:id/status', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).select('status');
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json({ status: order.status });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get order status' });
    }
});

// ✅ PUT to accept or cancel order, including refund if needed
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

            // process Stripe refund
            const refund = await stripe.refunds.create({
                payment_intent: order.paymentIntentId
            });

            order.status = 'cancelled';
            order.reason = reason || 'No reason provided';
            await order.save();

            // emit cancellation with refund to customer
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

        // ✅ Accept or update non-cancelled status
        order.status = status;
        await order.save();
        res.json({ message: 'Order status updated', order });

    } catch (err) {
        console.error('❌ Error updating order status or issuing refund:', err);
        res.status(500).json({ message: 'Failed to update order or refund' });
    }
});

router.put('/:id/confirm', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const { items } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        if (order.status !== 'pending_vendor') {
            return res.status(400).json({ message: 'Not a rehearsal order' });
        }

        order.items = items;
        order.status = 'confirmed_by_vendor';
        await order.save();

        const io = req.app.get('io');
        if (io) {
            io.to(order.customerId.toString()).emit('vendorConfirmedOrder', {
                orderId: order._id,
                items,
                address: order.address,
                totalAmount: order.totalAmount,
                deliveryCharge: order.deliveryCharge
            });
        }

        res.json({ message: 'Order confirmed by vendor', order });

    } catch (err) {
        console.error('❌ Failed to confirm vendor order:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ✅ Post-payment vendor confirms staged order
router.patch('/confirm/:orderId', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order || order.status !== 'staged') {
            return res.status(400).json({ message: 'Order not in confirmable state' });
        }

        order.status = 'confirmed';
        await order.save();

        const io = req.app.get('io');
        if (io) {
            io.to(order.customerId.toString()).emit('orderStatusUpdate', {
                orderId: order._id,
                status: 'confirmed'
            });
        }

        res.status(200).json({ message: 'Order confirmed' });
    } catch (err) {
        console.error('❌ Confirm staged order error:', err.message);
        res.status(500).json({ message: 'Failed to confirm staged order' });
    }
});

module.exports = router;
