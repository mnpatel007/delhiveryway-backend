// backend/controllers/orderController.js
const Order = require('../models/Order');
const Product = require('../models/Product');

/* ------------------------------------------------------------------ */
/*  Customer places order                                               */
/* ------------------------------------------------------------------ */
exports.placeOrder = async (req, res) => {
    try {
        const { items, address } = req.body;

        let totalAmount = 0;
        let orderItems = [];
        let shopVendorMap = {};

        for (const item of items) {
            const product = await Product.findById(item.productId).populate({
                path: 'shopId',
                populate: { path: 'vendorId' },
            });

            if (!product || !product.shopId || !product.shopId.vendorId) continue;

            totalAmount += product.price * item.quantity;

            orderItems.push({
                productId: product._id,
                shopId: product.shopId._id,
                quantity: item.quantity,
            });

            const vendorId = product.shopId.vendorId._id.toString();
            if (!shopVendorMap[vendorId]) shopVendorMap[vendorId] = [];

            shopVendorMap[vendorId].push({
                productId: product._id,
                name: product.name,
                quantity: item.quantity,
                price: product.price,
                shopName: product.shopId.name,
            });
        }

        const deliveryCharge = 20;
        const grandTotal = totalAmount + deliveryCharge;

        const order = new Order({
            customerId: req.user.id,
            items: orderItems,
            totalAmount: grandTotal,
            deliveryCharge,
            address,
        });

        await order.save();

        const io = req.app.get('io');
        for (const [vendorId, vendorItems] of Object.entries(shopVendorMap)) {
            io.to(vendorId).emit('newOrder', {
                orderId: order._id,
                items: vendorItems,
                address,
                createdAt: order.createdAt,
            });
        }

        res.status(201).json({ message: 'Order placed successfully', order });
    } catch (err) {
        console.error('❌ Order placement error:', err);
        res.status(500).json({ message: 'Failed to place order' });
    }
};

/* ------------------------------------------------------------------ */
/*  Customer fetches own orders                                         */
/* ------------------------------------------------------------------ */
exports.getCustomerOrders = async (req, res) => {
    try {
        const orders = await Order.find({ customerId: req.user.id }).populate({
            path: 'items.productId',
            populate: { path: 'shopId', model: 'Shop' },
        });
        res.status(200).json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
    }
};

/* ------------------------------------------------------------------ */
/*  Vendor fetches orders                                               */
/* ------------------------------------------------------------------ */
exports.getVendorOrders = async (req, res) => {
    try {
        const orders = await Order.find().populate('items.productId');

        const filtered = orders.filter(order =>
            order.items.some(
                item => item.productId?.shopId?.vendorId?.toString() === req.user.id
            )
        );

        res.status(200).json(filtered);
    } catch (err) {
        res.status(500).json({ message: 'Vendor order fetch failed', error: err.message });
    }
};

/* ------------------------------------------------------------------ */
/*  Generic status update endpoint                                      */
/* ------------------------------------------------------------------ */
exports.updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );
        res.status(200).json(order);
    } catch (err) {
        res.status(500).json({ message: 'Failed to update order', error: err.message });
    }
};

/* ------------------------------------------------------------------ */
/*  Delivery boy – accept order                                         */
/* ------------------------------------------------------------------ */
exports.acceptOrderByDeliveryBoy = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.deliveryBoyId)
            return res.status(400).json({ message: 'Order already assigned' });

        order.deliveryBoyId = req.user.id;
        order.status = 'assigned delivery driver';

        if (
            req.body.deliveryBoyStartLocation &&
            req.body.deliveryBoyStartLocation.lat &&
            req.body.deliveryBoyStartLocation.lng
        ) {
            order.deliveryBoyStartLocation = req.body.deliveryBoyStartLocation;
        }

        await order.save();

        // Populate for response
        await order.populate({
            path: 'items.productId',
            populate: { path: 'shopId', model: 'Shop' },
        });
        await order.populate('customerId', 'name email');

        // 🔊 NEW: broadcast status change to customer & vendor
        const io = req.app.get('io');
        io.to(order.customerId.toString()).emit('orderStatusUpdate', {
            orderId: order._id,
            status: 'assigned delivery driver',
        });
        io.to(order.items[0].productId.shopId.vendorId.toString()).emit(
            'orderStatusUpdate',
            { orderId: order._id, status: 'assigned delivery driver' }
        );

        res.status(200).json({ message: 'Order accepted by delivery boy', order });
    } catch (err) {
        res.status(500).json({ message: 'Failed to accept order', error: err.message });
    }
};

/* ------------------------------------------------------------------ */
/*  Delivery boy – mark picked up                                       */
/* ------------------------------------------------------------------ */
exports.pickupOrderByDeliveryBoy = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (!order.deliveryBoyId || order.deliveryBoyId.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to pick up this order' });
        }

        order.status = 'picked up';
        await order.save();

        // 🔊 NEW: broadcast status change
        const io = req.app.get('io');
        io.to(order.customerId.toString()).emit('orderStatusUpdate', {
            orderId: order._id,
            status: 'picked up',
        });
        io.to(order.items[0].productId.shopId.vendorId.toString()).emit(
            'orderStatusUpdate',
            { orderId: order._id, status: 'picked up' }
        );

        res.status(200).json({ message: 'Order marked as picked up', order });
    } catch (err) {
        res.status(500).json({ message: 'Failed to mark order as picked up', error: err.message });
    }
};

/* ------------------------------------------------------------------ */
/*  Delivery boy – mark delivered                                       */
/* ------------------------------------------------------------------ */
exports.completeOrderByDeliveryBoy = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (!order.deliveryBoyId || order.deliveryBoyId.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to complete this order' });
        }

        order.status = 'delivered';
        await order.save();

        // 🔊 NEW: broadcast status change
        const io = req.app.get('io');
        io.to(order.customerId.toString()).emit('orderStatusUpdate', {
            orderId: order._id,
            status: 'delivered',
        });
        io.to(order.items[0].productId.shopId.vendorId.toString()).emit(
            'orderStatusUpdate',
            { orderId: order._id, status: 'delivered' }
        );

        res.status(200).json({ message: 'Order marked as delivered', order });
    } catch (err) {
        res.status(500).json({ message: 'Failed to complete order', error: err.message });
    }
};

/* ------------------------------------------------------------------ */
/*  Delivery boy – get assigned orders                                  */
/* ------------------------------------------------------------------ */
exports.getAssignedOrdersForDeliveryBoy = async (req, res) => {
    try {
        const orders = await Order.find({
            deliveryBoyId: req.user.id,
            status: { $ne: 'delivered' },
        })
            .populate({
                path: 'items.productId',
                populate: { path: 'shopId', model: 'Shop' },
            })
            .populate('customerId', 'name email');
        res.status(200).json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch assigned orders', error: err.message });
    }
};

/* ------------------------------------------------------------------ */
/*  Get single order by ID                                              */
/* ------------------------------------------------------------------ */
exports.getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId)
            .populate({
                path: 'items.productId',
                populate: { path: 'shopId', model: 'Shop' },
            })
            .populate('customerId', 'name email');

        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.status(200).json({ order });
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch order', error: err.message });
    }
};