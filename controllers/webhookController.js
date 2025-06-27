const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const Order = require('../models/Order');
const Product = require('../models/Product');

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

exports.handleStripeWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('❌ Stripe signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const metadata = session.metadata;

        try {
            const items = JSON.parse(metadata.items);
            const customerId = metadata.customerId;
            const address = metadata.address;

            let totalAmount = 0;
            const shopSet = new Set();

            for (const item of items) {
                const product = await Product.findById(item.productId).populate('shopId');
                if (!product) continue;
                totalAmount += product.price * item.quantity;
                if (product.shopId?._id) {
                    shopSet.add(product.shopId._id.toString());
                }
            }

            for (const shopId of shopSet) {
                const shopItems = items.filter((item) => {
                    const product = item.productDetails;
                    return product.shopId === shopId;
                });

                await Order.create({
                    customer: customerId,
                    items: shopItems,
                    shop: shopId,
                    totalAmount,
                    address,
                    status: 'pending',
                });
            }

            console.log('✅ Order(s) created successfully after Stripe payment.');
            res.status(200).send();
        } catch (err) {
            console.error('❌ Failed to create order:', err);
            res.status(500).send('Internal Server Error');
        }
    } else {
        res.status(200).send(); // Other event types ignored for now
    }
};
