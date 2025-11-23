const Shop = require('../models/Shop');
const DeliveryDiscount = require('../models/DeliveryDiscount');
const { calculateDeliveryFee } = require('../utils/locationUtils');

// Helper to find and apply best discount
const applyBestDiscount = async (originalFee, orderValue = 0) => {
    try {
        const now = new Date();
        const activeDiscounts = await DeliveryDiscount.find({
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now },
            minOrderValue: { $lte: orderValue }
        });

        let bestDiscount = null;
        let discountAmount = 0;

        for (const discount of activeDiscounts) {
            let currentDiscountAmount = 0;
            if (discount.discountType === 'free') {
                currentDiscountAmount = originalFee;
            } else if (discount.discountType === 'fixed') {
                currentDiscountAmount = discount.discountValue;
            } else if (discount.discountType === 'percentage') {
                currentDiscountAmount = (originalFee * discount.discountValue) / 100;
            }

            // Cap discount at original fee (no negative delivery fee)
            currentDiscountAmount = Math.min(currentDiscountAmount, originalFee);

            if (currentDiscountAmount > discountAmount) {
                discountAmount = currentDiscountAmount;
                bestDiscount = discount;
            }
        }

        return {
            finalFee: originalFee - discountAmount,
            originalFee,
            discountApplied: bestDiscount ? {
                id: bestDiscount._id,
                name: bestDiscount.name,
                type: bestDiscount.discountType,
                value: bestDiscount.discountValue,
                amount: discountAmount
            } : null
        };
    } catch (error) {
        console.error('Error applying discount:', error);
        return { finalFee: originalFee, originalFee, discountApplied: null };
    }
};

// Calculate fee for a single shop
exports.calculateFee = async (req, res) => {
    try {
        const { shopId, deliveryLocation, orderValue = 0 } = req.body;

        if (!shopId || !deliveryLocation || !deliveryLocation.lat || !deliveryLocation.lng) {
            return res.status(400).json({
                success: false,
                message: 'Shop ID and delivery location (lat, lng) are required'
            });
        }

        const shop = await Shop.findById(shopId);
        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found'
            });
        }

        if (!shop.address?.coordinates?.lat || !shop.address?.coordinates?.lng) {
            return res.status(400).json({
                success: false,
                message: 'Shop location not available'
            });
        }

        const feeCalculation = calculateDeliveryFee(
            shop.address.coordinates.lat,
            shop.address.coordinates.lng,
            deliveryLocation.lat,
            deliveryLocation.lng,
            shop.deliveryFeeMode || 'fixed',
            shop.deliveryFee || 30,
            shop.feePerKm || 10
        );

        // Apply discount
        const discountResult = await applyBestDiscount(feeCalculation.totalFee, orderValue);

        res.json({
            success: true,
            data: {
                shopId: shop._id,
                shopName: shop.name,
                deliveryFee: discountResult.finalFee,
                originalDeliveryFee: discountResult.originalFee,
                discountApplied: discountResult.discountApplied,
                calculation: feeCalculation
            }
        });

    } catch (error) {
        console.error('Error calculating delivery fee:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate delivery fee'
        });
    }
};

// Calculate fees for multiple shops
exports.calculateFeesBulk = async (req, res) => {
    try {
        const { shopIds, deliveryLocation, orderValue = 0 } = req.body;

        if (!shopIds || !Array.isArray(shopIds) || shopIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Shop IDs array is required'
            });
        }

        if (!deliveryLocation || !deliveryLocation.lat || !deliveryLocation.lng) {
            return res.status(400).json({
                success: false,
                message: 'Delivery location (lat, lng) is required'
            });
        }

        const shops = await Shop.find({ _id: { $in: shopIds } });
        const results = [];

        // Pre-fetch best discount for this order value (optimization: do it once if not shop-specific)
        // Note: If we add shop-specific discounts later, this needs to move inside the loop.
        // For now, discounts are global.

        for (const shop of shops) {
            try {
                if (!shop.address?.coordinates?.lat || !shop.address?.coordinates?.lng) {
                    results.push({
                        shopId: shop._id,
                        shopName: shop.name,
                        error: 'Shop location not available',
                        deliveryFee: shop.deliveryFee || 30
                    });
                    continue;
                }

                const feeCalculation = calculateDeliveryFee(
                    shop.address.coordinates.lat,
                    shop.address.coordinates.lng,
                    deliveryLocation.lat,
                    deliveryLocation.lng,
                    shop.deliveryFeeMode || 'fixed',
                    shop.deliveryFee || 30,
                    shop.feePerKm || 10
                );

                const discountResult = await applyBestDiscount(feeCalculation.totalFee, orderValue);

                results.push({
                    shopId: shop._id,
                    shopName: shop.name,
                    deliveryFee: discountResult.finalFee,
                    originalDeliveryFee: discountResult.originalFee,
                    discountApplied: discountResult.discountApplied,
                    calculation: feeCalculation
                });

            } catch (error) {
                console.error(`Error calculating fee for shop ${shop._id}:`, error);
                results.push({
                    shopId: shop._id,
                    shopName: shop.name,
                    error: 'Calculation failed',
                    deliveryFee: shop.deliveryFee || 30
                });
            }
        }

        res.json({
            success: true,
            data: results
        });

    } catch (error) {
        console.error('Error calculating bulk delivery fees:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate delivery fees'
        });
    }
};

// Admin: Create discount
exports.createDiscount = async (req, res) => {
    try {
        const { name, discountType, discountValue, minOrderValue, startDate, endDate, description } = req.body;

        const discount = new DeliveryDiscount({
            name,
            discountType,
            discountValue,
            minOrderValue,
            startDate,
            endDate,
            description,
            createdBy: req.user._id
        });

        await discount.save();

        res.status(201).json({
            success: true,
            message: 'Delivery discount created successfully',
            data: { discount }
        });
    } catch (error) {
        console.error('Error creating discount:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create discount',
            error: error.message
        });
    }
};

// Admin: Get all discounts
exports.getAllDiscounts = async (req, res) => {
    try {
        const discounts = await DeliveryDiscount.find()
            .sort({ createdAt: -1 })
            .populate('createdBy', 'name email');

        res.json({
            success: true,
            data: { discounts }
        });
    } catch (error) {
        console.error('Error fetching discounts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch discounts'
        });
    }
};

// Admin: Delete discount
exports.deleteDiscount = async (req, res) => {
    try {
        const { id } = req.params;
        await DeliveryDiscount.findByIdAndDelete(id);
        res.json({
            success: true,
            message: 'Discount deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting discount:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete discount'
        });
    }
};

// Admin: Toggle active status
exports.toggleDiscountStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const discount = await DeliveryDiscount.findById(id);

        if (!discount) {
            return res.status(404).json({
                success: false,
                message: 'Discount not found'
            });
        }

        discount.isActive = !discount.isActive;
        await discount.save();

        res.json({
            success: true,
            message: `Discount ${discount.isActive ? 'activated' : 'deactivated'} successfully`,
            data: { discount }
        });
    } catch (error) {
        console.error('Error toggling discount status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update discount status'
        });
    }
};
