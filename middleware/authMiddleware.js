const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if user still exists
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User no longer exists.'
            });
        }

        // Check if user is verified
        if (!user.isVerified) {
            return res.status(401).json({
                success: false,
                message: 'Please verify your email first.'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({
            success: false,
            message: 'Invalid token.'
        });
    }
};

exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role: ${roles.join(' or ')}`
            });
        }
        next();
    };
};

exports.optionalAuth = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('-password');

            if (user && user.isVerified) {
                req.user = user;
            }
        }

        next();
    } catch (error) {
        // Continue without authentication
        next();
    }
};

// Special admin authentication middleware
exports.adminProtect = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            console.log('❌ Admin auth: No token provided');
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        console.log('🔍 Admin auth: Verifying token...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('🔍 Admin auth: Decoded token:', {
            id: decoded.id,
            role: decoded.role,
            isSystemAdmin: decoded.isSystemAdmin
        });

        // Handle system admin (hardcoded admin)
        if (decoded.id === 'admin' && decoded.role === 'admin') {
            console.log('✅ Admin auth: System admin authenticated');
            req.user = {
                _id: 'admin',
                name: 'System Admin',
                email: 'admin@delhiveryway.com',
                role: 'admin',
                isVerified: true
            };
            return next();
        }

        // Handle regular admin users from database
        console.log('🔍 Admin auth: Looking up user in database...');
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            console.log('❌ Admin auth: User not found in database');
            return res.status(401).json({
                success: false,
                message: 'User no longer exists.'
            });
        }

        if (user.role !== 'admin') {
            console.log('❌ Admin auth: User is not admin role:', user.role);
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required.'
            });
        }

        console.log('✅ Admin auth: Database admin authenticated');
        req.user = user;
        next();

    } catch (error) {
        console.error('❌ Admin auth middleware error:', error.message);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token format.'
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token has expired.'
            });
        }
        return res.status(401).json({
            success: false,
            message: 'Token verification failed.'
        });
    }
};