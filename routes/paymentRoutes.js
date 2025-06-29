const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

router.post('/create-checkout-session', protect, restrictTo('customer'), async (req, res) => {
    try {
        const { items, address } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Invalid items in request' });
        }

        const lineItems = items.map(item => {
            if (!item.product || !item.product.name || !item.product.price || !item.quantity) {
                throw new Error('Invalid product structure in items');
            }

            return {
                price_data: {
                    currency: 'inr',
                    product_data: {
                        name: item.product.name,
                    },
                    unit_amount: Math.round(item.product.price * 100),
                },
                quantity: item.quantity,
            };
        });

        const formattedItems = items.map(i => ({
            productId: i.product._id,
            quantity: i.quantity
        }));

        const successUrl = `${process.env.FRONTEND_URL}/order-success`;
        const cancelUrl = `${process.env.FRONTEND_URL}/cart`;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: lineItems,
            success_url: successUrl,
            cancel_url: cancelUrl,
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
