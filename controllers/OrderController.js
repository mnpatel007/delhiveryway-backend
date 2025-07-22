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

// Delivery boy accepts an order
exports.acceptOrderByDeliveryBoy = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.deliveryBoyId) return res.status(400).json({ message: 'Order already assigned' });
        order.deliveryBoyId = req.user.id;
        order.status = 'out for delivery';
        await order.save();
        // Populate product and shop info
        await order.populate({
            path: 'items.productId',
            populate: { path: 'shopId', model: 'Shop' }
        });
        await order.populate('customerId', 'name email');
        res.status(200).json({ message: 'Order accepted by delivery boy', order });
    } catch (err) {
        res.status(500).json({ message: 'Failed to accept order', error: err.message });
    }
};

// Delivery boy completes an order
exports.completeOrderByDeliveryBoy = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (!order.deliveryBoyId || order.deliveryBoyId.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to complete this order' });
        }
        order.status = 'delivered';
        await order.save();
        res.status(200).json({ message: 'Order marked as delivered', order });
    } catch (err) {
        res.status(500).json({ message: 'Failed to complete order', error: err.message });
    }
};

// Get all assigned (not yet delivered) orders for the logged-in delivery boy
exports.getAssignedOrdersForDeliveryBoy = async (req, res) => {
    try {
        const orders = await Order.find({
            deliveryBoyId: req.user.id,
            status: { $ne: 'delivered' }
        })
        .populate({
            path: 'items.productId',
            populate: { path: 'shopId', model: 'Shop' }
        })
        .populate('customerId', 'name email');
        res.status(200).json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch assigned orders', error: err.message });
    }
};