import { env } from 'process';

export const validateEnvironment = () => {
  // Core required variables for basic app functionality
  // App will start with warnings for missing optional services
  const coreRequired = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'INTERNAL_API_KEY'
  ];

  // Optional third-party services (app works without them)
  const optionalServices = [
    'TMDB_API_KEY',
    'TRAKT_CLIENT_ID',
    'MIXPANEL_PROJECT_TOKEN',
    'ONESIGNAL_APP_ID',
    'ONESIGNAL_REST_API_KEY',
    'ALGOLIA_APP_ID',
    'ALGOLIA_API_KEY',
    'ALGOLIA_SEARCH_API_KEY',
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ZONE_ID',
    'BETTER_UPTIME_API_KEY',
    'BETTER_UPTIME_HEARTBEAT_URL',
    'SENTRY_DSN',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'IMAGEKIT_PUBLIC_KEY',
    'IMAGEKIT_PRIVATE_KEY',
    'IMAGEKIT_URL_ENDPOINT'
  ];

  // Check core required variables
  const missingCore = coreRequired.filter(envVar => !env[envVar]);
  if (missingCore.length > 0) {
    throw new Error(`Missing required environment variables: ${missingCore.join(', ')}`);
  }

  // Warn about missing optional services but don't fail
  const missingOptional = optionalServices.filter(envVar => !env[envVar]);
  if (missingOptional.length > 0) {
    console.warn(`⚠️  Optional services not configured: ${missingOptional.join(', ')}`);
    console.warn('💡 App will run with reduced functionality for missing services');
  }
  
  
  // Validate API keys are not empty (only for configured services)
  if (env.TMDB_API_KEY && env.TMDB_API_KEY.trim() === '') {
    console.warn('⚠️  TMDB_API_KEY is configured but empty');
  }

  if (env.TRAKT_CLIENT_ID && env.TRAKT_CLIENT_ID.trim() === '') {
    console.warn('⚠️  TRAKT_CLIENT_ID is configured but empty');
  }

  // Validate Supabase configuration
  if (env.SUPABASE_URL && !env.SUPABASE_URL.includes('supabase.co')) {
    throw new Error('SUPABASE_URL must be a valid Supabase URL');
  }

  // Validate rate limiting configuration
  if (env.RATE_LIMIT_MAX_REQUESTS && (parseInt(env.RATE_LIMIT_MAX_REQUESTS) < 1 || parseInt(env.RATE_LIMIT_MAX_REQUESTS) > 10000)) {
    throw new Error('RATE_LIMIT_MAX_REQUESTS must be between 1 and 10000');
  }

  if (env.RATE_LIMIT_WINDOW_MS && (parseInt(env.RATE_LIMIT_WINDOW_MS) < 1000 || parseInt(env.RATE_LIMIT_WINDOW_MS) > 86400000)) {
    throw new Error('RATE_LIMIT_WINDOW_MS must be between 1000 (1 second) and 86400000 (24 hours)');
  }

  // Validate required URLs
  if (env.PROVIDERS_BACKEND_URL) {
    try {
      new URL(env.PROVIDERS_BACKEND_URL);
    } catch {
      throw new Error('Invalid PROVIDERS_BACKEND_URL format');
    }
  }

  // Validate internal API key
  if (env.INTERNAL_API_KEY && env.INTERNAL_API_KEY.length < 10) {
    throw new Error('INTERNAL_API_KEY must be at least 10 characters long');
  }

  // Validate CORS configuration
  if (env.CORS_ORIGIN && env.CORS_ORIGIN.split(',').length === 0) {
    throw new Error('CORS_ORIGIN cannot be empty if provided');
  }


  // Validate optional third-party services
  if (env.SENTRY_DSN && !env.SENTRY_DSN.startsWith('https://') && !env.SENTRY_DSN.startsWith('http://')) {
    throw new Error('SENTRY_DSN must be a valid URL');
  }

  if (env.BETTER_UPTIME_HEARTBEAT_URL && !env.BETTER_UPTIME_HEARTBEAT_URL.startsWith('https://')) {
    throw new Error('BETTER_UPTIME_HEARTBEAT_URL must be a valid HTTPS URL');
  }

  // Validate Redis configuration
  if (env.UPSTASH_REDIS_REST_URL && !env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('UPSTASH_REDIS_REST_TOKEN is required when UPSTASH_REDIS_REST_URL is provided');
  }

  if (env.UPSTASH_REDIS_REST_TOKEN && !env.UPSTASH_REDIS_REST_URL) {
    throw new Error('UPSTASH_REDIS_REST_URL is required when UPSTASH_REDIS_REST_TOKEN is provided');
  }
};

