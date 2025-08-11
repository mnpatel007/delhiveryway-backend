const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const PersonalShopper = require('../models/PersonalShopper');

// Register Personal Shopper
const registerShopper = async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        // Check if shopper already exists
        const existingShopper = await PersonalShopper.findOne({ email });
        if (existingShopper) {
            return res.status(400).json({ message: 'Personal Shopper already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create new shopper
        const shopper = new PersonalShopper({
            name,
            email,
            password: hashedPassword,
            phone
        });

        await shopper.save();

        // Generate JWT token
        const token = jwt.sign(
            { shopperId: shopper._id, email: shopper.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Personal Shopper registered successfully',
            token,
            shopper: {
                id: shopper._id,
                name: shopper.name,
                email: shopper.email,
                phone: shopper.phone,
                isOnline: shopper.isOnline,
                rating: shopper.rating
            }
        });
    } catch (error) {
        console.error('Register shopper error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Login Personal Shopper
const loginShopper = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find shopper
        const shopper = await PersonalShopper.findOne({ email });
        if (!shopper) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, shopper.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { shopperId: shopper._id, email: shopper.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            shopper: {
                id: shopper._id,
                name: shopper.name,
                email: shopper.email,
                phone: shopper.phone,
                isOnline: shopper.isOnline,
                rating: shopper.rating,
                totalOrders: shopper.totalOrders,
                earnings: shopper.earnings
            }
        });
    } catch (error) {
        console.error('Login shopper error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Update shopper online status
const updateOnlineStatus = async (req, res) => {
    try {
        const { isOnline } = req.body;
        const shopperId = req.shopperId;

        const shopper = await PersonalShopper.findByIdAndUpdate(
            shopperId,
            { isOnline },
            { new: true }
        );

        res.json({
            message: 'Status updated successfully',
            isOnline: shopper.isOnline
        });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    registerShopper,
    loginShopper,
    updateOnlineStatus
};