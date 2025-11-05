/**
 * Simple distance-based delivery fee calculation utilities
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

/**
 * Calculate delivery fee based on distance from shop
 * @param {number} shopLat - Shop latitude
 * @param {number} shopLng - Shop longitude
 * @param {number} deliveryLat - Delivery latitude
 * @param {number} deliveryLng - Delivery longitude
 * @param {string} mode - 'fixed' or 'distance'
 * @param {number} baseFee - Shop's base delivery fee (for fixed mode)
 * @param {number} feePerKm - Fee per 500m (for distance mode)
 * @returns {object} Fee calculation details
 */
function calculateDeliveryFee(shopLat, shopLng, deliveryLat, deliveryLng, mode = 'fixed', baseFee = 30, feePerKm = 10) {
    const distance = calculateDistance(shopLat, shopLng, deliveryLat, deliveryLng);
    const distanceInKm = distance / 1000;

    if (mode === 'fixed') {
        return {
            totalFee: baseFee,
            baseFee: baseFee,
            distanceFee: 0,
            distance: Math.round(distance),
            distanceKm: Math.round(distanceInKm * 10) / 10,
            segments: 0,
            mode: 'fixed',
            message: `Fixed delivery fee`
        };
    }

    // Distance-based calculation - fair for everyone
    const segments = Math.ceil(distance / 500); // Every 500m segment
    const totalFee = segments * feePerKm;

    console.log('🚚 DELIVERY FEE DEBUG:');
    console.log('  Distance (meters):', distance);
    console.log('  Distance (km):', distanceInKm);
    console.log('  Segments (500m each):', segments);
    console.log('  Fee per 500m:', feePerKm);
    console.log('  Total fee:', totalFee);

    return {
        totalFee: Math.round(totalFee),
        baseFee: 0,
        distanceFee: Math.round(totalFee),
        distance: Math.round(distance),
        distanceKm: Math.round(distanceInKm * 10) / 10,
        segments: segments,
        mode: 'distance',
        message: `Distance-based (${Math.round(distanceInKm * 10) / 10}km from shop)`
    };
}

/**
 * Get location info for display
 * @param {number} shopLat - Shop latitude
 * @param {number} shopLng - Shop longitude
 * @param {number} deliveryLat - Delivery latitude
 * @param {number} deliveryLng - Delivery longitude
 * @returns {object} Location information
 */
function getLocationInfo(shopLat, shopLng, deliveryLat, deliveryLng) {
    const distance = calculateDistance(shopLat, shopLng, deliveryLat, deliveryLng);
    const distanceInKm = distance / 1000;

    return {
        distance: Math.round(distance),
        distanceKm: Math.round(distanceInKm * 10) / 10,
        message: `${Math.round(distanceInKm * 10) / 10}km from shop`
    };
}

module.exports = {
    calculateDistance,
    calculateDeliveryFee,
    getLocationInfo
};