// =================================================================
// SERVER CONFIGURATION
// =================================================================
export const NODE_ENV = env.NODE_ENV || 'production';
export const PORT = parseInt(env.PORT || '3000');
export const RAILWAY_PUBLIC_DOMAIN = env.RAILWAY_PUBLIC_DOMAIN || 'localhost:3000';

// =================================================================
// CORE DATABASE & CACHING
// =================================================================
export const SUPABASE_URL = env.SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || '';
export const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';

export const UPSTASH_REDIS_REST_URL = env.UPSTASH_REDIS_REST_URL || '';
export const UPSTASH_REDIS_REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN || '';

// =================================================================
// AUTHENTICATION & SECURITY
// =================================================================
export const INTERNAL_API_KEY = env.INTERNAL_API_KEY || '';

export const CORS_ORIGIN = env.CORS_ORIGIN || 'http://localhost:3000';
export const CORS_CREDENTIALS = env.CORS_CREDENTIALS === 'true';
export const FRONTEND_URL = env.FRONTEND_URL || 'http://localhost:3000';

export const CSRF_PROTECTION_ENABLED = env.CSRF_PROTECTION_ENABLED === 'true';
export const SSL_ENFORCEMENT_ENABLED = env.SSL_ENFORCEMENT_ENABLED !== 'false';
export const MAX_TOKEN_ROTATIONS = parseInt(env.MAX_TOKEN_ROTATIONS || '5');

// =================================================================
// EXTERNAL APIs
// =================================================================
export const TMDB_API_URL = env.TMDB_API_URL || 'https://api.themoviedb.org/3';
export const TMDB_API_KEY = env.TMDB_API_KEY || '';

export const TRAKT_API_URL = env.TRAKT_API_URL || 'https://api.trakt.tv';
export const TRAKT_CLIENT_ID = env.TRAKT_CLIENT_ID || '';
export const TRAKT_CLIENT_SECRET = env.TRAKT_CLIENT_SECRET || '';

// =================================================================
// MONITORING & ANALYTICS
// =================================================================
export const SENTRY_DSN = env.SENTRY_DSN || '';

// Mixpanel Analytics (PostHog replacement)
export const MIXPANEL_PROJECT_TOKEN = env.MIXPANEL_PROJECT_TOKEN || '';
export const MIXPANEL_API_SECRET = env.MIXPANEL_API_SECRET || '';
export const MIXPANEL_SERVICE_ACCOUNT_USER = env.MIXPANEL_SERVICE_ACCOUNT_USER || '';
export const MIXPANEL_SERVICE_ACCOUNT_SECRET = env.MIXPANEL_SERVICE_ACCOUNT_SECRET || '';

export const BETTER_UPTIME_API_KEY = env.BETTER_UPTIME_API_KEY || '';
export const BETTER_UPTIME_HEARTBEAT_URL = env.BETTER_UPTIME_HEARTBEAT_URL || '';

// =================================================================
// INFRASTRUCTURE & CDN
// =================================================================
export const CLOUDFLARE_API_TOKEN = env.CLOUDFLARE_API_TOKEN || '';
export const CLOUDFLARE_ZONE_ID = env.CLOUDFLARE_ZONE_ID || '';

// =================================================================
// IMAGE OPTIMIZATION
// =================================================================
export const IMAGEKIT_PUBLIC_KEY = env.IMAGEKIT_PUBLIC_KEY || '';
export const IMAGEKIT_PRIVATE_KEY = env.IMAGEKIT_PRIVATE_KEY || '';
export const IMAGEKIT_URL_ENDPOINT = env.IMAGEKIT_URL_ENDPOINT || '';


// =================================================================
// SEARCH
// =================================================================
export const ALGOLIA_APP_ID = env.ALGOLIA_APP_ID || '';
export const ALGOLIA_API_KEY = env.ALGOLIA_API_KEY || '';
export const ALGOLIA_SEARCH_API_KEY = env.ALGOLIA_SEARCH_API_KEY || '';

