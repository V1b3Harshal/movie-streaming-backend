// Advanced rate limiting for main backend
import { getRedisClient, RedisKeys } from '../config/redis';
import { logger } from './logger';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (request: any) => string;
  onLimitReached?: (request: any, key: string) => void;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalHits: number;
}

class MainBackendRateLimiter {
  private redisClient: any = null;
  private defaultConfig: Required<RateLimitConfig>;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.defaultConfig = {
      windowMs: 60000, // 1 minute
      maxRequests: 100,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (request) => {
        return request.ip || request.headers['x-forwarded-for'] || 'unknown';
      },
      onLimitReached: (request, key) => {
        logger.warn('Rate limit exceeded', { key, ip: request.ip, endpoint: request.url });
      },
      ...config
    };
  }

  private async ensureRedisClient(): Promise<any> {
    if (this.redisClient) {
      return this.redisClient;
    }

    try {
      this.redisClient = await getRedisClient();
      return this.redisClient;
    } catch (error) {
      logger.warn('Redis not available, rate limiting disabled');
      return null;
    }
  }

  async checkRateLimit(request: any, config: Partial<RateLimitConfig> = {}): Promise<RateLimitResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const client = await this.ensureRedisClient();
    
    // If Redis is not available, allow all requests
    if (!client) {
      return {
        allowed: true,
        remaining: finalConfig.maxRequests,
        resetTime: Date.now() + finalConfig.windowMs,
        totalHits: 0
      };
    }

    const key = `${RedisKeys.rateLimit}:${finalConfig.keyGenerator(request)}`;
    const now = Date.now();
    const windowStart = now - finalConfig.windowMs;

    try {
      // Remove old requests from the window
      await client.zRemRangeByScore(key, 0, windowStart);

      // Get current count
      const currentCount = await client.zCard(key);
      const remaining = Math.max(0, finalConfig.maxRequests - currentCount);
      const allowed = currentCount < finalConfig.maxRequests;

      // Add current request if allowed
      if (allowed) {
        await client.zAdd(key, [{ score: now, value: now.toString() }]);
        await client.expire(key, Math.ceil(finalConfig.windowMs / 1000));
      } else {
        finalConfig.onLimitReached?.(request, key);
      }

      return {
        allowed,
        remaining,
        resetTime: now + finalConfig.windowMs,
        totalHits: currentCount
      };
    } catch (error) {
      logger.error('Rate limit check failed:', error);
      // Fallback to allow if Redis fails
      return {
        allowed: true,
        remaining: finalConfig.maxRequests,
        resetTime: Date.now() + finalConfig.windowMs,
        totalHits: 0
      };
    }
  }

  // Pre-configured limiters for different endpoints
  static createTMDBLimiter(): MainBackendRateLimiter {
    return new MainBackendRateLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 40, // TMDB free tier limit
      keyGenerator: (request) => {
        return `tmdb:${request.ip || 'unknown'}`;
      }
    });
  }

  static createSearchLimiter(): MainBackendRateLimiter {
    return new MainBackendRateLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 10, // More restrictive for search
      keyGenerator: (request) => {
        return `search:${request.ip || 'unknown'}`;
      }
    });
  }

  static createAuthLimiter(): MainBackendRateLimiter {
    return new MainBackendRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5, // Very restrictive for auth
      keyGenerator: (request) => {
        return `auth:${request.ip || 'unknown'}`;
      },
      onLimitReached: (request, key) => {
        logger.warn('Authentication rate limit exceeded', { key, ip: request.ip });
      }
    });
  }

  static createWatchTogetherLimiter(): MainBackendRateLimiter {
    return new MainBackendRateLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 20, // Moderate for watch together
      keyGenerator: (request) => {
        return `watch_together:${request.ip || 'unknown'}`;
      }
    });
  }

  static createAPILimiter(): MainBackendRateLimiter {
    return new MainBackendRateLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100, // General API limit
      keyGenerator: (request) => {
        return `api:${request.ip || 'unknown'}`;
      }
    });
  }
}

// Global instances
export const tmdbRateLimiter = MainBackendRateLimiter.createTMDBLimiter();
export const searchRateLimiter = MainBackendRateLimiter.createSearchLimiter();
export const authRateLimiter = MainBackendRateLimiter.createAuthLimiter();
export const watchTogetherRateLimiter = MainBackendRateLimiter.createWatchTogetherLimiter();
export const apiRateLimiter = MainBackendRateLimiter.createAPILimiter();

// Middleware factory
export const createRateLimitMiddleware = (limiter: MainBackendRateLimiter) => {
  return async (request: any, reply: any, done: Function) => {
    try {
      const result = await limiter.checkRateLimit(request);
      
      // Add rate limit headers
      reply.header('X-RateLimit-Limit', result.totalHits + result.remaining);
      reply.header('X-RateLimit-Remaining', result.remaining);
      reply.header('X-RateLimit-Reset', result.resetTime);
      reply.header('X-RateLimit-Type', 'window');

      if (!result.allowed) {
        reply.code(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
        });
        return;
      }

      done();
    } catch (error) {
      logger.error('Rate limit middleware error:', error);
      // Continue on error
      done();
    }
  };
};

// Convenience middleware exports
export const tmdbRateLimit = createRateLimitMiddleware(tmdbRateLimiter);
export const searchRateLimit = createRateLimitMiddleware(searchRateLimiter);
export const authRateLimit = createRateLimitMiddleware(authRateLimiter);
export const watchTogetherRateLimit = createRateLimitMiddleware(watchTogetherRateLimiter);
export const apiRateLimit = createRateLimitMiddleware(apiRateLimiter);

export default MainBackendRateLimiter;