/**
 * Image Moderation Service using Google Vision API
 * Detects inappropriate content in uploaded images
 */

const vision = require('@google-cloud/vision');
const fs = require('fs').promises;
const path = require('path');

// Initialize Vision API client
// Option 1: Use keyFilename if GOOGLE_VISION_CREDENTIALS is set
// Option 2: Use GOOGLE_APPLICATION_CREDENTIALS environment variable (set by system)
let client;
try {
  if (process.env.GOOGLE_VISION_CREDENTIALS) {
    client = new vision.ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_VISION_CREDENTIALS
    });
  } else {
    // Will use GOOGLE_APPLICATION_CREDENTIALS from environment
    client = new vision.ImageAnnotatorClient();
  }
} catch (error) {
  console.error('[VISION API INIT ERROR]', error);
  // Create a dummy client to prevent crashes
  client = null;
}

/**
 * Safety thresholds for content detection - STRICT MODE
 * Likelihood levels: UNKNOWN, VERY_UNLIKELY, UNLIKELY, POSSIBLE, LIKELY, VERY_LIKELY
 */
const SAFETY_THRESHOLDS = {
  adult: 'UNLIKELY',      // Very strict - reject anything suspicious
  spoof: 'POSSIBLE',      // Spoof/fake images
  medical: 'POSSIBLE',    // Stricter on medical content
  violence: 'UNLIKELY',   // Very strict on violence
  racy: 'LIKELY'          // Only flag LIKELY or VERY_LIKELY
};

/**
 * Allowed labels for room/building photos
 * Images MUST contain at least one of these to be considered valid
 */
const ALLOWED_LABELS = [
  // Buildings & Architecture
  'building', 'house', 'home', 'apartment', 'room', 'ceiling', 'floor', 'wall', 'door', 'window',
  'architecture', 'property', 'real estate', 'interior design', 'estate',
  
  // Rooms
  'bedroom', 'living room', 'kitchen', 'bathroom', 'dining room', 'hallway', 'corridor',
  
  // Furniture & Fixtures
  'furniture', 'bed', 'chair', 'table', 'desk', 'couch', 'sofa', 'cabinet', 'shelf',
  'lamp', 'lighting', 'curtain', 'blinds', 'carpet', 'rug', 'mattress', 'pillow',
  
  // Common room items
  'appliance', 'refrigerator', 'stove', 'sink', 'toilet', 'shower', 'bathtub',
  'air conditioner', 'fan', 'heater', 'television', 'mirror', 'closet', 'wardrobe'
];

/**
 * Forbidden labels - Auto-reject if these are detected
 */
const FORBIDDEN_LABELS = [
  // People-focused
  'person', 'people', 'human', 'face', 'selfie', 'portrait', 'model', 'woman', 'man', 'girl', 'boy',
  
  // Inappropriate clothing/body
  'bra', 'bikini', 'lingerie', 'underwear', 'undergarment', 'swimsuit', 'swimwear',
  'skin', 'body', 'abdomen', 'chest', 'breast', 'cleavage', 'thigh', 'leg', 'beauty',
  'neck', 'shoulder', 'back', 'stomach',
  
  // Other inappropriate
  'weapon', 'gun', 'knife', 'blood', 'nudity', 'explicit'
];

const LIKELIHOOD_SCORES = {
  'UNKNOWN': 0,
  'VERY_UNLIKELY': 1,
  'UNLIKELY': 2,
  'POSSIBLE': 3,
  'LIKELY': 4,
  'VERY_LIKELY': 5
};

/**
 * Analyze image for inappropriate content using Google Vision API
 * Now includes LABEL CHECKING to ensure only room/building photos
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<Object>} - Moderation result
 */
