const Shop = require('../models/Shop');
const Order = require('../models/Order');
const User = require('../models/User');
const mongoose = require('mongoose');
const ShopClaimCode = require('../models/ShopClaimCode');
const { toVendorOrder, shopFacingValue, round2 } = require('../utils/vendorView');

// Helper to get the current shop for the vendor
const getVendorShop = async (vendorId) => {
  return await Shop.findOne({ vendorId });
};

// Get shop owner profile and shop details
exports.getProfile = async (req, res) => {
  try {
    const vendor = await User.findById(req.user._id).select('-password');
    let shop = await Shop.findOne({ vendorId: vendor._id });

    // Fallback: link by contact email only if the shop is unclaimed
    if (!shop && vendor.role === 'vendor') {
      shop = await Shop.findOne({
        $and: [
          {
            $or: [
              { 'contact.email': vendor.email },
              { 'contact.email': vendor.email.toLowerCase() },
            ],
          },
          { $or: [{ vendorId: null }, { vendorId: { $exists: false } }] },
        ],
      });

      if (shop) {
        shop.vendorId = vendor._id;
        await shop.save();
        console.log(`Synced ${vendor.email} with unclaimed shop: ${shop.name}`);
      }
    }

    if (!shop) {
      return res.status(404).json({
        success: false,
        message:
          'No shop associated with this vendor account. Please ensure your shop contact email matches your login email.',
      });
    }

    res.json({
      success: true,
      data: {
        vendor,
        shop,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Update Consent
exports.updateConsent = async (req, res) => {
  try {
    const shop = await getVendorShop(req.user._id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

    shop.consent = {
      hasAgreed: true,
      agreedAt: new Date(),
    };
    await shop.save();

    res.json({ success: true, message: 'Consent updated', data: { shop } });
  } catch (error) {
    console.error('Update consent error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Update Timings
exports.updateTimings = async (req, res) => {
  try {
    const { operatingHours, isTemporarilyClosed } = req.body;
    const shop = await getVendorShop(req.user._id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

    if (operatingHours) shop.operatingHours = operatingHours;
    if (typeof isTemporarilyClosed === 'boolean') shop.isTemporarilyClosed = isTemporarilyClosed;

    await shop.save();

    res.json({ success: true, message: 'Timings updated', data: { shop } });
  } catch (error) {
    console.error('Update timings error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get Commission
exports.getCommission = async (req, res) => {
  try {
    const shop = await getVendorShop(req.user._id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

    res.json({
      success: true,
      data: {
        commission: shop.commission || { commissionType: 'percentage', commissionValue: 10 },
      },
    });
  } catch (error) {
    console.error('Get commission error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Update Commission
exports.updateCommission = async (req, res) => {
  try {
    const { commissionType, commissionValue } = req.body;
    const shop = await getVendorShop(req.user._id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

    if (!['percentage', 'fixed'].includes(commissionType)) {
      return res.status(400).json({ success: false, message: 'Invalid commission type' });
    }

    const value = Number(commissionValue);
    if (isNaN(value) || value < 0 || (commissionType === 'percentage' && value > 100)) {
      return res.status(400).json({ success: false, message: 'Invalid commission value' });
    }

    shop.commission = {
      commissionType,
      commissionValue: value,
    };
    await shop.save();

    res.json({
      success: true,
      message: 'Commission updated',
      data: { commission: shop.commission },
    });
  } catch (error) {
    console.error('Update commission error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get Monthly Stats (last month)
exports.getMonthlyStats = async (req, res) => {
  try {
    const shop = await getVendorShop(req.user._id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

    // ?period=this-month | last-month | last-30 | all   (default this-month)
    const period = req.query.period || 'this-month';
    const IST = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(Date.now() + IST);

    let start = null;
    let end = null;
    let label = 'All time';

    if (period === 'this-month') {
      start = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), 1) - IST);
      label = 'This month';
    } else if (period === 'last-month') {
      start = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth() - 1, 1) - IST);
      end = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), 1) - IST);
      label = 'Last month';
    } else if (period === 'last-30') {
      start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      label = 'Last 30 days';
    }

    const range = {};
    if (start) range.$gte = start;
    if (end) range.$lt = end;
    const dateFilter = start || end ? { createdAt: range } : {};

    const orders = await Order.find({ shopId: shop._id, ...dateFilter }).select(
      'status createdAt orderValue revisedOrderValue'
    );

    let delivered = 0;
    let cancelled = 0;
    let revenue = 0;
    let taxes = 0;
    let packaging = 0;
    const perDay = {};

    for (const o of orders) {
      if (o.status === 'cancelled') {
        cancelled += 1;
        continue;
      }
      if (o.status !== 'delivered') continue;

      delivered += 1;
      const v = shopFacingValue(o);
      revenue += v.shopTotal;
      taxes += v.taxes;
      packaging += v.packagingCharges;

      const day = new Date(o.createdAt.getTime() + IST).toISOString().slice(0, 10);
      if (!perDay[day]) perDay[day] = { date: day, orders: 0, revenue: 0 };
      perDay[day].orders += 1;
      perDay[day].revenue = round2(perDay[day].revenue + v.shopTotal);
    }

    revenue = round2(revenue);

    // The shop's own cost of selling with us. This is their money, so they
    // are entitled to it - unlike the delivery fee or convenience charge.
    const commType = shop.commission?.commissionType || 'percentage';
    const commVal = shop.commission?.commissionValue || 0;
    const commissionDeducted =
      commType === 'percentage' ? round2((revenue * commVal) / 100) : round2(delivered * commVal);
    const payableAmount = round2(revenue - commissionDeducted);

    res.json({
      success: true,
      data: {
        shopId: shop._id,
        shopName: shop.name,
        period,
        label,
        ordersPlaced: orders.length,
        delivered,
        cancelled,
        revenue,
        taxes: round2(taxes),
        packagingCharges: round2(packaging),
        averageOrderValue: delivered ? round2(revenue / delivered) : 0,
        commission: {
          type: commType,
          value: commVal,
          deducted: commissionDeducted,
        },
        payableAmount,
        dailyBreakdown: Object.values(perDay).sort((a, b) => (a.date < b.date ? 1 : -1)),
      },
    });
  } catch (error) {
    console.error('Get monthly stats error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get Available Shops (shops without a vendor)
exports.getAvailableShops = async (req, res) => {
  try {
    // Treat any non-ObjectId vendorId (null, missing, empty string, falsy) as unclaimed
    const shops = await Shop.find({
      $or: [
        { vendorId: null },
        { vendorId: { $exists: false } },
        { vendorId: { $not: { $type: 'objectId' } } },
      ],
    });
    res.json({
      success: true,
      data: { shops },
    });
  } catch (error) {
    console.error('Get available shops error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get Shop Orders
exports.getShopOrders = async (req, res) => {
  try {
    const shop = await getVendorShop(req.user._id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

    const { status, from, to, limit } = req.query;

    const filter = { shopId: shop._id };
    if (status && status !== 'all') filter.status = status;

    // Dates arrive as YYYY-MM-DD and mean IST days, since that is the
    // business day the shop keeps.
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from + 'T00:00:00+05:30');
      if (to) {
        const end = new Date(to + 'T00:00:00+05:30');
        end.setUTCDate(end.getUTCDate() + 1);
        filter.createdAt.$lt = end;
      }
    }

    const cap = Math.min(parseInt(limit, 10) || 200, 500);

    const orders = await Order.find(filter)
      .populate('customerId', 'name')
      .sort({ createdAt: -1 })
      .limit(cap);

    // toVendorOrder is an allow-list: the delivery fee, convenience charge
    // and shopper commission are never serialised to a vendor.
    res.json({
      success: true,
      data: { orders: orders.map(toVendorOrder) },
    });
  } catch (error) {
    console.error('Get shop orders error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Update Order Status (for Vendor)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const shop = await getVendorShop(req.user._id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

    const order = await Order.findOne({ _id: id, shopId: shop._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Validate allowed status transitions for vendor
    const allowedStatuses = [
      'accepted_by_shop',
      'preparing',
      'ready_for_pickup',
      'cancelled_by_shop',
    ];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status update for vendor' });
    }

    order.status = status;

    // Add timeline event
    order.timeline.push({
      status,
      description: `Order marked as ${status.replace(/_/g, ' ')} by shop owner`,
      timestamp: new Date(),
    });

    await order.save();

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: { order },
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ---------------------------------------------------------------------------
// One-time shop claim
// ---------------------------------------------------------------------------

/**
 * Where the signed-in vendor stands: are they bound to a shop yet, and is a
 * claim code waiting for them? Drives the portal's gate screen.
 */
exports.getVendorStatus = async (req, res) => {
  try {
    const shop = await Shop.findOne({ vendorId: req.user._id }).select('name isActive');
    const pendingCode = shop ? null : await ShopClaimCode.findLiveFor(req.user._id);

    res.json({
      success: true,
      data: {
        linked: Boolean(shop),
        shop: shop ? { _id: shop._id, name: shop.name, isActive: shop.isActive } : null,
        requestedShopName: req.user.requestedShopName || null,
        codeIssued: Boolean(pendingCode),
        codeExpiresAt: pendingCode ? pendingCode.expiresAt : null,
      },
    });
  } catch (error) {
    console.error('Get vendor status error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/** Redeem a claim code and bind this vendor to the shop it was issued for. */
exports.claimShop = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || !String(code).trim()) {
      return res.status(400).json({ success: false, message: 'Enter the code sent to you.' });
    }

    const already = await Shop.findOne({ vendorId: req.user._id });
    if (already) {
      return res.status(409).json({
        success: false,
        message: 'Your account is already connected to ' + already.name + '.',
      });
    }

    const record = await ShopClaimCode.findOne({
      codeHash: ShopClaimCode.hashCode(code),
    });

    // Deliberately the same message for wrong, spent, revoked and expired,
    // so a guesser learns nothing from the difference.
    const reject = () =>
      res
        .status(400)
        .json({ success: false, message: 'That code is not valid. Ask the team for a new one.' });

    if (!record) return reject();
    if (record.usedAt || record.revokedAt) return reject();
    if (record.expiresAt < new Date()) return reject();

    if (record.issuedToUserId && String(record.issuedToUserId) !== String(req.user._id)) {
      record.attempts += 1;
      await record.save();
      return reject();
    }

    const shop = await Shop.findById(record.shopId);
    if (!shop) return reject();
    if (shop.vendorId && String(shop.vendorId) !== String(req.user._id)) {
      return res.status(409).json({
        success: false,
        message: 'That shop already has an owner. Ask the team to sort it out.',
      });
    }

    shop.vendorId = req.user._id;
    await shop.save();

    record.usedAt = new Date();
    record.usedBy = req.user._id;
    await record.save();

    res.json({
      success: true,
      message: 'Connected to ' + shop.name + '.',
      data: { shop: { _id: shop._id, name: shop.name } },
    });
  } catch (error) {
    console.error('Claim shop error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
