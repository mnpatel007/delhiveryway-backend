const User = require('../models/User');
const Shop = require('../models/Shop');
const Product = require('../models/Product');
const Order = require('../models/Order');
const PersonalShopper = require('../models/PersonalShopper');
const mongoose = require('mongoose');

// Admin login
exports.adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check for admin credentials
        if (email === 'admin@delhiveryway.com' && password === 'admin123') {
            const adminUser = {
                _id: 'admin',
                name: 'System Admin',
                email: 'admin@delhiveryway.com',
                role: 'admin'
            };

            const jwt = require('jsonwebtoken');
            const tokenPayload = { id: 'admin', role: 'admin', isSystemAdmin: true };
            const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });

            console.log('✅ Admin login successful for system admin');
            console.log('🔍 Token payload:', tokenPayload);
            console.log('🔍 JWT Secret exists:', !!process.env.JWT_SECRET);

            return res.json({
                success: true,
                message: 'Admin login successful',
                data: {
                    user: adminUser,
                    token
                }
            });
        }

        // Check for regular admin users
        const user = await User.findOne({ email, role: 'admin' }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid admin credentials'
            });
        }

        const isPasswordValid = await user.comparePassword(password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid admin credentials'
            });
        }

        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Admin login successful',
            data: {
                user: user.toJSON(),
                token
            }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Admin login failed'
        });
    }
};

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
    try {
        const [
            totalUsers,
            totalShops,
            totalProducts,
            totalOrders,
            totalShoppers,
            recentOrders,
            monthlyStats
        ] = await Promise.all([
            User.countDocuments({ role: { $ne: 'admin' } }),
            Shop.countDocuments(),
            Product.countDocuments(),
            Order.countDocuments(),
            PersonalShopper.countDocuments(),
            Order.find()
                .populate('customerId', 'name email')
                .populate('shopId', 'name')
                .populate('personalShopperId', 'name')
                .sort({ createdAt: -1 })
                .limit(10),
            Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                    }
                },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        orders: { $sum: 1 },
                        revenue: { $sum: '$orderValue.total' }
                    }
                },
                { $sort: { _id: 1 } }
            ])
        ]);

        // Calculate revenue stats
        const revenueStats = await Order.aggregate([
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$orderValue.total' },
                    deliveredRevenue: {
                        $sum: {
                            $cond: [
                                { $eq: ['$status', 'delivered'] },
                                '$orderValue.total',
                                0
                            ]
                        }
                    },
                    averageOrderValue: { $avg: '$orderValue.total' }
                }
            }
        ]);

        const revenue = revenueStats[0] || {
            totalRevenue: 0,
            deliveredRevenue: 0,
            averageOrderValue: 0
        };

        // Order status distribution
        const orderStatusStats = await Order.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                stats: {
                    totalUsers,
                    totalShops,
                    totalProducts,
                    totalOrders,
                    totalShoppers,
                    totalRevenue: Math.round(revenue.totalRevenue),
                    deliveredRevenue: Math.round(revenue.deliveredRevenue),
                    averageOrderValue: Math.round(revenue.averageOrderValue)
                },
                recentOrders,
                monthlyStats,
                orderStatusStats
            }
        });

    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics'
        });
    }
};

// Get all users
exports.getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 20, role, search } = req.query;
        const skip = (page - 1) * limit;

        const filter = { role: { $ne: 'admin' } };

        if (role && role !== 'all') {
            filter.role = role;
        }

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        const users = await User.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await User.countDocuments(filter);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                }
            }
        });

    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users'
        });
    }
};

// Get all shops
exports.getAllShops = async (req, res) => {
    try {
        const { page = 1, limit = 20, category, isActive, search } = req.query;
        const skip = (page - 1) * limit;

        const filter = {};

        if (category && category !== 'all') {
            filter.category = category;
        }

        if (isActive !== undefined) {
            filter.isActive = isActive === 'true';
        }

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { 'address.city': { $regex: search, $options: 'i' } },
                { 'address.state': { $regex: search, $options: 'i' } }
            ];
        }

        const shops = await Shop.find(filter)
            .populate('vendorId', 'name email phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Shop.countDocuments(filter);

        // Add product count for each shop
        const shopsWithStats = await Promise.all(
            shops.map(async (shop) => {
                const productCount = await Product.countDocuments({ shopId: shop._id });
                const orderCount = await Order.countDocuments({ shopId: shop._id });

                return {
                    ...shop.toObject(),
                    productCount,
                    orderCount
                };
            })
        );

        res.json({
            success: true,
            data: {
                shops: shopsWithStats,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                }
            }
        });

    } catch (error) {
        console.error('Get all shops error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch shops'
        });
    }
};

// Get all orders
exports.getAllOrders = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search } = req.query;
        const skip = (page - 1) * limit;

        const filter = {};

        if (status && status !== 'all') {
            filter.status = status;
        }

        if (search) {
            filter.$or = [
                { orderNumber: { $regex: search, $options: 'i' } }
            ];
        }

        const orders = await Order.find(filter)
            .populate('customerId', 'name email phone')
            .populate('shopId', 'name category')
            .populate('personalShopperId', 'name phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Order.countDocuments(filter);

        res.json({
            success: true,
            data: {
                orders,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                }
            }
        });

    } catch (error) {
        console.error('Get all orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders'
        });
    }
};

