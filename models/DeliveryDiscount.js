const mongoose = require('mongoose');

const deliveryDiscountSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed', 'free'],
        required: [true, 'Discount type is required']
    },
    discountValue: {
        type: Number,
        required: function () { return this.discountType !== 'free'; },
        min: 0
    },
    minOrderValue: {
        type: Number,
        default: 0,
        min: 0
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        required: [true, 'End date is required']
    },
    isActive: {
        type: Boolean,
        default: true
    },
    description: {
        type: String,
        trim: true
    },
    shopId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shop',
        default: null // null means applies to all shops
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Index for efficient querying of active discounts
deliveryDiscountSchema.index({ isActive: 1, startDate: 1, endDate: 1, shopId: 1 });

// Method to check if discount is currently valid
deliveryDiscountSchema.methods.isValid = function () {
    const now = new Date();
    return this.isActive && now >= this.startDate && now <= this.endDate;
};

// Static method to find the best applicable discount
deliveryDiscountSchema.statics.findBestDiscount = async function (originalFee, orderValue = 0, shopId = null) {
    const now = new Date();

    // Build query
    const query = {
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
        minOrderValue: { $lte: orderValue }
    };

    // If shopId is provided, find discounts for this shop OR global discounts (shopId: null)
    if (shopId) {
        // Ensure shopId is an ObjectId
        let shopObjectId = shopId;
        try {
            if (typeof shopId === 'string') {
                shopObjectId = new mongoose.Types.ObjectId(shopId);
            }
        } catch (e) {
            console.error('Invalid shopId provided to findBestDiscount:', shopId);
            // If invalid ObjectId, just return global discounts, don't crash
            shopObjectId = null;
        }

        if (shopObjectId) {
            query.$or = [
                { shopId: shopObjectId },
                { shopId: null },
                { shopId: { $exists: false } } // For backward compatibility
            ];
        } else {
            query.shopId = null;
        }

    } else {
        // If no shopId provided (shouldn't happen for real orders but maybe for general estimates),
        // only return global discounts
        query.shopId = null;
    }

    const activeDiscounts = await this.find(query);

    let bestDiscount = null;
    let discountAmount = 0;

    for (const discount of activeDiscounts) {
        let currentDiscountAmount = 0;

        if (discount.discountType === 'free') {
            currentDiscountAmount = originalFee;
        } else if (discount.discountType === 'fixed') {
            currentDiscountAmount = discount.discountValue;
        } else if (discount.discountType === 'percentage') {
            currentDiscountAmount = (originalFee * discount.discountValue) / 100;
        }

        // Cap discount at original fee (cannot be negative)
        currentDiscountAmount = Math.min(currentDiscountAmount, originalFee);

        if (currentDiscountAmount > discountAmount) {
            discountAmount = currentDiscountAmount;
            bestDiscount = discount;
        }
    }

    return {
        finalFee: originalFee - discountAmount,
        originalFee,
        discountAmount,
        discountApplied: bestDiscount
    };
};

module.exports = mongoose.model('DeliveryDiscount', deliveryDiscountSchema);
