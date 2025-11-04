import { FastifyJWT } from '@fastify/jwt';
import { JWTPayload, RefreshTokenPayload } from '../types/jwt';
import { storeRefreshToken, getRefreshToken, removeRefreshToken, isRefreshTokenValid } from './refreshToken';
import crypto from 'crypto';

interface TokenRotationPayload extends JWTPayload {
  jti: string; // JWT ID for token identification
  sessionId: string; // Session identifier
  lastRotation?: number; // Timestamp of last rotation
  rotationCount?: number; // Number of rotations performed
}

interface SessionData {
  userId: string;
  email: string;
  sessionId: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  rotationCount: number;
  isActive: boolean;
}

// In-memory session storage (fallback when Redis is not available)
const sessionStore = new Map<string, SessionData>();
let redisModule: any = null;

try {
  redisModule = require('../config/redis');
} catch (error) {
  console.warn('Redis module not found. Using in-memory session storage.');
}

// Session management constants
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT_MS || '1800000'); // 30 minutes default
const TOKEN_ROTATION_INTERVAL = parseInt(process.env.TOKEN_ROTATION_INTERVAL_MS || '300000'); // 5 minutes default
const MAX_ROTATIONS = parseInt(process.env.MAX_TOKEN_ROTATIONS || '5'); // Max rotations per session

export const generateSessionId = (): string => {
  return crypto.randomBytes(16).toString('hex');
};

export const generateJTI = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const createSession = (userId: string, email: string): SessionData => {
  const sessionId = generateSessionId();
  const now = Date.now();
  const expiresAt = now + SESSION_TIMEOUT;
  
  const session: SessionData = {
    userId,
    email,
    sessionId,
    createdAt: now,
    lastActivity: now,
    expiresAt,
    rotationCount: 0,
    isActive: true,
  };

  if (redisModule && process.env.REDIS_URL) {
    try {
      storeSessionInRedis(session);
    } catch (error) {
      console.warn('Redis session storage failed, falling back to in-memory:', error);
      sessionStore.set(sessionId, session);
    }
  } else {
    sessionStore.set(sessionId, session);
  }

  return session;
};

export const updateSessionActivity = (sessionId: string): boolean => {
  const now = Date.now();
  
  if (redisModule && process.env.REDIS_URL) {
    try {
      return updateSessionActivityInRedis(sessionId, now);
    } catch (error) {
      console.warn('Redis session update failed, falling back to in-memory:', error);
    }
  }
  
  // Fallback to in-memory storage
  const session = sessionStore.get(sessionId);
  if (session && session.isActive && now < session.expiresAt) {
    session.lastActivity = now;
    sessionStore.set(sessionId, session);
    return true;
  }
  
  return false;
};

export const invalidateSession = (sessionId: string): boolean => {
  if (redisModule && process.env.REDIS_URL) {
    try {
      return invalidateSessionInRedis(sessionId);
    } catch (error) {
      console.warn('Redis session invalidation failed, falling back to in-memory:', error);
    }
  }
  
  // Fallback to in-memory storage
  const session = sessionStore.get(sessionId);
  if (session) {
    session.isActive = false;
    sessionStore.set(sessionId, session);
    return true;
  }
  
  return false;
};

export const isSessionValid = (sessionId: string): boolean => {
  const now = Date.now();
  
  if (redisModule && process.env.REDIS_URL) {
    try {
      return isSessionValidInRedis(sessionId, now);
    } catch (error) {
      console.warn('Redis session validation failed, falling back to in-memory:', error);
    }
  }
  
  // Fallback to in-memory storage
  const session = sessionStore.get(sessionId);
  return !!session && session.isActive && now < session.expiresAt;
};

