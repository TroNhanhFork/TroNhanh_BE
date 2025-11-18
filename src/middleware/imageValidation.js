/**
 * Image Validation Middleware
 * Intercepts uploaded images and runs AI moderation checks
 */

const { analyzeImageSafety, comprehensiveImageAnalysis } = require('../service/imageModerationService');
const { optimizeImage } = require('../service/imageOptimizationService');
const FlaggedImage = require('../models/FlaggedImage');
const fs = require('fs').promises;
const path = require('path');

/**
 * Middleware to validate images after upload
 * Use AFTER multer middleware
 */
const validateUploadedImages = async (req, res, next) => {
  try {
    // Skip if no files uploaded
    if (!req.files && !req.file) {
      return next();
    }

    // Handle different multer configurations:
    // 1. array() -> req.files is array
    // 2. fields() -> req.files is object with named arrays (e.g., {photos: [...], files: [...]})
    // 3. single() -> req.file is object
    let files = [];
    
    if (req.file) {
      // Single file upload
      files = [req.file];
    } else if (Array.isArray(req.files)) {
      // array() - req.files is already an array
      files = req.files;
    } else if (req.files && typeof req.files === 'object') {
      // fields() - req.files is object with named arrays
      // Extract all files from all fields (photos, files, etc.)
      files = Object.values(req.files).flat();
    }
    
    if (files.length === 0) {
      return next();
    }

    console.log(`[IMAGE VALIDATION] Validating ${files.length} uploaded images...`);

    const validatedFiles = [];
    const flaggedFiles = [];

    // Analyze each file
    for (const file of files) {
      try {
        const filePath = file.path;
        
        // Run AI safety check
        const safetyResult = await analyzeImageSafety(filePath);
        
        // Store validation result with file
        file.moderationResult = safetyResult;

        if (!safetyResult.isSafe) {
          // Image is flagged as unsafe
          console.log(`[IMAGE FLAGGED] ${file.originalname} - Violations:`, safetyResult.violations);
          
          flaggedFiles.push({
            file,
            reason: safetyResult.violations,
            details: safetyResult.details
          });

          // Create FlaggedImage record (skip if this is a test endpoint)
          const isTestEndpoint = req.path?.includes('/test/');
          
          if (!isTestEndpoint) {
            try {
              const flaggedImage = new FlaggedImage({
                imagePath: filePath,
                originalFilename: file.originalname,
                imageUrl: `/uploads/${path.basename(filePath)}`,
                entityType: req.body.entityType || 'BoardingHouse',
                entityId: req.body.entityId || req.params.boardingHouseId || null,
                uploaderId: req.user?.id || req.user?._id,
                moderationResult: safetyResult,
                severity: determineSeverity(safetyResult.violations),
                autoRejected: shouldAutoReject(safetyResult.violations)
              });

              await flaggedImage.save();
              
              // Optionally delete the file immediately if auto-rejected
              if (flaggedImage.autoRejected) {
                try {
                  await fs.unlink(filePath);
                  console.log(`[AUTO-REJECTED] Deleted flagged file: ${file.originalname}`);
                } catch (err) {
                  console.error('[DELETE ERROR]', err);
                }
              }
            } catch (dbError) {
              console.error(`[DB ERROR] Failed to save FlaggedImage for ${file.originalname}:`, dbError.message);
              // Continue even if DB save fails (for test endpoints)
            }
          } else {
            console.log(`[TEST MODE] Skipping FlaggedImage creation for test endpoint`);
          }

        } else {
          // Image is safe
          validatedFiles.push(file);
        }

      } catch (error) {
        console.error(`[VALIDATION ERROR] Failed to validate ${file.originalname}:`, error);
        // On error, allow the file but log it
        validatedFiles.push(file);
      }
    }

    // Attach results to request
    req.validatedFiles = validatedFiles;
    req.flaggedFiles = flaggedFiles;
    req.moderationComplete = true;

    // Reconstruct req.files with only validated files (preserve original structure)
    if (req.file && validatedFiles.length > 0) {
      // Single file - keep as is if validated
      req.file = validatedFiles[0];
    } else if (Array.isArray(req.files)) {
      // array() - replace with validated files array
      req.files = validatedFiles;
    } else if (req.files && typeof req.files === 'object') {
      // fields() - reconstruct object structure with validated files only
      const newFiles = {};
      for (const [fieldName, fieldFiles] of Object.entries(req.files)) {
        newFiles[fieldName] = fieldFiles.filter(file => 
          validatedFiles.some(vf => vf.path === file.path)
        );
      }
      req.files = newFiles;
    }

    // If any file is flagged and should be auto-rejected, return error
    const autoRejectedFiles = flaggedFiles.filter(f => shouldAutoReject(f.reason));
    
    if (autoRejectedFiles.length > 0) {
      return res.status(400).json({
        message: 'One or more uploaded images contain inappropriate content and were rejected',
        error: 'IMAGE_VALIDATION_FAILED',
        flaggedCount: flaggedFiles.length,
        autoRejectedCount: autoRejectedFiles.length,
        violations: autoRejectedFiles.map(f => ({
          filename: f.file.originalname,
          violations: f.reason
        }))
      });
    }

    // Continue with valid files
    next();

  } catch (error) {
    console.error('[IMAGE VALIDATION MIDDLEWARE ERROR]', error);
    // On middleware error, continue anyway to not block uploads
    next();
  }
};