// =================================================================
// NOTIFICATIONS
// =================================================================
export const ONESIGNAL_APP_ID = env.ONESIGNAL_APP_ID || '';
export const ONESIGNAL_REST_API_KEY = env.ONESIGNAL_REST_API_KEY || '';

// Firebase removed - not used anywhere in the codebase
// If Firebase is needed in the future, re-add these exports:
// export const FIREBASE_PROJECT_ID = env.FIREBASE_PROJECT_ID || '';
// export const FIREBASE_PRIVATE_KEY = env.FIREBASE_PRIVATE_KEY || '';
// export const FIREBASE_CLIENT_EMAIL = env.FIREBASE_CLIENT_EMAIL || '';

// =================================================================
// RATE LIMITING
// =================================================================
export const RATE_LIMIT_MAX_REQUESTS = parseInt(env.RATE_LIMIT_MAX_REQUESTS || '100');
export const RATE_LIMIT_WINDOW_MS = parseInt(env.RATE_LIMIT_WINDOW_MS || '60000');

// =================================================================
// API DOCUMENTATION
// =================================================================
export const SWAGGER_TITLE = env.SWAGGER_TITLE || 'Movie Streaming Backend API';
export const SWAGGER_DESCRIPTION = env.SWAGGER_DESCRIPTION || 'Advanced API for Movie Streaming Platform';
export const SWAGGER_VERSION = env.SWAGGER_VERSION || '2.0.0';
export const SWAGGER_HOST = env.SWAGGER_HOST || 'localhost:3000';

// =================================================================
// BACKEND INTEGRATION
// =================================================================
export const PROVIDERS_BACKEND_URL = env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';

// =================================================================
// LOGGING & MONITORING
// =================================================================
export const LOG_LEVEL = env.LOG_LEVEL || 'info';
export const HEALTH_CHECK_TIMEOUT = parseInt(env.HEALTH_CHECK_TIMEOUT || '3000');

// =================================================================
// FEATURE FLAGS
// =================================================================
export const ENABLE_WATCH_TOGETHER = env.ENABLE_WATCH_TOGETHER === 'true';
export const ENABLE_PROVIDERS = env.ENABLE_PROVIDERS === 'true';
export const ENABLE_WEBSOCKET = env.ENABLE_WEBSOCKET === 'true';
export const ENABLE_CACHING = env.ENABLE_CACHING !== 'false';
export const ENABLE_RATE_LIMITING = env.ENABLE_RATE_LIMITING !== 'false';

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

// Create a function to get environment variables (for services that need them)
export const getEnv = (key: string) => {
  return env[key];
};

// Security status check
export const getSecurityStatus = () => {
  return {
    csrfProtection: CSRF_PROTECTION_ENABLED,
    sslEnforcement: SSL_ENFORCEMENT_ENABLED,
    productionMode: NODE_ENV === 'production',
    supabaseConfigured: !!(SUPABASE_URL && SUPABASE_ANON_KEY),
    redisConfigured: !!(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN),
    monitoringEnabled: !!(SENTRY_DSN || process.env.MIXPANEL_PROJECT_TOKEN),
    notificationsEnabled: !!(ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY),
    cloudflareConfigured: !!(CLOUDFLARE_API_TOKEN && CLOUDFLARE_ZONE_ID)
  };
};

// Health check status
export const getHealthCheckStatus = () => {
  return {
    environment: NODE_ENV,
    port: PORT,
    timestamp: new Date().toISOString(),
    features: {
      watchTogether: ENABLE_WATCH_TOGETHER,
      providers: ENABLE_PROVIDERS,
      websocket: ENABLE_WEBSOCKET,
      caching: ENABLE_CACHING,
      rateLimiting: ENABLE_RATE_LIMITING
    },
    services: {
      supabase: !!SUPABASE_URL,
      redis: !!UPSTASH_REDIS_REST_URL,
      sentry: !!SENTRY_DSN,
      posthog: false, // PostHog removed
      betterUptime: !!BETTER_UPTIME_HEARTBEAT_URL,
      cloudflare: !!CLOUDFLARE_API_TOKEN,
      firebase: false, // Firebase removed - using OneSignal instead
    }
  };
};