import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import moviesRoutes from './routes/movies';
import tvSeriesRoutes from './routes/tvSeries';
import authRoutes from './routes/auth';
import traktRoutes from './routes/trakt';
import '@fastify/jwt';
import dotenv from 'dotenv';
import { connectToDatabase } from './config/database';
import { validateEnvironment } from './config/environment';
import { createSafeErrorResponse, logErrorWithDetails } from './utils/errorHandler';

// Optional Redis import (only if Redis is configured)
let redisModule: any = null;
try {
  redisModule = require('./config/redis');
} catch (error) {
  console.warn('Redis module not found. Refresh token storage will use in-memory fallback.');
}

// Load environment variables
dotenv.config();

// Validate environment variables
validateEnvironment();

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
      connectSrc: ["'self'", "https://api.themoviedb.org", "https://api.trakt.tv"],
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

fastify.get('/', async () => {
  return { message: 'Welcome to Movie Streaming Backend!' };
});

// Register routes
fastify.register(authRoutes, { prefix: '/auth' });
fastify.register(moviesRoutes, { prefix: '/movies' });
fastify.register(tvSeriesRoutes, { prefix: '/tv-series' });
fastify.register(traktRoutes, { prefix: '/trakt' });

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
    
    // Then start the server
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server listening on http://0.0.0.0:3000');
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
  fastify.log.info({
    method: request.method,
    url: request.url,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    timestamp: new Date().toISOString(),
    contentType: request.headers['content-type'],
    contentLength: request.headers['content-length'],
  });
  done();
});

start();
