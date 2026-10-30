const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * A one-time code that binds a vendor account to a shop.
 *
 * An admin issues a code for a specific shop and it is emailed to the vendor.
 * The vendor enters it once; their account is then bound to that shop for good
 * and the code is spent. Only a hash is stored, so reading the collection does
 * not hand anyone a working code.
 */
const shopClaimCodeSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },

    // SHA-256 of the plaintext code. The plaintext is shown to the admin and
    // emailed to the vendor at issue time, then never recoverable.
    codeHash: { type: String, required: true, unique: true },

    // Who it was issued for, so an admin can see it on the vendor's row.
    issuedToEmail: { type: String, required: true, lowercase: true, trim: true },
    issuedToUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    issuedBy: { type: String, default: 'admin' },

    expiresAt: { type: Date, required: true, index: true },

    usedAt: { type: Date, default: null },
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    revokedAt: { type: Date, default: null },

    // Failed redemption attempts, to blunt brute-forcing of a short code.
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

shopClaimCodeSchema.index({ issuedToEmail: 1, usedAt: 1 });

const hashCode = (code) =>
  crypto.createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');

/**
 * Human-friendly code: 8 characters, no look-alikes (no O/0, I/1, etc), drawn
 * from a CSPRNG without modulo bias.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, so 1 byte -> 5 bits cleanly
const generateCode = () => {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out.slice(0, 4) + '-' + out.slice(4);
};

shopClaimCodeSchema.statics.hashCode = hashCode;
shopClaimCodeSchema.statics.generateCode = generateCode;

/** The live (unused, unrevoked, unexpired) code for a vendor, if any. */
shopClaimCodeSchema.statics.findLiveFor = function (userId) {
  return this.findOne({
    issuedToUserId: userId,
    usedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).populate('shopId', 'name');
};

module.exports = mongoose.model('ShopClaimCode', shopClaimCodeSchema);
