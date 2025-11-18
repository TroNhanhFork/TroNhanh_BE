/**
 * Image Moderation Test Controller
 * Test endpoints for validating AI image moderation functionality
 */

const { analyzeImageSafety, comprehensiveImageAnalysis, detectLabels } = require('../service/imageModerationService');
const { optimizeImage, getCompressionCount } = require('../service/imageOptimizationService');
const fs = require('fs').promises;

/**
 * Test endpoint - Upload and analyze a single image
 * @route POST /api/test/image-moderation
 */
exports.testImageModeration = async (req, res) => {
  try {
    // Support both single file (req.file) and multiple files (req.files)
    const files = req.files || (req.file ? [req.file] : []);
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image file(s) uploaded. Please upload at least one image.'
      });
    }

    console.log(`[TEST] ${files.length} file(s) received for validation`);

    // Process each file
    const results = [];
    const fs = require('fs');

    for (const file of files) {
      const filePath = file.path;
      
      // Log file details for debugging
      console.log('[TEST] Processing file:', {
        originalname: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      });

      // Verify file exists before processing
      if (!fs.existsSync(filePath)) {
        results.push({
          filename: file.originalname,
          safe: false,
          error: 'File was uploaded but cannot be found on disk'
        });
        continue;
      }

      try {
        // Run comprehensive analysis
        const analysis = await comprehensiveImageAnalysis(filePath);

        results.push({
          filename: file.originalname,
          safe: analysis.isSafe,
          violations: analysis.violations || [],
          details: analysis.details,
          labels: analysis.labels?.slice(0, 10) || []
        });
      } catch (error) {
        console.error(`[TEST] Error analyzing ${file.originalname}:`, error);
        results.push({
          filename: file.originalname,
          safe: false,
          error: error.message,
          violations: []
        });
      }
    }

    const allSafe = results.every(r => r.safe);

    res.status(allSafe ? 200 : 400).json({
      success: true,
      message: allSafe ? 'All images passed validation' : 'Some images failed validation',
      totalImages: files.length,
      results,
      summary: {
        total: files.length,
        safe: results.filter(r => r.safe).length,
        unsafe: results.filter(r => !r.safe).length
      },
      file: {
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: filePath
      },
      analysis
    });

  } catch (error) {
    console.error('[TEST MODERATION ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Error analyzing image',
      error: error.message
    });
  }
};

/**
 * Test endpoint - Upload and optimize image
 * @route POST /api/test/image-optimization
 */
exports.testImageOptimization = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded'
      });
    }

    if (!process.env.TINIFY_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Tinify API not configured. Please set TINIFY_API_KEY in environment variables.'
      });
    }

    const filePath = req.file.path;
    const originalSize = req.file.size;

    // Optimize the image
    const result = await optimizeImage(filePath);

    res.status(200).json({
      success: true,
      message: 'Image optimization completed',
      file: {
        originalName: req.file.originalname,
        originalSize,
        mimetype: req.file.mimetype
      },
      optimization: result,
      apiUsage: {
        compressionCount: getCompressionCount(),
        note: 'Free tier allows 500 compressions/month'
      }
    });

  } catch (error) {
    console.error('[TEST OPTIMIZATION ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Error optimizing image',
      error: error.message
    });
  }
};

/**
 * Test endpoint - Full pipeline (moderation + optimization)
 * @route POST /api/test/full-pipeline
 */
exports.testFullPipeline = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded'
      });
    }

    const filePath = req.file.path;
    const startTime = Date.now();

    // Step 1: Safety analysis
    console.log('[PIPELINE] Step 1: Analyzing image safety...');
    const safetyResult = await analyzeImageSafety(filePath);

    if (!safetyResult.isSafe) {
      // Delete unsafe image
      await fs.unlink(filePath);
      
      return res.status(400).json({
        success: false,
        message: 'Image rejected due to inappropriate content',
        violations: safetyResult.violations,
        details: safetyResult.details
      });
    }

    // Step 2: Label detection
    console.log('[PIPELINE] Step 2: Detecting labels...');
    const labels = await detectLabels(filePath);

    // Step 3: Optimization (if Tinify is configured)
    let optimizationResult = null;
    if (process.env.TINIFY_API_KEY) {
      console.log('[PIPELINE] Step 3: Optimizing image...');
      optimizationResult = await optimizeImage(filePath);
    } else {
      console.log('[PIPELINE] Step 3: Skipping optimization (Tinify not configured)');
    }

    const processingTime = Date.now() - startTime;

    res.status(200).json({
      success: true,
      message: 'Image passed all checks and was processed successfully',
      file: {
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        savedPath: filePath
      },
      pipeline: {
        safety: safetyResult,
        labels: labels.slice(0, 5),
        optimization: optimizationResult,
        processingTimeMs: processingTime
      }
    });

  } catch (error) {
    console.error('[TEST PIPELINE ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Error in processing pipeline',
      error: error.message
    });
  }
};

/**
 * Test endpoint - Check API configurations
 * @route GET /api/test/config-check
 */
exports.checkConfiguration = async (req, res) => {
  try {
    const config = {
      googleVision: {
        configured: !!process.env.GOOGLE_VISION_CREDENTIALS,
        credentialsPath: process.env.GOOGLE_VISION_CREDENTIALS || 'Not set'
      },
      tinify: {
        configured: !!process.env.TINIFY_API_KEY,
        apiKey: process.env.TINIFY_API_KEY ? '***' + process.env.TINIFY_API_KEY.slice(-4) : 'Not set',
        compressionCount: process.env.TINIFY_API_KEY ? getCompressionCount() : 'N/A'
      }
    };

    const allConfigured = config.googleVision.configured && config.tinify.configured;

    res.status(200).json({
      success: true,
      message: allConfigured ? 'All services are configured' : 'Some services are not configured',
      config,
      warnings: [
        !config.googleVision.configured && 'Google Vision API credentials not found',
        !config.tinify.configured && 'Tinify API key not found'
      ].filter(Boolean)
    });

  } catch (error) {
    console.error('[CONFIG CHECK ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Error checking configuration',
      error: error.message
    });
  }
};

/**
 * Test endpoint - Simulate unsafe image
 * @route GET /api/test/simulate-unsafe
 */
exports.simulateUnsafeImage = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'This is a simulation of how an unsafe image would be flagged',
    simulatedResult: {
      isSafe: false,
      violations: [
        { category: 'adult', likelihood: 'VERY_LIKELY' },
        { category: 'violence', likelihood: 'POSSIBLE' }
      ],
      details: {
        adult: 'VERY_LIKELY',
        violence: 'POSSIBLE',
        racy: 'LIKELY',
        spoof: 'UNLIKELY',
        medical: 'UNLIKELY'
      },
      action: 'Image would be auto-rejected and flagged for admin review'
    }
  });
};
