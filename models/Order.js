const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    },
    name: {
        type: String,
        required: [true, 'Item name is required']
    },
    price: {
        type: Number,
        required: [true, 'Item price is required'],
        min: [0, 'Price cannot be negative']
    },
    quantity: {
        type: Number,
        required: [true, 'Quantity is required'],
        min: [1, 'Quantity must be at least 1']
    },
    notes: String,
    actualPrice: Number, // Price from actual bill
    actualQuantity: Number, // Quantity from actual bill
    unavailable: {
        type: Boolean,
        default: false
    },
    // Shopper revised quantities and availability
    revisedQuantity: Number,
    revisedPrice: Number,
    shopperNotes: String,
    isAvailable: {
        type: Boolean,
        default: true
    }
});

const orderSchema = new mongoose.Schema({
    orderNumber: {
        type: String,
        unique: true,
        required: true
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Customer ID is required']
    },
    personalShopperId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PersonalShopper'
    },
    shopId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shop',
        required: [true, 'Shop ID is required']
    },
    items: {
        type: [orderItemSchema],
        validate: {
            validator: function (items) {
                return items && items.length > 0;
            },
            message: 'Order must have at least one item'
        }
    },
    orderValue: {
        subtotal: {
            type: Number,
            required: [true, 'Subtotal is required'],
            min: [0, 'Subtotal cannot be negative']
        },
        deliveryFee: {
            type: Number,
            default: 0,
            min: [0, 'Delivery fee cannot be negative']
        },
        serviceFee: {
            type: Number,
            default: 0,
            min: [0, 'Service fee cannot be negative']
        },
        taxes: {
            type: Number,
            default: 0,
            min: [0, 'Taxes cannot be negative']
        },
        discount: {
            type: Number,
            default: 0,
            min: [0, 'Discount cannot be negative']
        },
        total: {
            type: Number,
            required: [true, 'Total is required'],
            min: [0, 'Total cannot be negative']
        }
    },
    // Revised order value after shopper editing
    revisedOrderValue: {
        subtotal: Number,
        deliveryFee: Number,
        serviceFee: Number,
        taxes: Number,
        discount: Number,
        total: Number
    },

    deliveryAddress: {
        street: {
            type: String,
            required: [true, 'Street address is required']
        },
        city: {
            type: String,
            required: [true, 'City is required']
        },
        state: {
            type: String,
            required: [true, 'State is required']
        },
        zipCode: String,
        coordinates: {
            lat: {
                type: Number,
                required: [true, 'Delivery latitude is required']
            },
            lng: {
                type: Number,
                required: [true, 'Delivery longitude is required']
            }
        },
        instructions: String,
        contactName: String,
        contactPhone: String
    },

    // Real-time shopper location tracking
    shopperLocation: {
        latitude: {
            type: Number,
            min: -90,
            max: 90
        },
        longitude: {
            type: Number,
            min: -180,
            max: 180
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    },

    status: {
        type: String,
        enum: [
            'pending_shopper',
            'accepted_by_shopper',
            'shopper_at_shop',
            'shopping_in_progress',
            'shopper_revised_order',
            'customer_reviewing_revision',
            'customer_approved_revision',
            'final_shopping',
            'out_for_delivery',
            'delivered',
            'cancelled',
            'refunded'
        ],
        default: 'pending_shopper'
    },
    timeline: [{
        status: {
            type: String,
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        note: String,
        updatedBy: {
            type: String,
            enum: ['customer', 'shopper', 'admin', 'system']
        }
    }],
    payment: {
        method: {
            type: String,
            enum: ['cash', 'online', 'card', 'upi'],
            default: 'cash'
        },
        status: {
            type: String,
            enum: ['pending', 'paid', 'failed', 'refunded', 'partial_refund'],
            default: 'pending'
        },
        transactionId: String,
        paymentIntentId: String, // For Stripe
        refundId: String,
        paidAt: Date,
        refundedAt: Date
    },
    ratings: {
        customerRating: {
            rating: {
                type: Number,
                min: [1, 'Rating must be at least 1'],
                max: [5, 'Rating cannot exceed 5']
            },
            review: String,
            ratedAt: Date
        },
        shopperRating: {
            rating: {
                type: Number,
                min: [1, 'Rating must be at least 1'],
                max: [5, 'Rating cannot exceed 5']
            },
            review: String,
            ratedAt: Date
        }
    },
    estimatedDeliveryTime: Date,
    actualDeliveryTime: Date,
    specialInstructions: String,
    cancellationReason: String,
    cancelledBy: {
        type: String,
        enum: ['customer', 'shopper', 'admin']
    },
    cancelledAt: Date,
    shopperCommission: {
        type: Number,
        default: 0
    },
    deliveryOTP: String,
    priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'urgent'],
        default: 'normal'
    }
}, {
    timestamps: true
});

// Indexes (orderNumber index is created by unique: true)
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ personalShopperId: 1, status: 1 });
orderSchema.index({ shopId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

// Pre-save middleware to generate order number
orderSchema.pre('save', async function (next) {
    if (this.isNew && !this.orderNumber) {
        const count = await this.constructor.countDocuments();
        this.orderNumber = `DW${Date.now()}${String(count + 1).padStart(4, '0')}`;
    }
    next();
});

// Pre-save middleware to add timeline entry
orderSchema.pre('save', function (next) {
    if (this.isModified('status') && !this.isNew) {
        this.timeline.push({
            status: this.status,
            timestamp: new Date(),
            updatedBy: 'system'
        });
    }
    next();
});

// Virtual for order age in hours
orderSchema.virtual('ageInHours').get(function () {
    return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60));
});

// Method to check if order can be cancelled
orderSchema.methods.canBeCancelled = function () {
    const nonCancellableStatuses = ['delivered', 'cancelled', 'refunded'];
    return !nonCancellableStatuses.includes(this.status);
};

// Method to calculate shopper commission - ONLY delivery fee
orderSchema.methods.calculateShopperCommission = function () {
    // Shopper earns ONLY the delivery fee, nothing else
    return this.orderValue?.deliveryFee || this.revisedOrderValue?.deliveryFee || 0;
};

// Method to get current status message
orderSchema.methods.getStatusMessage = function () {
    const messages = {
        'pending_shopper': 'Waiting for a personal shopper to accept your order',
        'accepted_by_shopper': 'A personal shopper has accepted your order',
        'shopper_at_shop': 'Personal shopper has arrived at the shop',
        'shopping_in_progress': 'Personal shopper is checking item availability',
        'shopper_revised_order': 'Personal shopper has revised your order based on availability',
        'customer_reviewing_revision': 'Please review the revised order from your shopper',
        'customer_approved_revision': 'You approved the revised order, shopper will proceed with final shopping',
        'final_shopping': 'Personal shopper is purchasing your final items',
        'out_for_delivery': 'Your order is out for delivery',
        'delivered': 'Your order has been delivered successfully',
        'cancelled': 'Your order has been cancelled',
        'refunded': 'Your order has been refunded'
    };

    return messages[this.status] || 'Unknown status';
};

module.exports = mongoose.model('Order', orderSchema);