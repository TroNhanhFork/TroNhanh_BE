/**
 * Image Moderation Admin Controller
 * Handles admin review and management of flagged images
 */

const FlaggedImage = require('../../models/FlaggedImage');
const User = require('../../models/User');
const fs = require('fs').promises;

/**
 * Get all flagged images with filters
 * @route GET /api/admin/flagged-images
 */
exports.getFlaggedImages = async (req, res) => {
    try {
        const {
            status = 'pending',
            severity,
            page = 1,
            limit = 20,
            sortBy = '-flaggedAt'
        } = req.query;

        const query = {};

        if (status && status !== 'all') {
            query.reviewStatus = status;
        }

        if (severity) {
            query.severity = severity;
        }

        const skip = (page - 1) * limit;

        const [flaggedImages, total] = await Promise.all([
            FlaggedImage.find(query)
                .populate('uploaderId', 'name email phone')
                .populate('reviewedBy', 'name email')
                .sort(sortBy)
                .skip(skip)
                .limit(parseInt(limit)),
            FlaggedImage.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            data: flaggedImages,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('[GET FLAGGED IMAGES ERROR]', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách ảnh bị đánh dấu'
        });
    }
};

/**
 * Get flagged image details
 * @route GET /api/admin/flagged-images/:id
 */
exports.getFlaggedImageById = async (req, res) => {
    try {
        const { id } = req.params;

        const flaggedImage = await FlaggedImage.findById(id)
            .populate('uploaderId', 'name email phone role')
            .populate('reviewedBy', 'name email')
            .populate('entityId');

        if (!flaggedImage) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ảnh bị đánh dấu'
            });
        }

        res.status(200).json({
            success: true,
            data: flaggedImage
        });

    } catch (error) {
        console.error('[GET FLAGGED IMAGE ERROR]', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông tin ảnh'
        });
    }
};

/**
 * Review and approve a flagged image
 * @route PUT /api/admin/flagged-images/:id/approve
 */
exports.approveFlaggedImage = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const adminId = req.user.id;

        const flaggedImage = await FlaggedImage.findById(id);

        if (!flaggedImage) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ảnh bị đánh dấu'
            });
        }

        flaggedImage.reviewStatus = 'approved';
        flaggedImage.reviewedBy = adminId;
        flaggedImage.reviewedAt = new Date();
        flaggedImage.reviewNotes = notes || 'Approved by admin';
        flaggedImage.actionTaken = 'none';

        await flaggedImage.save();

        res.status(200).json({
            success: true,
            message: 'Đã phê duyệt ảnh thành công',
            data: flaggedImage
        });

    } catch (error) {
        console.error('[APPROVE IMAGE ERROR]', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi phê duyệt ảnh'
        });
    }
};

/**
 * Review and reject a flagged image
 * @route PUT /api/admin/flagged-images/:id/reject
 */
exports.rejectFlaggedImage = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes, actionTaken = 'removed', deleteFile = true } = req.body;
        const adminId = req.user.id;

        const flaggedImage = await FlaggedImage.findById(id);

        if (!flaggedImage) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ảnh bị đánh dấu'
            });
        }

        flaggedImage.reviewStatus = 'rejected';
        flaggedImage.reviewedBy = adminId;
        flaggedImage.reviewedAt = new Date();
        flaggedImage.reviewNotes = notes || 'Rejected due to policy violation';
        flaggedImage.actionTaken = actionTaken;

        // Optionally delete the physical file
        if (deleteFile && flaggedImage.imagePath) {
            try {
                await fs.unlink(flaggedImage.imagePath);
                console.log(`[FILE DELETED] ${flaggedImage.imagePath}`);
            } catch (err) {
                console.error('[DELETE FILE ERROR]', err);
            }
        }

        await flaggedImage.save();

        // If action is account suspension, update user
        if (actionTaken === 'account_suspended') {
            await User.findByIdAndUpdate(flaggedImage.uploaderId, {
                accountStatus: 'suspended',
                suspensionReason: 'Uploaded inappropriate content',
                suspendedAt: new Date()
            });
        }

        res.status(200).json({
            success: true,
            message: 'Đã từ chối ảnh thành công',
            data: flaggedImage
        });

    } catch (error) {
        console.error('[REJECT IMAGE ERROR]', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi từ chối ảnh'
        });
    }
};

/**
 * Delete a flagged image record
 * @route DELETE /api/admin/flagged-images/:id
 */
