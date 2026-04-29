const GlobalShopClosure = require('../models/GlobalShopClosure');
const { getCurrentISTTime } = require('../utils/timeUtils');

// Build a Date for "next day 00:00 IST" so shops resume normal hours next day.
const computeNextDayReopenAt = () => {
    const istNow = getCurrentISTTime();
    const istNextMidnight = new Date(istNow);
    istNextMidnight.setHours(24, 0, 0, 0); // start of next day in IST-local terms
    // istNow was constructed from a locale string, so its epoch is offset; convert back.
    // Compute the offset between true now and istNow to get a real UTC instant.
    const offsetMs = Date.now() - istNow.getTime();
    return new Date(istNextMidnight.getTime() + offsetMs);
};

// GET /api/admin/shops/closure  and  GET /api/shops/closure-status
exports.getClosureStatus = async (req, res) => {
    try {
        const active = await GlobalShopClosure.getActiveClosure();
        return res.json({
            success: true,
            data: {
                isClosed: !!active,
                closure: active ? {
                    mode: active.mode,
                    reopenAt: active.reopenAt,
                    closedAt: active.closedAt,
                    reason: active.reason
                } : null
            }
        });
    } catch (error) {
        console.error('getClosureStatus error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch closure status' });
    }
};

// POST /api/admin/shops/closure
// body: { mode: 'until_time' | 'next_day' | 'manual', reopenAt?: ISOString, reason?: string }
exports.closeAllShops = async (req, res) => {
    try {
        const { mode, reopenAt, reason } = req.body || {};

        if (!['until_time', 'next_day', 'manual'].includes(mode)) {
            return res.status(400).json({ success: false, message: 'Invalid mode' });
        }

        let resolvedReopenAt = null;
        if (mode === 'until_time') {
            if (!reopenAt) {
                return res.status(400).json({ success: false, message: 'reopenAt required for until_time mode' });
            }
            const d = new Date(reopenAt);
            if (isNaN(d.getTime())) {
                return res.status(400).json({ success: false, message: 'Invalid reopenAt date' });
            }
            if (d.getTime() <= Date.now()) {
                return res.status(400).json({ success: false, message: 'reopenAt must be in the future' });
            }
            resolvedReopenAt = d;
        } else if (mode === 'next_day') {
            resolvedReopenAt = computeNextDayReopenAt();
        }

        const update = {
            singletonKey: 'global',
            isClosed: true,
            mode,
            reopenAt: resolvedReopenAt,
            closedAt: new Date(),
            closedBy: req.user ? (req.user.email || String(req.user._id || 'admin')) : 'admin',
            reason: reason || ''
        };

        const doc = await GlobalShopClosure.findOneAndUpdate(
            { singletonKey: 'global' },
            update,
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        if (req.io) {
            req.io.emit('globalShopClosureUpdated', {
                isClosed: true,
                mode: doc.mode,
                reopenAt: doc.reopenAt
            });
        }

        return res.json({
            success: true,
            message: 'All shops marked as closed',
            data: {
                isClosed: true,
                closure: {
                    mode: doc.mode,
                    reopenAt: doc.reopenAt,
                    closedAt: doc.closedAt,
                    reason: doc.reason
                }
            }
        });
    } catch (error) {
        console.error('closeAllShops error:', error);
        return res.status(500).json({ success: false, message: 'Failed to close shops' });
    }
};

// DELETE /api/admin/shops/closure
exports.reopenAllShops = async (req, res) => {
    try {
        const doc = await GlobalShopClosure.findOneAndUpdate(
            { singletonKey: 'global' },
            {
                isClosed: false,
                mode: null,
                reopenAt: null,
                closedAt: null,
                closedBy: null,
                reason: ''
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        if (req.io) {
            req.io.emit('globalShopClosureUpdated', { isClosed: false });
        }

        return res.json({
            success: true,
            message: 'All shops reopened',
            data: { isClosed: false, closure: null }
        });
    } catch (error) {
        console.error('reopenAllShops error:', error);
        return res.status(500).json({ success: false, message: 'Failed to reopen shops' });
    }
};