/**
 * Middleware to optimize images after validation
 * Use AFTER validateUploadedImages
 */
const optimizeUploadedImages = async (req, res, next) => {
  try {
    // Skip if no validated files
    if (!req.validatedFiles || req.validatedFiles.length === 0) {
      return next();
    }

    console.log(`[IMAGE OPTIMIZATION] Optimizing ${req.validatedFiles.length} images...`);

    // Check if Tinify is configured
    if (!process.env.TINIFY_API_KEY) {
      console.log('[IMAGE OPTIMIZATION] Skipping - TINIFY_API_KEY not configured');
      return next();
    }

    const optimizationResults = [];

    for (const file of req.validatedFiles) {
      try {
        const result = await optimizeImage(file.path, null, {
          resize: {
            method: 'fit',
            width: 1920,
            height: 1080
          }
        });
        
        optimizationResults.push({
          filename: file.originalname,
          ...result
        });

        // Update file size in file object
        file.size = result.compressedSize;

      } catch (error) {
        console.error(`[OPTIMIZATION ERROR] Failed to optimize ${file.originalname}:`, error.message);
        // Continue even if optimization fails
      }
    }

    req.optimizationResults = optimizationResults;
    next();

  } catch (error) {
    console.error('[IMAGE OPTIMIZATION MIDDLEWARE ERROR]', error);
    next();
  }
};

/**
 * Determine severity based on violations
 * @param {Array} violations
 * @returns {string} - 'low', 'medium', 'high', 'critical'
 */
const determineSeverity = (violations) => {
  if (!violations || violations.length === 0) return 'low';

  const criticalCategories = ['adult', 'violence'];
  const highCategories = ['racy', 'inappropriate_content'];

  const hasCritical = violations.some(v => 
    criticalCategories.includes(v.category) && 
    (v.likelihood === 'LIKELY' || v.likelihood === 'VERY_LIKELY')
  );

  const hasHigh = violations.some(v => 
    highCategories.includes(v.category) && 
    (v.likelihood === 'LIKELY' || v.likelihood === 'VERY_LIKELY' || v.likelihood === 'DETECTED')
  );

  // Content violations are high priority
  const hasContentViolation = violations.some(v => 
    v.category === 'inappropriate_content' || v.category === 'irrelevant_content'
  );

  if (hasCritical) return 'critical';
  if (hasHigh || hasContentViolation) return 'high';
  if (violations.length > 2) return 'high';
  return 'medium';
};

/**
 * Determine if image should be auto-rejected
 * @param {Array} violations
 * @returns {boolean}
 */
const shouldAutoReject = (violations) => {
  if (!violations || violations.length === 0) return false;

  // Define likelihood scores for comparison
  const likelihoodScores = {
    UNKNOWN: 0,
    VERY_UNLIKELY: 1,
    UNLIKELY: 2,
    POSSIBLE: 3,
    LIKELY: 4,
    VERY_LIKELY: 5
  };

  // Auto-reject scenarios:
  // 1. Adult or violence content is UNLIKELY or higher
  // 2. Forbidden content detected (people, inappropriate items)
  // 3. Racy content is LIKELY or higher
  return violations.some(v => {
    const score = likelihoodScores[v.likelihood] || 0;

    // Critical safety violations
    if ((v.category === 'adult' || v.category === 'violence') && score >= likelihoodScores.UNLIKELY) {
      return true;
    }
    
    // Forbidden content (people, lingerie, etc.)
    if (v.category === 'inappropriate_content') {
      return true;
    }
    
    // Racy content at LIKELY or higher
    if (v.category === 'racy' && score >= likelihoodScores.LIKELY) {
      return true;
    }

    return false;
  });
};

/**
 * Comprehensive validation with full analysis
 * For admin testing or detailed reporting
 */
const comprehensiveValidation = async (req, res, next) => {
  try {
    if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
      if (!req.file) return next();
    }

    const files = req.files || (req.file ? [req.file] : []);
    if (files.length === 0) return next();

    const analysisResults = [];

    for (const file of files) {
      try {
        const result = await comprehensiveImageAnalysis(file.path);
        analysisResults.push({
          filename: file.originalname,
          ...result
        });
      } catch (error) {
        console.error(`[COMPREHENSIVE ANALYSIS ERROR]`, error);
      }
    }

    req.comprehensiveAnalysis = analysisResults;
    next();

  } catch (error) {
    console.error('[COMPREHENSIVE VALIDATION ERROR]', error);
    next();
  }
};

module.exports = {
  validateUploadedImages,
  optimizeUploadedImages,
  comprehensiveValidation,
  determineSeverity,
  shouldAutoReject
};