export const rotateToken = async (
  fastify: any, 
  currentToken: string, 
  sessionId: string
): Promise<{ newToken: string; oldTokenJTI: string } | null> => {
  // Verify current session is valid
  if (!isSessionValid(sessionId)) {
    return null;
  }

  try {
    // Verify current token
    const decoded = fastify.jwt.verify(currentToken) as TokenRotationPayload;
    
    // Check if token needs rotation (based on time or rotation count)
    const now = Date.now();
    const timeSinceLastRotation = decoded.lastRotation ? now - decoded.lastRotation : 0;
    
    if (timeSinceLastRotation < TOKEN_ROTATION_INTERVAL && decoded.rotationCount! < MAX_ROTATIONS) {
      return null; // No rotation needed
    }

    // Update session activity
    if (!updateSessionActivity(sessionId)) {
      return null; // Session is invalid
    }

    // Generate new token with updated rotation info
    const newJTI = generateJTI();
    const newPayload: TokenRotationPayload = {
      userId: decoded.userId,
      email: decoded.email,
      jti: newJTI,
      sessionId,
      lastRotation: now,
      rotationCount: (decoded.rotationCount || 0) + 1,
    };

    const newToken = fastify.jwt.sign(newPayload, { expiresIn: '15m' });

    // Store the old token JTI for potential revocation
    const oldTokenJTI = decoded.jti;

    return { newToken, oldTokenJTI };
  } catch (error) {
    console.error('Token rotation failed:', error);
    return null;
  }
};

export const shouldRotateToken = (token: string, sessionId: string): boolean => {
  try {
    // Note: We can't verify the token without the fastify instance here
    // This is a simplified check - in practice, you'd verify the token first
    return isSessionValid(sessionId);
  } catch (error) {
    return false;
  }
};

export const cleanupExpiredSessions = async (): Promise<void> => {
  const now = Date.now();
  
  if (redisModule && process.env.REDIS_URL) {
    try {
      await cleanupExpiredSessionsInRedis(now);
      return;
    } catch (error) {
      console.warn('Redis session cleanup failed, falling back to in-memory:', error);
    }
  }
  
  // Fallback to in-memory storage
  for (const [sessionId, session] of sessionStore.entries()) {
    if (now >= session.expiresAt || !session.isActive) {
      sessionStore.delete(sessionId);
    }
  }
};

// Redis helper functions (when available)
const storeSessionInRedis = (session: SessionData): void => {
  const client = redisModule.getRedisClient();
  const key = `session:${session.sessionId}`;
  
  client.hset(key, {
    userId: session.userId,
    email: session.email,
    sessionId: session.sessionId,
    createdAt: session.createdAt.toString(),
    lastActivity: session.lastActivity.toString(),
    expiresAt: session.expiresAt.toString(),
    rotationCount: session.rotationCount.toString(),
    isActive: session.isActive.toString(),
  });
  
  // Set TTL
  const ttl = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
  if (ttl > 0) {
    client.expire(key, ttl);
  }
};

const updateSessionActivityInRedis = (sessionId: string, now: number): boolean => {
  const client = redisModule.getRedisClient();
  const key = `session:${sessionId}`;
  
  const result = client.hgetall(key);
  if (!result || Object.keys(result).length === 0) {
    return false;
  }
  
  client.hset(key, {
    lastActivity: now.toString(),
  });
  
  // Update TTL
  const expiresAt = parseInt(result.expiresAt);
  const ttl = Math.max(0, expiresAt - Math.floor(now / 1000));
  if (ttl > 0) {
    client.expire(key, ttl);
  }
  
  return true;
};

const invalidateSessionInRedis = (sessionId: string): boolean => {
  const client = redisModule.getRedisClient();
  const key = `session:${sessionId}`;
  
  const result = client.hgetall(key);
  if (!result || Object.keys(result).length === 0) {
    return false;
  }
  
  client.hset(key, {
    isActive: 'false',
  });
  
  // Set short TTL for cleanup
  client.expire(key, 300); // 5 minutes
  
  return true;
};

const isSessionValidInRedis = (sessionId: string, now: number): boolean => {
  const client = redisModule.getRedisClient();
  const key = `session:${sessionId}`;
  
  const result = client.hgetall(key);
  if (!result || Object.keys(result).length === 0) {
    return false;
  }
  
  const isActive = result.isActive === 'true';
  const expiresAt = parseInt(result.expiresAt);
  
  return isActive && now < expiresAt;
};

const cleanupExpiredSessionsInRedis = async (now: number): Promise<void> => {
  // Note: Upstash Redis doesn't support KEYS command for performance reasons
  // This function is kept for compatibility but won't work with Upstash
  console.log('Session cleanup not supported with Upstash Redis - use TTL instead');
};

// Initialize cleanup interval
setInterval(cleanupExpiredSessions, 60 * 60 * 1000); // Run every hour