/**
 * Quick Test Script for Image Moderation System
 * Run this to verify the setup is working correctly
 * 
 * Usage: node test-image-moderation.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';
const API_BASE = `${BASE_URL}/api/test`;

console.log('🧪 Testing AI Image Moderation System...\n');

async function runTests() {
  try {
    // Test 1: Configuration Check
    console.log('📋 Test 1: Checking API Configuration...');
    const configResponse = await axios.get(`${API_BASE}/config-check`);
    
    console.log('✅ Configuration Status:');
    console.log(`   - Google Vision: ${configResponse.data.config.googleVision.configured ? '✅' : '❌'}`);
    console.log(`   - Tinify: ${configResponse.data.config.tinify.configured ? '✅' : '❌'}`);
    
    if (configResponse.data.warnings && configResponse.data.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      configResponse.data.warnings.forEach(warning => {
        console.log(`   - ${warning}`);
      });
    }
    
    console.log('\n---\n');
    
    // Test 2: Simulate Unsafe Image
    console.log('📋 Test 2: Simulating Unsafe Image Detection...');
    const simulateResponse = await axios.get(`${API_BASE}/simulate-unsafe`);
    
    console.log('✅ Simulation Result:');
    console.log(`   - Would be flagged: ${!simulateResponse.data.simulatedResult.isSafe}`);
    console.log(`   - Violations: ${simulateResponse.data.simulatedResult.violations.length}`);
    simulateResponse.data.simulatedResult.violations.forEach(v => {
      console.log(`     • ${v.category}: ${v.likelihood}`);
    });
    console.log(`   - Action: ${simulateResponse.data.simulatedResult.action}`);
    
    console.log('\n---\n');
    
    console.log('✅ All tests completed successfully!\n');
    console.log('📝 Next Steps:');
    console.log('   1. Upload a test image using POST /api/test/image-moderation');
    console.log('   2. Check AI_IMAGE_MODERATION_SETUP.md for integration guide');
    console.log('   3. Integrate middleware into your upload routes');
    
  } catch (error) {
    console.error('\n❌ Test Failed:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.data.message || error.response.statusText}`);
    } else if (error.request) {
      console.error('   ❌ Server not responding. Is the server running on port 3000?');
    } else {
      console.error(`   Error: ${error.message}`);
    }
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Make sure the server is running (npm run dev)');
    console.log('   2. Check if port 3000 is correct');
    console.log('   3. Verify API keys in .env file');
    process.exit(1);
  }
}

runTests();
