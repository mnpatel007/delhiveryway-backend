const Order = require('../models/Order');
const PersonalShopper = require('../models/PersonalShopper');

// Helper function to get status note
const getStatusNote = (status) => {
    const notes = {
        'shopping_started': 'Shopper has started shopping for your items',
        'shopping_completed': 'Shopper has completed shopping and is proceeding to checkout',
        'picked_up': 'Order has been picked up and is on the way',
        'out_for_delivery': 'Order is out for delivery',
        'arrived_at_location': 'Shopper has arrived at your location',
        'delivered': 'Order has been delivered successfully'
    };
    return notes[status] || `Order status updated to ${status}`;
};

// Helper function to get status notification info
const getStatusNotificationInfo = (status, order) => {
    const statusInfo = {
        'shopping_started': {
            message: '🛒 Your personal shopper has started shopping for your items!',
            estimatedTime: '15-20 minutes',
            nextStep: 'Your shopper will update you on item availability and any substitutions.',
            details: 'Shopping in progress at the store'
        },
        'shopping_completed': {
            message: '✅ Shopping completed! Your shopper is proceeding to checkout.',
            estimatedTime: '5-10 minutes',
            nextStep: 'Your shopper will complete payment and start delivery.',
            details: 'All items collected and ready for checkout'
        },
        'picked_up': {
            message: '📦 Order picked up! Your shopper is on the way to you.',
            estimatedTime: '10-15 minutes',
            nextStep: 'Your shopper will arrive at your location soon.',
            details: 'Order is in transit to your location'
        },
        'out_for_delivery': {
            message: '🚚 Your order is out for delivery!',
            estimatedTime: '5-10 minutes',
            nextStep: 'Your shopper will arrive shortly.',
            details: 'Final delivery in progress'
        },
        'arrived_at_location': {
            message: '🏠 Your shopper has arrived at your location!',
            estimatedTime: '1-2 minutes',
            nextStep: 'Please be ready to receive your order.',
            details: 'Shopper is at your doorstep'
        },
        'delivered': {
            message: '🎉 Order delivered successfully!',
            estimatedTime: 'Completed',
            nextStep: 'Enjoy your order!',
            details: 'Order has been delivered and completed'
        }
    };

    return statusInfo[status] || {
        message: `Order status updated to ${status}`,
        estimatedTime: 'Unknown',
        nextStep: 'Please wait for further updates.',
        details: `Status changed to ${status}`
    };
};

