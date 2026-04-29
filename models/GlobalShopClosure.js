const mongoose = require('mongoose');

const globalShopClosureSchema = new mongoose.Schema({
    singletonKey: {
        type: String,
        default: 'global',
        unique: true,
        index: true
    },
    isClosed: {
        type: Boolean,
        default: false
    },
    mode: {
        type: String,
        enum: ['until_time', 'next_day', 'manual'],
        default: null
    },
    reopenAt: {
        type: Date,
        default: null
    },
    closedAt: {
        type: Date,
        default: null
    },
    closedBy: {
        type: String,
        default: null
    },
    reason: {
        type: String,
        default: ''
    }
}, { timestamps: true });

// Resolve and auto-clear expired closures. Returns the active closure doc or null.
globalShopClosureSchema.statics.getActiveClosure = async function () {
    let doc = await this.findOne({ singletonKey: 'global' });
    if (!doc || !doc.isClosed) return null;

    if (doc.mode !== 'manual' && doc.reopenAt && Date.now() >= new Date(doc.reopenAt).getTime()) {
        doc.isClosed = false;
        doc.mode = null;
        doc.reopenAt = null;
        doc.closedAt = null;
        doc.closedBy = null;
        doc.reason = '';
        await doc.save();
        return null;
    }
    return doc;
};

module.exports = mongoose.model('GlobalShopClosure', globalShopClosureSchema);
