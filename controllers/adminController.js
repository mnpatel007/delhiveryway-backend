const User = require('../models/User');
const PersonalShopper = require('../models/PersonalShopper');
const Shop = require('../models/Shop');
const Product = require('../models/Product');
const Order = require('../models/Order');

// Get all users
exports.getUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const users = await User.find().skip(skip).limit(limit).sort({ createdAt: -1 });
        const total = await User.countDocuments();

        res.json({
            users,
            pagination: {
                page,
                pages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get all personal shoppers
exports.getShoppers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const shoppers = await PersonalShopper.find().skip(skip).limit(limit).sort({ createdAt: -1 });
        const total = await PersonalShopper.countDocuments();

        res.json({
            shoppers,
            pagination: {
                page,
                pages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update shopper
exports.updateShopper = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const shopper = await PersonalShopper.findByIdAndUpdate(id, updates, { new: true });
        if (!shopper) {
            return res.status(404).json({ message: 'Shopper not found' });
        }

        res.json(shopper);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Delete shopper
exports.deleteShopper = async (req, res) => {
    try {
        const { id } = req.params;
        
        const shopper = await PersonalShopper.findByIdAndDelete(id);
        if (!shopper) {
            return res.status(404).json({ message: 'Shopper not found' });
        }

        res.json({ message: 'Shopper deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get all shops
exports.getShops = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const shops = await Shop.find().skip(skip).limit(limit).sort({ createdAt: -1 });
        const total = await Shop.countDocuments();

        res.json({
            shops,
            pagination: {
                page,
                pages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Create shop
exports.createShop = async (req, res) => {
    try {
        const shop = new Shop(req.body);
        await shop.save();
        res.status(201).json(shop);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Delete shop
exports.deleteShop = async (req, res) => {
    try {
        const { id } = req.params;
        
        const shop = await Shop.findByIdAndDelete(id);
        if (!shop) {
            return res.status(404).json({ message: 'Shop not found' });
        }

        res.json({ message: 'Shop deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get all products
exports.getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const products = await Product.find().populate('shopId', 'name').skip(skip).limit(limit).sort({ createdAt: -1 });
        const total = await Product.countDocuments();

        res.json({
            products,
            pagination: {
                page,
                pages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Create product
exports.createProduct = async (req, res) => {
    try {
        const product = new Product(req.body);
        await product.save();
        await product.populate('shopId', 'name');
        res.status(201).json(product);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Delete product
exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        
        const product = await Product.findByIdAndDelete(id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get all orders
exports.getOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const orders = await Order.find()
            .populate('customerId', 'name email')
            .populate('personalShopperId', 'name email')
            .populate('shopId', 'name')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        
        const total = await Order.countDocuments();

        res.json({
            orders,
            pagination: {
                page,
                pages: Math.ceil(total / limit),
                total
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};