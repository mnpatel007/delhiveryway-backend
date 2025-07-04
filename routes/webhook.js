const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const Shop = require('../models/Shop');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('❌ Stripe webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        console.log('📦 Checkout session completed.');

        try {
            const metadata = JSON.parse(session.metadata.customData);
            const { items, address, userId } = metadata;

            let totalAmount = 0;
            const shopSet = new Set();
            const populatedItems = [];

            for (const item of items) {
                const product = await Product.findById(item.productId).populate('shopId');
                if (!product) continue;

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
            const grandTotal = totalAmount + tax + deliveryCharge;

            const newOrder = await Order.create({
                customerId: userId,
                items: populatedItems,
                address,
                totalAmount: grandTotal,
                deliveryCharge,
                status: 'staged',
                paymentStatus: 'paid',
                paymentIntentId: session.payment_intent
            });

            console.log('✅ Order created in DB:', newOrder._id);

            const io = req.app.get('io');
            if (io) {
                for (const shopId of shopSet) {
                    const shop = await Shop.findById(shopId);
                    if (!shop) continue;

                    const itemsForShop = await Promise.all(
                        populatedItems
                            .filter(i => i.shopId.toString() === shopId)
                            .map(async (i) => {
                                const p = await Product.findById(i.productId);
                                return {
                                    name: p?.name || 'Unknown',
                                    quantity: i.quantity,
                                    shopName: shop.name,
                                    price: p?.price || 0  // ✅ Include price
                                };
                            })
                    );

                    io.to(shop.vendorId.toString()).emit('newStagedOrder', {
                        orderId: newOrder._id,
                        address,
                        items: itemsForShop
                    });

                    console.log(`📡 newStagedOrder emitted to vendor ${shop.vendorId}`);
                }
            }

            return res.status(200).json({ received: true });

        } catch (err) {
            console.error('❌ Error processing checkout.session.completed:', err);
            return res.status(500).send('Webhook processing error');
        }
    }

    res.json({ received: true });
});

module.exports = router;
