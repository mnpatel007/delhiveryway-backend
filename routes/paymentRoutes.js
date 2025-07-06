const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../models/Order');

router.post('/create-checkout-session', protect, restrictTo('customer'), async (req, res) => {
    try {
        const { items, address } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Invalid items in request' });
        }

        let itemTotal = 0;
        const shopSet = new Set();

        const lineItems = items.map(item => {
            if (!item.product || !item.product.name || !item.product.price || !item.quantity) {
                throw new Error('Invalid product structure in items');
            }

            itemTotal += item.product.price * item.quantity;
            shopSet.add(item.product.shopId);

            return {
                price_data: {
                    currency: 'inr',
                    product_data: { name: item.product.name },
                    unit_amount: Math.round(item.product.price * 100),
                },
                quantity: item.quantity,
            };
        });

        const gst = itemTotal * 0.05;
        const deliveryCharge = parseInt(req.body.deliveryCharge); // ✅ from frontend

        lineItems.push({
            price_data: {
                currency: 'inr',
                product_data: { name: 'GST (5%)' },
                unit_amount: Math.round(gst * 100),
            },
            quantity: 1,
        });

        lineItems.push({
            price_data: {
                currency: 'inr',
                product_data: { name: 'Delivery Charges' },
                unit_amount: Math.round(deliveryCharge * 100),
            },
            quantity: 1,
        });

        const formattedItems = items.map(i => ({
            productId: i.product._id,
            quantity: i.quantity
        }));

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: lineItems,
            success_url: `${process.env.FRONTEND_URL}/order-success`,
            cancel_url: `${process.env.FRONTEND_URL}/cart`,
            metadata: {
                customData: JSON.stringify({
                    items: formattedItems,
                    address,
                    userId: req.user.id
                })
            }
        });

        res.json({ id: session.id });

    } catch (err) {
        console.error('❌ Stripe session error:', err.message);
        res.status(500).json({ error: 'Payment session failed' });
    }
});

module.exports = router;
