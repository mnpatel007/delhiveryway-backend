const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const DeliveryBoy = require('../models/DeliveryBoy');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const generateToken = (deliveryBoy) => {
    return jwt.sign({ id: deliveryBoy._id, role: 'delivery' }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

router.post('/signup', async (req, res) => {
    try {
        const { name, email, password, phone, vehicleType, vehicleNumber } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters long' });
        }

        const existing = await DeliveryBoy.findOne({ email });
        if (existing) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        const deliveryBoy = await DeliveryBoy.create({
            name,
            email,
            password,
            phone,
            vehicleType: vehicleType || 'bike',
            vehicleNumber
        });

        const token = generateToken(deliveryBoy);

        // Remove password from response
        const deliveryBoyResponse = deliveryBoy.toObject();
        delete deliveryBoyResponse.password;

        res.status(201).json({
            message: 'Registration successful',
            deliveryBoy: deliveryBoyResponse,
            token
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ message: 'Signup failed', error: err.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const deliveryBoy = await DeliveryBoy.findOne({ email });
        if (!deliveryBoy) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, deliveryBoy.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const token = generateToken(deliveryBoy);

        // Remove password from response
        const deliveryBoyResponse = deliveryBoy.toObject();
        delete deliveryBoyResponse.password;

        res.status(200).json({
            message: 'Login successful',
            deliveryBoy: deliveryBoyResponse,
            token
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
});

router.post('/logout', protect, restrictTo('delivery'), async (req, res) => {
    try {
        // Update online status to false
        await DeliveryBoy.findByIdAndUpdate(req.user.id, { isOnline: false });

        res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ message: 'Logout failed', error: err.message });
    }
});

router.get('/verify-token', protect, restrictTo('delivery'), async (req, res) => {
    try {
        const deliveryBoy = await DeliveryBoy.findById(req.user.id).select('-password');
        if (!deliveryBoy) {
            return res.status(404).json({ message: 'Delivery boy not found' });
        }

        res.status(200).json({
            message: 'Token valid',
            deliveryBoy
        });
    } catch (err) {
        console.error('Token verification error:', err);
        res.status(500).json({ message: 'Token verification failed', error: err.message });
    }
});

module.exports = router;
