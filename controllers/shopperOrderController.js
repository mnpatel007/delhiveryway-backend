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
        const { orderId, status, billPhoto, billAmount } = req.body;
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
        
        if (status === 'bill_sent' && billPhoto && billAmount) {
            order.billPhoto = billPhoto;
            order.billAmount = billAmount;
        }

        await order.save();

        // Emit socket event to customer
        const io = req.app.get('io');
        io.to(`customer_${order.customerId}`).emit('orderUpdate', {
            orderId: order._id,
            status: status,
            billPhoto: billPhoto,
            billAmount: billAmount
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
            status: { $in: ['accepted_by_shopper', 'shopping', 'bill_sent', 'bill_approved', 'out_for_delivery'] }
        }).populate('customerId', 'name phone').sort({ createdAt: -1 });

        res.json({ orders });
    } catch (error) {
        console.error('Get active orders error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    acceptOrder,
    updateOrderStatus,
    getActiveOrders,
    getAvailableOrders
};