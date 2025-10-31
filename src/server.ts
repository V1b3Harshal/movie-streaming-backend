import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import moviesRoutes from './routes/movies';
import tvSeriesRoutes from './routes/tvSeries';
import authRoutes from './routes/auth';
import traktRoutes from './routes/trakt';
import providersRoutes from './routes/providers';
import watchTogetherRoutes from './routes/watchTogether';
import '@fastify/jwt';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

// Explicitly load .env file
const envPath = process.cwd() + '/.env';
try {
  const envConfig = dotenv.parse(readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
  console.log('Successfully loaded .env file from:', envPath);
  console.log('INTERNAL_API_KEY after loading:', process.env.INTERNAL_API_KEY ? process.env.INTERNAL_API_KEY.substring(0, 10) + '...' : 'undefined');
} catch (error) {
  console.warn('Could not load .env file, using environment variables');
}
import { connectToDatabase } from './config/database';
import { validateEnvironment } from './config/environment';
import { createSafeErrorResponse, logErrorWithDetails } from './utils/errorHandler';
import { logger } from './utils/logger';

// Optional Redis import (only if Redis is configured)
let redisModule: any = null;
try {
  redisModule = require('./config/redis');
} catch (error) {
  console.warn('Redis module not found. Refresh token storage will use in-memory fallback.');
}


// Validate environment variables
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

const fastify = Fastify({ logger: true });

// Initialize JWT plugin
fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET!,
});

// Enable CORS for frontend interaction
fastify.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGIN?.split(',').filter(Boolean) || [process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost:3000'])
    : true,
  credentials: process.env.CORS_CREDENTIALS === 'true',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Add comprehensive security headers with Helmet
fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.themoviedb.org", "https://api.trakt.tv", "ws:", "wss:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// Add additional security headers
fastify.addHook('onRequest', (request, reply, done) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  done();
});

// Simple in-memory rate limiting (in production, use Redis)
declare global {
  var rateLimit: Record<string, number[]>;
}

fastify.addHook('onRequest', (request, reply, done) => {
  const ip = request.ip;
  const now = Date.now();
  
  if (!global.rateLimit) {
    global.rateLimit = {};
  }
  
  if (!global.rateLimit[ip]) {
    global.rateLimit[ip] = [];
  }
  
  // Remove requests older than 1 minute
  global.rateLimit[ip] = global.rateLimit[ip].filter((time: number) => now - time < (parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000')));
  
  // Check if rate limit exceeded
  if (global.rateLimit[ip].length >= parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')) {
    return reply.code(429).send({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded'
    });
  }
  
  // Add current request
  global.rateLimit[ip].push(now);
  done();
});

// Register Swagger
fastify.register(require('@fastify/swagger'), {
  swagger: {
    info: {
      title: process.env.SWAGGER_TITLE || 'Movie Streaming Backend API',
      description: process.env.SWAGGER_DESCRIPTION || 'API for Movie Streaming Backend',
      version: process.env.SWAGGER_VERSION || '1.0.0',
    },
    host: process.env.SWAGGER_HOST || process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost:3000',
    schemes: ['https', 'http'],
    consumes: ['application/json'],
    produces: ['application/json'],
  },
});

// Register Swagger UI
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
fastify.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'movie-streaming-backend'
  };
});

// Health check for providers backend with improved error handling
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
      signal: AbortSignal.timeout(3000) // 3 second timeout
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

// API configuration endpoint for frontend
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
    // Connect to MongoDB first
    await connectToDatabase();
    
    // Connect to Redis if available
    if (redisModule && process.env.REDIS_URL) {
      try {
        await redisModule.connectToRedis();
        // Start token cleanup interval
        setInterval(redisModule.cleanupExpiredTokens, 60 * 60 * 1000); // Run every hour
        console.log('Redis connected successfully');
      } catch (redisError) {
        console.warn('Redis connection failed, using in-memory fallback:', redisError instanceof Error ? redisError.message : String(redisError));
      }
    } else {
      console.log('Redis not configured, using in-memory refresh token storage');
    }
    
    // Check providers backend connection
    try {
      const { PROVIDERS_BACKEND_URL } = await import('./config/environment');
      const response = await fetch(`${PROVIDERS_BACKEND_URL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        console.log('Providers backend is accessible');
      } else {
        console.warn('Providers backend health check failed');
      }
    } catch (error) {
      console.warn('Could not connect to providers backend:', error instanceof Error ? error.message : String(error));
    }
    
    // Then start the server
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server listening on http://0.0.0.0:3000');
    console.log('Watch together functionality available at providers backend');
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

// Add security-focused request logging
fastify.addHook('onRequest', (request, reply, done) => {
  logger.http({
    method: request.method,
    url: request.url,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    timestamp: new Date().toISOString(),
    contentType: request.headers['content-type'],
    contentLength: request.headers['content-length'],
  });
  
  // Special logging for proxied requests
  if (request.url.startsWith('/watch-together') || request.url.startsWith('/providers')) {
    logger.info('Proxy request initiated', {
      method: request.method,
      url: request.url,
      target: process.env.PROVIDERS_BACKEND_URL,
      timestamp: new Date().toISOString()
    });
  }
  
  done();
});

start();
