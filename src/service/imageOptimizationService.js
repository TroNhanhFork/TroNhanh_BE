/**
 * Image Optimization Service using Tinify API
 * Compresses and optimizes uploaded images
 */

const tinify = require('tinify');
const fs = require('fs').promises;
const path = require('path');

// Initialize Tinify with API key
tinify.key = process.env.TINIFY_API_KEY;

/**
 * Compress and optimize an image using Tinify
 * @param {string} inputPath - Path to original image
 * @param {string} outputPath - Path to save optimized image (optional, defaults to overwrite)
 * @param {Object} options - Optimization options
 * @returns {Promise<Object>} - Optimization result
 */
const optimizeImage = async (inputPath, outputPath = null, options = {}) => {
  try {
    // Validate API key is set
    if (!tinify.key) {
      throw new Error('TINIFY_API_KEY is not configured');
    }

    const destination = outputPath || inputPath;

    // Get original file size
    const originalStats = await fs.stat(inputPath);
    const originalSize = originalStats.size;

    // Compress the image
    const source = tinify.fromFile(inputPath);
    
    // Apply resize if specified
    let optimized = source;
    if (options.resize) {
      optimized = source.resize({
        method: options.resize.method || 'fit', // fit, cover, scale, thumb
        width: options.resize.width,
        height: options.resize.height
      });
    }

    // Convert to specific format if specified
    if (options.convert) {
      optimized = optimized.convert({ type: options.convert }); // ["image/webp", "image/png", "image/jpeg"]
    }

    // Save optimized image
    await optimized.toFile(destination);

    // Get compressed file size
    const compressedStats = await fs.stat(destination);
    const compressedSize = compressedStats.size;

    // Calculate compression ratio
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

    // Get compression count (API usage tracking)
    const compressionCount = tinify.compressionCount;

    return {
      success: true,
      originalSize,
      compressedSize,
      compressionRatio: `${compressionRatio}%`,
      savedBytes: originalSize - compressedSize,
      outputPath: destination,
      compressionCount,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('[IMAGE OPTIMIZATION ERROR]', error);
    
    // Handle specific Tinify errors
    if (error instanceof tinify.AccountError) {
      throw new Error('Tinify API key verification failed or account issue');
    } else if (error instanceof tinify.ClientError) {
      throw new Error('Invalid image or request to Tinify');
    } else if (error instanceof tinify.ServerError) {
      throw new Error('Tinify server error, please try again');
    } else if (error instanceof tinify.ConnectionError) {
      throw new Error('Network connection error with Tinify');
    }
    
    throw new Error(`Failed to optimize image: ${error.message}`);
  }
};

/**
 * Batch optimize multiple images
 * @param {Array<Object>} images - Array of {inputPath, outputPath, options}
 * @returns {Promise<Array>}
 */
const batchOptimizeImages = async (images) => {
  try {
    const results = await Promise.allSettled(
      images.map(img => optimizeImage(img.inputPath, img.outputPath, img.options || {}))
    );

    return results.map((result, index) => ({
      inputPath: images[index].inputPath,
      status: result.status,
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null
    }));
  } catch (error) {
    console.error('[BATCH OPTIMIZATION ERROR]', error);
    throw error;
  }
};

/**
 * Get current API usage statistics
 * @returns {number} - Number of compressions made this month
 */
const getCompressionCount = () => {
  return tinify.compressionCount || 0;
};

/**
 * Validate image before optimization
 * @param {string} filePath
 * @returns {Promise<Object>}
 */
const validateImage = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

    return {
      isValid: allowedExtensions.includes(ext),
      size: stats.size,
      extension: ext,
      path: filePath
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message
    };
  }
};

/**
 * Optimize with standard presets for room/boarding house images
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {string} preset - 'thumbnail', 'medium', 'large'
 */
const optimizeWithPreset = async (inputPath, outputPath, preset = 'medium') => {
  const presets = {
    thumbnail: {
      resize: { method: 'cover', width: 300, height: 300 }
    },
    medium: {
      resize: { method: 'fit', width: 800, height: 600 }
    },
    large: {
      resize: { method: 'fit', width: 1920, height: 1080 }
    },
    original: {} // Just compress without resize
  };

  const options = presets[preset] || presets.medium;
  return await optimizeImage(inputPath, outputPath, options);
};

module.exports = {
  optimizeImage,
  batchOptimizeImages,
  getCompressionCount,
  validateImage,
  optimizeWithPreset
};
