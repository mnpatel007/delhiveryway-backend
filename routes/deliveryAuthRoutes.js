const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const DeliveryBoy = require('../models/DeliveryBoy');

const generateToken = (deliveryBoy) => {
    return jwt.sign({ id: deliveryBoy._id, role: 'delivery' }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existing = await DeliveryBoy.findOne({ email });
        if (existing) return res.status(400).json({ message: 'Already registered' });

        const deliveryBoy = await DeliveryBoy.create({ name, email, password });
        const token = generateToken(deliveryBoy);
        res.status(201).json({ deliveryBoy, token });
    } catch (err) {
        res.status(500).json({ message: 'Signup failed', error: err.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const deliveryBoy = await DeliveryBoy.findOne({ email });
        if (!deliveryBoy) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, deliveryBoy.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        const token = generateToken(deliveryBoy);
        res.status(200).json({ deliveryBoy, token });
    } catch (err) {
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
});

module.exports = router;
