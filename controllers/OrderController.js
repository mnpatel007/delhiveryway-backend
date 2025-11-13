const Order = require('../models/Order');
const PersonalShopper = require('../models/PersonalShopper');
const User = require('../models/User');
const { calculateOrderPricing } = require('../utils/paymentCalculator');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Check for recent duplicate orders for a customer
exports.checkRecentOrders = async (req, res) => {
    try {
        const { customerId } = req.params;
        const { minutes = 10 } = req.query;

        const timeAgo = new Date(Date.now() - minutes * 60 * 1000);

        const recentOrders = await Order.find({
            customerId: customerId,
            createdAt: { $gte: timeAgo },
            status: { $nin: ['cancelled'] }
        })
            .populate('shopId', 'name')
            .sort({ createdAt: -1 })
            .limit(10);

        // Group by shop and detect potential duplicates
        const ordersByShop = {};
        const potentialDuplicates = [];

        recentOrders.forEach(order => {
            const shopId = order.shopId._id.toString();
            if (!ordersByShop[shopId]) {
                ordersByShop[shopId] = [];
            }
            ordersByShop[shopId].push(order);
        });

        // Check for duplicates within each shop
        Object.keys(ordersByShop).forEach(shopId => {
            const orders = ordersByShop[shopId];
            if (orders.length > 1) {
                // Check if orders have similar items
                for (let i = 0; i < orders.length - 1; i++) {
                    for (let j = i + 1; j < orders.length; j++) {
                        const order1 = orders[i];
                        const order2 = orders[j];

                        // Simple similarity check
                        if (order1.items.length === order2.items.length) {
                            let matchCount = 0;
                            for (const item1 of order1.items) {
                                const match = order2.items.find(item2 =>
                                    item1.name.toLowerCase() === item2.name.toLowerCase() &&
                                    Math.abs(item1.quantity - item2.quantity) <= 1
                                );
                                if (match) matchCount++;
                            }

                            const similarity = (matchCount / order1.items.length) * 100;
                            if (similarity >= 70) {
                                potentialDuplicates.push({
                                    order1: {
                                        id: order1._id,
                                        orderNumber: order1.orderNumber,
                                        createdAt: order1.createdAt,
                                        status: order1.status,
                                        total: order1.orderValue.total
                                    },
                                    order2: {
                                        id: order2._id,
                                        orderNumber: order2.orderNumber,
                                        createdAt: order2.createdAt,
                                        status: order2.status,
                                        total: order2.orderValue.total
                                    },
                                    similarity: Math.round(similarity),
                                    timeDifference: Math.round((order1.createdAt - order2.createdAt) / (1000 * 60))
                                });
                            }
                        }
                    }
                }
            }
        });

        res.json({
            success: true,
            data: {
                recentOrdersCount: recentOrders.length,
                potentialDuplicates: potentialDuplicates,
                recentOrders: recentOrders.map(order => ({
                    id: order._id,
                    orderNumber: order.orderNumber,
                    shopName: order.shopId.name,
                    status: order.status,
                    total: order.orderValue.total,
                    itemCount: order.items.length,
                    createdAt: order.createdAt
                }))
            }
        });

    } catch (error) {
        console.error('Error checking recent orders:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check recent orders'
        });
    }
};

// Get estimated order acceptance time based on pending orders
exports.getOrderAcceptanceTime = async (req, res) => {
    try {
        const { shopId } = req.params;

        // Count pending orders for this shop
        const pendingOrdersCount = await Order.countDocuments({
            shopId: shopId,
            status: 'pending_shopper'
        });

        // Calculate estimated time based on pending orders
        // Base time: 5 minutes
        // Additional time: 3 minutes per pending order
        const baseTime = 10; // minutes
        const additionalTimePerOrder = 3; // minutes
        const estimatedMinutes = baseTime + (pendingOrdersCount * additionalTimePerOrder);

        // Cap the maximum time at 30 minutes
        const cappedMinutes = Math.min(estimatedMinutes, 30);

        res.json({
            success: true,
            data: {
                pendingOrdersCount,
                estimatedMinutes: cappedMinutes,
                estimatedTime: `${cappedMinutes} minutes`
            }
        });

    } catch (error) {
        console.error('Error getting order acceptance time:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get order acceptance time'
        });
    }
};

