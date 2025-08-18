const Shop = require('../models/Shop');
const Product = require('../models/Product');
const User = require('../models/User');
const mongoose = require('mongoose');
const axios = require('axios');

// Location validation function using Google Maps Geocoding API
const validateLocationAccuracy = async (address) => {
    try {
        const { street, city, state, zipCode, coordinates } = address;
        const fullAddress = `${street}, ${city}, ${state} ${zipCode}`.trim();

        // Skip validation if no Google Maps API key
        if (!process.env.GOOGLE_MAPS_API_KEY) {
            console.warn('⚠️ Google Maps API key not found, skipping location validation');
            return { isValid: true };
        }

        // Geocode the address
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

        const response = await axios.get(geocodeUrl);

        if (response.data.status !== 'OK' || !response.data.results.length) {
            return {
                isValid: false,
                message: 'Address not found or invalid. Please provide a valid, complete address.'
            };
        }

        const result = response.data.results[0];
        const geocodedLocation = result.geometry.location;

        // Calculate distance between provided coordinates and geocoded coordinates
        const distance = calculateDistance(
            coordinates.lat,
            coordinates.lng,
            geocodedLocation.lat,
            geocodedLocation.lng
        );

        // Allow up to 100 meters tolerance
        if (distance > 0.1) { // 0.1 km = 100 meters
            return {
                isValid: false,
                message: `Location coordinates don't match the provided address. Distance: ${(distance * 1000).toFixed(0)}m. Please ensure coordinates are accurate.`
            };
        }

        // Validate address components
        const components = result.address_components;
        const hasStreetNumber = components.some(comp => comp.types.includes('street_number'));
        const hasRoute = components.some(comp => comp.types.includes('route'));
        const hasLocality = components.some(comp => comp.types.includes('locality') || comp.types.includes('sublocality'));

        if (!hasStreetNumber || !hasRoute) {
            return {
                isValid: false,
                message: 'Please provide a complete street address with street number and name.'
            };
        }

        if (!hasLocality) {
            return {
                isValid: false,
                message: 'Please provide a valid city/locality in the address.'
            };
        }

        return {
            isValid: true,
            geocodedAddress: result.formatted_address,
            placeId: result.place_id
        };

    } catch (error) {
        console.error('❌ Location validation error:', error);
        // Don't block shop creation if validation service fails
        return { isValid: true };
    }
};

// Calculate distance between two coordinates using Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers
    return distance;
};

// Create a new shop (Vendor only)
exports.createShop = async (req, res) => {
    try {
        const {
            name,
            description,
            category,
            address,
            contact,
            images,
            operatingHours,
            tags,
            deliveryFee,
            minOrderValue,
            maxOrderValue
        } = req.body;

        // Validate required fields
        if (!name || !category || !address) {
            return res.status(400).json({
                success: false,
                message: 'Name, category, and address are required'
            });
        }

        if (!address.street || !address.city || !address.state || !address.coordinates) {
            return res.status(400).json({
                success: false,
                message: 'Complete address with coordinates is required'
            });
        }

        if (!address.coordinates.lat || !address.coordinates.lng) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        // Validate coordinate ranges
        const lat = parseFloat(address.coordinates.lat);
        const lng = parseFloat(address.coordinates.lng);

        if (isNaN(lat) || isNaN(lng)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid latitude or longitude format'
            });
        }

        if (lat < -90 || lat > 90) {
            return res.status(400).json({
                success: false,
                message: 'Latitude must be between -90 and 90 degrees'
            });
        }

        if (lng < -180 || lng > 180) {
            return res.status(400).json({
                success: false,
                message: 'Longitude must be between -180 and 180 degrees'
            });
        }

        // Validate location accuracy using Google Maps Geocoding API
        const locationValidation = await validateLocationAccuracy(address);
        if (!locationValidation.isValid) {
            return res.status(400).json({
                success: false,
                message: locationValidation.message
            });
        }

        // Check if vendor already has a shop with the same name
        const existingShop = await Shop.findOne({
            vendorId: req.user._id,
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });

        if (existingShop) {
            return res.status(400).json({
                success: false,
                message: 'You already have a shop with this name'
            });
        }

        // Create shop
        const shop = new Shop({
            name: name.trim(),
            description: description?.trim(),
            vendorId: req.user._id,
            category,
            address: {
                street: address.street.trim(),
                city: address.city.trim(),
                state: address.state.trim(),
                zipCode: address.zipCode?.trim(),
                coordinates: {
                    lat: parseFloat(address.coordinates.lat),
                    lng: parseFloat(address.coordinates.lng)
                }
            },
            contact: contact || {},
            images: images || [],
            operatingHours: operatingHours || {},
            tags: tags || [],
            deliveryFee: deliveryFee || 0,
            minOrderValue: minOrderValue || 0,
            maxOrderValue: maxOrderValue || 10000
        });

        await shop.save();

        // Populate vendor info for response
        await shop.populate('vendorId', 'name email phone');

        res.status(201).json({
            success: true,
            message: 'Shop created successfully',
            data: { shop }
        });

    } catch (error) {
        console.error('Create shop error:', error);

        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to create shop'
        });
    }
};

