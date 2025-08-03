const crypto = require('crypto');

// Simple CSRF protection middleware
const csrfProtection = (req, res, next) => {
    // Skip CSRF for GET requests and webhook endpoints
    if (req.method === 'GET' || req.path.includes('/webhook')) {
        return next();
    }

    // Generate CSRF token for new sessions
    if (!req.session?.csrfToken) {
        if (!req.session) {
            req.session = {};
        }
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }

    // For non-GET requests, verify CSRF token
    const clientToken = req.headers['x-csrf-token'] || req.body._csrf;
    
    if (!clientToken || clientToken !== req.session.csrfToken) {
        return res.status(403).json({ 
            message: 'Invalid CSRF token',
            csrfToken: req.session.csrfToken // Provide new token
        });
    }

    next();
};

// Endpoint to get CSRF token
const getCsrfToken = (req, res) => {
    if (!req.session?.csrfToken) {
        if (!req.session) {
            req.session = {};
        }
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    
    res.json({ csrfToken: req.session.csrfToken });
};

module.exports = { csrfProtection, getCsrfToken };