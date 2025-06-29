const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../models/Order');
const Product = require('../models/Product');
const Shop = require('../models/Shop');

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        console.log('✅ Stripe webhook received:', event.type);
    } catch (err) {
        console.error('❌ Stripe webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        console.log('📦 Checkout session completed.');

        try {
            const metadata = JSON.parse(session.metadata.customData);
            console.log('📨 Metadata received from session:', metadata);

            const { items, address, userId } = metadata;
            let totalAmount = 0;
            const shopSet = new Set();
            const populatedItems = [];

            const productCache = {};

            for (const item of items) {
                const product = await Product.findById(item.productId).populate('shopId');
                if (!product) {
                    console.warn(`⚠️ Product not found: ${item.productId}`);
                    continue;
                }

                productCache[item.productId] = product;

                totalAmount += product.price * item.quantity;
                shopSet.add(product.shopId._id.toString());

                populatedItems.push({
                    productId: product._id,
                    shopId: product.shopId._id,
                    quantity: item.quantity
                });
            }

            const deliveryCharge = shopSet.size * 10;
            const tax = totalAmount * 0.05;
            const grandTotal = totalAmount + deliveryCharge + tax;

            const newOrder = await Order.create({
                customerId: userId,
                items: populatedItems,
                address,
                totalAmount: grandTotal,
                deliveryCharge,
                status: 'pending',
                paymentStatus: 'paid'
            });

            console.log('✅ Order created in DB:', newOrder._id);

            const io = req.app.get('io');
            if (!io) {
                console.warn('⚠️ Socket.IO not initialized');
                return res.json({ received: true });
            }

            for (const shopId of shopSet) {
                const shop = await Shop.findById(shopId);
                if (!shop || !shop.vendorId) {
                    console.warn(`⚠️ Cannot emit: shop or vendorId missing for shopId: ${shopId}`);
                    continue;
                }

                const shopItems = populatedItems
                    .filter(i => i.shopId.toString() === shopId)
                    .map(i => {
                        const p = productCache[i.productId];
                        return {
                            name: p?.name || 'Unknown',
                            quantity: i.quantity,
                            shopName: shop.name
                        };
                    });

                io.to(shop.vendorId.toString()).emit('newOrder', {
                    orderId: newOrder._id,
                    address,
                    items: shopItems
                });

                console.log(`📡 Real-time alert emitted to vendor ${shop.vendorId}`);
            }

            return res.json({ received: true });

        } catch (err) {
            console.error('❌ Error processing checkout.session.completed:', err);
            return res.status(500).send('Webhook processing error');
        }
    }

    res.json({ received: true });
});

module.exports = router;
