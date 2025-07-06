const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.post(
    '/create-checkout-session',
    protect,
    restrictTo('customer'),
    async (req, res) => {
        try {
            const { items, address } = req.body;

            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'Invalid items in request' });
            }

            let itemTotal = 0;
            const shopSet = new Set();

            const lineItems = items.map((item) => {
                if (
                    !item.product ||
                    typeof item.product.name !== 'string' ||
                    typeof item.product.price !== 'number' ||
                    typeof item.quantity !== 'number'
                ) {
                    throw new Error('Invalid product structure in items');
                }

                itemTotal += item.product.price * item.quantity;

                // ✅ Add shopId to shopSet to count unique shops
                const shopId = item.product.shopId;
                if (shopId) {
                    if (typeof shopId === 'object' && shopId._id) {
                        shopSet.add(shopId._id.toString());
                    } else {
                        shopSet.add(shopId.toString());
                    }
                }

                return {
                    price_data: {
                        currency: 'inr',
                        product_data: {
                            name: item.product.name,
                        },
                        unit_amount: item.product.price * 100,
                    },
                    quantity: item.quantity,
                };
            });

            const tax = Math.round(itemTotal * 0.05);
            const deliveryCharge = shopSet.size * 10; // ✅ shop-based charge

            const totalAmount = itemTotal + tax + deliveryCharge;

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: lineItems,
                mode: 'payment',
                success_url: `${process.env.CLIENT_CUSTOMER_URL}/order-success`,
                cancel_url: `${process.env.CLIENT_CUSTOMER_URL}/cart`,
                metadata: {
                    customData: JSON.stringify({
                        items,
                        address,
                        userId: req.user._id,
                        deliveryCharge
                    })
                }
            });

            res.status(200).json({ id: session.id });
        } catch (err) {
            console.error('❌ Stripe session error:', err);
            res.status(500).json({ error: 'Failed to create Stripe session' });
        }
    }
);

router.post('/refund/:orderId', protect, restrictTo('vendor'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        if (!order.paymentIntentId) {
            return res.status(400).json({ message: 'No payment intent associated with this order' });
        }

        const refund = await stripe.refunds.create({
            payment_intent: order.paymentIntentId
        });

        console.log(`✅ Refund processed for PaymentIntent: ${order.paymentIntentId}`);

        order.status = 'cancelled';
        order.reason = 'Refund issued by vendor';
        await order.save();

        res.json({ message: 'Refund issued and order cancelled', refund });
    } catch (err) {
        console.error('❌ Error processing refund:', err.message);
        res.status(500).json({ message: 'Refund failed' });
    }
});
module.exports = router;