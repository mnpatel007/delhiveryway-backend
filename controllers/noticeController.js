const Notice = require('../models/Notice');

// Get all notices (admin only)
exports.getAllNotices = async (req, res) => {
    try {
        console.log('📢 getAllNotices called by admin:', req.user?.name || req.user?._id);
        const { page = 1, limit = 10, status } = req.query;
        const skip = (page - 1) * limit;

        let filter = {};
        if (status === 'active') {
            const now = new Date();
            filter = {
                isActive: true,
                startDate: { $lte: now },
                $or: [
                    { endDate: null },
                    { endDate: { $gte: now } }
                ]
            };
        } else if (status === 'inactive') {
            filter.isActive = false;
        }

        const notices = await Notice.find(filter)
            .populate('createdBy', 'name email')
            .sort({ priority: -1, createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Notice.countDocuments(filter);

        console.log('📢 Found notices:', notices.length, 'Total:', total);

        res.json({
            success: true,
            data: {
                notices,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                }
            }
        });
    } catch (error) {
        console.error('Get all notices error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notices'
        });
    }
};

// Get active notices for customers
exports.getActiveNotices = async (req, res) => {
    try {
        const notices = await Notice.getActiveNotices()
            .select('title message type priority startDate endDate')
            .limit(10);

        res.json({
            success: true,
            data: notices
        });
    } catch (error) {
        console.error('Get active notices error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active notices'
        });
    }
};

// Create new notice (admin only)
exports.createNotice = async (req, res) => {
    try {
        const { title, message, type, priority, startDate, endDate } = req.body;

        // Validate required fields
        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        const notice = new Notice({
            title,
            message,
            type: type || 'info',
            priority: priority || 'medium',
            startDate: startDate ? new Date(startDate) : new Date(),
            endDate: endDate ? new Date(endDate) : null,
            createdBy: req.user._id
        });

        await notice.save();

        // Populate the created notice
        await notice.populate('createdBy', 'name email');

        // Emit socket event to all customers
        const io = req.app.get('io');
        if (io) {
            io.emit('newNotice', {
                id: notice._id,
                title: notice.title,
                message: notice.message,
                type: notice.type,
                priority: notice.priority
            });
        }

        res.status(201).json({
            success: true,
            message: 'Notice created successfully',
            data: notice
        });
    } catch (error) {
        console.error('Create notice error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create notice'
        });
    }
};

// Update notice (admin only)
exports.updateNotice = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, message, type, priority, isActive, startDate, endDate } = req.body;

        const notice = await Notice.findById(id);
        if (!notice) {
            return res.status(404).json({
                success: false,
                message: 'Notice not found'
            });
        }

        // Update fields
        if (title !== undefined) notice.title = title;
        if (message !== undefined) notice.message = message;
        if (type !== undefined) notice.type = type;
        if (priority !== undefined) notice.priority = priority;
        if (isActive !== undefined) notice.isActive = isActive;
        if (startDate !== undefined) notice.startDate = new Date(startDate);
        if (endDate !== undefined) notice.endDate = endDate ? new Date(endDate) : null;

        await notice.save();
        await notice.populate('createdBy', 'name email');

        res.json({
            success: true,
            message: 'Notice updated successfully',
            data: notice
        });
    } catch (error) {
        console.error('Update notice error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notice'
        });
    }
};

// Delete notice (admin only)
exports.deleteNotice = async (req, res) => {
    try {
        const { id } = req.params;

        const notice = await Notice.findById(id);
        if (!notice) {
            return res.status(404).json({
                success: false,
                message: 'Notice not found'
            });
        }

        await Notice.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Notice deleted successfully'
        });
    } catch (error) {
        console.error('Delete notice error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete notice'
        });
    }
};

// Mark notice as viewed by user
exports.markAsViewed = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const notice = await Notice.findById(id);
        if (!notice) {
            return res.status(404).json({
                success: false,
                message: 'Notice not found'
            });
        }

        // Check if user already viewed this notice
        const alreadyViewed = notice.viewedBy.some(view =>
            view.userId.toString() === userId.toString()
        );

        if (!alreadyViewed) {
            notice.viewedBy.push({
                userId: userId,
                viewedAt: new Date()
            });
            await notice.save();
        }

        res.json({
            success: true,
            message: 'Notice marked as viewed'
        });
    } catch (error) {
        console.error('Mark as viewed error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark notice as viewed'
        });
    }
};