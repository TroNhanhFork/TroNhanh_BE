/**
 * Image Moderation Test Routes
 * Routes for testing AI image moderation functionality
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
  testImageModeration,
  testImageOptimization,
  testFullPipeline,
  checkConfiguration,
  simulateUnsafeImage
} = require('../controllers/imageModerationTestController');

// Configure multer for test uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/test/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'test-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP) are allowed'));
    }
  }
});

// GET /api/test/config-check - Check if APIs are configured
router.get('/config-check', checkConfiguration);

// GET /api/test/simulate-unsafe - Simulate unsafe image response
router.get('/simulate-unsafe', simulateUnsafeImage);

// POST /api/test/image-moderation - Test image moderation (supports multiple images)
router.post('/image-moderation', upload.array('images', 10), testImageModeration);

// POST /api/test/image-optimization - Test image optimization
router.post('/image-optimization', upload.single('image'), testImageOptimization);

// POST /api/test/full-pipeline - Test complete pipeline
router.post('/full-pipeline', upload.single('image'), testFullPipeline);

module.exports = router;
