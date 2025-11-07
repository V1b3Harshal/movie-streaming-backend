import { getRedisClient, RedisKeys } from '../config/redis';
import { logger } from '../utils/logger';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

export class RateLimitService {
  private static instance: RateLimitService;
  private inMemoryRateLimit: Map<string, number[]> = new Map();

  public static getInstance(): RateLimitService {
    if (!RateLimitService.instance) {
      RateLimitService.instance = new RateLimitService();
    }
    return RateLimitService.instance;
  }

  async checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult> {
    try {
      const client = getRedisClient();
      const now = Date.now();
      const windowStart = now - windowMs;
      const rateLimitKey = `${RedisKeys.rateLimit}${key}`;

      // Remove old requests
      await client.zRemRangeByScore(rateLimitKey, 0, windowStart);

      // Add current request
      await client.zAdd(rateLimitKey, [{ score: now, value: now.toString() }]);
      await client.expire(rateLimitKey, Math.ceil(windowMs / 1000));

      // Get current count
      const currentCountResult = await client.zCard(rateLimitKey);
      const currentCount = currentCountResult.result || 0;
      const remaining = Math.max(0, maxRequests - currentCount);

      return {
        allowed: currentCount <= maxRequests,
        remaining,
        resetTime: now + windowMs
      };
    } catch (error) {
      logger.error('Redis rate limiting failed, falling back to in-memory:', error);
      return this.checkInMemoryRateLimit(key, maxRequests, windowMs);
    }
  }

  private checkInMemoryRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const rateLimitKey = `rate_limit:${key}`;

    // Initialize if not exists
    if (!this.inMemoryRateLimit.has(rateLimitKey)) {
      this.inMemoryRateLimit.set(rateLimitKey, []);
    }

    // Remove old requests
    const requests = this.inMemoryRateLimit.get(rateLimitKey)!;
    const filteredRequests = requests.filter(time => now - time < windowMs);
    this.inMemoryRateLimit.set(rateLimitKey, filteredRequests);

    // Check if rate limit exceeded
    const currentCount = filteredRequests.length;
    const remaining = Math.max(0, maxRequests - currentCount);

    if (currentCount >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: now + windowMs
      };
    }

    // Add current request
    filteredRequests.push(now);
    this.inMemoryRateLimit.set(rateLimitKey, filteredRequests);

    return {
      allowed: true,
      remaining,
      resetTime: now + windowMs
    };
  }

  // Cleanup old in-memory rate limit entries
  cleanup(): void {
    const now = Date.now();
    const cleanupThreshold = 24 * 60 * 60 * 1000; // 24 hours

    for (const [key, requests] of this.inMemoryRateLimit.entries()) {
      const filteredRequests = requests.filter(time => now - time < cleanupThreshold);
      if (filteredRequests.length === 0) {
        this.inMemoryRateLimit.delete(key);
      } else {
        this.inMemoryRateLimit.set(key, filteredRequests);
      }
    }
  }
}

export const rateLimitService = RateLimitService.getInstance();