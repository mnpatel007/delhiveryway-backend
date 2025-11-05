const express = require('express');
const router = express.Router();
const Shop = require('../models/Shop');
const { calculateDeliveryFee } = require('../utils/locationUtils');

/**
 * Calculate delivery fee for a shop to a specific location
 * POST /api/delivery/calculate-fee
 * Body: {
 *   shopId: string,
 *   deliveryLocation: {
 *     lat: number,
 *     lng: number
 *   }
 * }
 */
router.post('/calculate-fee', async (req, res) => {
    try {
        const { shopId, deliveryLocation } = req.body;

        // Validate input
        if (!shopId || !deliveryLocation || !deliveryLocation.lat || !deliveryLocation.lng) {
            return res.status(400).json({
                success: false,
                message: 'Shop ID and delivery location (lat, lng) are required'
            });
        }

        // Get shop details
        const shop = await Shop.findById(shopId);
        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found'
            });
        }

        // Check if shop has coordinates
        if (!shop.address?.coordinates?.lat || !shop.address?.coordinates?.lng) {
            return res.status(400).json({
                success: false,
                message: 'Shop location not available'
            });
        }

        // Calculate delivery fee
        const feeCalculation = calculateDeliveryFee(
            shop.address.coordinates.lat,
            shop.address.coordinates.lng,
            deliveryLocation.lat,
            deliveryLocation.lng,
            shop.deliveryFeeMode || 'fixed',
            shop.deliveryFee || 30,
            shop.feePerKm || 10
        );

        res.json({
            success: true,
            data: {
                shopId: shop._id,
                shopName: shop.name,
                deliveryFee: feeCalculation.totalFee,
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
});

/**
 * Calculate delivery fees for multiple shops to a specific location
 * POST /api/delivery/calculate-fees-bulk
 * Body: {
 *   shopIds: string[],
 *   deliveryLocation: {
 *     lat: number,
 *     lng: number
 *   }
 * }
 */
router.post('/calculate-fees-bulk', async (req, res) => {
    try {
        const { shopIds, deliveryLocation } = req.body;

        // Validate input
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

        // Get shops
        const shops = await Shop.find({ _id: { $in: shopIds } });

        const results = [];

        for (const shop of shops) {
            try {
                // Check if shop has coordinates
                if (!shop.address?.coordinates?.lat || !shop.address?.coordinates?.lng) {
                    results.push({
                        shopId: shop._id,
                        shopName: shop.name,
                        error: 'Shop location not available',
                        deliveryFee: shop.deliveryFee || 30 // Fallback to fixed fee
                    });
                    continue;
                }

                // Calculate delivery fee
                const feeCalculation = calculateDeliveryFee(
                    shop.address.coordinates.lat,
                    shop.address.coordinates.lng,
                    deliveryLocation.lat,
                    deliveryLocation.lng,
                    shop.deliveryFeeMode || 'fixed',
                    shop.deliveryFee || 30,
                    shop.feePerKm || 10
                );

                results.push({
                    shopId: shop._id,
                    shopName: shop.name,
                    deliveryFee: feeCalculation.totalFee,
                    calculation: feeCalculation
                });

            } catch (error) {
                console.error(`Error calculating fee for shop ${shop._id}:`, error);
                results.push({
                    shopId: shop._id,
                    shopName: shop.name,
                    error: 'Calculation failed',
                    deliveryFee: shop.deliveryFee || 30 // Fallback to fixed fee
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
});

module.exports = router;