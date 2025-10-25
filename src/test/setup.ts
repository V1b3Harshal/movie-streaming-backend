// Test setup file

// Set test environment
process.env.NODE_ENV = 'test';

// Mock environment variables for testing
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.TMDB_API_KEY = 'test-tmdb-api-key';
process.env.TRAKT_CLIENT_ID = 'test-trakt-client-id';
process.env.TRAKT_CLIENT_SECRET = 'test-trakt-client-secret';

// Global test timeout
// Note: Jest timeout is configured in jest.config.js