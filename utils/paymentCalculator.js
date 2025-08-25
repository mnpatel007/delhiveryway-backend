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
 * Calculate complete order pricing
 * @param {Array} items - Array of order items with price and quantity
 * @param {string} shopId - Shop ID to get coordinates
 * @param {Object} deliveryAddress - Delivery address with coordinates
 * @returns {Object} Complete pricing breakdown
 */
const calculateOrderPricing = async (items, shopId, deliveryAddress) => {
    try {
        // Calculate subtotal from items
        const subtotal = items.reduce((sum, item) => {
            return sum + (item.price * item.quantity);
        }, 0);

        // Get shop coordinates
        const shop = await Shop.findById(shopId);
        if (!shop || !shop.address.coordinates) {
            throw new Error('Shop not found or missing coordinates');
        }

        // Calculate distance
        const distance = calculateDistance(
            shop.address.coordinates.lat,
            shop.address.coordinates.lng,
            deliveryAddress.coordinates.lat,
            deliveryAddress.coordinates.lng
        );

        // Calculate delivery fee based on distance
        const deliveryFee = calculateDeliveryFee(distance);

        // Calculate taxes (5% of subtotal)
        const taxes = Math.round(subtotal * 0.05);

        // Service fee is removed as per new requirements
        const serviceFee = 0;

        // Calculate total
        const total = subtotal + taxes + deliveryFee;

        return {
            subtotal: Math.round(subtotal),
            taxes,
            deliveryFee,
            serviceFee,
            discount: 0, // Can be added later if needed
            total: Math.round(total),
            distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
            shopperEarning: deliveryFee // Shopper earns exactly the delivery fee
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
 * @returns {Object} Revised pricing breakdown
 */
const recalculateRevisedPricing = (revisedItems, originalPricing) => {
    // Calculate new subtotal from revised items
    const subtotal = revisedItems.reduce((sum, item) => {
        if (item.isAvailable !== false && (item.revisedQuantity > 0 || item.quantity > 0)) {
            const price = item.revisedPrice !== undefined ? item.revisedPrice : item.price;
            const quantity = item.revisedQuantity !== undefined ? item.revisedQuantity : item.quantity;
            return sum + (price * quantity);
        }
        return sum;
    }, 0);

    // Recalculate taxes (5% of new subtotal)
    const taxes = Math.round(subtotal * 0.05);

    // Keep same delivery fee (distance doesn't change)
    const deliveryFee = originalPricing.deliveryFee;

    // Calculate new total (subtotal + taxes + delivery fee)
    const total = subtotal + taxes + deliveryFee;

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
