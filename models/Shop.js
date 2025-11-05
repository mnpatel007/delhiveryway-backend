const mongoose = require('mongoose');
const { getCurrentISTTime, getCurrentISTTimeString, getCurrentISTDay } = require('../utils/timeUtils');

const shopSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Shop name is required'],
        trim: true,
        minlength: [2, 'Shop name must be at least 2 characters'],
        maxlength: [100, 'Shop name cannot exceed 100 characters']
    },
    description: {
        type: String,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Vendor ID is required']
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: {
            values: ['grocery', 'pharmacy', 'electronics', 'clothing', 'restaurant', 'bakery', 'books', 'sports', 'beauty', 'home', 'other'],
            message: 'Invalid category'
        }
    },
    address: {
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
        zipCode: {
            type: String,
            match: [/^\d{6}$/, 'Please enter a valid 6-digit zip code']
        },
        coordinates: {
            lat: {
                type: Number,
                required: [true, 'Latitude is required'],
                min: [-90, 'Latitude must be between -90 and 90'],
                max: [90, 'Latitude must be between -90 and 90']
            },
            lng: {
                type: Number,
                required: [true, 'Longitude is required'],
                min: [-180, 'Longitude must be between -180 and 180'],
                max: [180, 'Longitude must be between -180 and 180']
            }
        }
    },
    contact: {
        phone: {
            type: String,
            match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
        },
        email: {
            type: String,
            match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
        },
        website: String
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
    operatingHours: {
        monday: {
            open: { type: String, default: '09:00' },
            close: { type: String, default: '21:00' },
            closed: { type: Boolean, default: false }
        },
        tuesday: {
            open: { type: String, default: '09:00' },
            close: { type: String, default: '21:00' },
            closed: { type: Boolean, default: false }
        },
        wednesday: {
            open: { type: String, default: '09:00' },
            close: { type: String, default: '21:00' },
            closed: { type: Boolean, default: false }
        },
        thursday: {
            open: { type: String, default: '09:00' },
            close: { type: String, default: '21:00' },
            closed: { type: Boolean, default: false }
        },
        friday: {
            open: { type: String, default: '09:00' },
            close: { type: String, default: '21:00' },
            closed: { type: Boolean, default: false }
        },
        saturday: {
            open: { type: String, default: '09:00' },
            close: { type: String, default: '21:00' },
            closed: { type: Boolean, default: false }
        },
        sunday: {
            open: { type: String, default: '10:00' },
            close: { type: String, default: '20:00' },
            closed: { type: Boolean, default: false }
        }
    },
    rating: {
        average: {
            type: Number,
            default: 4.0,
            min: [1, 'Rating must be at least 1'],
            max: [5, 'Rating cannot exceed 5']
        },
        count: {
            type: Number,
            default: 0,
            min: [0, 'Rating count cannot be negative']
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isVisible: {
        type: Boolean,
        default: true
    },
    inquiryAvailableTime: {
        type: Number,
        default: 15, // minutes after which customers can inquire
        min: [5, 'Inquiry time must be at least 5 minutes'],
        max: [120, 'Inquiry time cannot exceed 120 minutes']
    },
    tags: [{
        type: String,
        trim: true,
        maxlength: [20, 'Tag cannot exceed 20 characters']
    }],
    deliveryFee: {
        type: Number,
        default: 0,
        min: [0, 'Delivery fee cannot be negative']
    },
    minOrderValue: {
        type: Number,
        default: 0,
        min: [0, 'Minimum order value cannot be negative']
    },
    maxOrderValue: {
        type: Number,
        default: 10000,
        min: [0, 'Maximum order value cannot be negative']
    },
    preparationTime: {
        type: Number,
        default: 30, // minutes
        min: [5, 'Preparation time must be at least 5 minutes']
    },
    totalOrders: {
        type: Number,
        default: 0
    },
    totalRevenue: {
        type: Number,
        default: 0
    },
    hasTax: {
        type: Boolean,
        default: false
    },
    taxRate: {
        type: Number,
        default: 5,
        min: [0, 'Tax rate cannot be negative'],
        max: [100, 'Tax rate cannot exceed 100%']
    }
}, {
    timestamps: true
});

// Indexes
shopSchema.index({ vendorId: 1 });
shopSchema.index({ category: 1 });
shopSchema.index({ isActive: 1 });
shopSchema.index({ 'address.coordinates': '2dsphere' });
shopSchema.index({ name: 'text', description: 'text', tags: 'text' });

// Virtual for full address
shopSchema.virtual('fullAddress').get(function () {
    return `${this.address.street}, ${this.address.city}, ${this.address.state} ${this.address.zipCode}`;
});

// Method to check if shop is open
shopSchema.methods.isOpenNow = function () {
    try {
        // Get current time in IST (Indian Standard Time)
        const day = getCurrentISTDay();
        const currentTime = getCurrentISTTimeString();

        // Check if operating hours exist
        if (!this.operatingHours || typeof this.operatingHours !== 'object') {
            return true; // Default to open if no operating hours defined
        }

        const todayHours = this.operatingHours[day];
        if (!todayHours || todayHours.closed) return false;

        // Ensure open and close times exist
        if (!todayHours.open || !todayHours.close) return true;

        return currentTime >= todayHours.open && currentTime <= todayHours.close;
    } catch (error) {
        console.error('Error in isOpenNow method:', error);
        return true; // Default to open if there's an error
    }
};

// Method to calculate distance from coordinates
shopSchema.methods.distanceFrom = function (lat, lng) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat - this.address.coordinates.lat) * Math.PI / 180;
    const dLng = (lng - this.address.coordinates.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(this.address.coordinates.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

module.exports = mongoose.model('Shop', shopSchema);