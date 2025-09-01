const Order = require('../models/Order');
const PersonalShopper = require('../models/PersonalShopper');

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

        // Emit socket event
        const io = req.app.get('io');
        io.to(`customer_${order.customerId}`).emit('orderUpdate', {
            orderId: order._id,
            status: 'accepted_by_shopper',
            message: 'Your order has been accepted by a personal shopper!'
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
        const { orderId, status } = req.body;
        const shopperId = req.shopperId;

        const order = await Order.findOne({
            _id: orderId,
            personalShopperId: shopperId
        });

        if (!order) {
            return res.status(404).json({ message: 'Order not found or not assigned to you' });
        }

        // Update order based on status
        order.status = status;



        await order.save();

        // Emit socket event to customer
        const io = req.app.get('io');
        io.to(`customer_${order.customerId}`).emit('orderUpdate', {
            orderId: order._id,
            status: status
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
            { path: 'shopId', select: 'name address category' }
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
        }).populate('customerId', 'name phone').sort({ createdAt: -1 });

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

module.exports = {
    acceptOrder,
    updateOrderStatus,
    getAvailableOrders,
    getActiveOrders,
    getShopperEarnings,
    getCompletedOrders
};