// Get all shops for a vendor
exports.getVendorShops = async (req, res) => {
    try {
        const { page = 1, limit = 10, category, isActive } = req.query;
        const skip = (page - 1) * limit;

        const filter = { vendorId: req.user._id };

        if (category) {
            filter.category = category;
        }

        if (isActive !== undefined) {
            filter.isActive = isActive === 'true';
        }

        const shops = await Shop.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Shop.countDocuments(filter);

        // Get product counts for each shop
        const shopsWithProductCount = await Promise.all(
            shops.map(async (shop) => {
                const productCount = await Product.countDocuments({
                    shopId: shop._id,
                    isActive: true
                });

                return {
                    ...shop.toObject(),
                    productCount,
                    isOpenNow: shop.isOpenNow()
                };
            })
        );

        res.json({
            success: true,
            data: {
                shops: shopsWithProductCount,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                }
            }
        });

    } catch (error) {
        console.error('Get vendor shops error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch shops'
        });
    }
};

// Get all shops (Public route with optional filters)
exports.getAllShops = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            category,
            search,
            lat,
            lng,
            radius = 10, // km
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const skip = (page - 1) * limit;
        const filter = { isActive: true };

        // Category filter
        if (category && category !== 'all') {
            filter.category = category;
        }

        // Search filter
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ];
        }

        // Location-based filter
        if (lat && lng) {
            const latitude = parseFloat(lat);
            const longitude = parseFloat(lng);
            const radiusInMeters = parseFloat(radius) * 1000;

            filter['address.coordinates'] = {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [longitude, latitude]
                    },
                    $maxDistance: radiusInMeters
                }
            };
        }

        // Build sort object
        const sort = {};
        if (sortBy === 'distance' && lat && lng) {
            // Distance sorting is handled by $near
        } else if (sortBy === 'rating') {
            sort['rating.average'] = sortOrder === 'desc' ? -1 : 1;
        } else if (sortBy === 'name') {
            sort.name = sortOrder === 'desc' ? -1 : 1;
        } else {
            sort.createdAt = sortOrder === 'desc' ? -1 : 1;
        }

        const shops = await Shop.find(filter)
            .populate('vendorId', 'name')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Shop.countDocuments(filter);

        // Add additional info to each shop
        const shopsWithInfo = await Promise.all(
            shops.map(async (shop) => {
                const productCount = await Product.countDocuments({
                    shopId: shop._id,
                    isActive: true
                });

                let distance = null;
                if (lat && lng) {
                    distance = shop.distanceFrom(parseFloat(lat), parseFloat(lng));
                }

                return {
                    ...shop.toObject(),
                    productCount,
                    isOpenNow: shop.isOpenNow(),
                    distance: distance ? Math.round(distance * 10) / 10 : null
                };
            })
        );

        res.json({
            success: true,
            data: {
                shops: shopsWithInfo,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                },
                filters: {
                    categories: await Shop.distinct('category', { isActive: true }),
                    totalShops: await Shop.countDocuments({ isActive: true })
                }
            }
        });

    } catch (error) {
        console.error('Get all shops error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch shops',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get shop by ID
exports.getShopById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid shop ID'
            });
        }

        const shop = await Shop.findById(id)
            .populate('vendorId', 'name email phone');

        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found'
            });
        }

        // Get product count
        const productCount = await Product.countDocuments({
            shopId: shop._id,
            isActive: true
        });

        // Get recent products
        const recentProducts = await Product.find({
            shopId: shop._id,
            isActive: true
        })
            .sort({ createdAt: -1 })
            .limit(8)
            .select('name price images category');

        const shopData = {
            ...shop.toObject(),
            productCount,
            isOpenNow: shop.isOpenNow(),
            recentProducts
        };

        res.json({
            success: true,
            data: { shop: shopData }
        });

    } catch (error) {
        console.error('Get shop by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch shop'
        });
    }
};

