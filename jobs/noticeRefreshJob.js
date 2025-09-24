const Notice = require('../models/Notice');

class NoticeRefreshJob {
    constructor(io) {
        this.io = io;
        this.intervalId = null;
    }

    start() {
        console.log('📢 Starting notice refresh job...');

        // Run every minute to check for notices that need refreshing
        this.intervalId = setInterval(async () => {
            await this.checkAndRefreshNotices();
        }, 60000); // Check every minute

        // Also run immediately on start
        this.checkAndRefreshNotices();
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('📢 Notice refresh job stopped');
        }
    }

    async checkAndRefreshNotices() {
        try {
            const now = new Date();

            // Find notices that need refreshing
            const noticesToRefresh = await Notice.find({
                isActive: true,
                refreshInterval: { $ne: null },
                $or: [
                    { lastRefreshed: null },
                    {
                        lastRefreshed: {
                            $lte: new Date(now.getTime() - (15 * 60 * 1000)) // 15 minutes ago
                        }
                    }
                ],
                startDate: { $lte: now },
                $or: [
                    { endDate: null },
                    { endDate: { $gte: now } }
                ]
            });

            if (noticesToRefresh.length > 0) {
                console.log(`📢 Found ${noticesToRefresh.length} notices to refresh`);

                for (const notice of noticesToRefresh) {
                    await this.refreshNotice(notice);
                }
            }
        } catch (error) {
            console.error('❌ Error in notice refresh job:', error);
        }
    }

    async refreshNotice(notice) {
        try {
            console.log(`📢 Refreshing notice: ${notice.title}`);

            // Update last refreshed time
            notice.lastRefreshed = new Date();
            await notice.save();

            // Emit socket event to all customers
            if (this.io) {
                this.io.emit('refreshNotice', {
                    id: notice._id,
                    title: notice.title,
                    message: notice.message,
                    type: notice.type,
                    priority: notice.priority,
                    isRefresh: true
                });

                console.log(`📢 Refreshed notice "${notice.title}" sent to all customers`);
            }
        } catch (error) {
            console.error(`❌ Error refreshing notice ${notice._id}:`, error);
        }
    }
}

module.exports = NoticeRefreshJob;