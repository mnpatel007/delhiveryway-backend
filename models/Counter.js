const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
    date: {
        type: String, // Format: DDMMYY
        required: true,
        unique: true
    },
    sequence: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Static method to get next sequence number for a date
counterSchema.statics.getNextSequence = async function(dateStr) {
    const counter = await this.findOneAndUpdate(
        { date: dateStr },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true }
    );
    return counter.sequence;
};

module.exports = mongoose.model('Counter', counterSchema);