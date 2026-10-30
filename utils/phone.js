/**
 * Whether a stored phone number is one we can actually reach someone on.
 *
 * The User schema requires a 10-digit phone, so accounts that never supplied
 * one - Google sign-ins, chiefly - carry a placeholder instead of an empty
 * field. The customer checkout already refuses these before letting an order
 * through; this is the same rule in one place so the two cannot drift.
 */
const PLACEHOLDERS = ['0000000000', '1111111111', '1234567890', '9999999999'];

const normalisePhone = (phone) => {
  const digits = String(phone ?? '').replace(/\D/g, '');

  // People paste numbers with the country code or a trunk zero. Strip those
  // only when doing so leaves exactly ten digits, so a genuine number that
  // happens to begin 91 is never mangled.
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);

  return digits;
};

const isUsablePhone = (phone) => {
  const digits = normalisePhone(phone);
  return /^[0-9]{10}$/.test(digits) && !PLACEHOLDERS.includes(digits);
};

module.exports = { isUsablePhone, normalisePhone, PLACEHOLDERS };
