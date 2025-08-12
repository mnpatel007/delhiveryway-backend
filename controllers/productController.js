const Product = require('../models/Product');
const Shop = require('../models/Shop');
const mongoose = require('mongoose');

// Create a new product (Vendor only)
exports.createProduct = async (req, res) => {
    try {
        const {
            name,
            description,
            shopId,
            category,
            price,
            originalPrice,
            discount,
            images,
            stockQuantity,
            unit,
            tags,
            nutritionalInfo
        } = req.body;

        // Validate required fields
        if (!name || !shopId || !category || !price) {
            return res.status(400).json({
                success: false,
                message: 'Name, shop ID, category, and price are required'
            });
        }

        // Verify shop belongs to vendor
        const shop = await Shop.findOne({ _id: shopId, vendorId: req.user._id });
        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found or access denied'
            });
        }

        // Check if product with same name exists in this shop
        const existingProduct = await Product.findOne({
            shopId,
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });

        if (existingProduct) {
            return res.status(400).json({
                success: false,
                message: 'Product with this name already exists in this shop'
            });
        }

        // Create product
        const product = new Product({
            name: name.trim(),
            description: description?.trim(),
            shopId,
            category,
            price: parseFloat(price),
            originalPrice: originalPrice ? parseFloat(originalPrice) : null,
            discount: discount || 0,
            images: images || [],
            stockQuantity: stockQuantity || 0,
            unit: unit || 'piece',
            tags: tags || [],
            nutritionalInfo: nutritionalInfo || {},
            inStock: (stockQuantity || 0) > 0
        });

        await product.save();

        // Populate shop info for response
        await product.populate('shopId', 'name category');

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: { product }
        });

    } catch (error) {
        console.error('Create product error:', error);

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
            message: 'Failed to create product'
        });
    }
};

// Get all products for a shop (Public route)
exports.getShopProducts = async (req, res) => {
    try {
        const { shopId } = req.params;
        const {
            page = 1,
            limit = 20,
            category,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            inStock
        } = req.query;

        if (!mongoose.Types.ObjectId.isValid(shopId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid shop ID'
            });
        }

        const skip = (page - 1) * limit;
        const filter = { shopId, isActive: true };

        // Category filter
        if (category) {
            filter.category = category;
        }

        // Stock filter
        if (inStock !== undefined) {
            filter.inStock = inStock === 'true';
        }

        // Search filter
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ];
        }

        // Build sort object
        const sort = {};
        if (sortBy === 'price') {
            sort.price = sortOrder === 'desc' ? -1 : 1;
        } else if (sortBy === 'name') {
            sort.name = sortOrder === 'desc' ? -1 : 1;
        } else {
            sort.createdAt = sortOrder === 'desc' ? -1 : 1;
        }

        const products = await Product.find(filter)
            .populate('shopId', 'name')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Product.countDocuments(filter);

        res.json({
            success: true,
            data: {
                products,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                },
                filters: {
                    categories: await Product.distinct('category', { shopId, isActive: true })
                }
            }
        });

    } catch (error) {
        console.error('Get shop products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
};

// Get all products for vendor
exports.getVendorProducts = async (req, res) => {
    try {
        const { page = 1, limit = 20, shopId, category, inStock } = req.query;
        const skip = (page - 1) * limit;

        // Get vendor's shops
        const vendorShops = await Shop.find({ vendorId: req.user._id }).select('_id');
        const shopIds = vendorShops.map(shop => shop._id);

        if (shopIds.length === 0) {
            return res.json({
                success: true,
                data: {
                    products: [],
                    pagination: { current: 1, pages: 0, total: 0 }
                }
            });
        }

        const filter = { shopId: { $in: shopIds } };

        // Shop filter
        if (shopId && mongoose.Types.ObjectId.isValid(shopId)) {
            filter.shopId = shopId;
        }

        // Category filter
        if (category) {
            filter.category = category;
        }

        // Stock filter
        if (inStock !== undefined) {
            filter.inStock = inStock === 'true';
        }

        const products = await Product.find(filter)
            .populate('shopId', 'name category')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Product.countDocuments(filter);

        res.json({
            success: true,
            data: {
                products,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                },
                shops: vendorShops
            }
        });

    } catch (error) {
        console.error('Get vendor products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
};

// Get product by ID
exports.getProductById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
            });
        }

        const product = await Product.findById(id)
            .populate('shopId', 'name address category contact operatingHours rating');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if product is active (unless it's the vendor viewing their own product)
        const isVendor = req.user && product.shopId.vendorId &&
            product.shopId.vendorId.toString() === req.user._id.toString();

        if (!product.isActive && !isVendor) {
            return res.status(404).json({
                success: false,
                message: 'Product not available'
            });
        }

        // Get related products from the same shop
        const relatedProducts = await Product.find({
            shopId: product.shopId._id,
            _id: { $ne: product._id },
            isActive: true,
            category: product.category
        })
            .limit(6)
            .select('name price images');

        res.json({
            success: true,
            data: {
                product,
                relatedProducts
            }
        });

    } catch (error) {
        console.error('Get product by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product'
        });
    }
};

