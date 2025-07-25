// backend/routes/deliveryRoutes.js
const express = require('express');
const router = express.Router();
const DeliveryRecord = require('../models/DeliveryRecord');
const { protect, restrictTo } = require('../middleware/authMiddleware');

/* Accept order */
router.post('/accept/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const { orderId } = req.params;
        const deliveryBoyId = req.user.id;
        const { customerId, shopLocation, customerLocation } = req.body;

        if (!customerId || !shopLocation || !customerLocation) {
            return res.status(400).json({ message: 'Missing body fields' });
        }

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

/* Mark picked-up */
router.put('/pickup/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    await DeliveryRecord.findOneAndUpdate(
        { orderId: req.params.orderId, deliveryBoyId: req.user.id },
        { status: 'pickedUp', pickedUpAt: new Date() },
        { new: true }
    );
    res.json({ message: 'Picked up' });
});

/* Mark delivered */
router.put('/deliver/:orderId', protect, restrictTo('delivery'), async (req, res) => {
    await DeliveryRecord.findOneAndUpdate(
        { orderId: req.params.orderId, deliveryBoyId: req.user.id },
        { status: 'delivered', deliveredAt: new Date() },
        { new: true }
    );
    res.json({ message: 'Marked delivered ₹30 added' });
});

/* Get my deliveries */
router.get('/my-deliveries', protect, restrictTo('delivery'), async (req, res) => {
    const records = await DeliveryRecord.find({ deliveryBoyId: req.user.id })
        .populate('orderId customerId');
    res.json(records);
});

module.exports = router;