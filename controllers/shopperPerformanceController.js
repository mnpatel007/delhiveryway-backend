const PersonalShopper = require('../models/PersonalShopper');
const Order = require('../models/Order');

// Get comprehensive shopper performance analytics
exports.getShopperPerformance = async (req, res) => {
    try {
        const { days = 30, sortBy = 'rating', order = 'desc' } = req.query;

        // Calculate date range
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // Get all shoppers with their basic info
        const shoppers = await PersonalShopper.find({})
            .select('name phone email status isOnline lastActive createdAt')
            .lean();

        // Calculate performance metrics for each shopper
        const shopperPerformance = await Promise.all(
            shoppers.map(async (shopper) => {
                // Get orders for this shopper in the time period
                const orders = await Order.find({
                    personalShopperId: shopper._id,
                    createdAt: { $gte: startDate }
                }).lean();

                // Get all-time orders for some metrics
                const allTimeOrders = await Order.find({
                    personalShopperId: shopper._id
                }).lean();

                // Calculate metrics
                const totalOrders = orders.length;
                const allTimeTotalOrders = allTimeOrders.length;
                const completedOrders = orders.filter(o => o.status === 'delivered').length;
                const cancelledOrders = orders.filter(o => o.status === 'cancelled' && o.cancelledBy === 'shopper').length;

                // Completion rate
                const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

                // Cancellation rate
                const cancellationRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;

                // Calculate average rating from completed orders
                const ratedOrders = orders.filter(o => o.rating && o.rating > 0);
                const avgRating = ratedOrders.length > 0
                    ? ratedOrders.reduce((sum, o) => sum + o.rating, 0) / ratedOrders.length
                    : 0;

                // Calculate on-time delivery rate
                const deliveredOrders = orders.filter(o => o.status === 'delivered' && o.deliveredAt);
                let onTimeDeliveryRate = 0;

                if (deliveredOrders.length > 0) {
                    const onTimeDeliveries = deliveredOrders.filter(order => {
                        if (!order.estimatedDeliveryTime || !order.deliveredAt) return false;
                        return new Date(order.deliveredAt) <= new Date(order.estimatedDeliveryTime);
                    }).length;

                    onTimeDeliveryRate = (onTimeDeliveries / deliveredOrders.length) * 100;
                }

                // Calculate average delivery time
                let avgDeliveryTime = 0;
                if (deliveredOrders.length > 0) {
                    const totalDeliveryTime = deliveredOrders.reduce((sum, order) => {
                        if (order.createdAt && order.deliveredAt) {
                            const deliveryTime = (new Date(order.deliveredAt) - new Date(order.createdAt)) / (1000 * 60); // minutes
                            return sum + deliveryTime;
                        }
                        return sum;
                    }, 0);

                    avgDeliveryTime = Math.round(totalDeliveryTime / deliveredOrders.length);
                }

                // Calculate earnings
                const totalEarnings = completedOrders.reduce((sum, order) => {
                    return sum + (order.shopperCommission || 0);
                }, 0);

                const avgEarningsPerOrder = completedOrders > 0 ? totalEarnings / completedOrders : 0;

                // Customer satisfaction rate (based on ratings >= 4)
                const satisfiedCustomers = ratedOrders.filter(o => o.rating >= 4).length;
                const customerSatisfactionRate = ratedOrders.length > 0
                    ? (satisfiedCustomers / ratedOrders.length) * 100
                    : 0;

                // Recent activity metrics
                const thisWeekStart = new Date();
                thisWeekStart.setDate(thisWeekStart.getDate() - 7);

                const ordersThisWeek = orders.filter(o =>
                    new Date(o.createdAt) >= thisWeekStart
                ).length;

                // Count complaints (orders with rating <= 2)
                const complaints = ratedOrders.filter(o => o.rating <= 2).length;

                return {
                    ...shopper,
                    performance: {
                        totalOrders,
                        allTimeTotalOrders,
                        completedOrders,
                        cancelledOrders,
                        completionRate: Math.round(completionRate * 10) / 10,
                        cancellationRate: Math.round(cancellationRate * 10) / 10,
                        avgRating: Math.round(avgRating * 10) / 10,
                        totalRatings: ratedOrders.length,
                        onTimeDeliveryRate: Math.round(onTimeDeliveryRate * 10) / 10,
                        avgDeliveryTime,
                        totalEarnings: Math.round(totalEarnings),
                        avgEarningsPerOrder: Math.round(avgEarningsPerOrder),
                        customerSatisfactionRate: Math.round(customerSatisfactionRate * 10) / 10,
                        ordersThisWeek,
                        complaints
                    }
                };
            })
        );

        // Sort shoppers based on the requested criteria
        shopperPerformance.sort((a, b) => {
            let aValue, bValue;

            switch (sortBy) {
                case 'rating':
                    aValue = a.performance.avgRating;
                    bValue = b.performance.avgRating;
                    break;
                case 'completionRate':
                    aValue = a.performance.completionRate;
                    bValue = b.performance.completionRate;
                    break;
                case 'totalOrders':
                    aValue = a.performance.totalOrders;
                    bValue = b.performance.totalOrders;
                    break;
                case 'earnings':
                    aValue = a.performance.totalEarnings;
                    bValue = b.performance.totalEarnings;
                    break;
                case 'onTimeRate':
                    aValue = a.performance.onTimeDeliveryRate;
                    bValue = b.performance.onTimeDeliveryRate;
                    break;
                default:
                    aValue = a.performance.avgRating;
                    bValue = b.performance.avgRating;
            }

            return order === 'desc' ? bValue - aValue : aValue - bValue;
        });

        res.json({
            success: true,
            data: shopperPerformance,
            summary: {
                totalShoppers: shoppers.length,
                activeShoppers: shoppers.filter(s => s.status === 'active').length,
                suspendedShoppers: shoppers.filter(s => s.status === 'suspended').length,
                avgPerformanceScore: shopperPerformance.length > 0
                    ? Math.round(shopperPerformance.reduce((sum, s) => {
                        const score = calculatePerformanceScore(s.performance);
                        return sum + score;
                    }, 0) / shopperPerformance.length)
                    : 0
            }
        });

    } catch (error) {
        console.error('Error fetching shopper performance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch shopper performance data'
        });
    }
};

