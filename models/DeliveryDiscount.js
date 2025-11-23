const mongoose = require('mongoose');

const deliveryDiscountSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Discount name is required'],
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
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Index for efficient querying of active discounts
deliveryDiscountSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

// Method to check if discount is currently valid
deliveryDiscountSchema.methods.isValid = function () {
    const now = new Date();
    return this.isActive && now >= this.startDate && now <= this.endDate;
};

// Static method to find the best applicable discount
deliveryDiscountSchema.statics.findBestDiscount = async function (originalFee, orderValue = 0) {
    const now = new Date();
    const activeDiscounts = await this.find({
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
        minOrderValue: { $lte: orderValue }
    });

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
