import { env } from 'process';

export const validateEnvironment = () => {
  const required = ['JWT_SECRET', 'MONGODB_URI', 'TMDB_API_KEY', 'TRAKT_CLIENT_ID'];
  const missing = required.filter(envVar => !env[envVar]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  if (env.NODE_ENV === 'production' && (env.JWT_SECRET === 'accessTokenSecret' || (env.JWT_SECRET && env.JWT_SECRET.length < 32))) {
    throw new Error('Weak or default JWT secret detected in production. JWT_SECRET must be at least 32 characters long');
  }
  
  // Validate API keys are not empty
  if (env.TMDB_API_KEY && env.TMDB_API_KEY.trim() === '') {
    throw new Error('TMDB_API_KEY is empty');
  }
  
  if (env.TRAKT_CLIENT_ID && env.TRAKT_CLIENT_ID.trim() === '') {
    throw new Error('TRAKT_CLIENT_ID is empty');
  }

  // Validate session configuration
  if (env.SESSION_TIMEOUT_MS && (parseInt(env.SESSION_TIMEOUT_MS) < 60000 || parseInt(env.SESSION_TIMEOUT_MS) > 86400000)) {
    throw new Error('SESSION_TIMEOUT_MS must be between 60000 (1 minute) and 86400000 (24 hours)');
  }

  // Validate token rotation configuration
  if (env.TOKEN_ROTATION_INTERVAL_MS && (parseInt(env.TOKEN_ROTATION_INTERVAL_MS) < 300000 || parseInt(env.TOKEN_ROTATION_INTERVAL_MS) > 3600000)) {
    throw new Error('TOKEN_ROTATION_INTERVAL_MS must be between 300000 (5 minutes) and 3600000 (1 hour)');
  }

  // Validate SSL/TLS configuration for production
  if (env.NODE_ENV === 'production' && env.MONGODB_URI && !env.MONGODB_URI.includes('ssl=true') && !env.MONGODB_URI.includes('tls=true')) {
    console.warn('WARNING: Production environment detected but SSL/TLS is not enabled for MongoDB connection');
    console.warn('Please ensure your MongoDB connection string includes SSL/TLS settings');
  }
};

// TMDB API Configuration
export const TMDB_API_URL = env.TMDB_API_URL || 'https://api.themoviedb.org/3';
export const TMDB_API_KEY = env.TMDB_API_KEY || '';

// Trakt API Configuration
export const TRAKT_API_URL = env.TRAKT_API_URL || 'https://api.trakt.tv';
export const TRAKT_CLIENT_ID = env.TRAKT_CLIENT_ID || '';
export const TRAKT_CLIENT_SECRET = env.TRAKT_CLIENT_SECRET || '';

// Railway-specific configurations
export const RAILWAY_DOMAIN = env.RAILWAY_PUBLIC_DOMAIN || 'localhost:3000';
export const NODE_ENV = env.NODE_ENV || 'production';
export const PORT = env.PORT || 3000;

// Providers Backend Configuration
export const PROVIDERS_BACKEND_URL = env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
export const INTERNAL_API_KEY = env.INTERNAL_API_KEY || '';

// Security Configuration
export const SESSION_TIMEOUT_MS = parseInt(env.SESSION_TIMEOUT_MS || '1800000'); // 30 minutes default
export const TOKEN_ROTATION_INTERVAL_MS = parseInt(env.TOKEN_ROTATION_INTERVAL_MS || '300000'); // 5 minutes default
export const MAX_TOKEN_ROTATIONS = parseInt(env.MAX_TOKEN_ROTATIONS || '5'); // Max rotations per session
export const CSRF_PROTECTION_ENABLED = env.CSRF_PROTECTION_ENABLED === 'true';
export const SSL_ENFORCEMENT_ENABLED = env.SSL_ENFORCEMENT_ENABLED !== 'false';

// Database SSL Configuration
export const MONGODB_SSL_CA_FILE = env.MONGODB_SSL_CA_FILE || '';
export const MONGODB_SSL_CERT_FILE = env.MONGODB_SSL_CERT_FILE || '';
export const MONGODB_SSL_KEY_FILE = env.MONGODB_SSL_KEY_FILE || '';

// Redis Configuration
export const REDIS_URL = env.REDIS_URL || 'redis://localhost:6379';
export const REDIS_PASSWORD = env.REDIS_PASSWORD;

// Upstash Redis Configuration
export const UPSTASH_REDIS_URL = env.UPSTASH_REDIS_URL || env.REDIS_URL;
export const UPSTASH_REDIS_TOKEN = env.UPSTASH_REDIS_TOKEN;

// Create a function to get environment variables (for services that need them)
export const getEnv = (key: string) => {
  return env[key];
};

// Security status check
export const getSecurityStatus = () => {
  return {
    jwtSecretLength: env.JWT_SECRET?.length || 0,
    sessionTimeout: SESSION_TIMEOUT_MS,
    tokenRotationInterval: TOKEN_ROTATION_INTERVAL_MS,
    csrfProtection: CSRF_PROTECTION_ENABLED,
    sslEnforcement: SSL_ENFORCEMENT_ENABLED,
    productionMode: NODE_ENV === 'production',
    mongoUriSsl: env.MONGODB_URI?.includes('ssl=true') || env.MONGODB_URI?.includes('tls=true') || false
  };
};