const mongoose = require('mongoose');

const termsAndConditionsSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Terms title is required'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    content: {
        type: String,
        required: [true, 'Terms content is required'],
        trim: true
    },
    version: {
        type: String,
        required: [true, 'Version is required'],
        trim: true,
        default: '1.0'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    acceptedBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        acceptedAt: {
            type: Date,
            default: Date.now
        },
        ipAddress: {
            type: String,
            default: null
        },
        userAgent: {
            type: String,
            default: null
        }
    }],
    acceptanceCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for efficient queries
termsAndConditionsSchema.index({ isActive: 1, createdAt: -1 });
termsAndConditionsSchema.index({ 'acceptedBy.userId': 1 });

// Method to check if user has accepted current terms
termsAndConditionsSchema.methods.hasUserAccepted = function (userId) {
    return this.acceptedBy.some(acceptance =>
        acceptance.userId.toString() === userId.toString()
    );
};

// Static method to get current active terms
termsAndConditionsSchema.statics.getCurrentTerms = function () {
    return this.findOne({ isActive: true }).sort({ createdAt: -1 });
};

// Method to add user acceptance
termsAndConditionsSchema.methods.addAcceptance = function (userId, ipAddress = null, userAgent = null) {
    // Check if user already accepted
    if (!this.hasUserAccepted(userId)) {
        this.acceptedBy.push({
            userId,
            acceptedAt: new Date(),
            ipAddress,
            userAgent
        });
        this.acceptanceCount = this.acceptedBy.length;
    }
    return this.save();
};

module.exports = mongoose.model('TermsAndConditions', termsAndConditionsSchema);