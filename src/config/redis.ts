import { createClient } from 'redis';
import { env } from 'process';

let redisClient: any = null;

export const connectToRedis = async () => {
  try {
    redisClient = createClient({
      url: env.REDIS_URL || 'redis://localhost:6379',
      password: env.REDIS_PASSWORD,
    });

    redisClient.on('error', (err: any) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Connected to Redis successfully');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('Redis connection error:', error);
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
  if (redisClient) {
    await redisClient.quit();
    console.log('Disconnected from Redis');
  }
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
  
  await client.hSet(key, {
    userId,
    email,
    expiresAt: expiresAt.toString(),
  });
  
  await client.expireAt(key, expiresAt);
};

export const getRefreshToken = async (token: string) => {
  const client = getRedisClient();
  const key = `${RedisKeys.refreshTokens}${token}`;
  
  const result = await client.hGetAll(key);
  return Object.keys(result).length > 0 ? result : null;
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
  const client = getRedisClient();
  const pattern = `${RedisKeys.refreshTokens}*`;
  
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
      console.log(`Cleaned up ${keys.length} expired refresh tokens`);
    }
  } catch (error) {
    console.error('Error cleaning up expired tokens:', error);
  }
};

// Rate limiting functions
export const incrementRateLimit = async (key: string, windowMs: number) => {
  const client = getRedisClient();
  const now = Date.now();
  const windowStart = now - windowMs;
  
  await client.zRemRangeByScore(key, 0, windowStart);
  await client.zAdd(key, [{ score: now, value: now.toString() }]);
  await client.expire(key, Math.ceil(windowMs / 1000));
  
  const currentCount = await client.zCard(key);
  return currentCount;
};

export const getRateLimitCount = async (key: string) => {
  const client = getRedisClient();
  return await client.zCard(key);
};