// Place a new order
exports.placeOrder = async (req, res) => {
    try {
        const {
            shopId,
            items,
            deliveryAddress,
            specialInstructions,
            paymentMethod = 'cash'
        } = req.body;

        // Validate required fields
        if (!shopId || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Shop ID and items are required'
            });
        }

        if (!deliveryAddress || !deliveryAddress.street || !deliveryAddress.city) {
            return res.status(400).json({
                success: false,
                message: 'Complete delivery address is required'
            });
        }

        // Validate delivery address has coordinates
        if (!deliveryAddress.coordinates || !deliveryAddress.coordinates.lat || !deliveryAddress.coordinates.lng) {
            return res.status(400).json({
                success: false,
                message: 'Delivery address coordinates are required for distance calculation'
            });
        }

        // Check for duplicate orders within the last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentOrder = await Order.findOne({
            customerId: req.user._id,
            shopId: shopId,
            createdAt: { $gte: fiveMinutesAgo },
            status: { $nin: ['cancelled', 'delivered'] }
        }).sort({ createdAt: -1 });

        if (recentOrder) {
            // Check if items are similar (same items with similar quantities)
            const existingItems = recentOrder.items.map(item => ({
                name: item.name.toLowerCase().trim(),
                quantity: item.quantity
            }));

            const newItems = items.map(item => ({
                name: item.name.toLowerCase().trim(),
                quantity: item.quantity
            }));

            // Simple duplicate detection: same number of items and at least 80% match
            if (existingItems.length === newItems.length) {
                let matchCount = 0;
                for (const newItem of newItems) {
                    const match = existingItems.find(existing =>
                        existing.name === newItem.name &&
                        Math.abs(existing.quantity - newItem.quantity) <= 1
                    );
                    if (match) matchCount++;
                }

                const matchPercentage = (matchCount / newItems.length) * 100;
                if (matchPercentage >= 80) {
                    const timeDiff = Math.ceil((Date.now() - recentOrder.createdAt) / (1000 * 60));
                    return res.status(400).json({
                        success: false,
                        message: `You placed a similar order ${timeDiff} minute${timeDiff !== 1 ? 's' : ''} ago (Order #${recentOrder.orderNumber}). Please wait a few minutes before placing another similar order to avoid confusion for shoppers.`,
                        duplicateOrder: true,
                        existingOrderId: recentOrder._id,
                        existingOrderNumber: recentOrder.orderNumber,
                        waitTime: Math.max(0, 5 - timeDiff) // Minutes to wait
                    });
                }
            }
        }

        // Validate shop exists and is active
        const Shop = require('../models/Shop');
        const shop = await Shop.findById(shopId);
        if (!shop || !shop.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found or inactive'
            });
        }

        // CRITICAL: Check if shop is currently open
        if (!shop.isOpenNow()) {
            const now = new Date();
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const currentDay = dayNames[now.getDay()];
            const currentTime = now.toTimeString().slice(0, 5);

            // Get today's hours for better error message
            const todayHours = shop.operatingHours?.[currentDay.toLowerCase()];
            let hoursMessage = '';

            if (todayHours?.closed) {
                hoursMessage = `${shop.name} is closed on ${currentDay}s.`;
            } else if (todayHours?.open && todayHours?.close) {
                hoursMessage = `${shop.name} is open from ${todayHours.open} to ${todayHours.close} on ${currentDay}s. Current time: ${currentTime}`;
            } else {
                hoursMessage = `${shop.name} is currently closed.`;
            }

            console.log(`🚫 Order blocked - Shop ${shop.name} is closed. ${hoursMessage}`);

            return res.status(400).json({
                success: false,
                message: `Sorry! ${shop.name} is currently closed. ${hoursMessage}`,
                shopClosed: true,
                currentTime: currentTime,
                shopHours: todayHours
            });
        }

        console.log('✅ Shop is open:', shop.name, 'Delivery Fee:', shop.deliveryFee);

        // Validate and prepare items
        const validatedItems = items.map(item => {
            if (!item.name || !item.price || !item.quantity) {
                throw new Error('Each item must have name, price, and quantity');
            }

            return {
                productId: item.productId || null,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                notes: item.notes || ''
            };
        });

        // Calculate pricing using new payment calculator
        const pricing = await calculateOrderPricing(validatedItems, shopId, deliveryAddress);

        console.log('Order pricing calculated:', pricing);

        // Check minimum order value
        if (pricing.subtotal < shop.minOrderValue) {
            return res.status(400).json({
                success: false,
                message: `Minimum order value is ₹${shop.minOrderValue}`
            });
        }

        // Generate unique order number
        const orderNumber = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // Create order
        const order = new Order({
            orderNumber,
            customerId: req.user._id,
            shopId,
            items: validatedItems,
            orderValue: {
                subtotal: pricing.subtotal,
                deliveryFee: pricing.deliveryFee,
                serviceFee: pricing.serviceFee,
                taxes: pricing.taxes,
                packagingCharges: pricing.packagingCharges,
                discount: pricing.discount,
                total: pricing.total
            },
            deliveryAddress: {
                ...deliveryAddress,
                contactName: deliveryAddress.contactName || req.user.name,
                contactPhone: deliveryAddress.contactPhone || req.user.phone
            },
            specialInstructions,
            payment: {
                method: paymentMethod,
                status: 'pending'
            },
            shopperCommission: pricing.shopperEarning,
            timeline: [{
                status: 'pending_shopper',
                timestamp: new Date(),
                note: 'Order placed successfully',
                updatedBy: 'customer'
            }]
        });

        await order.save();

        // Populate order for response
        await order.populate([
            { path: 'shopId', select: 'name address category' },
            { path: 'customerId', select: 'name phone email' }
        ]);

        // Emit to all online personal shoppers
        const io = req.app.get('io');
        const newOrderPayload = {
            orderId: order._id,
            orderNumber: order.orderNumber,
            shopName: shop.name,
            shopAddress: shop.address,
            itemCount: order.items.length,
            total: order.orderValue.total,
            deliveryAddress: order.deliveryAddress,
            estimatedEarnings: order.calculateShopperCommission()
        };
        io.to('personalShoppers').emit('newOrder', newOrderPayload);
        // Also emit alias used by shopper socket client
        io.to('personalShoppers').emit('newOrderAvailable', newOrderPayload);

        // Update user's total orders
        await User.findByIdAndUpdate(req.user._id, {
            $inc: { totalOrders: 1 }
        });

        res.status(201).json({
            success: true,
            message: 'Order placed successfully',
            data: {
                order: {
                    _id: order._id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    total: order.orderValue.total,
                    estimatedDeliveryTime: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
                    shop: order.shopId
                }
            }
        });

    } catch (error) {
        console.error('Place order error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to place order'
        });
    }
};

