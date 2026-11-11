const mongoose = require('mongoose');

/**
 * A shop-wide "spend this much, get this free" offer.
 *
 * Two shapes, both set up by the shop itself:
 *   auto   - the shop names one item, and it is added to the order free once
 *            the subtotal reaches the threshold.
 *   choice - the shop names several items and the customer picks one.
 *
 * The gift is a real line item priced at zero, so the shop sees it on the
 * order and packs it, while the subtotal, taxes and commission are all
 * untouched by it.
 */
const shopOfferSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Give the offer a name customers will understand'],
      trim: true,
      maxlength: [120, 'Offer name cannot exceed 120 characters'],
    },
    minSubtotal: {
      type: Number,
      required: [true, 'An offer needs a spend threshold'],
      min: [1, 'The threshold must be at least 1'],
    },
    mode: {
      type: String,
      enum: {
        values: ['auto', 'choice'],
        message: 'An offer is either auto or choice',
      },
      default: 'auto',
    },
    // One product for auto, several for choice. Always products of this shop.
    rewardProductIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    rewardQuantity: {
      type: Number,
      default: 1,
      min: [1, 'The free quantity must be at least 1'],
      max: [10, 'The free quantity cannot exceed 10'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Bookkeeping, so a shop can see whether an offer is doing anything.
    timesApplied: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

shopOfferSchema.index({ shopId: 1, isActive: 1 });

module.exports = mongoose.model('ShopOffer', shopOfferSchema);
