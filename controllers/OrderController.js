const Order = require('../models/Order');
const PersonalShopper = require('../models/PersonalShopper');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

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

        // Validate shop exists and is active
        const shop = await Shop.findById(shopId);
        if (!shop || !shop.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found or inactive'
            });
        }

        // Calculate order value
        let subtotal = 0;
        const validatedItems = items.map(item => {
            if (!item.name || !item.price || !item.quantity) {
                throw new Error('Each item must have name, price, and quantity');
            }

            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;

            return {
                productId: item.productId || null,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                notes: item.notes || ''
            };
        });

        const deliveryFee = shop.deliveryFee || 0;
        const serviceFee = Math.round(subtotal * 0.05); // 5% service fee
        const taxes = Math.round(subtotal * 0.05); // 5% tax
        const total = subtotal + deliveryFee + serviceFee + taxes;

        // Check minimum order value
        if (subtotal < shop.minOrderValue) {
            return res.status(400).json({
                success: false,
                message: `Minimum order value is ₹${shop.minOrderValue}`
            });
        }

        // Create order
        const order = new Order({
            customerId: req.user._id,
            shopId,
            items: validatedItems,
            orderValue: {
                subtotal,
                deliveryFee,
                serviceFee,
                taxes,
                total
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
        io.to('personalShoppers').emit('newOrder', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            shopName: shop.name,
            shopAddress: shop.address,
            itemCount: order.items.length,
            total: order.orderValue.total,
            deliveryAddress: order.deliveryAddress,
            estimatedEarnings: order.calculateShopperCommission()
        });

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

        const filter = { customerId: req.user._id };
        if (status) {
            filter.status = status;
        }

        const orders = await Order.find(filter)
            .populate('shopId', 'name address category images')
            .populate('personalShopperId', 'name phone rating')
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
            'final_shopping': ['bill_uploaded', 'cancelled'],
            'bill_uploaded': ['bill_approved', 'bill_rejected'],
            'bill_rejected': ['final_shopping', 'cancelled'],
            'bill_approved': ['out_for_delivery'],
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
        if (status === 'out_for_delivery') {
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
        const { id } = req.params;
        const { revisedItems, shopperNotes } = req.body;

        const order = await Order.findById(id)
            .populate('customerId', 'name phone')
            .populate('personalShopperId', 'name phone');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if shopper owns this order
        if (!order.personalShopperId || order.personalShopperId._id.toString() !== req.user._id.toString()) {
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

        // Update items with revised quantities and availability
        let revisedSubtotal = 0;
        const updatedItems = order.items.map(item => {
            const revision = revisedItems.find(r => r.itemId === item._id.toString());
            if (revision) {
                item.revisedQuantity = revision.quantity;
                item.revisedPrice = revision.price || item.price;
                item.isAvailable = revision.isAvailable;
                item.shopperNotes = revision.notes || '';
                
                if (revision.isAvailable) {
                    revisedSubtotal += (revision.price || item.price) * revision.quantity;
                }
            }
            return item;
        });

        // Calculate revised order value
        const deliveryFee = order.orderValue.deliveryFee;
        const serviceFee = Math.round(revisedSubtotal * 0.05);
        const taxes = Math.round(revisedSubtotal * 0.05);
        const revisedTotal = revisedSubtotal + deliveryFee + serviceFee + taxes;

        order.items = updatedItems;
        order.revisedOrderValue = {
            subtotal: revisedSubtotal,
            deliveryFee,
            serviceFee,
            taxes,
            discount: 0,
            total: revisedTotal
        };
        order.status = 'shopper_revised_order';
        
        order.timeline.push({
            status: 'shopper_revised_order',
            timestamp: new Date(),
            note: shopperNotes || 'Shopper revised order based on item availability',
            updatedBy: 'shopper'
        });

        await order.save();

        // Notify customer about revision
        const io = req.app.get('io');
        io.to(`customer_${order.customerId._id}`).emit('orderRevised', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            message: 'Your shopper has revised your order. Please review the changes.',
            revisedTotal: revisedTotal
        });

        res.json({
            success: true,
            message: 'Order revised successfully',
            data: {
                order: {
                    _id: order._id,
                    status: order.status,
                    revisedOrderValue: order.revisedOrderValue
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

        order.status = 'customer_approved_revision';
        order.timeline.push({
            status: 'customer_approved_revision',
            timestamp: new Date(),
            note: 'Customer approved the revised order',
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