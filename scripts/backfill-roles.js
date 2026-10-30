/**
 * Backfill User.roles from User.role.
 *
 * Safe to run more than once: it only touches accounts that have no roles
 * array yet, and never removes a capability. Run it once per database before
 * deploying the multi-role build.
 *
 *   MONGO_URI='...' node scripts/backfill-roles.js
 *   MONGO_URI='...' node scripts/backfill-roles.js --dry
 */
const mongoose = require('mongoose');

const DRY = process.argv.includes('--dry');

(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const users = mongoose.connection.collection('users');

  const needing = { $or: [{ roles: { $exists: false } }, { roles: { $size: 0 } }] };
  const total = await users.countDocuments({});
  const todo = await users.countDocuments(needing);

  const byRole = await users
    .aggregate([{ $match: needing }, { $group: { _id: '$role', n: { $sum: 1 } } }])
    .toArray();

  console.log('database:        ' + mongoose.connection.name);
  console.log('users:           ' + total);
  console.log('needing backfill:' + todo);
  for (const r of byRole) console.log('   ' + String(r._id).padEnd(10) + r.n);

  if (DRY) {
    console.log('\nDry run — nothing written.');
    await mongoose.disconnect();
    return;
  }

  if (todo === 0) {
    console.log('\nNothing to do.');
    await mongoose.disconnect();
    return;
  }

  // Mongo cannot copy a field into an array in a plain update, so group the
  // work by role and set each bucket in one pass.
  let changed = 0;
  for (const r of byRole) {
    const role = r._id || 'customer';
    const res = await users.updateMany({ ...needing, role: r._id }, { $set: { roles: [role] } });
    changed += res.modifiedCount;
    console.log('  set roles=[' + role + '] on ' + res.modifiedCount);
  }

  const left = await users.countDocuments(needing);
  console.log('\nbackfilled: ' + changed);
  console.log('still missing roles: ' + left);

  await mongoose.disconnect();
})().catch((e) => {
  console.error('ERR ' + e.message);
  process.exit(1);
});
