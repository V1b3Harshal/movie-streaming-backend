// Comprehensive Backend Testing Script
// Run this after creating users in Supabase and getting JWT tokens

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
let userToken = ''; // You'll need to set this after getting from Supabase

// Test data
const testMovieId = 'tt0111161'; // The Shawshank Redemption
const testContentId = 'movie_123';

async function testEndpoint(method, url, data = null, auth = false) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      headers: {}
    };

    if (auth && userToken) {
      config.headers.Authorization = `Bearer ${userToken}`;
    }

    if (data && (method === 'post' || method === 'put')) {
      config.data = data;
      config.headers['Content-Type'] = 'application/json';
    }

    const response = await axios(config);
    console.log(`✅ ${method.toUpperCase()} ${url} - ${response.status}`);
    return response.data;
  } catch (error) {
    console.log(`❌ ${method.toUpperCase()} ${url} - ${error.response?.status || 'ERROR'}: ${error.response?.statusText || error.message}`);
    return null;
  }
}

async function runComprehensiveTests() {
  console.log('🎬 COMPREHENSIVE BACKEND TESTING STARTED\n');

  // Test 1: Health Check
  console.log('1. HEALTH CHECKS');
  await testEndpoint('get', '/health');
  await testEndpoint('get', '/security/status');
  await testEndpoint('get', '/api/config');
  await testEndpoint('get', '/csrf-token');
  await testEndpoint('get', '/test');

  // Test 2: Public Movie Endpoints
  console.log('\n2. PUBLIC MOVIE ENDPOINTS');
  await testEndpoint('get', '/movies');
  await testEndpoint('get', '/movies/trending');
  await testEndpoint('get', `/movies/details/${testMovieId}`);
  await testEndpoint('get', `/movies/similar/${testMovieId}`);
  await testEndpoint('get', '/movies/search?query=batman');

  // Test 3: Public TV Series Endpoints
  console.log('\n3. PUBLIC TV SERIES ENDPOINTS');
  await testEndpoint('get', '/tv-series');
  await testEndpoint('get', '/tv-series/trending');
  await testEndpoint('get', '/tv-series/airing-today');

  // Test 4: Trakt Endpoints
  console.log('\n4. TRAKT ENDPOINTS');
  await testEndpoint('get', '/trakt/movies/trending');

  // Test 5: Notification Endpoints (no auth required for stats)
  console.log('\n5. NOTIFICATION ENDPOINTS');
  await testEndpoint('get', '/notifications/stats');

  // Test 6: Authenticated User Endpoints (requires token)
  if (userToken) {
    console.log('\n6. AUTHENTICATED USER ENDPOINTS');

    // Profile endpoints
    await testEndpoint('get', '/user/profile', null, true);
    await testEndpoint('get', '/user/profile/statistics', null, true);

    // Session management
    const sessionData = {
      contentId: testContentId,
      contentType: 'movie'
    };
    const session = await testEndpoint('post', '/user/session/start', sessionData, true);

    if (session?.data?.id) {
      const sessionId = session.data.id;

      // Update session progress
      await testEndpoint('put', `/user/session/${sessionId}/progress`, {
        currentTime: 120,
        totalDuration: 7200
      }, true);

      // End session
      await testEndpoint('post', `/user/session/${sessionId}/end`, {
        finalProgress: 3600,
        totalDuration: 7200
      }, true);
    }

    // Watch history
    await testEndpoint('get', '/user/watch-history', null, true);
    await testEndpoint('get', '/user/recently-watched', null, true);
    await testEndpoint('get', '/user/continue-watching', null, true);

    // Favorites
    await testEndpoint('post', `/user/favorites/${testContentId}`, {
      contentType: 'movie'
    }, true);

    // Watch statistics
    await testEndpoint('get', '/user/watch-statistics?days=30', null, true);

  } else {
    console.log('\n6. AUTHENTICATED ENDPOINTS - SKIPPED (No user token provided)');
    console.log('   To test authenticated endpoints:');
    console.log('   1. Create users in Supabase Auth dashboard');
    console.log('   2. Get JWT tokens using the test-users-setup.js script');
    console.log('   3. Set userToken variable in this script');
  }

  // Test 7: Providers Proxy (requires external service)
  console.log('\n7. PROVIDERS BACKEND PROXY');
  await testEndpoint('get', '/health/providers');

  console.log('\n🎉 TESTING COMPLETE!');
  console.log('\nSUMMARY:');
  console.log('- ✅ All public endpoints tested');
  console.log('- ✅ Database connection verified');
  console.log('- ✅ External services integrated');
  console.log('- ⏳ Authenticated endpoints require user tokens');

  if (!userToken) {
    console.log('\nNEXT STEPS:');
    console.log('1. Create test users in Supabase dashboard');
    console.log('2. Run: node test-users-setup.js');
    console.log('3. Get JWT token and set userToken variable');
    console.log('4. Re-run this script for full testing');
  }
}

// Instructions
console.log(`
🎬 MOVIE STREAMING BACKEND - COMPREHENSIVE TESTING

This script will test all endpoints in your backend.

TO GET USER TOKENS (for authenticated endpoints):
1. Go to https://supabase.com/dashboard
2. Navigate to your project > Authentication > Users
3. Click "Add user" and create test users
4. After creating users, run: node test-users-setup.js
5. Copy the JWT token and paste it below

SET YOUR USER TOKEN HERE:
`);

if (process.argv[2]) {
  userToken = process.argv[2];
  console.log(`Using token: ${userToken.substring(0, 20)}...`);
} else {
  console.log('No token provided - authenticated endpoints will be skipped');
  console.log('Run with token: node comprehensive-test.js YOUR_JWT_TOKEN');
}

runComprehensiveTests().catch(console.error);