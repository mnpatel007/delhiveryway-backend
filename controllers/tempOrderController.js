const Order = require('../models/Order');
const Product = require('../models/Product');

exports.createTempOrder = async (req, res) => {
    try {
        const { items, address } = req.body;
        if (!items || items.length === 0 || !address) {
            return res.status(400).json({ message: 'Missing items or address' });
        }

        let total = 0;
        const shopSet = new Set();
        const orderItems = [];
        const vendorMap = {};

        for (const item of items) {
            const product = await Product.findById(item.productId).populate('shopId');
            if (!product) continue;

            total += product.price * item.quantity;
            shopSet.add(product.shopId._id.toString());

            orderItems.push({
                productId: product._id,
                shopId: product.shopId._id,
                quantity: item.quantity,
                name: product.name,
                price: product.price,
                shopName: product.shopId.name,
                shopAddress: product.shopId.address || 'Address not available'
            });

            const vendorId = product.shopId.vendorId.toString();
            if (!vendorMap[vendorId]) vendorMap[vendorId] = [];
            vendorMap[vendorId].push({
                productId: product._id,
                name: product.name,
                quantity: item.quantity,
                price: product.price,
                shopName: product.shopId.name
            });

        }

        const deliveryCharge = shopSet.size * 10;
        const tax = total * 0.05;
        const grandTotal = total + tax + deliveryCharge;

        const tempOrder = await Order.create({
            customerId: req.user.id,
            items: orderItems,
            address,
            totalAmount: grandTotal,
            deliveryCharge,
            status: 'pending_vendor'
        });

        // 🔁 Notify each vendor
        const io = req.app.get('io');
        if (io) {
            for (const [vendorId, vendorItems] of Object.entries(vendorMap)) {
                io.to(vendorId).emit('newRehearsalOrder', {
                    orderId: tempOrder._id,
                    items: vendorItems,
                    address,
                    createdAt: tempOrder.createdAt
                });
            }
        }

        res.status(201).json({ message: 'Rehearsal order created', orderId: tempOrder._id });

    } catch (err) {
        console.error('❌ Failed to create temp order:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
