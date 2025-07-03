const Product = require('../models/Product');

// CREATE product
exports.createProduct = async (req, res) => {
    try {
        const product = new Product({ ...req.body, vendorId: req.user.id });
        await product.save();
        res.status(201).json(product);
    } catch (err) {
        console.error('❌ Error creating product:', err.message);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// GET all products for a shop
exports.getProductsByShop = async (req, res) => {
    try {
        const products = await Product.find({ shopId: req.params.id });
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// GET all products for a vendor
exports.getVendorProducts = async (req, res) => {
    try {
        const products = await Product.find({ vendorId: req.user.id }).populate('shopId');

        // Filter out invalid ones (shopId null or not populated)
        const valid = products.filter(p => p.shopId && p.shopId._id);
        res.json(valid);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};



// GET single product by ID (for checkout)
exports.getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('shopId');
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json(product);
    } catch (err) {
        console.error('❌ Error in getProductById:', err.message);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};
