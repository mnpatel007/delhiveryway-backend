const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const DeliveryRecord = require('../models/DeliveryRecord');
const Order = require('../models/Order');

// Accept delivery
router.post('/accept/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { orderId } = req.params;
        const deliveryBoyId = req.user.id;
        const { customerId, shopLocation, customerLocation } = req.body;

        if (!customerId || !shopLocation || !customerLocation) {
            return res.status(400).json({ message: 'Missing fields in body' });
        }

        // Update Order with delivery assignment
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        order.status = 'delivery_assigned';
        order.deliveryBoyId = deliveryBoyId;
        await order.save();

        // Create delivery record
        const record = await DeliveryRecord.create({
            orderId,
            deliveryBoyId,
            customerId,
            shopLocation,
            customerLocation
        });

        res.json({ message: 'Order accepted', record });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Mark as picked up
router.put('/pickup/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { orderId } = req.params;

        await DeliveryRecord.findOneAndUpdate(
            { orderId, deliveryBoyId: req.user.id },
            { status: 'pickedUp', pickedUpAt: new Date() },
            { new: true }
        );

        await Order.findByIdAndUpdate(orderId, { status: 'picked_up' });

        res.json({ message: 'Picked up' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to mark as picked up' });
    }
});

// Mark as delivered
router.put('/deliver/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { orderId } = req.params;

        await DeliveryRecord.findOneAndUpdate(
            { orderId, deliveryBoyId: req.user.id },
            { status: 'delivered', deliveredAt: new Date() },
            { new: true }
        );

        await Order.findByIdAndUpdate(orderId, { status: 'delivered' });

        res.json({ message: 'Marked delivered ₹30 added' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to mark as delivered' });
    }
});

module.exports = router;
