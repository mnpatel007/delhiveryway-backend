// backend/routes/deliveryRoutes.js
const express = require('express');
const router = express.Router();
const DeliveryRecord = require('../models/DeliveryRecord');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Accept order
router.post('/accept/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    const { orderId } = req.params;
    const deliveryBoyId = req.user.id;
    const { shopLocation, customerLocation } = req.body;

    const record = await DeliveryRecord.create({
        orderId,
        deliveryBoyId,
        customerId: req.body.customerId,
        shopLocation,
        customerLocation
    });

    res.json({ message: 'Order accepted', record });
});

// Pick-up
router.put('/pickup/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    const record = await DeliveryRecord.findOneAndUpdate(
        { orderId: req.params.orderId, deliveryBoyId: req.user.id },
        { status: 'pickedUp', pickedUpAt: new Date() },
        { new: true }
    );
    res.json(record);
});

// Deliver
router.put('/deliver/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    const record = await DeliveryRecord.findOneAndUpdate(
        { orderId: req.params.orderId, deliveryBoyId: req.user.id },
        { status: 'delivered', deliveredAt: new Date() },
        { new: true }
    );
    res.json(record);
});

// Get my deliveries
router.get('/my-deliveries', protect, restrictTo('delivery'), async (req, res) => {
    const records = await DeliveryRecord.find({ deliveryBoyId: req.user.id }).populate('orderId');
    res.json(records);
});

module.exports = router;