// Accept an order
const acceptOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const shopperId = req.shopperId;

        // Check if order exists and is available
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'pending_shopper') {
            return res.status(400).json({ success: false, message: 'Order is no longer available' });
        }

        // Update order with shopper
        order.personalShopperId = shopperId;
        order.status = 'accepted_by_shopper';
        await order.save();

        // Update shopper status
        await PersonalShopper.findByIdAndUpdate(shopperId, {
            $inc: { totalOrders: 1 }
        });

        // Emit comprehensive socket notifications
        const io = req.app.get('io');

        // Notify customer with detailed information
        io.to(`customer_${order.customerId}`).emit('orderUpdate', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: 'accepted_by_shopper',
            message: 'Your order has been accepted by a personal shopper!',
            shopperInfo: {
                name: req.shopper?.name || 'Personal Shopper',
                phone: req.shopper?.phone
            },
            estimatedTime: '30-45 minutes',
            timestamp: new Date().toISOString()
        });

        // Also send a specific notification for order acceptance
        io.to(`customer_${order.customerId}`).emit('orderAccepted', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            message: '🎉 Great news! Your personal shopper is on their way to the store.',
            shopperName: req.shopper?.name || 'Personal Shopper',
            nextStep: 'Your shopper will start shopping soon and keep you updated on progress.',
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Order accepted successfully',
            order: {
                id: order._id,
                status: order.status,
                totalAmount: order.totalAmount,
                items: order.items
            }
        });
    } catch (error) {
        console.error('Accept order error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update order status
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status, reason } = req.body;
        const shopperId = req.shopperId;

        const order = await Order.findOne({
            _id: orderId,
            personalShopperId: shopperId
        });

        if (!order) {
            return res.status(404).json({ message: 'Order not found or not assigned to you' });
        }

        // Handle cancellation with reason
        if (status === 'cancelled') {
            order.status = status;
            order.cancelledBy = 'shopper';
            order.reason = reason;
            order.timeline.push({
                status: status,
                timestamp: new Date(),
                note: `Order cancelled by shopper: ${reason}`,
                updatedBy: 'shopper'
            });
        } else {
            // Update order based on status with timeline
            order.status = status;
            order.timeline.push({
                status: status,
                timestamp: new Date(),
                note: getStatusNote(status),
                updatedBy: 'shopper'
            });
        }

        await order.save();

        // Emit comprehensive socket notifications
        const io = req.app.get('io');

        // Get status-specific message and details
        const statusInfo = getStatusNotificationInfo(status, order);

        // Notify customer with detailed information
        io.to(`customer_${order.customerId}`).emit('orderUpdate', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: status,
            message: statusInfo.message,
            shopperInfo: {
                name: req.shopper?.name || 'Personal Shopper',
                phone: req.shopper?.phone
            },
            estimatedTime: statusInfo.estimatedTime,
            nextStep: statusInfo.nextStep,
            timestamp: new Date().toISOString()
        });

        // Also emit a standard orderStatusUpdate for customer listeners
        io.to(`customer_${order.customerId}`).emit('orderStatusUpdate', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: status,
            message: statusInfo.message,
            timeline: order.timeline
        });

        // Send specific notification based on status
        io.to(`customer_${order.customerId}`).emit('shopperAction', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            action: status,
            message: statusInfo.message,
            shopperName: req.shopper?.name || 'Personal Shopper',
            details: statusInfo.details,
            timestamp: new Date().toISOString()
        });

        res.json({
            message: 'Order status updated successfully',
            order: {
                id: order._id,
                status: order.status
            }
        });
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get available orders for shoppers to accept
const getAvailableOrders = async (req, res) => {
    try {
        const orders = await Order.find({
            status: 'pending_shopper'
        }).populate([
            { path: 'customerId', select: 'name phone' },
            { path: 'shopId', select: 'name address category deliveryFee' }
        ]).sort({ createdAt: -1 });

        res.json({
            success: true,
            data: {
                orders: orders
            }
        });
    } catch (error) {
        console.error('Get available orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Get shopper's active orders
const getActiveOrders = async (req, res) => {
    try {
        const shopperId = req.shopperId;

        const orders = await Order.find({
            personalShopperId: shopperId,
            status: {
                $in: [
                    'accepted_by_shopper',
                    'shopper_at_shop',
                    'shopping_in_progress',
                    'shopping',
                    'shopper_revised_order',
                    'customer_reviewing_revision',
                    'customer_approved_revision',
                    'final_shopping',
                    'bill_sent',
                    'bill_uploaded',
                    'bill_approved',
                    'out_for_delivery'
                ]
            }
        }).populate([
            { path: 'customerId', select: 'name phone' },
            { path: 'shopId', select: 'name address category' }
        ]).sort({ createdAt: 1 });

        res.json({ success: true, orders });
    } catch (error) {
        console.error('Get active orders error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get shopper earnings
const getShopperEarnings = async (req, res) => {
    try {
        const shopperId = req.shopperId;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Fix startOfWeek calculation - create new date object to avoid mutation
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const startOfWeek = weekStart;

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get completed orders for this shopper
        const completedOrders = await Order.find({
            personalShopperId: shopperId,
            status: { $in: ['delivered'] }
        }).populate('customerId', 'name').populate('shopId', 'name');

        console.log('Shopper ID:', shopperId);
        console.log('Found completed orders:', completedOrders.length);
        console.log('Orders:', completedOrders.map(o => ({
            id: o._id,
            status: o.status,
            orderValueTotal: o.orderValue?.total,

        })));

        // Calculate earnings (delivery fee only - new payment structure)
        // Use shopperCommission if available, otherwise fall back to deliveryFee
        const totalEarnings = completedOrders.reduce((sum, order) => {
            const earning = order.shopperCommission || order.orderValue?.deliveryFee || 0;
            return sum + earning;
        }, 0);

        const todayEarnings = completedOrders
            .filter(order => {
                const orderDate = new Date(order.deliveredAt || order.updatedAt || order.createdAt);
                return orderDate >= startOfDay;
            })
            .reduce((sum, order) => {
                const earning = order.shopperCommission || order.orderValue?.deliveryFee || 0;
                return sum + earning;
            }, 0);

        const weekEarnings = completedOrders
            .filter(order => {
                const orderDate = new Date(order.deliveredAt || order.updatedAt || order.createdAt);
                return orderDate >= startOfWeek;
            })
            .reduce((sum, order) => {
                const earning = order.shopperCommission || order.orderValue?.deliveryFee || 0;
                return sum + earning;
            }, 0);

        const monthEarnings = completedOrders
            .filter(order => {
                const orderDate = new Date(order.deliveredAt || order.updatedAt || order.createdAt);
                return orderDate >= startOfMonth;
            })
            .reduce((sum, order) => {
                const earning = order.shopperCommission || order.orderValue?.deliveryFee || 0;
                return sum + earning;
            }, 0);

        res.json({
            success: true,
            data: {
                today: todayEarnings,
                thisWeek: weekEarnings,
                thisMonth: monthEarnings,
                total: totalEarnings
            }
        });
    } catch (error) {
        console.error('Get shopper earnings error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get completed orders for history
const getCompletedOrders = async (req, res) => {
    try {
        const shopperId = req.shopperId;
        const { page = 1, limit = 20 } = req.query;

        const orders = await Order.find({
            personalShopperId: shopperId,
            status: { $in: ['delivered'] }
        })
            .populate('customerId', 'name phone')
            .populate('shopId', 'name address')
            .sort({ deliveredAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Order.countDocuments({
            personalShopperId: shopperId,
            status: { $in: ['delivered'] }
        });

        res.json({
            success: true,
            data: {
                orders,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                }
            }
        });
    } catch (error) {
        console.error('Get completed orders error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update shopper location
const updateLocation = async (req, res) => {
    try {
        const { orderId, latitude, longitude, status } = req.body;
        const shopperId = req.shopperId;

        const order = await Order.findOne({
            _id: orderId,
            personalShopperId: shopperId
        });

        if (!order) {
            return res.status(404).json({ message: 'Order not found or not assigned to you' });
        }

        // Update order with location
        order.shopperLocation = {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            timestamp: new Date()
        };

        await order.save();

        // Emit location update to customer
        const io = req.app.get('io');
        io.to(`customer_${order.customerId}`).emit('shopperLocationUpdate', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            location: {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                timestamp: new Date().toISOString()
            },
            status: status || 'in_transit',
            message: getLocationMessage(status, order),
            shopperName: req.shopper?.name || 'Personal Shopper'
        });

        res.json({
            message: 'Location updated successfully',
            order: {
                id: order._id,
                location: order.shopperLocation
            }
        });
    } catch (error) {
        console.error('Update location error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Helper function to get location message
const getLocationMessage = (status, order) => {
    const messages = {
        'at_shop': '📍 Your shopper is at the store and starting to shop',
        'shopping': '🛒 Your shopper is actively shopping for your items',
        'checkout': '💳 Your shopper is at checkout, almost done!',
        'in_transit': '🚚 Your shopper is on the way to you',
        'nearby': '🏠 Your shopper is nearby and will arrive soon',
        'arrived': '🎯 Your shopper has arrived at your location'
    };

    return messages[status] || '📍 Your shopper location has been updated';
};

module.exports = {
    acceptOrder,
    updateOrderStatus,
    getAvailableOrders,
    getActiveOrders,
    getShopperEarnings,
    getCompletedOrders,
    updateLocation
};