exports.deleteFlaggedImage = async (req, res) => {
    try {
        const { id } = req.params;
        const { deleteFile = false } = req.body;

        const flaggedImage = await FlaggedImage.findById(id);

        if (!flaggedImage) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ảnh bị đánh dấu'
            });
        }

        // Optionally delete physical file
        if (deleteFile && flaggedImage.imagePath) {
            try {
                await fs.unlink(flaggedImage.imagePath);
                console.log(`[FILE DELETED] ${flaggedImage.imagePath}`);
            } catch (err) {
                console.error('[DELETE FILE ERROR]', err);
            }
        }

        await FlaggedImage.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Đã xóa bản ghi ảnh bị đánh dấu'
        });

    } catch (error) {
        console.error('[DELETE FLAGGED IMAGE ERROR]', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa bản ghi'
        });
    }
};

/**
 * Get statistics for flagged images
 * @route GET /api/admin/flagged-images/stats
 */
exports.getFlaggedImageStats = async (req, res) => {
    try {
        const [
            totalFlagged,
            pendingCount,
            approvedCount,
            rejectedCount,
            criticalCount,
            highCount,
            recentFlags
        ] = await Promise.all([
            FlaggedImage.countDocuments(),
            FlaggedImage.countDocuments({ reviewStatus: 'pending' }),
            FlaggedImage.countDocuments({ reviewStatus: 'approved' }),
            FlaggedImage.countDocuments({ reviewStatus: 'rejected' }),
            FlaggedImage.countDocuments({ severity: 'critical', reviewStatus: 'pending' }),
            FlaggedImage.countDocuments({ severity: 'high', reviewStatus: 'pending' }),
            FlaggedImage.find({ reviewStatus: 'pending' })
                .sort('-flaggedAt')
                .limit(5)
                .populate('uploaderId', 'name email')
        ]);

        // Get violation categories breakdown
        const violationStats = await FlaggedImage.aggregate([
            { $match: { reviewStatus: 'pending' } },
            { $unwind: '$moderationResult.violations' },
            {
                $group: {
                    _id: '$moderationResult.violations.category',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                total: totalFlagged,
                byStatus: {
                    pending: pendingCount,
                    approved: approvedCount,
                    rejected: rejectedCount
                },
                bySeverity: {
                    critical: criticalCount,
                    high: highCount
                },
                violationCategories: violationStats,
                recentFlags
            }
        });

    } catch (error) {
        console.error('[GET STATS ERROR]', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê'
        });
    }
};

/**
 * Batch approve multiple flagged images
 * @route POST /api/admin/flagged-images/batch-approve
 */
exports.batchApprove = async (req, res) => {
    try {
        const { ids, notes } = req.body;
        const adminId = req.user.id;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách ID không hợp lệ'
            });
        }

        const result = await FlaggedImage.updateMany(
            { _id: { $in: ids } },
            {
                $set: {
                    reviewStatus: 'approved',
                    reviewedBy: adminId,
                    reviewedAt: new Date(),
                    reviewNotes: notes || 'Batch approved',
                    actionTaken: 'none'
                }
            }
        );

        res.status(200).json({
            success: true,
            message: `Đã phê duyệt ${result.modifiedCount} ảnh`,
            data: { modified: result.modifiedCount }
        });

    } catch (error) {
        console.error('[BATCH APPROVE ERROR]', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi phê duyệt hàng loạt'
        });
    }
};

/**
 * Batch reject multiple flagged images
 * @route POST /api/admin/flagged-images/batch-reject
 */
exports.batchReject = async (req, res) => {
    try {
        const { ids, notes, actionTaken = 'removed' } = req.body;
        const adminId = req.user.id;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách ID không hợp lệ'
            });
        }

        const result = await FlaggedImage.updateMany(
            { _id: { $in: ids } },
            {
                $set: {
                    reviewStatus: 'rejected',
                    reviewedBy: adminId,
                    reviewedAt: new Date(),
                    reviewNotes: notes || 'Batch rejected',
                    actionTaken
                }
            }
        );

        res.status(200).json({
            success: true,
            message: `Đã từ chối ${result.modifiedCount} ảnh`,
            data: { modified: result.modifiedCount }
        });

    } catch (error) {
        console.error('[BATCH REJECT ERROR]', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi từ chối hàng loạt'
        });
    }
};
