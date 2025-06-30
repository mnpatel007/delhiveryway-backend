// backend/controllers/orderController.js

const Order = require('../models/Order');
const Product = require('../models/Product');

exports.placeOrder = async (req, res) => {
    try {
        const { items, address } = req.body;

        let totalAmount = 0;
        let orderItems = [];
        let shopVendorMap = {};

        for (const item of items) {
            const product = await Product.findById(item.productId).populate({
                path: 'shopId',
                populate: { path: 'vendorId' }
            });

            if (!product || !product.shopId || !product.shopId.vendorId) continue;

            totalAmount += product.price * item.quantity;

            orderItems.push({
                productId: product._id,
                shopId: product.shopId._id,
                quantity: item.quantity
            });

            const vendorId = product.shopId.vendorId._id.toString();

            if (!shopVendorMap[vendorId]) {
                shopVendorMap[vendorId] = [];
            }

            shopVendorMap[vendorId].push({
                productId: product._id,
                name: product.name,
                quantity: item.quantity,
                price: product.price,
                shopName: product.shopId.name
            });
        }

        const deliveryCharge = 20;
        const grandTotal = totalAmount + deliveryCharge;

        const order = new Order({
            customerId: req.user.id,
            items: orderItems,
            totalAmount: grandTotal,
            deliveryCharge,
            address
        });

        await order.save();

        const io = req.app.get('io'); // you have this set globally in server.js

        for (const [vendorId, vendorItems] of Object.entries(shopVendorMap)) {
            io.to(vendorId).emit('newOrder', {
                orderId: order._id,
                items: vendorItems,
                address,
                createdAt: order.createdAt
            });
        }

        res.status(201).json({ message: 'Order placed successfully', order });
    } catch (err) {
        console.error('❌ Order placement error:', err);
        res.status(500).json({ message: 'Failed to place order' });
    }
};



exports.getCustomerOrders = async (req, res) => {
    try {
        const orders = await Order.find({ customerId: req.user.id })
            .populate({
                path: 'items.productId',
                populate: {
                    path: 'shopId',
                    model: 'Shop'
                }
            });

        res.status(200).json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
    }
};

exports.getVendorOrders = async (req, res) => {
    try {
        const orders = await Order.find().populate('items.productId');

        // filter items belonging to this vendor
        const filtered = orders.filter(order =>
            order.items.some(item => item.productId?.shopId?.vendorId?.toString() === req.user.id)
        );

        res.status(200).json(filtered);
    } catch (err) {
        res.status(500).json({ message: 'Vendor order fetch failed', error: err.message });
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
        res.status(200).json(order);
    } catch (err) {
        res.status(500).json({ message: 'Failed to update order', error: err.message });
    }
};