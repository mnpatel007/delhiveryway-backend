const mongoose = require('mongoose');

/**
 * A shop's menu PDF, held in the database rather than on disk.
 *
 * Render gives the backend an ephemeral filesystem: anything written to
 * uploads/ is gone the next time the service deploys or restarts. A menu PDF
 * has to survive that, and it is one small file per shop, so the bytes live
 * here instead. The Shop document keeps only a lightweight reference, so
 * listing shops never drags the blobs along.
 */
const shopMenuFileSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      unique: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    contentType: {
      type: String,
      required: true,
      default: 'application/pdf',
    },
    size: {
      type: Number,
      required: true,
      min: 1,
    },
    data: {
      type: Buffer,
      required: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ShopMenuFile', shopMenuFileSchema);
