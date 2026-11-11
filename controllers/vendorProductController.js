const Shop = require('../models/Shop');
const Product = require('../models/Product');

const UNITS = [
  'piece',
  'kg',
  'gram',
  'liter',
  'ml',
  'dozen',
  'pack',
  'box',
  'bottle',
  'can',
  'strip',
];

// Vendors may only ever touch their own shop. Every handler below resolves the
// shop from the signed-in vendor rather than from anything the client sends,
// so a vendor cannot reach another shop's menu by guessing an id.
const resolveShop = async (vendorId) => Shop.findOne({ vendorId }).select('_id name');

const noShop = (res) =>
  res.status(404).json({
    success: false,
    message: 'No shop is linked to your account yet. Enter your access code first.',
  });

const cleanText = (value, max) => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > max ? text.slice(0, max) : text;
};

const toPrice = (value) => {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return null;
  return Math.round(price * 100) / 100;
};

const toDiscount = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  const discount = Number(value);
  if (!Number.isFinite(discount)) return null;
  return Math.min(100, Math.max(0, Math.round(discount)));
};

// What the portal needs to render a menu row — nothing about platform money.
const toMenuItem = (product) => ({
  _id: product._id,
  name: product.name,
  description: product.description === '.' ? '' : product.description || '',
  category: product.category,
  price: product.price,
  discount: product.discount || 0,
  discountedPrice: product.discountedPrice,
  unit: product.unit,
  inStock: product.inStock,
  isActive: product.isActive,
  totalSold: product.totalSold || 0,
  updatedAt: product.updatedAt,
});

// GET /shop-owner/products
exports.listProducts = async (req, res) => {
  try {
    const shop = await resolveShop(req.user._id);
    if (!shop) return noShop(res);

    const includeHidden = String(req.query.includeHidden || '') === 'true';
    const filter = { shopId: shop._id };
    if (!includeHidden) filter.isActive = true;

    const products = await Product.find(filter).sort({ category: 1, name: 1 });
    const categories = await Product.distinct('category', { shopId: shop._id });

    res.json({
      success: true,
      data: {
        shop: { _id: shop._id, name: shop.name },
        items: products.map(toMenuItem),
        categories: categories.filter(Boolean).sort(),
        units: UNITS,
        counts: {
          total: products.length,
          live: products.filter((p) => p.isActive).length,
          outOfStock: products.filter((p) => p.isActive && !p.inStock).length,
        },
      },
    });
  } catch (error) {
    console.error('Vendor list products error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// POST /shop-owner/products
exports.createProduct = async (req, res) => {
  try {
    const shop = await resolveShop(req.user._id);
    if (!shop) return noShop(res);

    const name = cleanText(req.body.name, 100);
    if (!name || name.length < 2) {
      return res
        .status(400)
        .json({ success: false, message: 'Item name must be at least 2 characters.' });
    }

    const price = toPrice(req.body.price);
    if (price === null) {
      return res.status(400).json({ success: false, message: 'Enter a valid price.' });
    }

    const discount = toDiscount(req.body.discount);
    if (discount === null) {
      return res.status(400).json({ success: false, message: 'Enter a valid discount.' });
    }

    const unit = UNITS.includes(req.body.unit) ? req.body.unit : 'piece';
    const category = cleanText(req.body.category, 50) || 'General Items';

    // The rest of the platform treats '.' as "no description", so keep that
    // convention instead of storing an empty string.
    const description = cleanText(req.body.description, 1000) || '.';

    const duplicate = await Product.findOne({
      shopId: shop._id,
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      isActive: true,
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: `"${duplicate.name}" is already on your menu.`,
      });
    }

    const product = await Product.create({
      name,
      description,
      shopId: shop._id,
      category,
      price,
      discount,
      unit,
      inStock: req.body.inStock === false ? false : true,
      // Stock counts are not tracked for shop menus; a non-zero quantity keeps
      // the shared availability checks happy while inStock stays the real switch.
      stockQuantity: 1000,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: `"${product.name}" added to your menu.`,
      data: toMenuItem(product),
    });
  } catch (error) {
    console.error('Vendor create product error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors)[0]?.message || 'Invalid item details.',
      });
    }
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// PATCH /shop-owner/products/:id
exports.updateProduct = async (req, res) => {
  try {
    const shop = await resolveShop(req.user._id);
    if (!shop) return noShop(res);

    const product = await Product.findOne({ _id: req.params.id, shopId: shop._id });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Item not found on your menu.' });
    }

    if (req.body.name !== undefined) {
      const name = cleanText(req.body.name, 100);
      if (!name || name.length < 2) {
        return res
          .status(400)
          .json({ success: false, message: 'Item name must be at least 2 characters.' });
      }
      product.name = name;
    }

    if (req.body.price !== undefined) {
      const price = toPrice(req.body.price);
      if (price === null) {
        return res.status(400).json({ success: false, message: 'Enter a valid price.' });
      }
      product.price = price;
    }

    if (req.body.discount !== undefined) {
      const discount = toDiscount(req.body.discount);
      if (discount === null) {
        return res.status(400).json({ success: false, message: 'Enter a valid discount.' });
      }
      product.discount = discount;
    }

    if (req.body.category !== undefined) {
      product.category = cleanText(req.body.category, 50) || 'General Items';
    }

    if (req.body.description !== undefined) {
      product.description = cleanText(req.body.description, 1000) || '.';
    }

    if (req.body.unit !== undefined && UNITS.includes(req.body.unit)) {
      product.unit = req.body.unit;
    }

    if (req.body.inStock !== undefined) {
      product.inStock = Boolean(req.body.inStock);
    }

    // Putting a removed item back on the menu.
    if (req.body.isActive !== undefined) {
      product.isActive = Boolean(req.body.isActive);
    }

    await product.save();

    res.json({
      success: true,
      message: `"${product.name}" updated.`,
      data: toMenuItem(product),
    });
  } catch (error) {
    console.error('Vendor update product error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors)[0]?.message || 'Invalid item details.',
      });
    }
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// DELETE /shop-owner/products/:id
// Soft delete only. Past orders reference these documents, so removing the
// record outright would blank out customers' and the shop's own order history.
exports.removeProduct = async (req, res) => {
  try {
    const shop = await resolveShop(req.user._id);
    if (!shop) return noShop(res);

    const product = await Product.findOne({ _id: req.params.id, shopId: shop._id });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Item not found on your menu.' });
    }

    product.isActive = false;
    await product.save();

    res.json({
      success: true,
      message: `"${product.name}" removed from your menu.`,
      data: toMenuItem(product),
    });
  } catch (error) {
    console.error('Vendor remove product error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
