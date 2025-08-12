const express = require('express');
const router = express.Router();
const {
    getUsers,
    getShoppers,
    updateShopper,
    deleteShopper,
    getShops,
    createShop,
    deleteShop,
    getProducts,
    createProduct,
    deleteProduct,
    getOrders
} = require('../controllers/adminController');

// Simple admin auth middleware (for demo purposes)
const adminAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token && token.startsWith('admin-token')) {
        next();
    } else {
        res.status(401).json({ message: 'Unauthorized' });
    }
};

// Apply admin auth to all routes
router.use(adminAuth);

// User routes
router.get('/users', getUsers);

// Shopper routes
router.get('/shoppers', getShoppers);
router.put('/shoppers/:id', updateShopper);
router.delete('/shoppers/:id', deleteShopper);

// Shop routes
router.get('/shops', getShops);
router.post('/shops', createShop);
router.delete('/shops/:id', deleteShop);

// Product routes
router.get('/products', getProducts);
router.post('/products', createProduct);
router.delete('/products/:id', deleteProduct);

// Order routes
router.get('/orders', getOrders);

module.exports = router;