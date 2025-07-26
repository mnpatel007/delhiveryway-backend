// backend/routes/deliveryRoutes.js
const express = require('express');
const router = express.Router();
const DeliveryRecord = require('../models/DeliveryRecord');
const DeliveryBoy = require('../models/DeliveryBoy');
const Order = require('../models/Order');
const { protect, restrictTo } = require('../middleware/authMiddleware');

/* Get delivery boy profile */
router.get('/profile', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const deliveryBoy = await DeliveryBoy.findById(req.user.id).select('-password');
        if (!deliveryBoy) {
            return res.status(404).json({ message: 'Delivery boy not found' });
        }
        res.json(deliveryBoy);
    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* Update delivery boy profile */
router.put('/profile', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { name, phone, vehicleType, vehicleNumber } = req.body;
        const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(
            req.user.id,
            { name, phone, vehicleType, vehicleNumber },
            { new: true, runValidators: true }
        ).select('-password');

        res.json({ message: 'Profile updated successfully', deliveryBoy });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* Update online status */
router.put('/status', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { isOnline } = req.body;
        const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(
            req.user.id,
            { isOnline },
            { new: true }
        ).select('-password');

        const io = req.app.get('io');
        if (io) {
            if (isOnline) {
                io.emit('deliveryBoyOnline', { deliveryBoyId: req.user.id });
            } else {
                io.emit('deliveryBoyOffline', { deliveryBoyId: req.user.id });
            }
        }

        res.json({ message: `Status updated to ${isOnline ? 'online' : 'offline'}`, deliveryBoy });
    } catch (err) {
        console.error('Status update error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* Update current location */
router.put('/location', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { lat, lng, address } = req.body;

        if (!lat || !lng) {
            return res.status(400).json({ message: 'Latitude and longitude are required' });
        }

        const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(
            req.user.id,
            {
                currentLocation: {
                    lat,
                    lng,
                    address: address || 'Unknown location',
                    lastUpdated: new Date()
                }
            },
            { new: true }
        ).select('-password');

        res.json({ message: 'Location updated successfully', deliveryBoy });
    } catch (err) {
        console.error('Location update error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* Get available orders for delivery */
router.get('/available-orders', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const orders = await Order.find({
            status: 'confirmed',
            deliveryBoyId: { $exists: false }
        })
            .populate({
                path: 'items.productId',
                populate: { path: 'shopId', model: 'Shop' }
            })
            .populate('customerId', 'name phone')
            .sort({ createdAt: -1 });

        res.json(orders);
    } catch (err) {
        console.error('Available orders fetch error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* Accept order */
router.post('/accept/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { orderId } = req.params;
        const deliveryBoyId = req.user.id;
        const { currentLocation } = req.body;

        // Check if order exists and is available
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.deliveryBoyId) {
            return res.status(400).json({ message: 'Order already assigned to another delivery boy' });
        }

        if (order.status !== 'confirmed') {
            return res.status(400).json({ message: 'Order is not ready for delivery' });
        }

        // Update order with delivery boy
        order.deliveryBoyId = deliveryBoyId;
        order.status = 'out for delivery';
        if (currentLocation) {
            order.deliveryBoyStartLocation = currentLocation;
        }
        await order.save();

        // Create delivery record
        await order.populate({
            path: 'items.productId',
            populate: { path: 'shopId', model: 'Shop' }
        });
        await order.populate('customerId', 'name phone');

        const shopLocation = order.items[0]?.productId?.shopId?.location || {};
        const customerLocation = order.customerLocation || {};

        const record = await DeliveryRecord.create({
            orderId,
            deliveryBoyId,
            customerId: order.customerId._id,
            shopLocation: {
                lat: shopLocation.lat,
                lng: shopLocation.lng,
                address: order.items[0]?.productId?.shopId?.name || 'Shop'
            },
            customerLocation: {
                lat: customerLocation.lat,
                lng: customerLocation.lng,
                address: order.address
            }
        });

        // Emit real-time updates
        const io = req.app.get('io');
        if (io) {
            io.to(order.customerId._id.toString()).emit('orderStatusUpdate', {
                orderId: order._id,
                status: 'out for delivery',
                deliveryBoy: {
                    name: (await DeliveryBoy.findById(deliveryBoyId)).name,
                    phone: (await DeliveryBoy.findById(deliveryBoyId)).phone
                }
            });
        }

        res.json({
            message: 'Order accepted successfully',
            order,
            deliveryRecord: record
        });
    } catch (err) {
        console.error('Accept order error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* Mark picked-up */
router.put('/pickup/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { orderId } = req.params;
        const deliveryBoyId = req.user.id;

        // Update order status
        const order = await Order.findOneAndUpdate(
            { _id: orderId, deliveryBoyId },
            { status: 'picked up' },
            { new: true }
        ).populate('customerId', 'name');

        if (!order) {
            return res.status(404).json({ message: 'Order not found or not assigned to you' });
        }

        // Update delivery record
        const record = await DeliveryRecord.findOneAndUpdate(
            { orderId, deliveryBoyId },
            { status: 'pickedUp', pickedUpAt: new Date() },
            { new: true }
        );

        // Emit real-time update
        const io = req.app.get('io');
        if (io) {
            io.to(order.customerId._id.toString()).emit('orderStatusUpdate', {
                orderId: order._id,
                status: 'picked up'
            });
        }

        res.json({
            message: 'Order marked as picked up',
            order,
            deliveryRecord: record
        });
    } catch (err) {
        console.error('Pickup error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* Mark delivered */
router.put('/deliver/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { orderId } = req.params;
        const deliveryBoyId = req.user.id;

        // Update order status
        const order = await Order.findOneAndUpdate(
            { _id: orderId, deliveryBoyId },
            { status: 'delivered' },
            { new: true }
        ).populate('customerId', 'name');

        if (!order) {
            return res.status(404).json({ message: 'Order not found or not assigned to you' });
        }

        // Update delivery record
        const record = await DeliveryRecord.findOneAndUpdate(
            { orderId, deliveryBoyId },
            { status: 'delivered', deliveredAt: new Date() },
            { new: true }
        );

        // Update delivery boy earnings and stats
        await DeliveryBoy.findByIdAndUpdate(deliveryBoyId, {
            $inc: { totalEarnings: 30, totalDeliveries: 1 }
        });

        // Emit real-time update
        const io = req.app.get('io');
        if (io) {
            io.to(order.customerId._id.toString()).emit('orderStatusUpdate', {
                orderId: order._id,
                status: 'delivered'
            });
        }

        res.json({
            message: 'Order delivered successfully! ₹30 added to your earnings',
            order,
            deliveryRecord: record,
            earnings: 30
        });
    } catch (err) {
        console.error('Delivery error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* Get my active deliveries */
router.get('/active-deliveries', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const records = await DeliveryRecord.find({
            deliveryBoyId: req.user.id,
            status: { $in: ['accepted', 'pickedUp'] }
        })
            .populate({
                path: 'orderId',
                populate: {
                    path: 'items.productId',
                    populate: { path: 'shopId', model: 'Shop' }
                }
            })
            .populate('customerId', 'name phone')
            .sort({ createdAt: -1 });

        res.json(records);
    } catch (err) {
        console.error('Active deliveries fetch error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* Get my delivery history */
router.get('/my-deliveries', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const query = { deliveryBoyId: req.user.id };

        if (status) {
            query.status = status;
        }

        const records = await DeliveryRecord.find(query)
            .populate({
                path: 'orderId',
                populate: {
                    path: 'items.productId',
                    populate: { path: 'shopId', model: 'Shop' }
                }
            })
            .populate('customerId', 'name phone')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await DeliveryRecord.countDocuments(query);

        res.json({
            records,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (err) {
        console.error('Delivery history fetch error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* Get earnings summary */
router.get('/earnings', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const deliveryBoy = await DeliveryBoy.findById(req.user.id);
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get delivered orders for different periods
        const todayDeliveries = await DeliveryRecord.countDocuments({
            deliveryBoyId: req.user.id,
            status: 'delivered',
            deliveredAt: { $gte: startOfDay }
        });

        const weekDeliveries = await DeliveryRecord.countDocuments({
            deliveryBoyId: req.user.id,
            status: 'delivered',
            deliveredAt: { $gte: startOfWeek }
        });

        const monthDeliveries = await DeliveryRecord.countDocuments({
            deliveryBoyId: req.user.id,
            status: 'delivered',
            deliveredAt: { $gte: startOfMonth }
        });

        res.json({
            totalEarnings: deliveryBoy.totalEarnings,
            totalDeliveries: deliveryBoy.totalDeliveries,
            todayEarnings: todayDeliveries * 30,
            weekEarnings: weekDeliveries * 30,
            monthEarnings: monthDeliveries * 30,
            todayDeliveries,
            weekDeliveries,
            monthDeliveries
        });
    } catch (err) {
        console.error('Earnings fetch error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;