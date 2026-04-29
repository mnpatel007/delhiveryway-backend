const Shop = require('../models/Shop');
const Order = require('../models/Order');
const User = require('../models/User');
const mongoose = require('mongoose');

// Helper to get the current shop for the vendor
const getVendorShop = async (vendorId) => {
    return await Shop.findOne({ vendorId });
};

// Get shop owner profile and shop details
exports.getProfile = async (req, res) => {
    try {
        const vendor = await User.findById(req.user._id).select('-password');
        const shop = await getVendorShop(req.user._id);

        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'No shop associated with this vendor account'
            });
        }

        res.json({
            success: true,
            data: {
                vendor,
                shop
            }
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Update Consent
exports.updateConsent = async (req, res) => {
    try {
        const shop = await getVendorShop(req.user._id);
        if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

        shop.consent = {
            hasAgreed: true,
            agreedAt: new Date()
        };
        await shop.save();

        res.json({ success: true, message: 'Consent updated', data: { shop } });
    } catch (error) {
        console.error('Update consent error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Update Timings
exports.updateTimings = async (req, res) => {
    try {
        const { operatingHours, isTemporarilyClosed } = req.body;
        const shop = await getVendorShop(req.user._id);
        if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

        if (operatingHours) shop.operatingHours = operatingHours;
        if (typeof isTemporarilyClosed === 'boolean') shop.isTemporarilyClosed = isTemporarilyClosed;

        await shop.save();

        res.json({ success: true, message: 'Timings updated', data: { shop } });
    } catch (error) {
        console.error('Update timings error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Get Commission
exports.getCommission = async (req, res) => {
    try {
        const shop = await getVendorShop(req.user._id);
        if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

        res.json({ success: true, data: { commission: shop.commission || { commissionType: 'percentage', commissionValue: 10 } } });
    } catch (error) {
        console.error('Get commission error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Update Commission
exports.updateCommission = async (req, res) => {
    try {
        const { commissionType, commissionValue } = req.body;
        const shop = await getVendorShop(req.user._id);
        if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

        if (!['percentage', 'fixed'].includes(commissionType)) {
            return res.status(400).json({ success: false, message: 'Invalid commission type' });
        }

        const value = Number(commissionValue);
        if (isNaN(value) || value < 0 || (commissionType === 'percentage' && value > 100)) {
            return res.status(400).json({ success: false, message: 'Invalid commission value' });
        }

        shop.commission = {
            commissionType,
            commissionValue: value
        };
        await shop.save();

        res.json({ success: true, message: 'Commission updated', data: { commission: shop.commission } });
    } catch (error) {
        console.error('Update commission error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Get Monthly Stats (last month)
exports.getMonthlyStats = async (req, res) => {
    try {
        const shop = await getVendorShop(req.user._id);
        if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

        const now = new Date();
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

        // Fetch completed/delivered orders for last month
        const stats = await Order.aggregate([
            {
                $match: {
                    shopId: shop._id,
                    status: 'delivered',
                    createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }
                }
            },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    grossSales: { $sum: '$orderValue.subtotal' }, // Assuming subtotal is the gross sales of items
                    netSales: { $sum: '$orderValue.total' }
                }
            }
        ]);

        let totalOrders = 0;
        let grossSales = 0;
        let netSales = 0;
        let commissionDeducted = 0;
        let payableAmount = 0;

        if (stats.length > 0) {
            totalOrders = stats[0].totalOrders;
            grossSales = stats[0].grossSales;
            netSales = stats[0].netSales;

            const commType = shop.commission?.commissionType || 'percentage';
            const commVal = shop.commission?.commissionValue || 10;

            if (commType === 'percentage') {
                commissionDeducted = (grossSales * commVal) / 100;
            } else {
                commissionDeducted = totalOrders * commVal;
            }

            payableAmount = grossSales - commissionDeducted;
        }

        res.json({
            success: true,
            data: {
                shopId: shop._id,
                month: startOfLastMonth.toLocaleString('default', { month: 'long', year: 'numeric' }),
                totalOrders,
                grossSales,
                netSales,
                commissionDeducted,
                payableAmount
            }
        });
    } catch (error) {
        console.error('Get monthly stats error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Get Available Shops (shops without a vendor)
exports.getAvailableShops = async (req, res) => {
    try {
        // Temporarily return ALL shops to debug visibility
        const shops = await Shop.find({});
        res.json({
            success: true,
            data: { shops }
        });
    } catch (error) {
        console.error('Get available shops error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Get Shop Orders
exports.getShopOrders = async (req, res) => {
    try {
        const shop = await getVendorShop(req.user._id);
        if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

        const orders = await Order.find({ shopId: shop._id })
            .populate('customerId', 'name phone')
            .populate('personalShopperId', 'name phone')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: { orders }
        });
    } catch (error) {
        console.error('Get shop orders error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Update Order Status (for Vendor)
exports.updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const shop = await getVendorShop(req.user._id);
        if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

        const order = await Order.findOne({ _id: id, shopId: shop._id });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Validate allowed status transitions for vendor
        const allowedStatuses = ['accepted_by_shop', 'preparing', 'ready_for_pickup', 'cancelled_by_shop'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status update for vendor' });
        }

        order.status = status;
        
        // Add timeline event
        order.timeline.push({
            status,
            description: `Order marked as ${status.replace(/_/g, ' ')} by shop owner`,
            timestamp: new Date()
        });

        await order.save();

        res.json({
            success: true,
            message: 'Order status updated successfully',
            data: { order }
        });
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
