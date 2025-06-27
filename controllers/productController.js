const Product = require('../models/Product');

exports.createProduct = async (req, res) => {
    try {
        const { shopId, name, description, price } = req.body;
        const product = await Product.create({ shopId, name, description, price });
        res.status(201).json(product);
    } catch (err) {
        res.status(500).json({ message: 'Failed to create product', error: err.message });
    }
};

exports.getProductsByShop = async (req, res) => {
    try {
        const products = await Product.find({ shopId: req.params.shopId });
        res.status(200).json(products);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch products', error: err.message });
    }
};

exports.getVendorProducts = async (req, res) => {
    try {
        const products = await Product.find().populate('shopId');
        const vendorProducts = products.filter(p => p.shopId?.vendorId?.toString() === req.user.id);
        res.status(200).json(vendorProducts);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch vendor products', error: err.message });
    }
};