// Get customer orders
exports.getCustomerOrders = async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const skip = (page - 1) * limit;

        console.log('Customer ID from request:', req.user._id);
        console.log('Customer user object:', req.user);

        // Filter orders for the current customer
        const filter = { customerId: req.user._id };
        if (status) {
            filter.status = status;
        }

        console.log('Order filter:', filter);

        const orders = await Order.find(filter)
            .populate('shopId', 'name address category images inquiryAvailableTime')
            .populate('personalShopperId', 'name phone rating')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        console.log('Found orders count:', orders.length);
        console.log('Orders:', orders.map(o => ({ id: o._id, customerId: o.customerId, status: o.status })));

        // Also check all orders to see what customer IDs exist
        const allOrders = await Order.find({}).select('customerId status orderNumber').limit(10);
        console.log('Sample of all orders:', allOrders);

        // Check for any orders with bill_uploaded status specifically
        const billOrders = await Order.find({ status: 'bill_uploaded' }).select('customerId status orderNumber');
        console.log('Orders with bill_uploaded status:', billOrders);

        const total = await Order.countDocuments(filter);

        res.json({
            success: true,
            data: orders,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / limit),
                total
            }
        });

    } catch (error) {
        console.error('Get customer orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch orders'
        });
    }
};

// Get order by ID
exports.getOrderById = async (req, res) => {
    try {
        const { orderId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID'
            });
        }

        const order = await Order.findById(orderId)
            .populate('shopId', 'name address category contact images operatingHours')
            .populate('customerId', 'name phone email')
            .populate('personalShopperId', 'name phone rating currentLocation');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if user has permission to view this order
        const isCustomer = order.customerId._id.toString() === req.user._id.toString();
        const isShopper = order.personalShopperId && order.personalShopperId._id.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isCustomer && !isShopper && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        res.json({
            success: true,
            data: { order }
        });

    } catch (error) {
        console.error('Get order by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order'
        });
    }
};

