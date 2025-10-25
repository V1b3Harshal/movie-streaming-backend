import { Redis } from '@upstash/redis';
import { env } from 'process';

let redisClient: Redis | null = null;

export const connectToRedis = async () => {
  try {
    redisClient = new Redis({
      url: env.UPSTASH_REDIS_REST_URL || '',
      token: env.UPSTASH_REDIS_REST_TOKEN || '',
    });

    // Test the connection
    await redisClient.ping();
    console.log('Connected to Upstash Redis successfully');
    return redisClient;
  } catch (error) {
    console.error('Upstash Redis connection error:', error);
    throw error;
  }
};

export const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectToRedis first.');
  }
  return redisClient;
};

export const disconnectFromRedis = async () => {
  // Upstash Redis doesn't require explicit disconnection
  // as it uses HTTP REST API
  console.log('Upstash Redis connection managed automatically');
};

// Redis key prefixes for better organization
export const RedisKeys = {
  refreshTokens: 'refresh_token:',
  rateLimit: 'rate_limit:',
  userSessions: 'session:',
  cache: 'cache:',
} as const;

// Helper functions for Redis operations
export const setRefreshToken = async (token: string, userId: string, email: string, expiresAt: number) => {
  const client = getRedisClient();
  const key = `${RedisKeys.refreshTokens}${token}`;
  
  await client.hset(key, {
    userId,
    email,
    expiresAt: expiresAt.toString(),
  });
  
  // Set TTL in seconds
  const ttl = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  if (ttl > 0) {
    await client.expire(key, ttl);
  }
};

export const getRefreshToken = async (token: string) => {
  const client = getRedisClient();
  const key = `${RedisKeys.refreshTokens}${token}`;
  
  const result = await client.hgetall(key);
  return result !== null && Object.keys(result).length > 0 ? result : null;
};

export const removeRefreshToken = async (token: string) => {
  const client = getRedisClient();
  const key = `${RedisKeys.refreshTokens}${token}`;
  
  await client.del(key);
};

export const isRefreshTokenValid = async (token: string) => {
  const client = getRedisClient();
  const key = `${RedisKeys.refreshTokens}${token}`;
  
  const exists = await client.exists(key);
  return exists === 1;
};

export const cleanupExpiredTokens = async () => {
  // Upstash Redis doesn't support KEYS command for performance reasons
  // This function is kept for compatibility but won't work with Upstash
  console.log('Token cleanup not supported with Upstash Redis - use TTL instead');
};

// Rate limiting functions
export const incrementRateLimit = async (key: string, windowMs: number) => {
  const client = getRedisClient();
  const now = Date.now();
  const windowStart = now - windowMs;
  
  // Use ZREMRANGEBYSCORE equivalent
  await client.zremrangebyscore(key, 0, windowStart);
  
  // Use ZADD equivalent
  await client.zadd(key, { score: now, member: now.toString() });
  
  // Set TTL
  await client.expire(key, Math.ceil(windowMs / 1000));
  
  const currentCount = await client.zcard(key);
  return currentCount;
};

export const getRateLimitCount = async (key: string) => {
  const client = getRedisClient();
  return await client.zcard(key);
};