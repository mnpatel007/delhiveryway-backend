const ShopOffer = require('../models/ShopOffer');
const Product = require('../models/Product');

/**
 * Everything to do with turning a shop's offers into free line items.
 *
 * The rule the backend enforces, regardless of what a client sends: a gift is
 * only ever a product of that same shop, it is priced at zero, and it is added
 * on the subtotal the server computed from the paid items. A client can choose
 * which gift it wants from a 'choice' offer; it cannot choose the price, the
 * product, or whether the threshold was met.
 */

// Reward products a customer could actually receive: on the menu and in stock.
const loadRewardProducts = async (shopId, ids) => {
  if (!ids?.length) return [];
  const products = await Product.find({
    _id: { $in: ids },
    shopId,
    isActive: true,
  });
  return products;
};

/** Offers a shop is currently running, with their reward items spelled out. */
const listOffersForShop = async (shopId, { activeOnly = true } = {}) => {
  const filter = { shopId };
  if (activeOnly) filter.isActive = true;

  const offers = await ShopOffer.find(filter).sort({ minSubtotal: 1 });
  if (!offers.length) return [];

  const allIds = offers.flatMap((o) => o.rewardProductIds || []);
  const products = await loadRewardProducts(shopId, allIds);
  const byId = new Map(products.map((p) => [String(p._id), p]));

  return offers.map((offer) => {
    const rewards = (offer.rewardProductIds || [])
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .map((p) => ({
        _id: p._id,
        name: p.name,
        price: p.price,
        unit: p.unit,
        inStock: p.inStock,
        images: p.images?.length ? [p.images[0]] : [],
      }));

    return {
      _id: offer._id,
      title: offer.title,
      minSubtotal: offer.minSubtotal,
      mode: offer.mode,
      rewardQuantity: offer.rewardQuantity,
      isActive: offer.isActive,
      timesApplied: offer.timesApplied,
      rewards,
      // An offer whose reward items have all been taken off the menu cannot
      // be honoured, so it is not advertised.
      usable: rewards.length > 0,
    };
  });
};

/**
 * Work out the free line items for an order.
 *
 * @param shopId      the shop being ordered from
 * @param subtotal    the server-computed subtotal of the paid items
 * @param selections  [{ offerId, productId }] the customer's picks for
 *                    'choice' offers; ignored for 'auto' offers
 * @returns { giftItems, appliedOffers } — giftItems are ready to push onto
 *          order.items, priced at zero.
 */
const resolveGifts = async (shopId, subtotal, selections = []) => {
  const offers = await ShopOffer.find({ shopId, isActive: true }).sort({ minSubtotal: 1 });
  const qualifying = offers.filter((o) => subtotal >= o.minSubtotal);
  if (!qualifying.length) return { giftItems: [], appliedOffers: [] };

  const products = await loadRewardProducts(
    shopId,
    qualifying.flatMap((o) => o.rewardProductIds || [])
  );
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const chosenFor = new Map(
    (Array.isArray(selections) ? selections : [])
      .filter((s) => s?.offerId && s?.productId)
      .map((s) => [String(s.offerId), String(s.productId)])
  );

  const giftItems = [];
  const appliedOffers = [];

  for (const offer of qualifying) {
    const allowed = (offer.rewardProductIds || []).map(String);
    let productId;

    if (offer.mode === 'choice') {
      const picked = chosenFor.get(String(offer._id));
      // A pick that is not on this offer's list is ignored rather than
      // honoured, and an offer the customer did not choose for is skipped.
      if (!picked || !allowed.includes(picked)) continue;
      productId = picked;
    } else {
      productId = allowed[0];
    }

    const product = byId.get(String(productId));
    if (!product || !product.inStock) continue;

    giftItems.push({
      productId: product._id,
      name: product.name,
      price: 0,
      quantity: offer.rewardQuantity || 1,
      isGift: true,
      giftOfferId: offer._id,
      notes: `Free with this order — ${offer.title}`,
    });

    appliedOffers.push({
      offerId: offer._id,
      title: offer.title,
      minSubtotal: offer.minSubtotal,
      productId: product._id,
      productName: product.name,
      quantity: offer.rewardQuantity || 1,
    });
  }

  return { giftItems, appliedOffers };
};

/** Bump the counters once an order carrying these offers has been saved. */
const recordOfferUse = async (appliedOffers) => {
  if (!appliedOffers?.length) return;
  await ShopOffer.updateMany(
    { _id: { $in: appliedOffers.map((a) => a.offerId) } },
    { $inc: { timesApplied: 1 } }
  );
};

module.exports = { listOffersForShop, resolveGifts, recordOfferUse, loadRewardProducts };
