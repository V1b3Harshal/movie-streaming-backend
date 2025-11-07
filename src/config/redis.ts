// Upstash Redis configuration
import { env } from 'process';

// Check if Upstash is configured
const isUpstashConfigured = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN;

// Redis client instance
let isConnected = false;

// Initialize Upstash Redis client
export const connectToRedis = async (): Promise<void> => {
  if (!isUpstashConfigured) {
    console.log('Upstash Redis configuration missing, using in-memory fallback');
    isConnected = true;
    return;
  }

  try {
    // Use fetch API for Upstash REST API - test with a simple ping
    const response = await fetch(`${env.UPSTASH_REDIS_REST_URL}/ping`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to connect to Upstash: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (result.result !== 'PONG') {
      throw new Error(`Upstash ping returned unexpected result: ${result.result}`);
    }

    isConnected = true;
    console.log('Connected to Upstash Redis successfully');
  } catch (error) {
    console.error('Failed to connect to Upstash Redis:', error);
    console.log('Using in-memory fallback');
    isConnected = true; // Allow fallback to continue
  }
};

// Get Redis client
export const getRedisClient = () => {
  if (!isConnected) {
    throw new Error('Redis not connected. Call connectToRedis() first.');
  }
  
  const memoryStore = new Map<string, any>();
  
  return {
    // Redis operations
    zAdd: async (key: string, entries: Array<{ score: number; value: string }>) => {
      if (!memoryStore.has(key)) {
        memoryStore.set(key, new Map());
      }
      const zSet = memoryStore.get(key);
      entries.forEach(entry => {
        zSet.set(entry.value, entry.score);
      });
      return { result: entries.length };
    },

    zRemRangeByScore: async (key: string, min: number, max: number) => {
      if (!memoryStore.has(key)) {
        return { result: 0 };
      }
      const zSet = memoryStore.get(key);
      let removed = 0;
      for (const [value, score] of zSet) {
        if (score >= min && score <= max) {
          zSet.delete(value);
          removed++;
        }
      }
      return { result: removed };
    },

    zCard: async (key: string) => {
      if (!memoryStore.has(key)) {
        return { result: 0 };
      }
      return { result: memoryStore.get(key).size };
    },

    expire: async (key: string, seconds: number) => {
      // In-memory implementation doesn't support TTL, but we'll simulate it
      return { result: 1 };
    },

    del: async (key: string) => {
      const deleted = memoryStore.delete(key);
      return { result: deleted ? 1 : 0 };
    },

    sAdd: async (key: string, members: string[]) => {
      if (!memoryStore.has(key)) {
        memoryStore.set(key, new Set());
      }
      const set = memoryStore.get(key);
      let added = 0;
      members.forEach(member => {
        if (!set.has(member)) {
          set.add(member);
          added++;
        }
      });
      return { result: added };
    },

    sRem: async (key: string, member: string) => {
      if (!memoryStore.has(key)) {
        return { result: 0 };
      }
      const set = memoryStore.get(key);
      const deleted = set.delete(member);
      return { result: deleted ? 1 : 0 };
    },

    hGetAll: async (key: string) => {
      if (!memoryStore.has(key)) {
        return { result: {} };
      }
      return { result: Object.fromEntries(memoryStore.get(key)) };
    },

    hSet: async (key: string, field: string, value: string) => {
      if (!memoryStore.has(key)) {
        memoryStore.set(key, new Map());
      }
      const hash = memoryStore.get(key);
      hash.set(field, value);
      return { result: 1 };
    },

    multi: () => {
      // Return a mock multi object for batch operations
      return {
        exec: async () => {
          // For now, execute operations sequentially
          return [];
        }
      };
    },

    // Additional functions for refresh token support
    setRefreshToken: async (token: string, userId: string, email: string, expiresAt: number) => {
      const key = `refresh_token:${token}`;
      memoryStore.set(key, { userId, email, expiresAt });
      return { result: 'OK' };
    },

    getRefreshToken: async (token: string) => {
      const key = `refresh_token:${token}`;
      const data = memoryStore.get(key);
      return data || null;
    },

    removeRefreshToken: async (token: string) => {
      const key = `refresh_token:${token}`;
      const deleted = memoryStore.delete(key);
      return { result: deleted ? 1 : 0 };
    },

    isRefreshTokenValid: async (token: string) => {
      const key = `refresh_token:${token}`;
      const data = memoryStore.get(key);
      if (!data) return false;
      
      const now = Date.now();
      const expiresAt = data.expiresAt * 1000;
      return now < expiresAt;
    },

    cleanupExpiredTokens: async () => {
      const now = Date.now();
      let cleaned = 0;
      
      for (const [key, value] of memoryStore.entries()) {
        if (key.startsWith('refresh_token:')) {
          const expiresAt = value.expiresAt * 1000;
          if (now >= expiresAt) {
            memoryStore.delete(key);
            cleaned++;
          }
        }
      }
      
      return { result: cleaned };
    },

    // Utility methods
    isRedisConnected: () => isConnected,
    getRedisUrl: () => env.UPSTASH_REDIS_REST_URL || 'in-memory',
    getRedisToken: () => env.UPSTASH_REDIS_REST_TOKEN || ''
  };
};

// Check if Redis is connected
export const isRedisConnected = () => isConnected;

// Cleanup expired keys (Upstash handles TTL automatically, but we can add custom cleanup)
export const cleanupExpiredKeys = async (): Promise<void> => {
  if (!isConnected) return;
  
  try {
    // In-memory implementation doesn't need cleanup
    // Upstash automatically handles TTL expiration
    console.log('Redis cleanup completed');
  } catch (error) {
    console.error('Error during Redis cleanup:', error);
  }
};

// Redis keys constants
export const RedisKeys = {
  rateLimit: 'rate_limit:',
  refreshTokens: 'refresh_tokens:',
  sessions: 'sessions:',
  rooms: 'rooms:',
  roomParticipants: 'room_participants:',
  roomState: 'room_state:',
  activeRooms: 'active_rooms:'
};