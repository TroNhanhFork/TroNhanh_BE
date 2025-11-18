/**
 * FlaggedImage Model
 * Stores images flagged by AI moderation for admin review
 */

const mongoose = require('mongoose');

const flaggedImageSchema = new mongoose.Schema({
  // Image information
  imagePath: {
    type: String,
    required: true
  },
  originalFilename: {
    type: String
  },
  imageUrl: {
    type: String
  },
  
  // Associated entity
  entityType: {
    type: String,
    enum: ['BoardingHouse', 'Room', 'RoommatePost', 'User'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'entityType'
  },
  
  // Uploader information
  uploaderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // AI Analysis results
  moderationResult: {
    isSafe: {
      type: Boolean,
      default: false
    },
    violations: [{
      category: String,
      likelihood: String
    }],
    details: {
      adult: String,
      violence: String,
      racy: String,
      spoof: String,
      medical: String
    },
    labels: [{
      description: String,
      score: Number,
      confidence: Number
    }],
    detectedText: String,
    analysisTimestamp: Date
  },
  
  // Review status
  reviewStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'deleted'],
    default: 'pending'
  },
  
  // Admin review
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  reviewNotes: {
    type: String
  },
  
  // Action taken
  actionTaken: {
    type: String,
    enum: ['none', 'removed', 'warned', 'account_suspended'],
    default: 'none'
  },
  
  // Severity
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  // Automatic actions
  autoRejected: {
    type: Boolean,
    default: false
  },
  
  // Metadata
  flaggedAt: {
    type: Date,
    default: Date.now
  },
  
  // Appeal (if user disputes the flag)
  appeal: {
    submitted: {
      type: Boolean,
      default: false
    },
    message: String,
    submittedAt: Date,
    resolvedAt: Date,
    resolution: String
  }
}, {
  timestamps: true
});

// Indexes for performance
flaggedImageSchema.index({ reviewStatus: 1, flaggedAt: -1 });
flaggedImageSchema.index({ uploaderId: 1 });
flaggedImageSchema.index({ entityType: 1, entityId: 1 });
flaggedImageSchema.index({ severity: 1, reviewStatus: 1 });

// Virtual for age of flag
flaggedImageSchema.virtual('ageInHours').get(function() {
  return Math.floor((Date.now() - this.flaggedAt) / (1000 * 60 * 60));
});

// Static method to get pending reviews count
flaggedImageSchema.statics.getPendingCount = function() {
  return this.countDocuments({ reviewStatus: 'pending' });
};

// Static method to get high priority flags
flaggedImageSchema.statics.getHighPriorityFlags = function(limit = 20) {
  return this.find({
    reviewStatus: 'pending',
    severity: { $in: ['high', 'critical'] }
  })
  .sort({ severity: -1, flaggedAt: 1 })
  .limit(limit)
  .populate('uploaderId', 'name email')
  .populate('reviewedBy', 'name email');
};

const FlaggedImage = mongoose.model('FlaggedImage', flaggedImageSchema);

module.exports = FlaggedImage;
