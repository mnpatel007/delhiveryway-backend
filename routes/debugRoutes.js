const express = require('express');
const router = express.Router();
const Shop = require('../models/Shop');
const { calculateDeliveryFee } = require('../utils/locationUtils');
const { calculateOrderPricing } = require('../utils/paymentCalculator');

/**
 * Debug delivery fee calculation
 * POST /api/debug/delivery-fee
 */
router.post('/delivery-fee', async (req, res) => {
    try {
        const { shopId, customerLat, customerLng, items } = req.body;

        console.log('🔍 DEBUG: Delivery fee calculation request');
        console.log('  Shop ID:', shopId);
        console.log('  Customer location:', { lat: customerLat, lng: customerLng });
        console.log('  Items:', items);

        // Get shop
        const shop = await Shop.findById(shopId);
        if (!shop) {
            return res.status(404).json({ error: 'Shop not found' });
        }

        console.log('🏪 SHOP DETAILS:');
        console.log('  Name:', shop.name);
        console.log('  Delivery Mode:', shop.deliveryFeeMode);
        console.log('  Fixed Fee:', shop.deliveryFee);
        console.log('  Fee per 500m:', shop.feePerKm);
        console.log('  Coordinates:', shop.address?.coordinates);

        if (!shop.address?.coordinates) {
            return res.status(400).json({ error: 'Shop coordinates not available' });
        }

        // Calculate delivery fee directly
        const deliveryCalc = calculateDeliveryFee(
            shop.address.coordinates.lat,
            shop.address.coordinates.lng,
            customerLat,
            customerLng,
            shop.deliveryFeeMode || 'fixed',
            shop.deliveryFee || 30,
            shop.feePerKm || 10
        );

        console.log('🚚 DELIVERY CALCULATION:', deliveryCalc);

        // Calculate full order pricing if items provided
        let orderPricing = null;
        if (items && items.length > 0) {
            const deliveryAddress = {
                coordinates: { lat: customerLat, lng: customerLng }
            };

            orderPricing = await calculateOrderPricing(items, shopId, deliveryAddress);
            console.log('💰 FULL ORDER PRICING:', orderPricing);
        }

        res.json({
            success: true,
            shop: {
                name: shop.name,
                deliveryFeeMode: shop.deliveryFeeMode,
                deliveryFee: shop.deliveryFee,
                feePerKm: shop.feePerKm,
                coordinates: shop.address.coordinates
            },
            deliveryCalculation: deliveryCalc,
            orderPricing: orderPricing
        });

    } catch (error) {
        console.error('Debug delivery fee error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Update shop delivery settings for testing
 * POST /api/debug/update-shop-delivery
 */
router.post('/update-shop-delivery', async (req, res) => {
    try {
        const { shopId, deliveryFeeMode, feePerKm, deliveryFee } = req.body;

        const shop = await Shop.findByIdAndUpdate(
            shopId,
            {
                deliveryFeeMode: deliveryFeeMode || 'distance',
                feePerKm: feePerKm || 6,
                deliveryFee: deliveryFee || 30
            },
            { new: true }
        );

        if (!shop) {
            return res.status(404).json({ error: 'Shop not found' });
        }

        console.log('✅ Updated shop delivery settings:', {
            name: shop.name,
            deliveryFeeMode: shop.deliveryFeeMode,
            feePerKm: shop.feePerKm,
            deliveryFee: shop.deliveryFee
        });

        res.json({
            success: true,
            message: 'Shop delivery settings updated',
            shop: {
                name: shop.name,
                deliveryFeeMode: shop.deliveryFeeMode,
                feePerKm: shop.feePerKm,
                deliveryFee: shop.deliveryFee
            }
        });

    } catch (error) {
        console.error('Update shop delivery settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;