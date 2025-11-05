const Shop = require('../models/Shop');

/**
 * Calculate delivery fee based on distance
 * @param {number} distance - Distance in kilometers
 * @returns {number} Delivery fee in rupees
 */
const calculateDeliveryFee = (distance) => {
    // Base delivery fee structure
    const baseFee = 30; // Base fee for up to 2km
    const perKmRate = 15; // Additional fee per km after 2km
    const maxFee = 150; // Maximum delivery fee cap

    if (distance <= 2) {
        return baseFee;
    } else if (distance <= 10) {
        return Math.min(baseFee + ((distance - 2) * perKmRate), maxFee);
    } else {
        // For distances over 10km, add a premium
        return Math.min(baseFee + (8 * perKmRate) + ((distance - 10) * 20), 200);
    }
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/**
 * Calculate complete order pricing with flexible delivery fees
 * @param {Array} items - Array of order items with price and quantity
 * @param {string} shopId - Shop ID to get coordinates
 * @param {Object} deliveryAddress - Delivery address with coordinates
 * @returns {Object} Complete pricing breakdown
 */
const calculateOrderPricing = async (items, shopId, deliveryAddress) => {
    try {
        const { calculateDeliveryFee: calculateLocationBasedFee } = require('./locationUtils');

        // Calculate subtotal from items
        const subtotal = items.reduce((sum, item) => {
            return sum + (item.price * item.quantity);
        }, 0);

        // Get shop details with coordinates
        const shop = await Shop.findById(shopId);
        if (!shop || !shop.address.coordinates) {
            throw new Error('Shop not found or missing coordinates');
        }

        // Calculate delivery fee based on shop's mode
        const deliveryFeeCalculation = calculateLocationBasedFee(
            shop.address.coordinates.lat,
            shop.address.coordinates.lng,
            deliveryAddress.coordinates.lat,
            deliveryAddress.coordinates.lng,
            shop.deliveryFeeMode || 'fixed',
            shop.deliveryFee || 30,
            shop.feePerKm || 10
        );

        console.log('Shop name:', shop.name);
        console.log('Delivery mode:', shop.deliveryFeeMode);
        console.log('Fee calculation:', deliveryFeeCalculation);

        const deliveryFee = deliveryFeeCalculation.totalFee;

        // Calculate taxes based on shop settings
        let taxes = 0;
        if (shop.hasTax && shop.taxRate > 0) {
            taxes = Math.round((subtotal * shop.taxRate) / 100);
            console.log(`Tax applied: ${shop.taxRate}% on subtotal ${subtotal} = ${taxes}`);
        } else {
            console.log('No tax applied - shop hasTax:', shop.hasTax, 'taxRate:', shop.taxRate);
        }

        // Service fee is removed as per new requirements
        const serviceFee = 0;

        // Calculate total (subtotal + delivery fee + taxes)
        const total = subtotal + deliveryFee + taxes;

        return {
            subtotal: Math.round(subtotal),
            taxes,
            deliveryFee,
            serviceFee,
            discount: 0, // Can be added later if needed
            total: Math.round(total),
            distance: deliveryFeeCalculation.distance, // Distance from shop in meters
            distanceKm: deliveryFeeCalculation.distanceKm, // Distance in km for display
            deliveryMode: deliveryFeeCalculation.mode,
            locationMessage: deliveryFeeCalculation.message,
            shopperEarning: deliveryFee, // Shopper earns exactly the delivery fee
            deliveryFeeBreakdown: {
                baseFee: deliveryFeeCalculation.baseFee,
                distanceFee: deliveryFeeCalculation.distanceFee,
                segments: deliveryFeeCalculation.segments
            }
        };
    } catch (error) {
        console.error('Error calculating order pricing:', error);
        throw error;
    }
};

/**
 * Recalculate pricing when order is revised
 * @param {Array} revisedItems - Revised items array
 * @param {Object} originalPricing - Original pricing object
 * @param {Object} shop - Shop object with delivery fee
 * @returns {Object} Revised pricing breakdown
 */
const recalculateRevisedPricing = (revisedItems, originalPricing, shop = null) => {
    // Calculate new subtotal from revised items
    const subtotal = revisedItems.reduce((sum, item) => {
        if (item.isAvailable !== false && (item.revisedQuantity > 0 || item.quantity > 0)) {
            const price = item.revisedPrice !== undefined ? item.revisedPrice : item.price;
            const quantity = item.revisedQuantity !== undefined ? item.revisedQuantity : item.quantity;
            return sum + (price * quantity);
        }
        return sum;
    }, 0);

    // Calculate taxes based on shop settings
    let taxes = 0;
    if (shop && shop.hasTax && shop.taxRate > 0) {
        taxes = Math.round((subtotal * shop.taxRate) / 100);
    }

    // Always use shop's delivery fee (default to original if shop not provided)
    const deliveryFee = shop ? (shop.deliveryFee || 0) : originalPricing.deliveryFee;

    // Calculate new total (subtotal + delivery fee + taxes)
    const total = subtotal + deliveryFee + taxes;

    return {
        subtotal: Math.round(subtotal),
        taxes,
        deliveryFee,
        discount: 0,
        total: Math.round(total),
        distance: originalPricing.distance,
        shopperEarning: deliveryFee // Shopper earns exactly the delivery fee
    };
};

module.exports = {
    calculateDeliveryFee,
    calculateDistance,
    calculateOrderPricing,
    recalculateRevisedPricing
};