// Helper function to calculate overall performance score
function calculatePerformanceScore(performance) {
    const {
        completionRate = 0,
        avgRating = 0,
        onTimeDeliveryRate = 0,
        customerSatisfactionRate = 0,
        cancellationRate = 0
    } = performance;

    // Weighted scoring system (out of 100)
    const score = (
        (completionRate * 0.25) +           // 25% weight
        (avgRating * 20 * 0.25) +           // 25% weight (convert 5-star to 100-point scale)
        (onTimeDeliveryRate * 0.2) +        // 20% weight
        (customerSatisfactionRate * 0.2) +  // 20% weight
        ((100 - cancellationRate) * 0.1)    // 10% weight (inverted)
    );

    return Math.round(score);
}

// Get individual shopper detailed performance
exports.getShopperDetailedPerformance = async (req, res) => {
    try {
        const { shopperId } = req.params;
        const { days = 30 } = req.query;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const shopper = await PersonalShopper.findById(shopperId).lean();
        if (!shopper) {
            return res.status(404).json({
                success: false,
                message: 'Shopper not found'
            });
        }

        // Get detailed order history
        const orders = await Order.find({
            personalShopperId: shopperId,
            createdAt: { $gte: startDate }
        })
            .populate('customerId', 'name phone')
            .populate('shopId', 'name')
            .sort({ createdAt: -1 })
            .lean();

        // Calculate daily performance trends
        const dailyStats = {};
        orders.forEach(order => {
            const date = new Date(order.createdAt).toDateString();
            if (!dailyStats[date]) {
                dailyStats[date] = {
                    date,
                    totalOrders: 0,
                    completedOrders: 0,
                    cancelledOrders: 0,
                    totalEarnings: 0,
                    avgRating: 0,
                    ratings: []
                };
            }

            dailyStats[date].totalOrders++;

            if (order.status === 'delivered') {
                dailyStats[date].completedOrders++;
                dailyStats[date].totalEarnings += order.shopperCommission || 0;
            }

            if (order.status === 'cancelled' && order.cancelledBy === 'shopper') {
                dailyStats[date].cancelledOrders++;
            }

            if (order.rating) {
                dailyStats[date].ratings.push(order.rating);
            }
        });

        // Calculate average ratings for each day
        Object.values(dailyStats).forEach(day => {
            if (day.ratings.length > 0) {
                day.avgRating = day.ratings.reduce((sum, r) => sum + r, 0) / day.ratings.length;
            }
            delete day.ratings; // Remove ratings array from response
        });

        res.json({
            success: true,
            data: {
                shopper,
                orders,
                dailyStats: Object.values(dailyStats).sort((a, b) => new Date(b.date) - new Date(a.date))
            }
        });

    } catch (error) {
        console.error('Error fetching detailed shopper performance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch detailed shopper performance'
        });
    }
};