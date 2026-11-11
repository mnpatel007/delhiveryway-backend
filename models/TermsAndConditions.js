const mongoose = require('mongoose');

const termsAndConditionsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Terms title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    content: {
      type: String,
      required: [true, 'Terms content is required'],
      trim: true,
    },
    version: {
      type: String,
      required: [true, 'Version is required'],
      trim: true,
      default: '1.0',
    },
    // Who these terms are for. Customers and shop partners sign different
    // agreements, so each audience has its own active version and its own
    // acceptance record. Documents written before this field existed are
    // customer terms, which AUDIENCE_FILTER below accounts for.
    audience: {
      type: String,
      enum: {
        values: ['customer', 'vendor'],
        message: 'Terms are either for customers or for vendors',
      },
      default: 'customer',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isTesting: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    acceptedBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        acceptedAt: {
          type: Date,
          default: Date.now,
        },
        ipAddress: {
          type: String,
          default: null,
        },
        userAgent: {
          type: String,
          default: null,
        },
      },
    ],
    acceptanceCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
termsAndConditionsSchema.index({ isActive: 1, createdAt: -1 });
termsAndConditionsSchema.index({ audience: 1, isActive: 1, createdAt: -1 });
termsAndConditionsSchema.index({ 'acceptedBy.userId': 1 });

// Method to check if user has accepted current terms
termsAndConditionsSchema.methods.hasUserAccepted = function (userId) {
  return this.acceptedBy.some((acceptance) => acceptance.userId.toString() === userId.toString());
};

/**
 * Match one audience. Terms created before the audience field existed carry
 * no value at all, and those are the customer terms, so 'customer' has to
 * match a missing field as well as an explicit one. This keeps the live
 * customer terms working without a migration.
 */
termsAndConditionsSchema.statics.audienceFilter = function (audience = 'customer') {
  if (audience === 'vendor') return { audience: 'vendor' };
  return { $or: [{ audience: 'customer' }, { audience: { $exists: false } }] };
};

// Static method to get current active terms for one audience
termsAndConditionsSchema.statics.getCurrentTerms = function (audience = 'customer') {
  return this.findOne({
    isActive: true,
    ...this.audienceFilter(audience),
  }).sort({ createdAt: -1 });
};

// Method to add user acceptance
termsAndConditionsSchema.methods.addAcceptance = function (
  userId,
  ipAddress = null,
  userAgent = null
) {
  // Check if user already accepted
  if (!this.hasUserAccepted(userId)) {
    this.acceptedBy.push({
      userId,
      acceptedAt: new Date(),
      ipAddress,
      userAgent,
    });
    this.acceptanceCount = this.acceptedBy.length;
  }
  return this.save();
};

module.exports = mongoose.model('TermsAndConditions', termsAndConditionsSchema);
