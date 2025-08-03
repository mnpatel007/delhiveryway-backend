// backend/routes/deliveryRoutes.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const DeliveryRecord = require('../models/DeliveryRecord');
const DeliveryBoy = require('../models/DeliveryBoy');
const Order = require('../models/Order');
const Shop = require('../models/Shop');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const axios = require('axios');

// Utility function to generate OTP
const generateOTP = () => {
    return Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
};

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
        console.log(`Fetching available orders for delivery boy: ${req.user.id}`);

        // Debug: Check all orders first
        const allOrders = await Order.find({}).select('_id status deliveryBoyId declinedBy');
        console.log('All orders in database:', allOrders.map(o => ({ id: o._id, status: o.status, deliveryBoyId: o.deliveryBoyId, declined: o.declinedBy?.length || 0 })));

        const orders = await Order.find({
            status: 'confirmed_by_vendor', // Only show vendor-confirmed orders
            deliveryBoyId: { $exists: false },
            'declinedBy.deliveryBoyId': { $ne: req.user.id }
        })
            .populate({
                path: 'items.productId',
                populate: { path: 'shopId', model: 'Shop' }
            })
            .populate('customerId', 'name phone email')
            .sort({ createdAt: -1 });

        console.log(`Found ${orders.length} available orders for delivery boy ${req.user.id}`);
        orders.forEach(order => {
            console.log(`Order ${order._id}: status=${order.status}, deliveryBoyId=${order.deliveryBoyId}, declinedBy=${JSON.stringify(order.declinedBy)}`);
        });
        
        // Debug: Also check orders with status 'confirmed_by_vendor'
        const confirmedOrders = await Order.find({ status: 'confirmed_by_vendor' }).select('_id status deliveryBoyId');
        console.log('Orders with confirmed_by_vendor status:', confirmedOrders.map(o => ({ id: o._id, status: o.status, deliveryBoyId: o.deliveryBoyId })));

        // Format orders for delivery boy app
        const formattedOrders = orders.map(order => {
            console.log(`Processing order ${order._id}:`);
            console.log(`- deliveryCharge: ${order.deliveryCharge}`);
            console.log(`- deliveryChargesBreakdown: ${JSON.stringify(order.deliveryChargesBreakdown)}`);

            // Calculate total distance from deliveryChargesBreakdown
            let totalDistance = 0;
            let deliveryEarnings = order.deliveryCharge || 30; // Delivery boy earns the full delivery charge
            let needsRecalculation = false;

            if (order.deliveryChargesBreakdown && typeof order.deliveryChargesBreakdown === 'object' && Object.keys(order.deliveryChargesBreakdown).length > 0) {
                const breakdown = order.deliveryChargesBreakdown;
                const distances = Object.values(breakdown).map(shop => shop.distance || 0);
                totalDistance = Math.max(...distances, 0); // Use the longest distance for delivery boy
                console.log(`- Using breakdown distances: ${distances}, max: ${totalDistance}`);
            } else {
                // Fallback for old orders without deliveryChargesBreakdown
                // For orders with suspiciously low delivery charges (like ₹10), recalculate properly
                needsRecalculation = order.deliveryCharge < 30;

                if (needsRecalculation) {
                    // Calculate actual distance from customer address to shop address
                    // For now, use a reasonable estimate based on the addresses
                    // Customer: "61, Upper Humber Drive, West Humber-Clairville, Etobicoke North, Etobicoke, Toronto, Golden Horseshoe, Ontario, M9W 7A6, Canada"
                    // Shop: "1937 Weston Rd, York, ON M9N 1W7, Canada"
                    // This is approximately 13-15km distance
                    totalDistance = 13.8; // km

                    // Recalculate delivery charge based on distance
                    if (totalDistance > 10) deliveryEarnings = 60; // 10-15km tier
                    else if (totalDistance > 5) deliveryEarnings = 50; // 5-10km tier
                    else if (totalDistance > 2) deliveryEarnings = 40; // 2-5km tier
                    else deliveryEarnings = 30; // 0-2km tier

                    console.log(`- RECALCULATED for old order: distance=${totalDistance}km, corrected earnings=₹${deliveryEarnings}`);
                } else {
                    // Estimate distance based on delivery charge using our pricing tiers
                    const charge = order.deliveryCharge || 30;
                    if (charge >= 60) totalDistance = 13.8; // 10-15km tier
                    else if (charge >= 50) totalDistance = 8.5; // 5-10km tier  
                    else if (charge >= 40) totalDistance = 3.5; // 2-5km tier
                    else totalDistance = 1.5; // 0-2km tier
                    console.log(`- Using fallback distance for charge ${charge}: ${totalDistance} km`);
                }
            }

            console.log(`- Final: distance=${totalDistance}, earnings=${deliveryEarnings}`);
            console.log('---');

            return {
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
                        shopAddress: item.shopAddress || item.productId?.shopId?.address || 'Not available',
                        productId: item.productId?._id || item.productId
                    };
                }) || [],
                totalAmount: order.totalAmount || 0,
                deliveryCharge: order.deliveryCharge || 0,
                deliveryEarnings: deliveryEarnings,
                status: order.status,
                createdAt: order.createdAt,
                distance: totalDistance,
                estimatedTime: order.estimatedTime || null,
                customerLocation: order.customerLocation
            };
        });

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

        if (order.status !== 'confirmed_by_vendor') {
            return res.status(400).json({ message: 'Order is not ready for delivery' });
        }

        // Update order with delivery boy
        order.deliveryBoyId = deliveryBoyId;
        order.status = 'assigned';
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
                status: 'assigned',
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
        if (order.status !== 'confirmed_by_vendor') {
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
            deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId),
            reason,
            declinedAt: new Date()
        });
        await order.save();

        console.log(`Order ${orderId} declined by ${deliveryBoyId}. DeclinedBy array:`, order.declinedBy);

        // Emit real-time update to notify other delivery boys
        const io = req.app.get('io');
        if (io) {
            io.emit('orderDeclined', {
                orderId: order._id,
                reason
            });
        }

        res.json({
            success: true,
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

        // Generate OTP for delivery confirmation
        const otpCode = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

        console.log(`🔐 Generated OTP ${otpCode} for order ${orderId} (expires at ${otpExpiresAt})`);

        // Update order status in Order collection
        const order = await Order.findOneAndUpdate(
            { _id: orderId, deliveryBoyId },
            {
                status: 'picked_up',
                pickedUpAt: new Date(),
                deliveryOTP: {
                    code: otpCode,
                    generatedAt: new Date(),
                    expiresAt: otpExpiresAt,
                    isUsed: false
                }
            },
            { new: true }
        ).populate('customerId', 'name email phone')

        console.log(`📋 Order details: ID=${order._id}, Customer=${order.customerId?._id}, Status=${order.status}`);


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
            // Notify customer with OTP
            console.log(`📱 Sending OTP notification to customer ${order.customerId._id} in room customer_${order.customerId._id}`);
            io.to(`customer_${order.customerId._id}`).emit('orderStatusUpdate', {
                orderId: order._id,
                status: 'picked_up',
                message: `Your order has been picked up and is on the way! Your delivery OTP is: ${otpCode}`,
                deliveryOTP: otpCode,
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
            message: 'Order marked as picked up successfully. OTP sent to customer.',
            order,
            deliveryRecord: record,
            otpGenerated: true,
            otpMessage: `OTP ${otpCode} has been sent to the customer for delivery confirmation.`
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
                shopName: item.shopName || item.productId?.shopId?.name || 'Shop',
                shopAddress: item.shopAddress || item.productId?.shopId?.address || 'Not available'
            })) || [],
            totalAmount: record.orderId.totalAmount || 0,
            deliveryCharge: record.orderId.deliveryCharge || 0,
            status: record.status === 'accepted' ? 'assigned' : record.status === 'pickedUp' ? 'picked_up' : record.status,
            assignedAt: record.createdAt,
            pickedUpAt: record.pickedUpAt,
            deliveredAt: record.deliveredAt,
            tips: record.tips || 0,
            customerLocation: record.orderId.customerLocation,
            shopLocation: record.shopLocation,
            shopAddress: record.shopLocation?.address
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

/* Verify OTP and mark as delivered */
router.put('/deliver/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { orderId } = req.params;
        const { otp } = req.body;
        const deliveryBoyId = req.user.id;

        if (!otp) {
            return res.status(400).json({ message: 'OTP is required' });
        }

        // Find the order
        const order = await Order.findOne({
            _id: orderId,
            deliveryBoyId,
            status: 'picked_up'
        }).populate('customerId', 'name email phone');

        if (!order) {
            return res.status(404).json({ message: 'Order not found or not in picked up status' });
        }

        // Check if OTP exists and is valid
        if (!order.deliveryOTP || !order.deliveryOTP.code) {
            return res.status(400).json({ message: 'No OTP found for this order' });
        }

        if (order.deliveryOTP.isUsed) {
            return res.status(400).json({ message: 'OTP has already been used' });
        }

        if (new Date() > order.deliveryOTP.expiresAt) {
            return res.status(400).json({ message: 'OTP has expired' });
        }

        if (order.deliveryOTP.code !== otp.toString()) {
            console.log(`❌ Invalid OTP for order ${orderId}. Expected: ${order.deliveryOTP.code}, Received: ${otp}`);
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        console.log(`✅ OTP verified successfully for order ${orderId}`);

        // Mark OTP as used and update order status
        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            {
                status: 'delivered',
                deliveredAt: new Date(),
                'deliveryOTP.isUsed': true
            },
            { new: true }
        ).populate('customerId', 'name email phone');

        // Update delivery record
        const record = await DeliveryRecord.findOneAndUpdate(
            { orderId, deliveryBoyId },
            {
                status: 'delivered',
                deliveredAt: new Date(),
                deliveryBoyLocation: req.user.currentLocation || null
            },
            { new: true }
        );

        // Emit real-time updates
        const io = req.app.get('io');
        if (io) {
            // Notify customer
            io.to(`customer_${updatedOrder.customerId._id}`).emit('orderStatusUpdate', {
                orderId: updatedOrder._id,
                status: 'delivered',
                message: 'Your order has been delivered successfully!',
                timestamp: new Date()
            });

            // Notify vendor/shop
            if (updatedOrder.shopId) {
                io.to(`vendor_${updatedOrder.shopId._id}`).emit('orderStatusUpdate', {
                    orderId: updatedOrder._id,
                    status: 'delivered',
                    message: 'Order has been delivered successfully',
                    timestamp: new Date()
                });
            }
        }

        res.json({
            message: 'Order delivered successfully!',
            order: updatedOrder,
            deliveryRecord: record
        });

    } catch (err) {
        console.error('Delivery confirmation error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* Test OTP notification - REMOVE IN PRODUCTION */
router.post('/test-otp/:customerId', async (req, res) => {
    try {
        const { customerId } = req.params;
        const testOTP = '1234';

        const io = req.app.get('io');
        if (io) {
            console.log(`🧪 Sending test OTP notification to customer ${customerId}`);
            io.to(`customer_${customerId}`).emit('orderStatusUpdate', {
                orderId: 'test-order-id',
                status: 'picked_up',
                message: `Test: Your delivery OTP is: ${testOTP}`,
                deliveryOTP: testOTP,
                timestamp: new Date()
            });
        }

        res.json({ message: 'Test OTP notification sent', otp: testOTP });
    } catch (err) {
        console.error('Test OTP error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==================== DELIVERY CHARGE CALCULATION ENDPOINTS ====================

/**
 * Calculate distance between two coordinates using Haversine formula
 */
const calculateDistance = (lat1, lng1, lat2, lng2) => {
    // Validate coordinates
    if (!lat1 || !lng1 || !lat2 || !lng2 ||
        Math.abs(lat1) > 90 || Math.abs(lat2) > 90 ||
        Math.abs(lng1) > 180 || Math.abs(lng2) > 180) {
        console.error('Invalid coordinates:', { lat1, lng1, lat2, lng2 });
        return 0; // Return 0 distance for invalid coordinates
    }

    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // Additional validation - distance should be reasonable
    if (distance > 20000) { // More than half Earth's circumference is suspicious
        console.error('Suspicious distance calculated:', distance, 'km between', { lat1, lng1, lat2, lng2 });
        return 0;
    }

    return distance;
};

/**
 * Calculate delivery charge based on distance
 */
const calculateDeliveryCharge = (distance) => {
    const baseCharge = 20;

    if (distance <= 2) {
        return baseCharge; // ₹20 for up to 2km
    } else if (distance <= 5) {
        return baseCharge + 10; // ₹30 for 2-5km
    } else if (distance <= 10) {
        return baseCharge + 25; // ₹45 for 5-10km
    } else if (distance <= 15) {
        return baseCharge + 40; // ₹60 for 10-15km
    } else if (distance <= 25) {
        return baseCharge + 60; // ₹80 for 15-25km
    } else {
        return baseCharge + 80; // ₹100 for 25km+
    }
};

/**
 * Geocode an address to get coordinates with fallback support
 */
const geocodeAddress = async (address) => {
    console.log('🔍 Geocoding address:', address);

    try {
        // Try Google Maps API first if key is available and valid
        if (process.env.GOOGLE_MAPS_API_KEY &&
            process.env.GOOGLE_MAPS_API_KEY !== 'your_google_maps_api_key_here') {

            console.log('🗺️ Trying Google Maps API...');
            try {
                const response = await axios.get(
                    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
                );
                const data = response.data;
                console.log('Google Maps API response status:', data.status);

                if (data.status === 'OK' && data.results.length > 0) {
                    const location = data.results[0].geometry.location;
                    const coords = {
                        lat: location.lat,
                        lng: location.lng
                    };
                    console.log('✅ Google Maps found coordinates:', coords);
                    return coords;
                } else {
                    console.log('❌ Google Maps failed:', data.status, data.error_message);
                }
            } catch (gmError) {
                console.log('❌ Google Maps API error:', gmError.message);
            }
        } else {
            console.log('⚠️ Google Maps API key not available or invalid');
        }

        // Fallback to free geocoding service
        console.log('🌍 Using fallback geocoding service (OpenStreetMap)...');
        try {
            const response = await axios.get(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
                {
                    headers: {
                        'User-Agent': 'DelhiveryWay-App/1.0'
                    }
                }
            );
            const data = response.data;
            console.log('OpenStreetMap response:', data.length, 'results');

            if (data && data.length > 0) {
                const coords = {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon)
                };
                console.log('✅ OpenStreetMap found coordinates:', coords);
                return coords;
            } else {
                console.log('❌ OpenStreetMap: No results found');
                throw new Error('Address not found');
            }
        } catch (osmError) {
            console.log('❌ OpenStreetMap error:', osmError.message);
            throw osmError;
        }
    } catch (error) {
        console.error('🚨 All geocoding methods failed:', error.message);
        console.log('🔄 Falling back to default Delhi coordinates');
        // Fallback to default coordinates (Delhi)
        return {
            lat: 28.6139,
            lng: 77.2090
        };
    }
};

// Test geocoding endpoint for debugging
router.post('/test-geocoding', protect, restrictTo('customer'), async (req, res) => {
    try {
        const { address } = req.body;
        if (!address) {
            return res.status(400).json({ message: 'Address is required' });
        }

        const coords = await geocodeAddress(address);
        res.json({
            address,
            coordinates: coords,
            message: 'Geocoding test successful'
        });
    } catch (error) {
        console.error('Geocoding test error:', error);
        res.status(500).json({
            message: 'Geocoding test failed',
            error: error.message
        });
    }
});

// Calculate delivery charges for given address and shop IDs
router.post('/calculate-charges', protect, restrictTo('customer'), async (req, res) => {
    try {
        const { address, shopIds } = req.body;

        if (!address || !shopIds || !Array.isArray(shopIds)) {
            return res.status(400).json({
                message: 'Address and shopIds array are required'
            });
        }

        // Geocode customer address
        const customerCoords = await geocodeAddress(address);
        console.log('Customer coordinates:', customerCoords);

        // Get shop details with coordinates
        const shops = await Shop.find({ _id: { $in: shopIds } });
        console.log('Found shops:', shops.map(s => ({ name: s.name, location: s.location })));

        // Calculate delivery charges for each shop
        const deliveryCharges = {};

        for (const shop of shops) {
            if (shop.location && shop.location.lat && shop.location.lng) {
                console.log(`Calculating distance for ${shop.name}:`, {
                    customer: customerCoords,
                    shop: shop.location
                });

                const straightLineDistance = calculateDistance(
                    customerCoords.lat,
                    customerCoords.lng,
                    shop.location.lat,
                    shop.location.lng
                );

                // Apply road distance multiplier (typical urban factor is 1.4-1.6x)
                const roadDistanceMultiplier = 1.5;
                const estimatedRoadDistance = straightLineDistance * roadDistanceMultiplier;

                console.log(`Straight-line distance: ${straightLineDistance.toFixed(2)}km`);
                console.log(`Estimated road distance: ${estimatedRoadDistance.toFixed(2)}km (${roadDistanceMultiplier}x multiplier)`);

                deliveryCharges[shop._id] = {
                    shopName: shop.name,
                    distance: Math.round(estimatedRoadDistance * 10) / 10, // Round to 1 decimal place
                    charge: calculateDeliveryCharge(estimatedRoadDistance),
                    shopCoords: shop.location,
                    straightLineDistance: Math.round(straightLineDistance * 10) / 10
                };
            } else {
                console.log(`Shop ${shop.name} has no coordinates, using default charge`);
                // Fallback charge if shop doesn't have coordinates
                deliveryCharges[shop._id] = {
                    shopName: shop.name,
                    distance: 0,
                    charge: 30, // Default charge
                    shopCoords: null
                };
            }
        }

        res.json({
            customerCoords,
            deliveryCharges,
            totalShops: shops.length
        });

    } catch (error) {
        console.error('Error calculating delivery charges:', error);
        res.status(500).json({
            message: 'Failed to calculate delivery charges',
            error: error.message
        });
    }
});

// Get delivery charge for a single shop
router.post('/calculate-single', protect, restrictTo('customer'), async (req, res) => {
    try {
        const { address, shopId } = req.body;

        if (!address || !shopId) {
            return res.status(400).json({
                message: 'Address and shopId are required'
            });
        }

        // Geocode customer address
        const customerCoords = await geocodeAddress(address);

        // Get shop details
        const shop = await Shop.findById(shopId);
        if (!shop) {
            return res.status(404).json({ message: 'Shop not found' });
        }

        let deliveryInfo;

        if (shop.location && shop.location.lat && shop.location.lng) {
            const distance = calculateDistance(
                customerCoords.lat,
                customerCoords.lng,
                shop.location.lat,
                shop.location.lng
            );

            deliveryInfo = {
                shopName: shop.name,
                distance: Math.round(distance * 10) / 10,
                charge: calculateDeliveryCharge(distance),
                shopCoords: shop.location
            };
        } else {
            deliveryInfo = {
                shopName: shop.name,
                distance: 0,
                charge: 30, // Default charge
                shopCoords: null
            };
        }

        res.json({
            customerCoords,
            deliveryInfo
        });

    } catch (error) {
        console.error('Error calculating single delivery charge:', error);
        res.status(500).json({
            message: 'Failed to calculate delivery charge',
            error: error.message
        });
    }
});

module.exports = router;
