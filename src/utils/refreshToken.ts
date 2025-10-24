import { FastifyJWT } from '@fastify/jwt';
import { RefreshTokenPayload } from '../types/jwt';

// Try to use Redis if available, otherwise fall back to in-memory storage
let redisModule: any = null;
try {
  redisModule = require('../config/redis');
} catch (error) {
  console.warn('Redis module not found. Using in-memory refresh token storage.');
}

// In-memory storage for refresh tokens (fallback when Redis is not available)
const refreshTokenStore = new Map<string, RefreshTokenPayload>();

export const storeRefreshToken = async (token: string, payload: RefreshTokenPayload): Promise<void> => {
  if (redisModule && process.env.REDIS_URL) {
    try {
      const expiresAt = payload.exp || Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days default
      await redisModule.setRefreshToken(token, payload.userId, payload.email, expiresAt);
      return;
    } catch (error) {
      console.warn('Redis token storage failed, falling back to in-memory:', error);
    }
  }
  
  // Fallback to in-memory storage
  refreshTokenStore.set(token, payload);
};

export const getRefreshToken = async (token: string): Promise<RefreshTokenPayload | undefined> => {
  if (redisModule && process.env.REDIS_URL) {
    try {
      const result = await redisModule.getRefreshToken(token);
      if (result) {
        return {
          userId: result.userId,
          email: result.email,
          exp: parseInt(result.expiresAt),
        };
      }
      return undefined;
    } catch (error) {
      console.warn('Redis token retrieval failed, falling back to in-memory:', error);
    }
  }
  
  // Fallback to in-memory storage
  return refreshTokenStore.get(token);
};

export const removeRefreshToken = async (token: string): Promise<boolean> => {
  if (redisModule && process.env.REDIS_URL) {
    try {
      await redisModule.removeRefreshToken(token);
      return true;
    } catch (error) {
      console.warn('Redis token removal failed, falling back to in-memory:', error);
    }
  }
  
  // Fallback to in-memory storage
  return refreshTokenStore.delete(token);
};

export const isRefreshTokenValid = async (token: string): Promise<boolean> => {
  if (redisModule && process.env.REDIS_URL) {
    try {
      return await redisModule.isRefreshTokenValid(token);
    } catch (error) {
      console.warn('Redis token validation failed, falling back to in-memory:', error);
    }
  }
  
  // Fallback to in-memory storage
  const payload = refreshTokenStore.get(token);
  if (!payload) return false;
  
  // Check if token is expired
  if (payload.exp && Date.now() >= payload.exp * 1000) {
    refreshTokenStore.delete(token);
    return false;
  }
  
  return true;
};

export const cleanupExpiredTokens = async (): Promise<void> => {
  if (redisModule && process.env.REDIS_URL) {
    try {
      await redisModule.cleanupExpiredTokens();
      return;
    } catch (error) {
      console.warn('Redis token cleanup failed, falling back to in-memory:', error);
    }
  }
  
  // Fallback to in-memory storage
  const now = Date.now();
  for (const [token, payload] of refreshTokenStore.entries()) {
    if (payload.exp && now >= payload.exp * 1000) {
      refreshTokenStore.delete(token);
    }
  }
};

// Initialize cleanup interval
setInterval(cleanupExpiredTokens, 60 * 60 * 1000); // Run every hour