// Update shop
exports.updateShop = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const shop = await Shop.findOne({ _id: id, vendorId: req.user._id });

        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found or access denied'
            });
        }

        // Validate coordinates if provided
        if (updates.address?.coordinates) {
            const { lat, lng } = updates.address.coordinates;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid coordinates'
                });
            }
        }

        // Update shop
        Object.keys(updates).forEach(key => {
            if (key !== 'vendorId' && key !== '_id') {
                shop[key] = updates[key];
            }
        });

        await shop.save();

        res.json({
            success: true,
            message: 'Shop updated successfully',
            data: { shop }
        });

    } catch (error) {
        console.error('Update shop error:', error);

        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to update shop'
        });
    }
};

// Delete shop
exports.deleteShop = async (req, res) => {
    try {
        const { id } = req.params;

        const shop = await Shop.findOne({ _id: id, vendorId: req.user._id });

        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found or access denied'
            });
        }

        // Check if shop has active orders
        const Order = require('../models/Order');
        const activeOrders = await Order.countDocuments({
            shopId: shop._id,
            status: { $nin: ['delivered', 'cancelled', 'refunded'] }
        });

        if (activeOrders > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete shop with active orders'
            });
        }

        // Delete all products under this shop
        await Product.deleteMany({ shopId: shop._id });

        // Delete the shop
        await Shop.findByIdAndDelete(shop._id);

        res.json({
            success: true,
            message: 'Shop and its products deleted successfully'
        });

    } catch (error) {
        console.error('Delete shop error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete shop'
        });
    }
};

// Toggle shop status
exports.toggleShopStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const shop = await Shop.findOne({ _id: id, vendorId: req.user._id });

        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found or access denied'
            });
        }

        shop.isActive = !shop.isActive;
        await shop.save();

        res.json({
            success: true,
            message: `Shop ${shop.isActive ? 'activated' : 'deactivated'} successfully`,
            data: {
                shop: {
                    _id: shop._id,
                    name: shop.name,
                    isActive: shop.isActive
                }
            }
        });

    } catch (error) {
        console.error('Toggle shop status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update shop status'
        });
    }
};

// Get shop statistics
exports.getShopStats = async (req, res) => {
    try {
        const { id } = req.params;

        const shop = await Shop.findOne({ _id: id, vendorId: req.user._id });

        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found or access denied'
            });
        }

        const Order = require('../models/Order');

        const stats = await Order.aggregate([
            { $match: { shopId: new mongoose.Types.ObjectId(id) } },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$orderValue.total' },
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

        const monthlyStats = await Order.aggregate([
            {
                $match: {
                    shopId: new mongoose.Types.ObjectId(id),
                    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    orders: { $sum: 1 },
                    revenue: { $sum: '$orderValue.total' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const result = stats[0] || {
            totalOrders: 0,
            totalRevenue: 0,
            deliveredOrders: 0,
            cancelledOrders: 0,
            averageOrderValue: 0
        };

        res.json({
            success: true,
            data: {
                stats: {
                    ...result,
                    averageOrderValue: Math.round(result.averageOrderValue || 0),
                    successRate: result.totalOrders > 0
                        ? Math.round((result.deliveredOrders / result.totalOrders) * 100)
                        : 0
                },
                monthlyStats
            }
        });

    } catch (error) {
        console.error('Get shop stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch shop statistics'
        });
    }
};