// Get all products
exports.getAllProducts = async (req, res) => {
    try {
        const { page = 1, limit = 20, category, shopId, search } = req.query;
        const skip = (page - 1) * limit;

        const filter = {};

        if (category && category !== 'all') {
            filter.category = category;
        }

        if (shopId) {
            filter.shopId = shopId;
        }

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ];
        }

        const products = await Product.find(filter)
            .populate('shopId', 'name category')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Product.countDocuments(filter);

        res.json({
            success: true,
            data: {
                products,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                }
            }
        });

    } catch (error) {
        console.error('Get all products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
};

// Get all personal shoppers
exports.getAllShoppers = async (req, res) => {
    try {
        const { page = 1, limit = 20, isOnline, search } = req.query;
        const skip = (page - 1) * limit;

        const filter = {};

        if (isOnline !== undefined) {
            filter.isOnline = isOnline === 'true';
        }

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        const shoppers = await PersonalShopper.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await PersonalShopper.countDocuments(filter);

        res.json({
            success: true,
            data: {
                shoppers,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                }
            }
        });

    } catch (error) {
        console.error('Get all shoppers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch personal shoppers'
        });
    }
};

// Update user status
exports.updateUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive } = req.body;

        const user = await User.findByIdAndUpdate(
            userId,
            { isActive },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
            data: { user }
        });

    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user status'
        });
    }
};

// Update shop status
exports.updateShopStatus = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { isActive } = req.body;

        const shop = await Shop.findByIdAndUpdate(
            shopId,
            { isActive },
            { new: true }
        );

        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found'
            });
        }

        res.json({
            success: true,
            message: `Shop ${isActive ? 'activated' : 'deactivated'} successfully`,
            data: { shop }
        });

    } catch (error) {
        console.error('Update shop status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update shop status'
        });
    }
};

// Update order status (Admin override)
exports.updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status, note } = req.body;

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        order.status = status;
        order.timeline.push({
            status,
            timestamp: new Date(),
            note: note || `Status updated by admin`,
            updatedBy: 'admin'
        });

        await order.save();

        // Emit socket events
        const io = req.app.get('io');

        // Notify customer
        io.to(`customer_${order.customerId}`).emit('orderStatusUpdate', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: order.status,
            message: order.getStatusMessage(),
            updatedBy: 'admin'
        });

        // Notify shopper if assigned
        if (order.personalShopperId) {
            io.to(`shopper_${order.personalShopperId}`).emit('orderStatusUpdate', {
                orderId: order._id,
                status: order.status,
                message: `Order ${order.orderNumber} status updated by admin`
            });
        }

        res.json({
            success: true,
            message: 'Order status updated successfully',
            data: { order }
        });

    } catch (error) {
        console.error('Admin update order status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order status'
        });
    }
};

// Delete user
exports.deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;

        // Check if user has active orders
        const activeOrders = await Order.countDocuments({
            customerId: userId,
            status: { $nin: ['delivered', 'cancelled', 'refunded'] }
        });

        if (activeOrders > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete user with active orders'
            });
        }

        const user = await User.findByIdAndDelete(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // If user is a vendor, also delete their shops and products
        if (user.role === 'vendor') {
            const shops = await Shop.find({ vendorId: userId });
            const shopIds = shops.map(shop => shop._id);

            await Product.deleteMany({ shopId: { $in: shopIds } });
            await Shop.deleteMany({ vendorId: userId });
        }

        res.json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user'
        });
    }
};

// Delete shop
exports.deleteShop = async (req, res) => {
    try {
        const { shopId } = req.params;

        // Check if shop has active orders
        const activeOrders = await Order.countDocuments({
            shopId,
            status: { $nin: ['delivered', 'cancelled', 'refunded'] }
        });

        if (activeOrders > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete shop with active orders'
            });
        }

        const shop = await Shop.findByIdAndDelete(shopId);

        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found'
            });
        }

        // Delete all products under this shop
        await Product.deleteMany({ shopId });

        res.json({
            success: true,
            message: 'Shop and its products deleted successfully'
        });

    } catch (error) {
        console.error('Delete shop error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete shop'
        });
    }
};

// Get system analytics
exports.getAnalytics = async (req, res) => {
    try {
        const { period = '30' } = req.query; // days
        const days = parseInt(period);
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const [
            userGrowth,
            orderTrends,
            revenueAnalytics,
            topShops,
            topShoppers
        ] = await Promise.all([
            // User growth over time
            User.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate },
                        role: { $ne: 'admin' }
                    }
                },
                {
                    $group: {
                        _id: {
                            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                            role: '$role'
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id.date': 1 } }
            ]),

            // Order trends
            Order.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                {
                    $group: {
                        _id: {
                            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                            status: '$status'
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id.date': 1 } }
            ]),

            // Revenue analytics
            Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate },
                        status: 'delivered'
                    }
                },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        revenue: { $sum: '$orderValue.total' },
                        orders: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),

            // Top performing shops
            Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate },
                        status: 'delivered'
                    }
                },
                {
                    $group: {
                        _id: '$shopId',
                        totalOrders: { $sum: 1 },
                        totalRevenue: { $sum: '$orderValue.total' }
                    }
                },
                { $sort: { totalRevenue: -1 } },
                { $limit: 10 },
                {
                    $lookup: {
                        from: 'shops',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'shop'
                    }
                },
                { $unwind: '$shop' }
            ]),

            // Top performing shoppers
            Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate },
                        status: 'delivered',
                        personalShopperId: { $exists: true }
                    }
                },
                {
                    $group: {
                        _id: '$personalShopperId',
                        totalOrders: { $sum: 1 },
                        totalEarnings: { $sum: '$shopperCommission' }
                    }
                },
                { $sort: { totalOrders: -1 } },
                { $limit: 10 },
                {
                    $lookup: {
                        from: 'personalshoppers',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'shopper'
                    }
                },
                { $unwind: '$shopper' }
            ])
        ]);

        res.json({
            success: true,
            data: {
                userGrowth,
                orderTrends,
                revenueAnalytics,
                topShops,
                topShoppers,
                period: days
            }
        });

    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics'
        });
    }
};