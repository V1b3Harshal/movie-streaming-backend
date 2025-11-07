import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { connectToDatabase, getDatabaseStatus } from './config/database';
import { validateEnvironment } from './config/environment';
import { getAppConfig } from './config/appConfig';
import { createSafeErrorResponse, logErrorWithDetails } from './utils/errorHandler';
import * as redisModule from './config/redis';

// Import routes
import moviesRoutes from './routes/movies';
import tvSeriesRoutes from './routes/tvSeries';
import authRoutes from './routes/auth';
import traktRoutes from './routes/trakt';
import providersRoutes from './routes/providers';
import watchTogetherRoutes from './routes/watchTogether';

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
  console.error('Backend integration validation failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const config = getAppConfig();
const fastify = Fastify({ logger: true });

// Re-enable essential plugins one by one
fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET!,
});

fastify.register(cors, config.cors);

fastify.register(helmet, config.security.helmet);

// Re-enable rate limiting
fastify.register(rateLimit, {
  global: true,
  max: config.rateLimit.maxRequests,
  timeWindow: config.rateLimit.windowMs,
  skip: (request: any) => {
    // Skip rate limiting for internal API calls
    return request.headers['x-internal-key'] === process.env.INTERNAL_API_KEY;
  },
  addHeaders: (request: any, reply: any, limit: any) => {
    reply.header('X-RateLimit-Limit', limit.max);
    reply.header('X-RateLimit-Remaining', limit.remaining);
    reply.header('X-RateLimit-Reset', limit.resetTime);
  }
} as any);

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

// Health check endpoint
fastify.get('/health', (request, reply) => {
  reply.send({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'movie-streaming-backend',
    message: 'Server is running'
  });
});

// Test endpoint
fastify.get('/test', (request, reply) => {
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
        timeout: getSecurityStatus().sessionTimeout,
        rotationInterval: getSecurityStatus().tokenRotationInterval,
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
  preHandler: [async (request, reply) => {
    // Add CSRF protection logic here
  }]
}, async (request, reply) => {
  return {
    csrfToken: 'csrf-token-placeholder',
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
fastify.get('/api/config', async () => {
  const { PROVIDERS_BACKEND_URL } = await import('./config/environment');
  
  return {
    websocketUrl: process.env.WEBSOCKET_URL || `ws://${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost:3001'}`,
    providersBackendUrl: PROVIDERS_BACKEND_URL,
    apiBaseUrl: process.env.RAILWAY_PUBLIC_DOMAIN || `localhost:3000`,
    features: {
      watchTogether: true,
      providers: true,
      webSocket: true
    },
    timestamp: new Date().toISOString()
  };
});

fastify.get('/', async () => {
  return { message: 'Welcome to Movie Streaming Backend!' };
});

// Register routes
fastify.register(authRoutes, { prefix: '/auth' });
fastify.register(moviesRoutes, { prefix: '/movies' });
fastify.register(tvSeriesRoutes, { prefix: '/tv-series' });
fastify.register(traktRoutes, { prefix: '/trakt' });
fastify.register(providersRoutes, { prefix: '/providers' });
fastify.register(watchTogetherRoutes, { prefix: '/watch-together' });

const start = async () => {
  try {
    // Connect to MongoDB
    await connectToDatabase();
    
    // Connect to Redis if available
    if (redisModule) {
      try {
        await redisModule.connectToRedis();
        // Start cleanup interval
        setInterval(redisModule.cleanupExpiredKeys, 60 * 60 * 1000); // Run every hour
        console.log('Redis connected successfully');
      } catch (redisError) {
        console.warn('Redis connection failed, using in-memory fallback:', redisError instanceof Error ? redisError.message : String(redisError));
      }
    } else {
      console.log('Redis not configured, using in-memory fallback');
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
          console.log('Providers backend is accessible');
        } else {
          console.warn('Providers backend health check failed with status:', response.status);
        }
      } catch (error) {
        console.warn('Could not connect to providers backend:', error instanceof Error ? error.message : String(error));
        console.log('Note: Watch together functionality will be unavailable until providers backend is running');
      }
    };

    // Check providers backend in background
    checkProvidersBackend().catch(console.error);
    
    // Start the server
    try {
      await fastify.listen({ port: config.port, host: config.host });
      console.log(`Server listening on http://${config.host}:${config.port}`);
      console.log('Watch together functionality available at providers backend');
    } catch (error) {
      if (error instanceof Error && error.message.includes('EADDRINUSE')) {
        console.warn(`Port ${config.port} is already in use, trying alternative port ${config.port + 1}`);
        try {
          await fastify.listen({ port: config.port + 1, host: config.host });
          console.log(`Server listening on http://${config.host}:${config.port + 1}`);
          console.log('Watch together functionality available at providers backend');
        } catch (altError) {
          console.error('Failed to start server on alternative port:', altError instanceof Error ? altError.message : String(altError));
          process.exit(1);
        }
      } else {
        console.error('Failed to start server:', error instanceof Error ? error.message : String(error));
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
fastify.setNotFoundHandler((request, reply) => {
  const safeError = createSafeErrorResponse(new Error('Route not found'), 404);
  reply.code(safeError.statusCode).send(safeError);
});

// Request logging disabled to prevent hanging issues in production
// Alternative: Use middleware that doesn't interfere with request lifecycle

start();
