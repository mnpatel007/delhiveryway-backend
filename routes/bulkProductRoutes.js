const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { detectUnit, detectUnitsForProducts, calculateConfidence } = require('../utils/unitDetection');
const { adminProtect } = require('../middleware/authMiddleware');

// Bulk upload products
router.post('/bulk-upload', adminProtect, async (req, res) => {
    try {
        const { products } = req.body;

        if (!products || !Array.isArray(products) || products.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Products array is required and cannot be empty'
            });
        }

        console.log(`🚀 Starting bulk upload of ${products.length} products`);

        const results = {
            total: products.length,
            successCount: 0,
            failureCount: 0,
            successes: [],
            failures: []
        };

        // Process products in batches to avoid overwhelming the database
        const batchSize = 10;
        const batches = [];
        for (let i = 0; i < products.length; i += batchSize) {
            batches.push(products.slice(i, i + batchSize));
        }

        for (const batch of batches) {
            const batchPromises = batch.map(async (productData, index) => {
                try {
                    // Validate required fields
                    if (!productData.name || !productData.name.trim()) {
                        throw new Error('Product name is required');
                    }

                    if (!productData.price || productData.price <= 0) {
                        throw new Error('Valid price is required');
                    }

                    if (!productData.shopId) {
                        throw new Error('Shop ID is required');
                    }

                    // Detect unit if not provided or enhance existing unit
                    let finalUnit = productData.unit || 'piece';
                    let unitConfidence = 60;

                    if (productData.name) {
                        const detectedUnit = detectUnit(productData.name);
                        finalUnit = detectedUnit || productData.unit || 'piece';
                        unitConfidence = calculateConfidence(productData.name);
                    }

                    // Prepare product data with all required fields
                    const productToCreate = {
                        name: productData.name.trim(),
                        description: productData.description || '.',
                        shopId: productData.shopId,
                        category: productData.category || 'General Items',
                        price: parseFloat(productData.price),
                        originalPrice: productData.originalPrice || parseFloat(productData.price),
                        discount: productData.discount || 0,
                        stockQuantity: productData.stockQuantity || 1000,
                        inStock: productData.inStock !== false,
                        unit: finalUnit,
                        tags: productData.tags || ['Fresh'],
                        isActive: true,
                        featured: false
                    };

                    // Validate unit
                    const allowedUnits = ['piece', 'kg', 'gram', 'liter', 'ml', 'dozen', 'pack', 'box', 'bottle', 'can', 'strip'];
                    if (!allowedUnits.includes(productToCreate.unit)) {
                        productToCreate.unit = 'piece';
                    }

                    // Create the product
                    const newProduct = new Product(productToCreate);
                    const savedProduct = await newProduct.save();

                    console.log(`✅ Created product: ${savedProduct.name} (Unit: ${savedProduct.unit}, Confidence: ${unitConfidence}%)`);

                    results.successCount++;
                    results.successes.push({
                        product: savedProduct,
                        originalData: productData,
                        detectedUnit: finalUnit,
                        unitConfidence
                    });

                    return { success: true, product: savedProduct };

                } catch (error) {
                    console.error(`❌ Failed to create product: ${productData.name || 'Unknown'}`, error.message);

                    results.failureCount++;
                    results.failures.push({
                        product: productData,
                        error: error.message
                    });

                    return { success: false, error: error.message, product: productData };
                }
            });

            // Wait for current batch to complete before processing next batch
            await Promise.all(batchPromises);
        }

        console.log(`🎉 Bulk upload completed: ${results.successCount} success, ${results.failureCount} failures`);

        // Return results
        res.status(200).json({
            success: true,
            message: `Bulk upload completed: ${results.successCount} products created successfully, ${results.failureCount} failed`,
            data: {
                total: results.total,
                successCount: results.successCount,
                failureCount: results.failureCount,
                failures: results.failures.map(f => ({
                    product: f.product,
                    error: f.error
                }))
            }
        });

    } catch (error) {
        console.error('❌ Bulk upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during bulk upload',
            error: error.message
        });
    }
});

// Test unit detection endpoint
router.post('/test-unit-detection', adminProtect, async (req, res) => {
    try {
        const { productNames } = req.body;

        if (!productNames || !Array.isArray(productNames)) {
            return res.status(400).json({
                success: false,
                message: 'Product names array is required'
            });
        }

        const results = productNames.map(name => ({
            name,
            detectedUnit: detectUnit(name),
            confidence: calculateConfidence(name)
        }));

        res.json({
            success: true,
            data: results
        });

    } catch (error) {
        console.error('Unit detection test error:', error);
        res.status(500).json({
            success: false,
            message: 'Error testing unit detection',
            error: error.message
        });
    }
});

// Get unit detection statistics
router.get('/unit-stats', adminProtect, async (req, res) => {
    try {
        const products = await Product.find({}, 'name unit').lean();

        const unitStats = {};
        const detectionAccuracy = [];

        for (const product of products) {
            const detectedUnit = detectUnit(product.name);
            const confidence = calculateConfidence(product.name);

            // Count units
            if (!unitStats[product.unit]) {
                unitStats[product.unit] = 0;
            }
            unitStats[product.unit]++;

            // Track accuracy
            detectionAccuracy.push({
                name: product.name,
                actualUnit: product.unit,
                detectedUnit,
                confidence,
                isAccurate: product.unit === detectedUnit
            });
        }

        const totalProducts = products.length;
        const accurateDetections = detectionAccuracy.filter(d => d.isAccurate).length;
        const accuracyPercentage = totalProducts > 0 ? (accurateDetections / totalProducts * 100).toFixed(2) : 0;

        res.json({
            success: true,
            data: {
                totalProducts,
                accurateDetections,
                accuracyPercentage: parseFloat(accuracyPercentage),
                unitDistribution: unitStats,
                sampleDetections: detectionAccuracy.slice(0, 20)
            }
        });

    } catch (error) {
        console.error('Unit stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting unit statistics',
            error: error.message
        });
    }
});

module.exports = router;