const analyzeImageSafety = async (imagePath) => {
  try {
    // Check if Vision API client is initialized
    if (!client) {
      throw new Error('Google Vision API client not initialized. Check GOOGLE_VISION_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS');
    }

    // Validate file exists
    const fileExists = await fs.access(imagePath).then(() => true).catch(() => false);
    if (!fileExists) {
      throw new Error(`File not found: ${imagePath}`);
    }

    console.log(`[VISION API] Analyzing image: ${imagePath}`);

    // Read the image file as buffer
    const imageBuffer = await fs.readFile(imagePath);

    // Perform BOTH safe search AND label detection in parallel
    const [safeSearchResult, labelResult] = await Promise.all([
      client.safeSearchDetection({ image: { content: imageBuffer } }),
      client.labelDetection({ image: { content: imageBuffer } })
    ]);

    const detections = safeSearchResult[0].safeSearchAnnotation;
    const labels = (labelResult[0].labelAnnotations || []).map(l => ({
      description: l.description.toLowerCase(),
      score: l.score
    }));

    if (!detections) {
      throw new Error('No safe search annotations found');
    }

    console.log(`[VISION API] Detected labels:`, labels.map(l => l.description).join(', '));

    // Step 1: Check safety violations
    const violations = [];
    const details = {
      adult: detections.adult,
      spoof: detections.spoof,
      medical: detections.medical,
      violence: detections.violence,
      racy: detections.racy
    };

    if (LIKELIHOOD_SCORES[detections.adult] >= LIKELIHOOD_SCORES[SAFETY_THRESHOLDS.adult]) {
      violations.push({ category: 'adult', likelihood: detections.adult });
    }
    if (LIKELIHOOD_SCORES[detections.violence] >= LIKELIHOOD_SCORES[SAFETY_THRESHOLDS.violence]) {
      violations.push({ category: 'violence', likelihood: detections.violence });
    }
    if (LIKELIHOOD_SCORES[detections.racy] >= LIKELIHOOD_SCORES[SAFETY_THRESHOLDS.racy]) {
      violations.push({ category: 'racy', likelihood: detections.racy });
    }
    if (LIKELIHOOD_SCORES[detections.spoof] >= LIKELIHOOD_SCORES[SAFETY_THRESHOLDS.spoof]) {
      violations.push({ category: 'spoof', likelihood: detections.spoof });
    }
    if (LIKELIHOOD_SCORES[detections.medical] >= LIKELIHOOD_SCORES[SAFETY_THRESHOLDS.medical]) {
      violations.push({ category: 'medical', likelihood: detections.medical });
    }

    // Step 2: Check for FORBIDDEN labels (auto-reject)
    const forbiddenFound = labels.filter(label => 
      FORBIDDEN_LABELS.some(forbidden => 
        label.description.includes(forbidden.toLowerCase()) && label.score > 0.7
      )
    );

    if (forbiddenFound.length > 0) {
      console.log(`[CONTENT VIOLATION] Forbidden content detected:`, forbiddenFound.map(l => l.description));
      violations.push({ 
        category: 'inappropriate_content', 
        likelihood: 'DETECTED',
        labels: forbiddenFound.map(l => l.description)
      });
    }

    // Step 3: Check if image is relevant (room/building content)
    // Only flag as irrelevant if NO violations and NO relevant content
    const allowedFound = labels.filter(label => 
      ALLOWED_LABELS.some(allowed => 
        label.description.includes(allowed.toLowerCase()) && label.score > 0.6
      )
    );

    const hasRelevantContent = allowedFound.length > 0;

    // Don't add irrelevant_content violation - just track it
    // Images without room content but also without other violations will pass

    return {
      isSafe: violations.length === 0,
      violations,
      details,
      contentCheck: {
        hasRelevantContent,
        allowedLabelsFound: allowedFound.map(l => l.description),
        forbiddenLabelsFound: forbiddenFound.map(l => l.description)
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('[IMAGE MODERATION ERROR]', error);
    throw new Error(`Failed to analyze image: ${error.message}`);
  }
};

/**
 * Detect labels/objects in image (optional - for additional context)
 * @param {string} imagePath
 * @returns {Promise<Array>} - Array of detected labels
 */
const detectLabels = async (imagePath) => {
  try {
    if (!client) {
      throw new Error('Google Vision API client not initialized');
    }
    const imageBuffer = await fs.readFile(imagePath);
    const [result] = await client.labelDetection({
      image: { content: imageBuffer }
    });

    const labels = result.labelAnnotations || [];
    return labels.map(label => ({
      description: label.description,
      score: label.score,
      confidence: Math.round(label.score * 100)
    }));
  } catch (error) {
    console.error('[LABEL DETECTION ERROR]', error);
    return [];
  }
};

/**
 * Detect text in image (useful for detecting inappropriate text overlays)
 * @param {string} imagePath
 * @returns {Promise<string>} - Detected text
 */
const detectText = async (imagePath) => {
  try {
    if (!client) {
      throw new Error('Google Vision API client not initialized');
    }
    const imageBuffer = await fs.readFile(imagePath);
    const [result] = await client.textDetection({
      image: { content: imageBuffer }
    });

    const detections = result.textAnnotations || [];
    return detections.length > 0 ? detections[0].description : '';
  } catch (error) {
    console.error('[TEXT DETECTION ERROR]', error);
    return '';
  }
};

/**
 * Comprehensive image analysis combining safety, labels, and text detection
 * @param {string} imagePath
 * @returns {Promise<Object>}
 */
const comprehensiveImageAnalysis = async (imagePath) => {
  try {
    const [safetyResult, labels, detectedText] = await Promise.all([
      analyzeImageSafety(imagePath),
      detectLabels(imagePath),
      detectText(imagePath)
    ]);

    return {
      safety: safetyResult,
      labels: labels.slice(0, 10), // Top 10 labels
      detectedText: detectedText.substring(0, 500), // First 500 chars
      analysisTimestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[COMPREHENSIVE ANALYSIS ERROR]', error);
    throw error;
  }
};

/**
 * Batch analyze multiple images
 * @param {Array<string>} imagePaths
 * @returns {Promise<Array>}
 */
const batchAnalyzeImages = async (imagePaths) => {
  try {
    const results = await Promise.allSettled(
      imagePaths.map(imagePath => analyzeImageSafety(imagePath))
    );

    return results.map((result, index) => ({
      imagePath: imagePaths[index],
      status: result.status,
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null
    }));
  } catch (error) {
    console.error('[BATCH ANALYSIS ERROR]', error);
    throw error;
  }
};

module.exports = {
  analyzeImageSafety,
  detectLabels,
  detectText,
  comprehensiveImageAnalysis,
  batchAnalyzeImages,
  SAFETY_THRESHOLDS,
  LIKELIHOOD_SCORES,
  ALLOWED_LABELS,
  FORBIDDEN_LABELS
};
