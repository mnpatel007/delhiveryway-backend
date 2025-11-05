const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    // Delivery fee settings
    deliverySettings: {
        feePerKm: {
            type: Number,
            default: 10, // Default fee per 500m outside campus
            min: [0, 'Fee per 500m cannot be negative'],
            max: [100, 'Fee per 500m cannot exceed ₹100']
        },
        campusRadius: {
            type: Number,
            default: 2000, // Campus radius in meters (2km)
            min: [500, 'Campus radius must be at least 500m'],
            max: [10000, 'Campus radius cannot exceed 10km']
        },
        campusCoordinates: {
            lat: {
                type: Number,
                default: 22.5201 // IIT Indore latitude
            },
            lng: {
                type: Number,
                default: 75.9220 // IIT Indore longitude
            }
        }
    },

    // Other global settings can be added here
    generalSettings: {
        platformName: {
            type: String,
            default: 'DelhiveryWay'
        },
        supportEmail: {
            type: String,
            default: 'support@delhiveryway.com'
        },
        supportPhone: {
            type: String,
            default: '+91-9999999999'
        }
    },

    // Order settings
    orderSettings: {
        maxOrderValue: {
            type: Number,
            default: 10000 // Maximum order value
        },
        minOrderValue: {
            type: Number,
            default: 50 // Minimum order value
        }
    }
}, {
    timestamps: true
});

// Ensure only one settings document exists
settingsSchema.statics.getSettings = async function () {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

// Update settings
settingsSchema.statics.updateSettings = async function (updates) {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create(updates);
    } else {
        Object.assign(settings, updates);
        await settings.save();
    }
    return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);