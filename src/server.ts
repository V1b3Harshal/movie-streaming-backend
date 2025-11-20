require('dotenv').config();
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import { validateEnvironment } from './config/environment';
import { getAppConfig } from './config/appConfig';
import { createSafeErrorResponse, logErrorWithDetails } from './utils/errorHandler';
import { logger } from './utils/logger';
import { initSentry } from './config/sentry';
import { algoliaService } from './config/algolia';
import { initSupabase } from './config/supabase';
import { initCloudflare } from './config/cloudflare';
import * as redisModule from './config/redis';
import { performanceMonitor } from './utils/performanceMonitor';
import userRateLimitService from './services/userRateLimitService';
import { jobQueueService } from './services/jobQueueService';

// Import services
import oneSignalService from './config/onesignal';
import betterUptimeService from './config/betterUptime';
import imageKitService from './config/imagekit';
import securityService from './services/securityService';
import webhookService from './services/webhookService';
import { mixpanelService } from './config/mixpanel';
// import contentAccessService from './services/contentAccessService';

// Import routes
import moviesRoutes from './routes/movies';
import tvSeriesRoutes from './routes/tvSeries';
import traktRoutes from './routes/trakt';
import providersRoutes from './routes/providers';
import watchTogetherRoutes from './routes/watchTogether';
import userRoutes from './routes/user';
import notificationsRoutes from './routes/notifications';

// Load environment variables
validateEnvironment();

