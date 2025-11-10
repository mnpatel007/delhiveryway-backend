const mongoose = require('mongoose');

const personalShopperSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    phone: {
        type: String,
        required: true
    },
    profilePicture: String,
    isOnline: {
        type: Boolean,
        default: false
    },
    currentLocation: {
        latitude: Number,
        longitude: Number,
        address: String,
        lastUpdated: {
            type: Date,
            default: Date.now
        }
    },
    rating: {
        average: {
            type: Number,
            default: 5.0,
            min: 1,
            max: 5
        },
        count: {
            type: Number,
            default: 0
        }
    },
    stats: {
        totalOrders: {
            type: Number,
            default: 0
        },
        completedOrders: {
            type: Number,
            default: 0
        },
        cancelledOrders: {
            type: Number,
            default: 0
        },
        totalEarnings: {
            type: Number,
            default: 0
        },
        thisMonthEarnings: {
            type: Number,
            default: 0
        },
        avgDeliveryTime: {
            type: Number,
            default: 0
        }
    },
    availability: {
        isAvailable: {
            type: Boolean,
            default: true
        },
        workingHours: {
            start: {
                type: String,
                default: '09:00'
            },
            end: {
                type: String,
                default: '21:00'
            }
        },
        workingDays: [{
            type: String,
            enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        }]
    },
    verification: {
        isVerified: {
            type: Boolean,
            default: false
        },
        documents: {
            idProof: String,
            photo: String,
            bankDetails: String
        },
        verifiedAt: Date
    },
    bankDetails: {
        accountNumber: String,
        ifscCode: String,
        accountHolderName: String,
        upiId: String
    },
    preferences: {
        maxOrderValue: {
            type: Number,
            default: 5000
        },
        preferredAreas: [String],
        vehicleType: {
            type: String,
            enum: ['bike', 'car', 'bicycle', 'walking'],
            default: 'bike'
        }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('PersonalShopper', personalShopperSchema);