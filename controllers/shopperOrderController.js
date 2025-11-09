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

        // Check if shopper is online
        const shopper = await PersonalShopper.findById(shopperId);
        if (!shopper || !shopper.isOnline) {
            return res.status(403).json({
                success: false,
                message: 'You are currently offline. Please contact admin to go online.'
            });
        }

        // Check if shopper has UPI payment setup (allow without UPI for now)
        const hasUPISetup = shopper.upiPayment?.isSetup;
        if (!hasUPISetup) {
            console.log('⚠️ Shopper accepting order without UPI setup - using default UPI');
        }

        // Check if order exists and is available
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'pending_shopper') {
            return res.status(400).json({ success: false, message: 'Order is no longer available' });
        }

        // Update order with shopper and set up UPI payment
        order.personalShopperId = shopperId;
        order.status = 'accepted_by_shopper';
        order.payment.status = 'awaiting_upi_payment';
        order.payment.shopperUpiId = shopper.upiPayment?.upiId || 'shopper@upi';
        order.payment.paymentAmount = order.orderValue.total;
        order.payment.upiPaymentRequired = true;
        await order.save();

        // Update shopper status
        await PersonalShopper.findByIdAndUpdate(shopperId, {
            $inc: { totalOrders: 1 }
        });

        // Emit comprehensive socket notifications
        const io = req.app.get('io');

        // Notify customer with UPI payment requirement
        io.to(`customer_${order.customerId}`).emit('orderAccepted', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            message: '🎉 Great news! Your personal shopper has accepted your order.',
            shopperName: req.shopper?.name || 'Personal Shopper',
            nextStep: 'Please complete the UPI payment to allow your shopper to proceed.',
            timestamp: new Date().toISOString()
        });

        // Send UPI payment request to customer
        io.to(`customer_${order.customerId}`).emit('upiPaymentRequired', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            paymentAmount: order.payment.paymentAmount || order.orderValue.total,
            shopperUpiId: order.payment.shopperUpiId || 'shopper@upi',
            shopperName: req.shopper?.name || 'Personal Shopper',
            message: 'Please scan the UPI QR code and complete payment to proceed with your order.',
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

        // Check if shopper is online
        const shopper = await PersonalShopper.findById(shopperId);
        if (!shopper || !shopper.isOnline) {
            return res.status(403).json({
                success: false,
                message: 'You are currently offline. Please contact admin to go online.'
            });
        }

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
        const shopperId = req.shopperId;

        // Check if shopper is online
        const shopper = await PersonalShopper.findById(shopperId);
        if (!shopper || !shopper.isOnline) {
            return res.json({
                success: true,
                data: {
                    orders: [],
                    message: 'You are currently offline. No orders available.'
                }
            });
        }

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

// Setup UPI payment for shopper
const setupUPIPayment = async (req, res) => {
    try {
        const { upiId, qrCodeUrl } = req.body;
        const shopperId = req.shopperId;

        if (!upiId) {
            return res.status(400).json({
                success: false,
                message: 'UPI ID is required (e.g., yourname@paytm, yourname@phonepe)'
            });
        }

        // Basic UPI ID validation
        const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;
        if (!upiRegex.test(upiId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid UPI ID format. Please enter a valid UPI ID like yourname@paytm'
            });
        }

        const shopper = await PersonalShopper.findById(shopperId);
        if (!shopper) {
            return res.status(404).json({
                success: false,
                message: 'Shopper not found'
            });
        }

        // Update shopper's UPI payment info
        shopper.upiPayment = {
            upiId: upiId.trim().toLowerCase(),
            qrCodeUrl: qrCodeUrl || '',
            isSetup: true,
            setupAt: new Date(),
            lastUpdated: new Date(),
            verifiedUPI: false // Can be verified later by admin
        };

        await shopper.save();

        res.json({
            success: true,
            message: 'UPI payment setup completed successfully! You can now accept orders.',
            data: {
                upiId: shopper.upiPayment.upiId,
                isSetup: shopper.upiPayment.isSetup
            }
        });
    } catch (error) {
        console.error('Setup UPI payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to setup UPI payment'
        });
    }
};

// Get UPI payment status
const getUPIPaymentStatus = async (req, res) => {
    try {
        const shopperId = req.shopperId;

        const shopper = await PersonalShopper.findById(shopperId).select('upiPayment');
        if (!shopper) {
            return res.status(404).json({
                success: false,
                message: 'Shopper not found'
            });
        }

        res.json({
            success: true,
            data: {
                isSetup: shopper.upiPayment?.isSetup || false,
                upiId: shopper.upiPayment?.upiId || '',
                setupAt: shopper.upiPayment?.setupAt || null,
                verifiedUPI: shopper.upiPayment?.verifiedUPI || false
            }
        });
    } catch (error) {
        console.error('Get UPI payment status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get UPI payment status'
        });
    }
};

module.exports = {
    acceptOrder,
    updateOrderStatus,
    getAvailableOrders,
    getActiveOrders,
    getShopperEarnings,
    getCompletedOrders,
    updateLocation,
    setupUPIPayment,
    getUPIPaymentStatus
};