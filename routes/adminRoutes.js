const express = require('express');
const router = express.Router();
const { getDashboardStats, getAllShops, createShop, deleteShop, getAllProducts, createProduct, deleteProduct, getAllOrders, getAllUsers, getAllShoppers } = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// All admin routes require authentication and admin role
router.use(protect);
router.use(restrictTo('admin'));

// Dashboard statistics
router.get('/stats', getDashboardStats);

// Shops management
router.get('/shops', getAllShops);
router.post('/shops', createShop);
router.delete('/shops/:id', deleteShop);

// Products management
router.get('/products', getAllProducts);
router.post('/products', createProduct);
router.delete('/products/:id', deleteProduct);

// Orders management
router.get('/orders', getAllOrders);

// Users management
router.get('/users', getAllUsers);

// Personal shoppers management
router.get('/shoppers', getAllShoppers);

module.exports = router;