// Approve bill
exports.approveBill = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID'
            });
        }

        const order = await Order.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if user is the customer who placed this order
        if (order.customerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to approve this bill'
            });
        }

        // Check if order has bill uploaded
        if (order.status !== 'bill_uploaded') {
            return res.status(400).json({
                success: false,
                message: 'Bill is not uploaded or already processed'
            });
        }

        // Update order status to bill_approved
        order.status = 'bill_approved';
        order.billApprovedAt = new Date();
        await order.save();

        res.json({
            success: true,
            message: 'Bill approved successfully',
            data: order
        });

    } catch (error) {
        console.error('Approve bill error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve bill'
        });
    }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, note, billPhoto, billAmount } = req.body;

        const order = await Order.findById(id)
            .populate('customerId', 'name phone')
            .populate('personalShopperId', 'name phone');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Validate status transition
        const validTransitions = {
            'pending_shopper': ['accepted_by_shopper', 'cancelled'],
            'accepted_by_shopper': ['shopper_at_shop', 'cancelled'],
            'shopper_at_shop': ['shopping_in_progress', 'cancelled'],
            'shopping_in_progress': ['shopper_revised_order', 'final_shopping', 'cancelled'],
            'shopper_revised_order': ['customer_reviewing_revision', 'cancelled'],
            'customer_reviewing_revision': ['customer_approved_revision', 'cancelled'],
            'customer_approved_revision': ['final_shopping', 'cancelled'],
            'final_shopping': ['out_for_delivery', 'cancelled'],
            'out_for_delivery': ['delivered'],
            'delivered': [],
            'cancelled': [],
            'refunded': []
        };

        if (!validTransitions[order.status]?.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot change status from ${order.status} to ${status}`
            });
        }

        // Handle bill upload
        if (status === 'bill_uploaded') {
            if (!billAmount || billAmount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Bill amount is required'
                });
            }

            order.billAmount = billAmount;

            // Handle file upload if present
            if (req.file) {
                order.billImageUrl = `/uploads/bills/${req.file.filename}`;
            } else if (billImageUrl) {
                order.billImageUrl = billImageUrl;
            }
        }

        // Generate delivery OTP for out_for_delivery status
        if (status === 'out_for_delivery' && !order.deliveryOTP) {
            order.deliveryOTP = Math.floor(1000 + Math.random() * 9000).toString();
        }

        // Update order
        order.status = status;
        order.timeline.push({
            status,
            timestamp: new Date(),
            note,
            updatedBy: req.user.role === 'admin' ? 'admin' : 'shopper'
        });

        if (status === 'delivered') {
            order.actualDeliveryTime = new Date();
            order.payment.status = 'paid';
            order.payment.paidAt = new Date();

            // Update shopper commission
            if (order.personalShopperId) {
                order.shopperCommission = order.calculateShopperCommission();
                await PersonalShopper.findByIdAndUpdate(order.personalShopperId._id, {
                    $inc: {
                        'stats.completedOrders': 1,
                        'stats.totalEarnings': order.shopperCommission
                    }
                });
            }

            // Update customer stats
            await User.findByIdAndUpdate(order.customerId._id, {
                $inc: { totalSpent: order.orderValue.total }
            });
        }

        await order.save();

        // Emit socket events
        const io = req.app.get('io');

        // Notify customer
        io.to(`customer_${order.customerId._id}`).emit('orderStatusUpdate', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: order.status,
            message: order.getStatusMessage(),
            deliveryOTP: order.deliveryOTP,
            timeline: order.timeline
        });

        // Also emit legacy-compatible event if some clients still listen to it
        io.to(`customer_${order.customerId._id}`).emit('orderStatusUpdated', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: order.status,
            message: order.getStatusMessage(),
            deliveryOTP: order.deliveryOTP
        });

        // Notify shopper if assigned
        if (order.personalShopperId) {
            io.to(`shopper_${order.personalShopperId._id}`).emit('orderStatusUpdate', {
                orderId: order._id,
                status: order.status,
                message: `Order ${order.orderNumber} status updated to ${status}`
            });
        }

        res.json({
            success: true,
            message: 'Order status updated successfully',
            data: {
                order: {
                    _id: order._id,
                    status: order.status,
                    deliveryOTP: order.deliveryOTP
                }
            }
        });

    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order status'
        });
    }
};

// Cancel order
exports.cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if order can be cancelled
        if (!order.canBeCancelled()) {
            return res.status(400).json({
                success: false,
                message: 'Order cannot be cancelled at this stage'
            });
        }

        // Check permissions
        const isCustomer = order.customerId.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isCustomer && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        order.status = 'cancelled';
        order.cancellationReason = reason || 'Cancelled by customer';
        order.cancelledBy = req.user.role === 'admin' ? 'admin' : 'customer';
        order.cancelledAt = new Date();

        order.timeline.push({
            status: 'cancelled',
            timestamp: new Date(),
            note: order.cancellationReason,
            updatedBy: order.cancelledBy
        });

        await order.save();

        // Emit socket events
        const io = req.app.get('io');

        // Notify customer
        io.to(`customer_${order.customerId}`).emit('orderCancelled', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            reason: order.cancellationReason
        });

        // Notify shopper if assigned
        if (order.personalShopperId) {
            io.to(`shopper_${order.personalShopperId}`).emit('orderCancelled', {
                orderId: order._id,
                orderNumber: order.orderNumber,
                reason: order.cancellationReason
            });
        }

        res.json({
            success: true,
            message: 'Order cancelled successfully'
        });

    } catch (error) {
        console.error('Cancel order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order'
        });
    }
};

// Approve bill
exports.approveBill = async (req, res) => {
    try {
        const { id } = req.params;

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if customer owns this order
        if (order.customerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (order.status !== 'bill_uploaded') {
            return res.status(400).json({
                success: false,
                message: 'No bill to approve'
            });
        }

        order.status = 'bill_approved';
        order.actualBill.approvedAt = new Date();

        order.timeline.push({
            status: 'bill_approved',
            timestamp: new Date(),
            note: 'Bill approved by customer',
            updatedBy: 'customer'
        });

        await order.save();

        // Emit socket events
        const io = req.app.get('io');

        // Notify shopper
        if (order.personalShopperId) {
            io.to(`shopper_${order.personalShopperId}`).emit('billApproved', {
                orderId: order._id,
                orderNumber: order.orderNumber,
                message: 'Bill approved! You can now proceed for delivery.'
            });
        }

        res.json({
            success: true,
            message: 'Bill approved successfully'
        });

    } catch (error) {
        console.error('Approve bill error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve bill'
        });
    }
};

// Reject bill
exports.rejectBill = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if customer owns this order
        if (order.customerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (order.status !== 'bill_uploaded') {
            return res.status(400).json({
                success: false,
                message: 'No bill to reject'
            });
        }

        order.status = 'bill_rejected';
        order.actualBill.rejectedAt = new Date();
        order.actualBill.rejectionReason = reason || 'Bill rejected by customer';

        order.timeline.push({
            status: 'bill_rejected',
            timestamp: new Date(),
            note: order.actualBill.rejectionReason,
            updatedBy: 'customer'
        });

        await order.save();

        // Emit socket events
        const io = req.app.get('io');

        // Notify shopper
        if (order.personalShopperId) {
            io.to(`shopper_${order.personalShopperId}`).emit('billRejected', {
                orderId: order._id,
                orderNumber: order.orderNumber,
                reason: order.actualBill.rejectionReason,
                message: 'Bill rejected. Please shop again with correct items.'
            });
        }

        res.json({
            success: true,
            message: 'Bill rejected successfully'
        });

    } catch (error) {
        console.error('Reject bill error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject bill'
        });
    }
};

// Rate order
exports.rateOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, review } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if customer owns this order
        if (order.customerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (order.status !== 'delivered') {
            return res.status(400).json({
                success: false,
                message: 'Can only rate delivered orders'
            });
        }

        if (order.ratings.customerRating.rating) {
            return res.status(400).json({
                success: false,
                message: 'Order already rated'
            });
        }

        order.ratings.customerRating = {
            rating,
            review: review || '',
            ratedAt: new Date()
        };

        await order.save();

        // Update shopper rating
        if (order.personalShopperId) {
            const shopper = await PersonalShopper.findById(order.personalShopperId);
            if (shopper) {
                const newCount = shopper.rating.count + 1;
                const newAverage = ((shopper.rating.average * shopper.rating.count) + rating) / newCount;

                shopper.rating.average = Math.round(newAverage * 10) / 10;
                shopper.rating.count = newCount;
                await shopper.save();
            }
        }

        res.json({
            success: true,
            message: 'Order rated successfully'
        });

    } catch (error) {
        console.error('Rate order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to rate order'
        });
    }
};

// Shopper revise order items
exports.reviseOrderItems = async (req, res) => {
    try {
        console.log('🔄 Revise order items called');
        console.log('📋 Request params:', req.params);
        console.log('📋 Request body:', req.body);
        console.log('👤 Shopper ID from auth:', req.shopperId);
        console.log('👤 Shopper object:', req.shopper);

        const { id } = req.params;
        const { revisedItems, shopperNotes } = req.body;

        const order = await Order.findById(id)
            .populate('customerId', 'name phone')
            .populate('personalShopperId', 'name phone')
            .populate('shopId');

        if (!order) {
            console.log('❌ Order not found:', id);
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        console.log('📦 Order found:', {
            id: order._id,
            status: order.status,
            personalShopperId: order.personalShopperId?._id
        });

        // Check if shopper owns this order
        if (!order.personalShopperId || order.personalShopperId._id.toString() !== req.shopperId.toString()) {
            console.log('❌ Access denied - shopper mismatch');
            console.log('Order shopper:', order.personalShopperId?._id?.toString());
            console.log('Request shopper:', req.shopperId?.toString());
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (order.status !== 'shopping_in_progress') {
            return res.status(400).json({
                success: false,
                message: 'Order cannot be revised at this stage'
            });
        }

        // Validate revised items: if marked available, quantity must be >= 1
        if (!Array.isArray(revisedItems) || revisedItems.length === 0) {
            return res.status(400).json({ success: false, message: 'Revised items are required' });
        }

        for (const r of revisedItems) {
            const isAvail = r.isAvailable !== false; // treat undefined as available
            if (isAvail) {
                const q = Number(r.quantity);
                if (!Number.isFinite(q) || q < 1) {
                    return res.status(400).json({
                        success: false,
                        message: 'Quantity cannot be zero for available items. Mark item as not available instead.'
                    });
                }
            }
        }

        // Update items with revised quantities and availability
        const updatedItems = order.items.map(item => {
            const revision = revisedItems.find(r => r.itemId === item._id.toString());
            if (revision) {
                const isAvail = revision.isAvailable !== false;
                item.revisedQuantity = isAvail ? revision.quantity : 0;
                item.revisedPrice = isAvail ? (revision.price || item.price) : item.price;
                item.isAvailable = isAvail;
                item.shopperNotes = revision.notes || '';
            }
            return item;
        });

        // Filter out unavailable items and prepare items for price calculation
        const availableItems = updatedItems
            .filter(item => item.isAvailable !== false)
            .map(item => ({
                ...item.toObject(),
                price: item.revisedPrice || item.price,
                quantity: Number.isFinite(Number(item.revisedQuantity)) && Number(item.revisedQuantity) > 0 ? item.revisedQuantity : item.quantity
            }));

        // Get delivery address from the order
        const deliveryAddress = order.deliveryAddress;
        if (!deliveryAddress || !deliveryAddress.coordinates) {
            return res.status(400).json({
                success: false,
                message: 'Delivery address coordinates are missing'
            });
        }

        // Calculate new pricing using the payment calculator
        const pricing = await calculateOrderPricing(
            availableItems,
            order.shopId._id,
            deliveryAddress
        );

        // Update order with revised items and pricing
        order.items = updatedItems;
        order.revisedOrderValue = {
            subtotal: pricing.subtotal,
            deliveryFee: pricing.deliveryFee,
            taxes: pricing.taxes,
            packagingCharges: pricing.packagingCharges,
            discount: pricing.discount,
            total: pricing.total
        };

        // Shopper earns exactly the delivery fee amount
        order.shopperCommission = pricing.deliveryFee;
        order.status = 'customer_reviewing_revision';

        order.timeline.push({
            status: 'customer_reviewing_revision',
            timestamp: new Date(),
            note: shopperNotes || 'Shopper revised order based on item availability',
            updatedBy: 'shopper',
            pricingDetails: {
                subtotal: pricing.subtotal,
                deliveryFee: pricing.deliveryFee,
                taxes: 0,
                total: pricing.subtotal + pricing.deliveryFee,
                shopperEarning: pricing.deliveryFee
            }
        });

        await order.save();

        // Notify customer about revision
        const io = req.app.get('io');
        io.to(`customer_${order.customerId._id}`).emit('orderRevised', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            message: 'Your shopper has revised your order. Please review the changes.',
            revisedTotal: pricing.total,
            pricingBreakdown: {
                subtotal: pricing.subtotal,
                deliveryFee: pricing.deliveryFee,
                taxes: pricing.taxes,
                total: pricing.total
            }
        });

        res.json({
            success: true,
            message: 'Order revised successfully',
            data: {
                order: {
                    _id: order._id,
                    status: order.status,
                    revisedOrderValue: order.revisedOrderValue,
                    shopperCommission: order.shopperCommission
                }
            }
        });

    } catch (error) {
        console.error('Revise order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to revise order'
        });
    }
};

// Customer approve revised order
exports.approveRevisedOrder = async (req, res) => {
    try {
        const { id } = req.params;

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if customer owns this order
        if (order.customerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (order.status !== 'customer_reviewing_revision') {
            return res.status(400).json({
                success: false,
                message: 'No revision to approve'
            });
        }

        order.status = 'final_shopping';
        order.timeline.push({
            status: 'final_shopping',
            timestamp: new Date(),
            note: 'Customer approved the revised order - proceeding with final shopping',
            updatedBy: 'customer'
        });

        await order.save();

        // Notify shopper
        const io = req.app.get('io');
        if (order.personalShopperId) {
            io.to(`shopper_${order.personalShopperId}`).emit('revisionApproved', {
                orderId: order._id,
                orderNumber: order.orderNumber,
                message: 'Customer approved the revision. Proceed with final shopping.'
            });
        }

        res.json({
            success: true,
            message: 'Revised order approved successfully'
        });

    } catch (error) {
        console.error('Approve revised order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve revised order'
        });
    }
};

// Customer reject revised order
exports.rejectRevisedOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if customer owns this order
        if (order.customerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (order.status !== 'customer_reviewing_revision') {
            return res.status(400).json({
                success: false,
                message: 'No revision to reject'
            });
        }

        order.status = 'revision_rejected';
        order.timeline.push({
            status: 'revision_rejected',
            timestamp: new Date(),
            note: `Customer rejected the revision${reason ? ': ' + reason : ''}`,
            updatedBy: 'customer'
        });

        await order.save();

        // Notify shopper
        const io = req.app.get('io');
        if (order.personalShopperId) {
            io.to(`shopper_${order.personalShopperId}`).emit('revisionRejected', {
                orderId: order._id,
                orderNumber: order.orderNumber,
                message: 'Customer rejected the revision. Please contact customer for clarification.',
                reason: reason || 'No reason provided',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            message: 'Revised order rejected successfully'
        });

    } catch (error) {
        console.error('Reject revised order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject revised order'
        });
    }
};

// Get order statistics
exports.getOrderStats = async (req, res) => {
    try {
        const customerId = req.user._id;

        const stats = await Order.aggregate([
            { $match: { customerId: new mongoose.Types.ObjectId(customerId) } },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalSpent: { $sum: '$orderValue.total' },
                    deliveredOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
                    },
                    cancelledOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                    },
                    averageOrderValue: { $avg: '$orderValue.total' }
                }
            }
        ]);

        const result = stats[0] || {
            totalOrders: 0,
            totalSpent: 0,
            deliveredOrders: 0,
            cancelledOrders: 0,
            averageOrderValue: 0
        };

        res.json({
            success: true,
            data: {
                stats: {
                    ...result,
                    averageOrderValue: Math.round(result.averageOrderValue || 0)
                }
            }
        });

    } catch (error) {
        console.error('Get order stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order statistics'
        });
    }
};

// Track customer inquiry
exports.trackInquiry = async (req, res) => {
    try {
        const { id } = req.params;
        const { method, timestamp } = req.body;
        const customerId = req.user.id;

        // Find the order
        const order = await Order.findById(id)
            .populate('personalShopperId', 'name phone');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Verify the order belongs to the customer
        if (order.customerId.toString() !== customerId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Check if inquiry is available based on timing
        const orderTime = new Date(order.createdAt);
        const currentTime = new Date();
        const timeDiff = (currentTime - orderTime) / (1000 * 60); // minutes
        const inquiryTime = order.shopId?.inquiryAvailableTime || 15;

        if (timeDiff < inquiryTime) {
            return res.status(400).json({
                success: false,
                message: `Inquiry not available yet. Please wait ${Math.ceil(inquiryTime - timeDiff)} more minutes.`
            });
        }

        // Add inquiry to timeline
        order.timeline.push({
            status: 'inquiry_made',
            timestamp: timestamp || new Date(),
            note: `Customer made inquiry via ${method}`,
            updatedBy: 'customer'
        });

        await order.save();

        // Notify shopper via socket if assigned
        const io = req.app.get('io');
        if (order.personalShopperId && io) {
            io.to(`shopper_${order.personalShopperId._id}`).emit('customerInquiry', {
                orderId: order._id,
                orderNumber: order.orderNumber,
                customerName: req.user.name,
                method,
                timestamp: timestamp || new Date(),
                message: `Customer ${req.user.name} made an inquiry about order #${order.orderNumber} via ${method}`
            });
        }

        res.json({
            success: true,
            message: 'Inquiry tracked successfully',
            data: {
                orderId: order._id,
                method,
                timestamp: timestamp || new Date(),
                shopper: order.personalShopperId
            }
        });

    } catch (error) {
        console.error('Track inquiry error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to track inquiry'
        });
    }
};