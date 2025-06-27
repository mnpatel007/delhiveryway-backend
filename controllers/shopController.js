const Shop = require('../models/Shop');

exports.createShop = async (req, res) => {
    try {
        const { name, description, location } = req.body;
        const shop = await Shop.create({
            vendorId: req.user.id,
            name,
            description,
            location
        });
        res.status(201).json(shop);
    } catch (err) {
        res.status(500).json({ message: 'Failed to create shop', error: err.message });
    }
};

exports.getVendorShops = async (req, res) => {
    try {
        const shops = await Shop.find({ vendorId: req.user.id });
        res.status(200).json(shops);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch shops', error: err.message });
    }
};

exports.getAllShops = async (req, res) => {
    try {
        const shops = await Shop.find();
        res.status(200).json(shops);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch all shops', error: err.message });
    }
};

exports.getShopById = async (req, res) => {
    try {
        const shop = await Shop.findById(req.params.id);
        res.status(200).json(shop);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch shop', error: err.message });
    }
};
