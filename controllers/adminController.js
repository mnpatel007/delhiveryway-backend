const Shop = require('../models/Shop');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const PersonalShopper = require('../models/PersonalShopper');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Admin login
exports.adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // For demo purposes, we'll use hardcoded admin credentials
        // In production, you would check against a database
        if (email === 'admin@delhiveryway.com' && password === 'admin123') {
            const adminUser = {
                id: 'admin1',
                name: 'Admin',
                email: 'admin@delhiveryway.com',
                role: 'admin'
            };

            const token = jwt.sign(
                { id: adminUser.id, role: adminUser.role },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.status(200).json({
                token,
                user: adminUser
            });
        }

        res.status(401).json({ message: 'Invalid credentials' });
    } catch (err) {
        console.error('❌ Error during admin login:', err.message);
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
};

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
    try {
        // Get counts for all models
        const shopsCount = await Shop.countDocuments();
        const productsCount = await Product.countDocuments();
        const ordersCount = await Order.countDocuments();
        const usersCount = await User.countDocuments();
        const shoppersCount = await PersonalShopper.countDocuments();

        // Get recent orders (last 5)
        const recentOrders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('customerId', 'name')
            .populate('shopId', 'name');

        // Get order status distribution
        const orderStatusDistribution = await Order.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.status(200).json({
            stats: {
                shopsCount,
                productsCount,
                ordersCount,
                usersCount,
                shoppersCount
            },
            recentOrders,
            orderStatusDistribution
        });
    } catch (err) {
        console.error('❌ Error fetching dashboard stats:', err.message);
        res.status(500).json({ message: 'Failed to fetch dashboard stats', error: err.message });
    }
};

// Get all shops with pagination
exports.getAllShops = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const shops = await Shop.find()
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const total = await Shop.countDocuments();

        res.status(200).json({
            shops,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('❌ Error fetching shops:', err.message);
        res.status(500).json({ message: 'Failed to fetch shops', error: err.message });
    }
};

// Get all products with pagination
exports.getAllProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const products = await Product.find()
            .populate('shopId', 'name')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const total = await Product.countDocuments();

        res.status(200).json({
            products,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('❌ Error fetching products:', err.message);
        res.status(500).json({ message: 'Failed to fetch products', error: err.message });
    }
};

// Create a new product (admin only)
exports.createProduct = async (req, res) => {
    try {
        const product = new Product({ ...req.body });
        await product.save();
        res.status(201).json(product);
    } catch (err) {
        console.error('❌ Error creating product:', err.message);
        res.status(500).json({ message: 'Failed to create product', error: err.message });
    }
};

// Delete a product (admin only)
exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        const product = await Product.findByIdAndDelete(id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (err) {
        console.error('❌ Error deleting product:', err.message);
        res.status(500).json({ message: 'Failed to delete product', error: err.message });
    }
};

// Get all orders with pagination
exports.getAllOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const orders = await Order.find()
            .populate('customerId', 'name')
            .populate('shopId', 'name')
            .populate('personalShopperId', 'name')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const total = await Order.countDocuments();

        res.status(200).json({
            orders,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('❌ Error fetching orders:', err.message);
        res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
    }
};

// Get all users with pagination
exports.getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const users = await User.find()
            .select('-password') // Exclude password field
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const total = await User.countDocuments();

        res.status(200).json({
            users,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('❌ Error fetching users:', err.message);
        res.status(500).json({ message: 'Failed to fetch users', error: err.message });
    }
};

// Create a new shop (admin only)
exports.createShop = async (req, res) => {
    try {
        const { name, description, address } = req.body;

        // For admin-created shops, we might want to assign them to a default vendor
        // or leave vendorId as null for now
        const shop = new Shop({
            name,
            description,
            address,
            vendorId: null // Admin-created shops don't have a specific vendor initially
        });

        await shop.save();
        res.status(201).json(shop);
    } catch (err) {
        console.error('❌ Error creating shop:', err.message);
        res.status(500).json({ message: 'Failed to create shop', error: err.message });
    }
};

// Delete a shop (admin only)
exports.deleteShop = async (req, res) => {
    try {
        const { id } = req.params;

        // First delete all products associated with this shop
        await Product.deleteMany({ shopId: id });

        // Then delete the shop
        const shop = await Shop.findByIdAndDelete(id);

        if (!shop) {
            return res.status(404).json({ message: 'Shop not found' });
        }

        res.status(200).json({ message: 'Shop and its products deleted successfully' });
    } catch (err) {
        console.error('❌ Error deleting shop:', err.message);
        res.status(500).json({ message: 'Failed to delete shop', error: err.message });
    }
};

// Get all personal shoppers with pagination
exports.getAllShoppers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const shoppers = await PersonalShopper.find()
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const total = await PersonalShopper.countDocuments();

        res.status(200).json({
            shoppers,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('❌ Error fetching shoppers:', err.message);
        res.status(500).json({ message: 'Failed to fetch shoppers', error: err.message });
    }
};