// Validate backend integration configuration
function validateBackendIntegration() {
  const required = ['PROVIDERS_BACKEND_URL', 'INTERNAL_API_KEY'];
  const missing = required.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required backend integration variables: ${missing.join(', ')}`);
  }
  
  // Validate URL format
  try {
    new URL(process.env.PROVIDERS_BACKEND_URL!);
  } catch {
    throw new Error('Invalid PROVIDERS_BACKEND_URL format');
  }
  
  // Validate internal API key
  if (!process.env.INTERNAL_API_KEY || process.env.INTERNAL_API_KEY.length < 10) {
    throw new Error('INTERNAL_API_KEY must be at least 10 characters long');
  }
}

try {
  validateBackendIntegration();
} catch (error) {
  logger.error('Backend integration validation failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const config = getAppConfig();
const fastify = Fastify({ logger: true });

// Initialize OneSignal for push notifications
oneSignalService.init();

// Initialize Algolia search
algoliaService.init();

// Initialize BetterUptime for service monitoring
betterUptimeService.init();

// Initialize ImageKit for image optimization
imageKitService.getStatus(); // Check if configured

// Essential plugins

fastify.register(cors, config.cors);

fastify.register(helmet, config.security.helmet);

// Enhanced rate limiting with security service and per-user limits
const rateLimitConfig = {
  global: true,
  max: config.rateLimit.maxRequests,
  timeWindow: config.rateLimit.windowMs,
  skip: (request: any) => {
    // Skip rate limiting for internal API calls
    return request.headers['x-internal-key'] === process.env.INTERNAL_API_KEY;
  },
  // Add per-user rate limiting hook
  onRequest: async (request: any, reply: any) => {
    // Skip for internal API calls
    if (request.headers['x-internal-key'] === process.env.INTERNAL_API_KEY) {
      return;
    }

    // Get user identifier (IP address as fallback, or user ID if authenticated)
    const userId = request.user?.id || request.user?.userId || request.ip || 'anonymous';

    try {
      const userLimitResult = await userRateLimitService.checkUserLimit(userId, request.url);

      if (!userLimitResult.allowed) {
        if (userLimitResult.isBlocked) {
          logger.warn(`User ${userId} is blocked from rate limiting until ${new Date(userLimitResult.blockedUntil!).toISOString()}`);
          return reply.code(429).send({
            statusCode: 429,
            error: 'Too Many Requests',
            message: 'You have been temporarily blocked due to excessive requests. Please try again later.',
            retryAfter: Math.ceil((userLimitResult.blockedUntil! - Date.now()) / 1000)
          });
        } else {
          logger.warn(`User ${userId} exceeded per-user rate limit`);
          return reply.code(429).send({
            statusCode: 429,
            error: 'Too Many Requests',
            message: 'You have exceeded your request limit. Please try again later.',
            retryAfter: Math.ceil((userLimitResult.resetTime - Date.now()) / 1000)
          });
        }
      }

      // Add rate limit headers for user limits
      reply.header('X-User-RateLimit-Limit', 50); // 50 requests per minute
      reply.header('X-User-RateLimit-Remaining', userLimitResult.remaining);
      reply.header('X-User-RateLimit-Reset', userLimitResult.resetTime);

    } catch (error) {
      logger.error('User rate limiting failed:', error);
      // Continue with request if rate limiting fails
    }
  }
};

fastify.register(rateLimit, rateLimitConfig as any);

// Enable response compression (gzip, brotli)
fastify.register(compress, {
  global: true,
  encodings: ['gzip', 'deflate', 'br'],
  threshold: 1024, // Compress responses larger than 1KB
  zlibOptions: {
    level: 6, // Gzip compression level (1-9, 6 is good balance)
  },
});

// Re-enable Swagger plugins
fastify.register(require('@fastify/swagger'), {
  swagger: {
    info: {
      title: config.swagger.title,
      description: config.swagger.description,
      version: config.swagger.version,
    },
    host: config.swagger.host,
    schemes: ['https', 'http'],
    consumes: ['application/json'],
    produces: ['application/json'],
  },
});

fastify.register(require('@fastify/swagger-ui'), {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'full',
    deepLinking: true,
  },
  staticCSP: true,
  transformStaticCSP: (header: any) => header,
});

// Security middleware
fastify.addHook('onRequest', async (request, reply) => {
  // Add security headers
  securityService.addSecurityHeaders(request, reply);
  
  // Validate request
  const validation = securityService.validateRequest(request);
  if (!validation.valid) {
    securityService.logSecurityEvent('invalid_request', {
      reason: validation.reason,
      url: request.url,
      method: request.method
    }, request);
    
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: validation.reason || 'Invalid request'
    });
  }
  
  // Check IP security
  const ipCheck = securityService.checkIPSecurity(request);
  if (!ipCheck.allowed) {
    securityService.logSecurityEvent('ip_blocked', {
      reason: ipCheck.reason,
      ip: request.ip
    }, request);
    
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: ipCheck.reason || 'IP blocked'
    });
  }
});

// Health check endpoint
fastify.get('/health', async (_request, reply) => {
  const performance = performanceMonitor.getPerformanceSummary();

  // Import cache service dynamically to avoid circular dependencies
  const { cacheService } = await import('./services/cacheService');
  const { circuitBreaker } = await import('./services/circuitBreakerService');
  const userRateLimitStats = await userRateLimitService.getGlobalStats();

  reply.send({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'movie-streaming-backend',
    message: 'Server is running',
    performance,
    cache: cacheService.getStats(),
    circuitBreaker: circuitBreaker.getStats(),
    rateLimiting: {
      global: {
        maxRequests: config.rateLimit.maxRequests,
        windowMs: config.rateLimit.windowMs
      },
      userLimits: userRateLimitStats
    },
    services: {
      oneSignal: oneSignalService.getStatus(),
      betterUptime: betterUptimeService.getStatus(),
      imageKit: imageKitService.getStatus(),
      security: securityService.getSecurityStatus(),
      webhooks: webhookService.getStatistics()
    }
  });
});

// Test endpoint
fastify.get('/test', (_request, reply) => {
  reply.send({ message: 'Test successful' });
});

// Security status endpoint
fastify.get('/security/status', async () => {
  const { getSecurityStatus } = await import('./config/environment');
  const { getDatabaseStatus } = await import('./config/database');
  
  return {
    timestamp: new Date().toISOString(),
    security: {
      ...getSecurityStatus(),
      csrfProtectionEnabled: process.env.CSRF_PROTECTION_ENABLED === 'true',
      sslEnforcementEnabled: process.env.SSL_ENFORCEMENT_ENABLED !== 'false',
      sessionManagement: {
        timeout: 3600000, // 1 hour default
        rotationInterval: 300000, // 5 minutes default
        maxRotations: process.env.MAX_TOKEN_ROTATIONS || '5'
      }
    },
    database: getDatabaseStatus(),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      isProduction: process.env.NODE_ENV === 'production'
    }
  };
});

// CSRF token endpoint
fastify.get('/csrf-token', {
  preHandler: [async (_request, reply) => {
    // Generate a real CSRF token
    const crypto = require('crypto');
    const csrfToken = crypto.randomBytes(32).toString('hex');
    reply.header('X-CSRF-Token', csrfToken);
  }]
}, async (_request, _reply) => {
  const crypto = require('crypto');
  const csrfToken = crypto.randomBytes(32).toString('hex');
  
  // Store token in Redis for validation (if available)
  try {
    const { getRedisClient } = await import('./config/redis');
    const redis = getRedisClient();
    await redis.set(`csrf:${_request.ip}:${Date.now()}`, csrfToken, { EX: 3600 }); // 1 hour expiry
  } catch (error) {
    // Fallback to in-memory storage
    console.warn('Redis not available for CSRF token storage');
  }
  
  return {
    csrfToken,
    timestamp: new Date().toISOString()
  };
});

// Health check for providers backend
fastify.get('/health/providers', async () => {
  try {
    const { PROVIDERS_BACKEND_URL } = await import('./config/environment');
    const startTime = Date.now();
    
    const response = await fetch(`${PROVIDERS_BACKEND_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.INTERNAL_API_KEY || ''
      },
      signal: AbortSignal.timeout(3000)
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        service: 'providers-backend',
        message: 'Providers backend returned error status',
        statusCode: response.status,
        responseTime
      };
    }
    
    const providersHealth = await response.json();
    return {
      status: providersHealth.status || 'ok',
      timestamp: new Date().toISOString(),
      service: 'providers-backend',
      responseTime,
      ...providersHealth
    };
  } catch (error) {
    return {
      status: 'error',
      timestamp: new Date().toISOString(),
      service: 'providers-backend',
      message: 'Failed to connect to providers backend',
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// API configuration endpoint
fastify.get('/api/config', async (_request, reply) => {
  const { PROVIDERS_BACKEND_URL } = await import('./config/environment');

  return reply.send({
    websocketUrl: process.env.WEBSOCKET_URL || `ws://${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost:3001'}`,
    providersBackendUrl: PROVIDERS_BACKEND_URL,
    apiBaseUrl: process.env.RAILWAY_PUBLIC_DOMAIN || `localhost:3000`,
    features: {
      watchTogether: true,
      providers: true,
      webSocket: true
    },
    timestamp: new Date().toISOString()
  });
});

fastify.get('/', async () => {
  return { message: 'Welcome to Movie Streaming Backend!' };
});

// Register routes with versioning
fastify.register(moviesRoutes, { prefix: '/v1/movies' });
fastify.register(tvSeriesRoutes, { prefix: '/v1/tv-series' });
fastify.register(traktRoutes, { prefix: '/v1/trakt' });
fastify.register(providersRoutes, { prefix: '/v1/providers' });
fastify.register(watchTogetherRoutes, { prefix: '/v1/watch-together' });
fastify.register(userRoutes, { prefix: '/v1/user' });
fastify.register(notificationsRoutes, { prefix: '/v1/notifications' });

// Legacy routes without versioning for backward compatibility
fastify.register(moviesRoutes, { prefix: '/movies' });
fastify.register(tvSeriesRoutes, { prefix: '/tv-series' });
fastify.register(traktRoutes, { prefix: '/trakt' });
fastify.register(providersRoutes, { prefix: '/providers' });
fastify.register(watchTogetherRoutes, { prefix: '/watch-together' });
fastify.register(userRoutes, { prefix: '/user' });
fastify.register(notificationsRoutes, { prefix: '/notifications' });

const start = async () => {
  try {
    // Initialize third-party services
    logger.info('Initializing third-party services...');

    // Initialize Supabase
    initSupabase();

    // Connect to database
    try {
      const { connectToDatabase } = await import('./config/database');
      await connectToDatabase();
      logger.info('Database connected successfully');
    } catch (dbError) {
      logger.error('Database connection failed, but continuing with limited functionality:', dbError);
      // Don't exit - allow server to start with reduced functionality
    }

    // Initialize Cloudflare
    initCloudflare();
    
    // Initialize Sentry
    initSentry();
    
    // Initialize new services
    algoliaService.init();
    mixpanelService.init();
    
    // Log service initialization
    await webhookService.notifySystemEvent('services_initialized', {
      oneSignal: oneSignalService.getStatus(),
      betterUptime: betterUptimeService.getStatus(),
      imageKit: imageKitService.getStatus(),
      security: securityService.getSecurityStatus(),
      webhooks: webhookService.getStatistics()
    });
    
    logger.info('All third-party services initialized');
    
    // Database connection handled by Supabase config
    
    // Connect to Redis if available
    if (redisModule) {
      try {
        await redisModule.connectToRedis();
        // Start cleanup interval
        setInterval(redisModule.cleanupExpiredKeys, 60 * 60 * 1000); // Run every hour
        logger.info('Redis connected successfully');
      } catch (redisError) {
        logger.warn('Redis connection failed, using in-memory fallback:', redisError instanceof Error ? redisError.message : String(redisError));
      }
    } else {
      logger.info('Redis not configured, using in-memory fallback');
    }

    // Initialize job queue service
    try {
      await jobQueueService.initialize();
      logger.info('Job queue service initialized successfully');
    } catch (jobError) {
      logger.error('Job queue service initialization failed:', jobError instanceof Error ? jobError.message : String(jobError));
      // Don't exit - allow server to start without job processing
    }

    // Check providers backend connection (non-blocking)
    const checkProvidersBackend = async () => {
      try {
        const { PROVIDERS_BACKEND_URL } = await import('./config/environment');
        const response = await fetch(`${PROVIDERS_BACKEND_URL}/health`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(3000)
        });
        
        if (response.ok) {
          logger.info('Providers backend is accessible');
        } else {
          logger.warn('Providers backend health check failed with status:', response.status);
        }
      } catch (error) {
        logger.warn('Could not connect to providers backend:', error instanceof Error ? error.message : String(error));
        logger.info('Note: Watch together functionality will be unavailable until providers backend is running');
      }
    };

    // Check providers backend in background
    checkProvidersBackend().catch((error) => logger.error('Providers backend check failed:', error));
    
    // Track server start event
    mixpanelService.track('server_started', {
      port: config.port,
      environment: process.env.NODE_ENV
    }).catch((error: any) => logger.error('Failed to track server start:', error));
    
    // Start the server
    try {
      await fastify.listen({ port: config.port, host: config.host });
      
      // Log successful startup
      await webhookService.notifySystemEvent('server_started', {
        port: config.port,
        host: config.host,
        environment: process.env.NODE_ENV || 'development'
      });
      
      logger.info(`Server listening on http://${config.host}:${config.port}`);
      logger.info('Watch together functionality available at providers backend');
      
      // Track successful start
      mixpanelService.track('server_listening', {
        port: config.port,
        host: config.host
      }).catch((error: any) => logger.error('Failed to track server listening:', error));
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('EADDRINUSE')) {
        logger.warn(`Port ${config.port} is already in use, trying alternative port ${config.port + 1}`);
        try {
          await fastify.listen({ port: config.port + 1, host: config.host });
          logger.info(`Server listening on http://${config.host}:${config.port + 1}`);
          logger.info('Watch together functionality available at providers backend');
          
          // Track alternative port
          mixpanelService.track('server_listening_alt_port', {
            originalPort: config.port,
            port: config.port + 1
          }).catch((error: any) => logger.error('Failed to track alternative port:', error));
          
        } catch (altError) {
          logger.error('Failed to start server on alternative port:', altError instanceof Error ? altError.message : String(altError));
          process.exit(1);
        }
      } else {
        logger.error('Failed to start server:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }
  } catch (err) {
    logErrorWithDetails(err, { context: 'Server startup' });
    fastify.log.error('Failed to start server');
    process.exit(1);
  }
};

// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  logErrorWithDetails(error, {
    url: request.url,
    method: request.method,
    ip: request.ip
  });
  
  const safeError = createSafeErrorResponse(error);
  reply.code(safeError.statusCode).send(safeError);
});

// 404 handler
fastify.setNotFoundHandler((_request, reply) => {
  const safeError = createSafeErrorResponse(new Error('Route not found'), 404);
  reply.code(safeError.statusCode).send(safeError);
});

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    // Stop accepting new connections
    await fastify.close();

    // Close Redis connections
    try {
      const { getRedisClient } = await import('./config/redis');
      const redis = getRedisClient();
      if (redis && typeof redis.disconnect === 'function') {
        await redis.disconnect();
        logger.info('Redis connection closed');
      }
    } catch (redisError) {
      logger.warn('Error closing Redis connection:', redisError);
    }

    // Shutdown job queue service
    try {
      const { jobQueueService } = await import('./services/jobQueueService');
      await jobQueueService.shutdown();
      logger.info('Job queue service shut down');
    } catch (jobError) {
      logger.warn('Error shutting down job queue:', jobError);
    }


    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

start();
