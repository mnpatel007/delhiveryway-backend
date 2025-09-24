const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Notice title is required'],
        trim: true,
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    message: {
        type: String,
        required: [true, 'Notice message is required'],
        trim: true,
        maxlength: [500, 'Message cannot exceed 500 characters']
    },
    type: {
        type: String,
        enum: ['info', 'warning', 'success', 'error'],
        default: 'info'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        default: null // null means no end date
    },
    refreshInterval: {
        type: Number,
        default: null, // null means no refresh, number in minutes
        min: [1, 'Refresh interval must be at least 1 minute']
    },
    lastRefreshed: {
        type: Date,
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and string for system admin
        ref: 'User',
        required: true
    },
    viewedBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        viewedAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

// Index for efficient queries
noticeSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
noticeSchema.index({ priority: 1, createdAt: -1 });

// Method to check if notice is currently active
noticeSchema.methods.isCurrentlyActive = function () {
    const now = new Date();
    return this.isActive &&
        this.startDate <= now &&
        (!this.endDate || this.endDate >= now);
};

// Static method to get active notices
noticeSchema.statics.getActiveNotices = function () {
    const now = new Date();
    return this.find({
        isActive: true,
        startDate: { $lte: now },
        $or: [
            { endDate: null },
            { endDate: { $gte: now } }
        ]
    }).sort({ priority: -1, createdAt: -1 });
};

module.exports = mongoose.model('Notice', noticeSchema);