const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
        minlength: [2, 'Product name must be at least 2 characters'],
        maxlength: [100, 'Product name cannot exceed 100 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    shopId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shop',
        required: [true, 'Shop ID is required']
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        trim: true,
        maxlength: [50, 'Category cannot exceed 50 characters']
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: [0, 'Price cannot be negative']
    },
    originalPrice: {
        type: Number,
        min: [0, 'Original price cannot be negative']
    },
    discount: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative'],
        max: [100, 'Discount cannot exceed 100%']
    },
    images: [{
        type: String,
        validate: {
            validator: function (v) {
                return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(v);
            },
            message: 'Please provide a valid image URL'
        }
    }],
    inStock: {
        type: Boolean,
        default: true
    },
    stockQuantity: {
        type: Number,
        default: 0,
        min: [0, 'Stock quantity cannot be negative']
    },
    unit: {
        type: String,
        default: 'piece',
        enum: {
            values: ['piece', 'kg', 'gram', 'liter', 'ml', 'dozen', 'pack', 'box', 'bottle', 'can', 'strip'],
            message: 'Invalid unit type'
        }
    },
    tags: [{
        type: String,
        trim: true,
        maxlength: [20, 'Tag cannot exceed 20 characters']
    }],
    nutritionalInfo: {
        calories: {
            type: Number,
            min: [0, 'Calories cannot be negative']
        },
        protein: {
            type: Number,
            min: [0, 'Protein cannot be negative']
        },
        carbs: {
            type: Number,
            min: [0, 'Carbs cannot be negative']
        },
        fat: {
            type: Number,
            min: [0, 'Fat cannot be negative']
        },
        fiber: Number,
        sugar: Number,
        sodium: Number
    },
    isActive: {
        type: Boolean,
        default: true
    },
    featured: {
        type: Boolean,
        default: false
    },
    weight: {
        type: Number,
        min: [0, 'Weight cannot be negative']
    },
    dimensions: {
        length: Number,
        width: Number,
        height: Number
    },
    brand: {
        type: String,
        trim: true,
        maxlength: [50, 'Brand name cannot exceed 50 characters']
    },
    sku: {
        type: String,
        trim: true,
        unique: true,
        sparse: true
    },
    barcode: {
        type: String,
        trim: true
    },
    minOrderQuantity: {
        type: Number,
        default: 1,
        min: [1, 'Minimum order quantity must be at least 1']
    },
    maxOrderQuantity: {
        type: Number,
        min: [1, 'Maximum order quantity must be at least 1']
    },
    totalSold: {
        type: Number,
        default: 0,
        min: [0, 'Total sold cannot be negative']
    },
    rating: {
        average: {
            type: Number,
            default: 0,
            min: [0, 'Rating cannot be negative'],
            max: [5, 'Rating cannot exceed 5']
        },
        count: {
            type: Number,
            default: 0,
            min: [0, 'Rating count cannot be negative']
        }
    }
}, {
    timestamps: true
});

// Indexes
productSchema.index({ shopId: 1, isActive: 1 });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ price: 1 });
productSchema.index({ featured: 1, isActive: 1 });
productSchema.index({ totalSold: -1 });

// Compound indexes
productSchema.index({ shopId: 1, category: 1, isActive: 1 });
productSchema.index({ shopId: 1, inStock: 1, isActive: 1 });

// Virtual for discounted price
productSchema.virtual('discountedPrice').get(function () {
    if (this.discount > 0) {
        return Math.round(this.price * (1 - this.discount / 100));
    }
    return this.price;
});

// Virtual for savings amount
productSchema.virtual('savings').get(function () {
    if (this.originalPrice && this.originalPrice > this.price) {
        return this.originalPrice - this.price;
    }
    if (this.discount > 0) {
        return Math.round(this.price * (this.discount / 100));
    }
    return 0;
});

// Pre-save middleware to generate SKU if not provided
productSchema.pre('save', async function (next) {
    if (this.isNew && !this.sku) {
        const count = await this.constructor.countDocuments({ shopId: this.shopId });
        this.sku = `${this.shopId.toString().slice(-6).toUpperCase()}${String(count + 1).padStart(4, '0')}`;
    }

    // Update stock status based on quantity only if not manually set
    if (!this.isModified('inStock')) {
        this.inStock = this.stockQuantity > 0;
    }

    // Validate max order quantity
    if (this.maxOrderQuantity && this.maxOrderQuantity < this.minOrderQuantity) {
        this.maxOrderQuantity = this.minOrderQuantity;
    }

    next();
});

// Method to check if product is available for order
productSchema.methods.isAvailableForOrder = function (quantity = 1) {
    return this.isActive &&
        this.inStock &&
        this.stockQuantity >= quantity &&
        quantity >= this.minOrderQuantity &&
        (!this.maxOrderQuantity || quantity <= this.maxOrderQuantity);
};

// Method to update stock after order
productSchema.methods.updateStock = function (quantitySold) {
    this.stockQuantity = Math.max(0, this.stockQuantity - quantitySold);
    this.totalSold += quantitySold;
    this.inStock = this.stockQuantity > 0;
    return this.save();
};

// Method to add rating
productSchema.methods.addRating = function (rating) {
    const newCount = this.rating.count + 1;
    const newAverage = ((this.rating.average * this.rating.count) + rating) / newCount;

    this.rating.average = Math.round(newAverage * 10) / 10;
    this.rating.count = newCount;

    return this.save();
};

// Transform output
productSchema.methods.toJSON = function () {
    const product = this.toObject({ virtuals: true });
    return product;
};

module.exports = mongoose.model('Product', productSchema);