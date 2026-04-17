const jwt = require('jsonwebtoken');
const PersonalShopper = require('../models/PersonalShopper');

const authenticateShopper = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const shopper = await PersonalShopper.findById(decoded.shopperId).select('-password');
        
        if (!shopper) {
            return res.status(401).json({ message: 'Token is not valid' });
        }

        req.shopperId = decoded.shopperId;
        req.shopper = shopper;

        // NUCLEAR SECURITY CHECK: Block all unverified shoppers at the server level
        if (shopper.verification && shopper.verification.isVerified === false) {
            console.warn(`🛑 Blocked unverified API access for shopper: ${shopper.email}`);
            return res.status(403).json({ 
                success: false,
                message: 'Your verification is still pending',
                isVerified: false 
            });
        }

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ message: 'Token is not valid' });
    }
};

module.exports = { authenticateShopper };