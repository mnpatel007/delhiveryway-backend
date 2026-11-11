const mongoose = require('mongoose');
const Shop = require('../models/Shop');
const Product = require('../models/Product');
const ShopOffer = require('../models/ShopOffer');
const { listOffersForShop } = require('../utils/shopOffers');

const MAX_OFFERS_PER_SHOP = 10;
const MAX_CHOICES = 8;

const resolveShop = async (vendorId) => Shop.findOne({ vendorId }).select('_id name');

const noShop = (res) =>
  res.status(404).json({
    success: false,
    message: 'No shop is linked to your account yet. Enter your access code first.',
  });

const bad = (res, message) => res.status(400).json({ success: false, message });

/**
 * Pull the offer fields out of a request body and check them, including that
 * every reward product really belongs to this shop. Returns either
 * { error } or { value }.
 */
const readOfferInput = async (body, shopId, { partial = false } = {}) => {
  const out = {};

  if (body.title !== undefined || !partial) {
    const title = String(body.title || '').trim();
    if (title.length < 3) {
      return { error: 'Give the offer a name of at least 3 characters.' };
    }
    out.title = title.slice(0, 120);
  }

  if (body.minSubtotal !== undefined || !partial) {
    const min = Number(body.minSubtotal);
    if (!Number.isFinite(min) || min < 1) {
      return { error: 'Enter the amount a customer has to spend, as a number above zero.' };
    }
    out.minSubtotal = Math.round(min);
  }

  if (body.mode !== undefined || !partial) {
    const mode = body.mode === 'choice' ? 'choice' : 'auto';
    out.mode = mode;
  }

  if (body.rewardQuantity !== undefined) {
    const qty = Number(body.rewardQuantity);
    if (!Number.isFinite(qty) || qty < 1 || qty > 10) {
      return { error: 'The free quantity has to be between 1 and 10.' };
    }
    out.rewardQuantity = Math.round(qty);
  }

  if (body.rewardProductIds !== undefined || !partial) {
    const raw = Array.isArray(body.rewardProductIds) ? body.rewardProductIds : [];
    const ids = [...new Set(raw.map(String))].filter((id) => mongoose.isValidObjectId(id));

    if (!ids.length) {
      return { error: 'Choose at least one item to give away.' };
    }
    if (ids.length > MAX_CHOICES) {
      return { error: `An offer can list at most ${MAX_CHOICES} items to choose from.` };
    }

    // The items have to be this shop's own, and still on the menu.
    const owned = await Product.find({ _id: { $in: ids }, shopId, isActive: true }).select('_id');
    if (owned.length !== ids.length) {
      return { error: 'One of those items is not on your menu any more. Pick it again.' };
    }

    out.rewardProductIds = ids;
  }

  const mode = out.mode;
  const count = out.rewardProductIds?.length;
  if (mode === 'auto' && count !== undefined && count !== 1) {
    return { error: 'An automatic offer gives away exactly one item. Pick just one.' };
  }
  if (mode === 'choice' && count !== undefined && count < 2) {
    return { error: 'A "let the customer choose" offer needs at least two items.' };
  }

  return { value: out };
};

// GET /shop-owner/offers
exports.listMyOffers = async (req, res) => {
  try {
    const shop = await resolveShop(req.user._id);
    if (!shop) return noShop(res);

    const offers = await listOffersForShop(shop._id, { activeOnly: false });
    res.json({ success: true, data: { offers, maxOffers: MAX_OFFERS_PER_SHOP } });
  } catch (error) {
    console.error('List offers error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// POST /shop-owner/offers
exports.createOffer = async (req, res) => {
  try {
    const shop = await resolveShop(req.user._id);
    if (!shop) return noShop(res);

    const existing = await ShopOffer.countDocuments({ shopId: shop._id });
    if (existing >= MAX_OFFERS_PER_SHOP) {
      return bad(
        res,
        `You already have ${MAX_OFFERS_PER_SHOP} offers. Remove one before adding another.`
      );
    }

    const { error, value } = await readOfferInput(req.body, shop._id);
    if (error) return bad(res, error);

    const offer = await ShopOffer.create({
      ...value,
      shopId: shop._id,
      isActive: req.body.isActive === false ? false : true,
    });

    const [shaped] = await listOffersForShop(shop._id, { activeOnly: false }).then((all) =>
      all.filter((o) => String(o._id) === String(offer._id))
    );

    res.status(201).json({
      success: true,
      message: 'Offer created. Customers will see it on your shop page.',
      data: shaped,
    });
  } catch (error) {
    console.error('Create offer error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// PATCH /shop-owner/offers/:id
exports.updateOffer = async (req, res) => {
  try {
    const shop = await resolveShop(req.user._id);
    if (!shop) return noShop(res);

    const offer = await ShopOffer.findOne({ _id: req.params.id, shopId: shop._id });
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found.' });
    }

    // Merge first, so the auto/choice item-count rule is checked against what
    // the offer will actually look like rather than against the patch alone.
    const merged = {
      title: req.body.title ?? offer.title,
      minSubtotal: req.body.minSubtotal ?? offer.minSubtotal,
      mode: req.body.mode ?? offer.mode,
      rewardQuantity: req.body.rewardQuantity ?? offer.rewardQuantity,
      rewardProductIds: req.body.rewardProductIds ?? offer.rewardProductIds.map(String),
    };

    const { error, value } = await readOfferInput(merged, shop._id);
    if (error) return bad(res, error);

    Object.assign(offer, value);
    if (req.body.isActive !== undefined) offer.isActive = Boolean(req.body.isActive);
    await offer.save();

    const [shaped] = await listOffersForShop(shop._id, { activeOnly: false }).then((all) =>
      all.filter((o) => String(o._id) === String(offer._id))
    );

    res.json({ success: true, message: 'Offer updated.', data: shaped });
  } catch (error) {
    console.error('Update offer error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// DELETE /shop-owner/offers/:id
exports.deleteOffer = async (req, res) => {
  try {
    const shop = await resolveShop(req.user._id);
    if (!shop) return noShop(res);

    const offer = await ShopOffer.findOneAndDelete({ _id: req.params.id, shopId: shop._id });
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found.' });
    }

    res.json({ success: true, message: `"${offer.title}" removed.` });
  } catch (error) {
    console.error('Delete offer error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// GET /shops/:id/offers — public, this is what the cart reads.
exports.getPublicOffers = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.json({ success: true, data: { offers: [] } });
    }

    const offers = await listOffersForShop(req.params.id, { activeOnly: true });
    res.json({
      success: true,
      data: {
        // An offer with no usable reward left is not shown, because it cannot
        // be honoured.
        offers: offers.filter((o) => o.usable),
      },
    });
  } catch (error) {
    console.error('Public offers error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