// Update product
exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Find product and verify ownership
        const product = await Product.findById(id).populate('shopId');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        if (product.shopId.vendorId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Validate price if provided
        if (updates.price !== undefined) {
            updates.price = parseFloat(updates.price);
            if (updates.price < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Price cannot be negative'
                });
            }
        }

        // Update stock status based on quantity
        if (updates.stockQuantity !== undefined) {
            updates.inStock = updates.stockQuantity > 0;
        }

        // Update product
        Object.keys(updates).forEach(key => {
            if (key !== 'shopId' && key !== '_id') {
                product[key] = updates[key];
            }
        });

        await product.save();

        res.json({
            success: true,
            message: 'Product updated successfully',
            data: { product }
        });

    } catch (error) {
        console.error('Update product error:', error);

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
            message: 'Failed to update product'
        });
    }
};

// Delete product
exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        // Find product and verify ownership
        const product = await Product.findById(id).populate('shopId');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        if (product.shopId.vendorId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Check if product is in any active orders
        const Order = require('../models/Order');
        const activeOrders = await Order.countDocuments({
            'items.productId': product._id,
            status: { $nin: ['delivered', 'cancelled', 'refunded'] }
        });

        if (activeOrders > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete product with active orders'
            });
        }

        await Product.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Product deleted successfully'
        });

    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete product'
        });
    }
};

// Toggle product status
exports.toggleProductStatus = async (req, res) => {
    try {
        const { id } = req.params;

        // Find product and verify ownership
        const product = await Product.findById(id).populate('shopId');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        if (product.shopId.vendorId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        product.isActive = !product.isActive;
        await product.save();

        res.json({
            success: true,
            message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
            data: {
                product: {
                    _id: product._id,
                    name: product.name,
                    isActive: product.isActive
                }
            }
        });

    } catch (error) {
        console.error('Toggle product status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update product status'
        });
    }
};

// Search products across all shops
exports.searchProducts = async (req, res) => {
    try {
        const {
            q: query,
            page = 1,
            limit = 20,
            category,
            minPrice,
            maxPrice,
            sortBy = 'relevance',
            lat,
            lng,
            radius = 10
        } = req.query;

        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters'
            });
        }

        const skip = (page - 1) * limit;
        const searchRegex = new RegExp(query.trim(), 'i');

        // Build product filter
        const productFilter = {
            isActive: true,
            $or: [
                { name: searchRegex },
                { description: searchRegex },
                { tags: { $in: [searchRegex] } },
                { category: searchRegex }
            ]
        };

        // Category filter
        if (category) {
            productFilter.category = category;
        }

        // Price filter
        if (minPrice || maxPrice) {
            productFilter.price = {};
            if (minPrice) productFilter.price.$gte = parseFloat(minPrice);
            if (maxPrice) productFilter.price.$lte = parseFloat(maxPrice);
        }

        // Location-based shop filter
        let shopFilter = { isActive: true };
        if (lat && lng) {
            const latitude = parseFloat(lat);
            const longitude = parseFloat(lng);
            const radiusInMeters = parseFloat(radius) * 1000;

            shopFilter['address.coordinates'] = {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [longitude, latitude]
                    },
                    $maxDistance: radiusInMeters
                }
            };
        }

        // Get shops within radius (if location provided)
        const nearbyShops = await Shop.find(shopFilter).select('_id');
        const shopIds = nearbyShops.map(shop => shop._id);

        if (shopIds.length > 0) {
            productFilter.shopId = { $in: shopIds };
        }

        // Build sort
        let sort = {};
        if (sortBy === 'price_low') {
            sort.price = 1;
        } else if (sortBy === 'price_high') {
            sort.price = -1;
        } else if (sortBy === 'name') {
            sort.name = 1;
        } else {
            sort.createdAt = -1; // Default relevance by newest
        }

        const products = await Product.find(productFilter)
            .populate('shopId', 'name address category rating')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Product.countDocuments(productFilter);

        // Add distance to products if location provided
        const productsWithDistance = products.map(product => {
            let distance = null;
            if (lat && lng && product.shopId.address.coordinates) {
                const shop = product.shopId;
                distance = calculateDistance(
                    parseFloat(lat), parseFloat(lng),
                    shop.address.coordinates.lat, shop.address.coordinates.lng
                );
            }

            return {
                ...product.toObject(),
                distance: distance ? Math.round(distance * 10) / 10 : null
            };
        });

        res.json({
            success: true,
            data: {
                products: productsWithDistance,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                },
                query: query.trim()
            }
        });

    } catch (error) {
        console.error('Search products error:', error);
        res.status(500).json({
            success: false,
            message: 'Search failed'
        });
    }
};

// Helper function to calculate distance between two points
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}