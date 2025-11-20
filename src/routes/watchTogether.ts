// Watch together functionality has been moved to providers backend
// This file is kept for backward compatibility during transition period
// All watch together requests should be directed to the providers backend directly

import { FastifyPluginAsync } from 'fastify';
import { PROVIDERS_BACKEND_URL } from '../config/environment';
import { logger } from '../utils/logger';
import '../utils/errorHandler';

// Circuit breaker for backend communication
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private timeout = 60000; // 1 minute
  private failureThreshold = 5;
  
  async execute(requestFn: () => Promise<Response>): Promise<Response> {
    if (this.failures > this.failureThreshold && Date.now() - this.lastFailure < this.timeout) {
      throw new Error('Service temporarily unavailable - circuit breaker open');
    }
    
    try {
      const result = await requestFn();
      this.failures = 0;
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();
      throw error;
    }
  }
}

const circuitBreaker = new CircuitBreaker();

// Cache for frequently accessed data - currently unused
// const cache = new Map();

// async function getCachedData(key: string, fetchFn: () => Promise<any>, ttl = 300000): Promise<any> {
//   const cached = cache.get(key);
//   if (cached && Date.now() - cached.timestamp < ttl) {
//     logger.debug(`Cache hit for ${key}`);
//     return cached.data;
//   }
//
//   logger.debug(`Cache miss for ${key}, fetching fresh data`);
//   const data = await fetchFn();
//   cache.set(key, { data, timestamp: Date.now() });
//   return data;
// }

// Rate limiting for internal requests
const internalRateLimit = new Map();

function checkInternalRateLimit(): boolean {
  const ip = 'internal'; // Internal requests
  const now = Date.now();
  
  if (!internalRateLimit.has(ip)) {
    internalRateLimit.set(ip, []);
  }
  
  const requests = internalRateLimit.get(ip);
  requests.push(now);
  
  // Keep only last minute of requests
  internalRateLimit.set(ip, requests.filter((time: number) => now - time < 60000));
  
  return internalRateLimit.get(ip).length <= 100; // 100 requests per minute
}

const watchTogetherRoutes: FastifyPluginAsync = async (fastify) => {
  // Proxy watch together requests to providers backend
  fastify.all('/*', async (request, reply) => {
    try {
      // Check rate limiting
      if (!checkInternalRateLimit()) {
        return reply.code(429).send({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Internal rate limit exceeded'
        });
      }

      const targetUrl = `${PROVIDERS_BACKEND_URL}/watch-together${request.url.replace('/watch-together', '')}`;
      
      logger.info('Proxying watch together request', {
        method: request.method,
        url: request.url,
        targetUrl,
        timestamp: new Date().toISOString()
      });
      
      const response = await circuitBreaker.execute(() =>
        fetch(targetUrl, {
          method: request.method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': request.headers.authorization || '',
            'x-internal-key': process.env.INTERNAL_API_KEY || '',
            'User-Agent': 'Movie-Streaming-Backend/1.0'
          },
          signal: AbortSignal.timeout(5000), // 5 second timeout
          body: ['GET', 'HEAD'].includes(request.method) ? null : JSON.stringify(request.body)
        })
      );

      const data = await response.text();
      
      logger.info('Proxy request completed', {
        method: request.method,
        url: request.url,
        statusCode: response.status,
        timestamp: new Date().toISOString()
      });
      
      reply.code(response.status);
      reply.header('Content-Type', 'application/json');
      return data;
    } catch (error) {
      logger.error('Proxy request failed', {
        method: request.method,
        url: request.url,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      
      if (error instanceof Error && error.message.includes('circuit breaker')) {
        return {
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Providers backend is temporarily unavailable'
        };
      }
      
      return {
        statusCode: 502,
        error: 'Bad Gateway',
        message: 'Failed to proxy request to providers backend'
      };
    }
  });
};

export default watchTogetherRoutes;