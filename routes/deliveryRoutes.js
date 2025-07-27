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

/* Debug endpoint to check order data */
router.get('/debug-orders', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const orders = await Order.find({
            status: 'confirmed',
            deliveryBoyId: { $exists: false }
        })
            .populate({
                path: 'items.productId',
                populate: { path: 'shopId', model: 'Shop' }
            })
            .populate('customerId', 'name phone email')
            .limit(1);

        res.json({
            count: orders.length,
            sampleOrder: orders[0] || null,
            message: 'Debug data for available orders'
        });
    } catch (err) {
        console.error('Debug orders error:', err);
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
            .populate('customerId', 'name phone email')
            .sort({ createdAt: -1 });

        // Format orders for delivery boy app
        const formattedOrders = orders.map(order => ({
            _id: order._id,
            customer: {
                name: order.customerId?.name || 'Customer',
                phone: order.customerId?.phone || null,
                email: order.customerId?.email || null
            },
            deliveryAddress: order.address || 'Address not provided',
            items: order.items?.map(item => {
                console.log('Processing item:', item);
                return {
                    name: item.name || item.productId?.name || item.productName || 'Product',
                    quantity: item.quantity || 1,
                    price: item.price || item.totalPrice || 0,
                    shopName: item.shopName || item.productId?.shopId?.name || 'Shop',
                    productId: item.productId?._id || item.productId
                };
            }) || [],
            totalAmount: order.totalAmount || 0,
            deliveryCharge: order.deliveryCharge || 0,
            status: order.status,
            createdAt: order.createdAt,
            distance: order.distance || null,
            estimatedTime: order.estimatedTime || null,
            customerLocation: order.customerLocation
        }));

        res.json(formattedOrders);
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

/* Decline order */
router.post('/decline/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        const deliveryBoyId = req.user.id;

        // Find the order
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Check if order is available for assignment
        if (order.status !== 'confirmed' && order.status !== 'pending') {
            return res.status(400).json({ message: 'Order is not available for decline' });
        }

        // Log the decline reason
        console.log(`Order ${orderId} declined by delivery boy ${deliveryBoyId}. Reason: ${reason}`);

        // Optionally, you can add the delivery boy to a declined list for this order
        // to prevent reassignment to the same delivery boy
        if (!order.declinedBy) {
            order.declinedBy = [];
        }
        order.declinedBy.push({
            deliveryBoyId,
            reason,
            declinedAt: new Date()
        });
        await order.save();

        // Emit real-time update to notify other delivery boys
        const io = req.app.get('io');
        if (io) {
            io.emit('orderDeclined', {
                orderId: order._id,
                reason
            });
        }

        res.json({
            message: 'Order declined successfully'
        });
    } catch (err) {
        console.error('Decline order error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* Mark picked-up */
router.put('/pickup/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { orderId } = req.params;
        const deliveryBoyId = req.user.id;

        // Update order status in Order collection
        const order = await Order.findOneAndUpdate(
            { _id: orderId, deliveryBoyId },
            {
                status: 'picked_up',
                pickedUpAt: new Date()
            },
            { new: true }
        ).populate('customerId', 'name email phone')


        if (!order) {
            return res.status(404).json({ message: 'Order not found or not assigned to you' });
        }

        // Update delivery record
        const record = await DeliveryRecord.findOneAndUpdate(
            { orderId, deliveryBoyId },
            {
                status: 'pickedUp',
                pickedUpAt: new Date(),
                deliveryBoyLocation: req.user.currentLocation || null
            },
            { new: true }
        );

        // Emit real-time updates to all relevant parties
        const io = req.app.get('io');
        if (io) {
            // Notify customer
            io.to(`customer_${order.customerId._id}`).emit('orderStatusUpdate', {
                orderId: order._id,
                status: 'picked_up',
                message: 'Your order has been picked up and is on the way!',
                deliveryBoyLocation: req.user.currentLocation,
                timestamp: new Date()
            });

            // Notify vendor/shop
            if (order.shopId) {
                io.to(`vendor_${order.shopId._id}`).emit('orderStatusUpdate', {
                    orderId: order._id,
                    status: 'picked_up',
                    message: 'Order has been picked up by delivery partner',
                    timestamp: new Date()
                });
            }

            // Notify other delivery boys (remove from available orders)
            io.emit('orderUpdate', {
                orderId: order._id,
                status: 'picked_up',
                action: 'remove_from_available'
            });
        }

        res.json({
            message: 'Order marked as picked up successfully',
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
        const { customerFeedback, rating } = req.body || {};

        // Update order status in Order collection
        const order = await Order.findOneAndUpdate(
            { _id: orderId, deliveryBoyId },
            {
                status: 'delivered',
                deliveredAt: new Date(),
                customerFeedback: customerFeedback || null,
                rating: rating || null
            },
            { new: true }
        ).populate('customerId', 'name email phone')


        if (!order) {
            return res.status(404).json({ message: 'Order not found or not assigned to you' });
        }

        // Update delivery record
        const record = await DeliveryRecord.findOneAndUpdate(
            { orderId, deliveryBoyId },
            {
                status: 'delivered',
                deliveredAt: new Date(),
                finalLocation: req.user.currentLocation || null,
                customerFeedback: customerFeedback || null,
                rating: rating || null
            },
            { new: true }
        );

        // Calculate earnings (base + tips)
        const baseEarning = 30;
        const tips = req.body.tips || 0;
        const totalEarning = baseEarning + tips;

        // Update delivery boy earnings and stats
        await DeliveryBoy.findByIdAndUpdate(deliveryBoyId, {
            $inc: {
                totalEarnings: totalEarning,
                totalDeliveries: 1,
                'stats.completedDeliveries': 1
            },
            $set: {
                isAvailable: true, // Make available for new orders
                lastDeliveryAt: new Date()
            }
        });

        // Emit real-time updates to all relevant parties
        const io = req.app.get('io');
        if (io) {
            // Notify customer
            io.to(`customer_${order.customerId._id}`).emit('orderStatusUpdate', {
                orderId: order._id,
                status: 'delivered',
                message: 'Your order has been delivered successfully!',
                deliveredAt: new Date(),
                timestamp: new Date()
            });

            // Notify vendor/shop
            if (order.shopId) {
                io.to(`vendor_${order.shopId._id}`).emit('orderStatusUpdate', {
                    orderId: order._id,
                    status: 'delivered',
                    message: 'Order has been delivered successfully',
                    deliveredAt: new Date(),
                    timestamp: new Date()
                });
            }

            // Notify delivery boy about earnings
            io.to(`delivery_${deliveryBoyId}`).emit('earningsUpdate', {
                orderId: order._id,
                earnings: totalEarning,
                message: `Order delivered! You earned ₹${totalEarning}`,
                timestamp: new Date()
            });
        }

        res.json({
            success: true,
            message: `Order delivered successfully! ₹${totalEarning} added to your earnings`,
            order,
            deliveryRecord: record,
            earnings: totalEarning
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
                populate: [
                    {
                        path: 'items.productId',
                        populate: { path: 'shopId', model: 'Shop' }
                    },
                    {
                        path: 'customerId',
                        select: 'name phone email'
                    }
                ]
            })
            .sort({ createdAt: -1 });

        // Format records for delivery boy app
        const formattedRecords = records.map(record => ({
            _id: record.orderId._id,
            customer: {
                name: record.orderId.customerId?.name || 'Customer',
                phone: record.orderId.customerId?.phone || null,
                email: record.orderId.customerId?.email || null
            },
            deliveryAddress: record.orderId.address || record.customerLocation?.address || 'Address not provided',
            items: record.orderId.items?.map(item => ({
                name: item.name || item.productId?.name || 'Product',
                quantity: item.quantity || 1,
                price: item.price || 0,
                shopName: item.shopName || item.productId?.shopId?.name || 'Shop'
            })) || [],
            totalAmount: record.orderId.totalAmount || 0,
            deliveryCharge: record.orderId.deliveryCharge || 0,
            status: record.status === 'accepted' ? 'assigned' : record.status === 'pickedUp' ? 'picked_up' : record.status,
            assignedAt: record.createdAt,
            pickedUpAt: record.pickedUpAt,
            deliveredAt: record.deliveredAt,
            tips: record.tips || 0,
            customerLocation: record.orderId.customerLocation,
            shopLocation: record.shopLocation
        }));

        res.json(formattedRecords);
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

/* Update delivery boy location */
router.put('/location', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { lat, lng, accuracy, timestamp } = req.body;
        const deliveryBoyId = req.user.id;

        // Update delivery boy location
        const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(
            deliveryBoyId,
            {
                currentLocation: {
                    lat: parseFloat(lat),
                    lng: parseFloat(lng),
                    accuracy: accuracy || null,
                    lastUpdated: new Date(timestamp || Date.now())
                },
                isOnline: true,
                lastSeen: new Date()
            },
            { new: true }
        );

        if (!deliveryBoy) {
            return res.status(404).json({ message: 'Delivery boy not found' });
        }

        // Update any active delivery records
        await DeliveryRecord.updateMany(
            {
                deliveryBoyId,
                status: { $in: ['accepted', 'pickedUp'] }
            },
            {
                $set: {
                    'deliveryBoyLocation.lat': parseFloat(lat),
                    'deliveryBoyLocation.lng': parseFloat(lng),
                    'deliveryBoyLocation.lastUpdated': new Date()
                }
            }
        );

        // Emit location update to relevant parties
        const io = req.app.get('io');
        if (io) {
            // Notify customers with active orders from this delivery boy
            const activeRecords = await DeliveryRecord.find({
                deliveryBoyId,
                status: { $in: ['accepted', 'pickedUp'] }
            }).populate('orderId', 'customerId');

            activeRecords.forEach(record => {
                if (record.orderId?.customerId) {
                    io.to(`customer_${record.orderId.customerId}`).emit('delivery_location_update', {
                        orderId: record.orderId._id,
                        deliveryBoyLocation: {
                            lat: parseFloat(lat),
                            lng: parseFloat(lng),
                            timestamp: new Date()
                        }
                    });
                }
            });
        }

        res.json({
            message: 'Location updated successfully',
            location: {
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                accuracy,
                timestamp: new Date()
            }
        });
    } catch (err) {
        console.error('Location update error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
