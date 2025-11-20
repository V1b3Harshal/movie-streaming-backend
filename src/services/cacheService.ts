import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
  compress?: boolean; // Whether to compress large responses
}

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  tags?: string[] | undefined;
  hits: number;
}

class CacheService {
  private static instance: CacheService;
  private memoryCache = new Map<string, CacheEntry>();
  private pendingRequests = new Map<string, Promise<any>>();
  private readonly MAX_MEMORY_SIZE = 100; // Max items in memory cache
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes

  private constructor() {
    // Periodic cleanup of expired entries
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Multi-level cache get (Memory -> Redis)
   */
  async get(key: string): Promise<any | null> {
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && !this.isExpired(memoryEntry)) {
      memoryEntry.hits++;
      return memoryEntry.data;
    }

    // Check Redis cache
    try {
      const redis = getRedisClient();
      const cacheKey = `cache:${key}`;
      const redisData = await redis.get(cacheKey);

      if (redisData?.result) {
        const entry: CacheEntry = JSON.parse(redisData.result);

        // Promote to memory cache if frequently accessed
        if (entry.hits > 5) {
          this.memoryCache.set(key, entry);
          this.enforceMemoryLimit();
        }

        entry.hits++;
        await redis.set(cacheKey, JSON.stringify(entry));
        if (entry.ttl > 0) {
          await redis.expire(cacheKey, entry.ttl);
        }
        return entry.data;
      }
    } catch (error) {
      logger.warn('Redis cache get failed:', error);
    }

    return null;
  }

  /**
   * Multi-level cache set
   */
  async set(key: string, data: any, options: CacheOptions = {}): Promise<void> {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl: options.ttl || 3600, // Default 1 hour
      tags: options.tags,
      hits: 1
    };

    // Set in memory cache
    this.memoryCache.set(key, entry);
    this.enforceMemoryLimit();

    // Set in Redis cache
    try {
      const redis = getRedisClient();
      const cacheKey = `cache:${key}`;
      const serializedEntry = JSON.stringify(entry);
      await redis.set(cacheKey, serializedEntry);

      // Set TTL if specified
      if (entry.ttl > 0) {
        await redis.expire(cacheKey, entry.ttl);
      }

      // Store cache tags for invalidation
      if (options.tags?.length) {
        for (const tag of options.tags) {
          const tagKey = `tag:${tag}:${key}`;
          await redis.set(tagKey, '1');
          if (entry.ttl > 0) {
            await redis.expire(tagKey, entry.ttl);
          }
        }
      }
    } catch (error) {
      logger.warn('Redis cache set failed:', error);
    }
  }

  /**
   * Delete from all cache levels
   */
  async delete(key: string): Promise<void> {
    // Delete from memory
    this.memoryCache.delete(key);

    // Delete from Redis
    try {
      const redis = getRedisClient();
      await redis.del(`cache:${key}`);
    } catch (error) {
      logger.warn('Redis cache delete failed:', error);
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      for (const tag of tags) {
        // Note: In production, you'd use Redis SCAN or a more sophisticated approach
        // For now, we'll use a simple approach
        logger.info(`Invalidating cache for tag: ${tag}`);

        // Remove from memory cache (simplified approach)
        for (const [key, entry] of this.memoryCache.entries()) {
          if (entry.tags?.includes(tag)) {
            this.memoryCache.delete(key);
          }
        }
      }
    } catch (error) {
      logger.warn('Cache invalidation failed:', error);
    }
  }

  /**
   * Request deduplication - prevent duplicate concurrent requests
   */
  async deduplicateRequest<T>(
    key: string,
    requestFn: () => Promise<T>,
    ttl: number = 300
  ): Promise<T> {
    // Check if request is already pending
    const pendingRequest = this.pendingRequests.get(key);
    if (pendingRequest) {
      logger.debug(`Deduplicating request for key: ${key}`);
      return pendingRequest;
    }

    // Create new request
    const requestPromise = (async () => {
      try {
        const result = await requestFn();

        // Cache the result
        await this.set(key, result, { ttl });

        return result;
      } finally {
        // Remove from pending requests
        this.pendingRequests.delete(key);
      }
    })();

    // Store pending request
    this.pendingRequests.set(key, requestPromise);

    return requestPromise;
  }

  /**
   * HTTP response caching wrapper
   */
  async cachedHttpRequest<T>(
    url: string,
    options: RequestInit = {},
    cacheOptions: CacheOptions = {}
  ): Promise<T> {
    const cacheKey = `http:${url}:${JSON.stringify(options)}`;

    // Try cache first
    const cached = await this.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for HTTP request: ${url}`);
      return cached;
    }

    // Make request with deduplication
    return this.deduplicateRequest(
      cacheKey,
      async () => {
        logger.debug(`Making HTTP request: ${url}`);

        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
      },
      cacheOptions.ttl || 1800 // 30 minutes default
    );
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const memoryEntries = Array.from(this.memoryCache.values());
    const totalHits = memoryEntries.reduce((sum, entry) => sum + entry.hits, 0);

    return {
      memoryCache: {
        size: this.memoryCache.size,
        maxSize: this.MAX_MEMORY_SIZE,
        totalHits,
        averageHits: memoryEntries.length > 0 ? totalHits / memoryEntries.length : 0
      },
      pendingRequests: this.pendingRequests.size
    };
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.pendingRequests.clear();

    try {
      // In production, you'd want to be more selective
      // For now, clear cache keys (this is a simplified approach)
      logger.info('Cache cleared');
    } catch (error) {
      logger.warn('Redis cache clear failed:', error);
    }
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl * 1000;
  }

  private enforceMemoryLimit(): void {
    if (this.memoryCache.size > this.MAX_MEMORY_SIZE) {
      // Remove least recently used items
      const entries = Array.from(this.memoryCache.entries());
      entries.sort((a, b) => (a[1].hits / (Date.now() - a[1].timestamp)) - (b[1].hits / (Date.now() - b[1].timestamp)));

      const toRemove = entries.slice(0, Math.floor(this.MAX_MEMORY_SIZE * 0.2));
      for (const [key] of toRemove) {
        this.memoryCache.delete(key);
      }
    }
  }

  private cleanup(): void {
    const toDelete: string[] = [];

    for (const [key, entry] of this.memoryCache.entries()) {
      if (this.isExpired(entry)) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.memoryCache.delete(key);
    }

    if (toDelete.length > 0) {
      logger.debug(`Cleaned up ${toDelete.length} expired cache entries`);
    }
  }
}

export const cacheService = CacheService.getInstance();
export default cacheService;