// Cloudflare configuration and utilities
import { logger } from '../utils/logger';

export interface CloudflareConfig {
  apiToken?: string;
  zoneId?: string;
  apiUrl: string;
}

let cloudflareConfig: CloudflareConfig | null = null;

export const initCloudflare = () => {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ZONE_ID) {
    logger.warn('Cloudflare configuration missing, skipping Cloudflare initialization');
    return;
  }

  cloudflareConfig = {
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
    apiUrl: 'https://api.cloudflare.com/client/v4'
  };

  logger.info('Cloudflare initialized successfully');
};

export const getCloudflareConfig = () => {
  return cloudflareConfig;
};

// Cloudflare API utilities
export const cloudflareAPI = {
  // Cache management
  async purgeCache(urls?: string[]) {
    if (!cloudflareConfig) return false;

    try {
      const response = await fetch(`${cloudflareConfig.apiUrl}/zones/${cloudflareConfig.zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cloudflareConfig.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: urls || [], // If empty, purges entire cache
          hosts: [], // Optional: purge by host
          tags: [], // Optional: purge by tags
        })
      });

      const result = await response.json();
      
      if (result.success) {
        logger.info('Cloudflare cache purged successfully');
        return true;
      } else {
        logger.error('Cloudflare cache purge failed:', result.errors);
        return false;
      }
    } catch (error) {
      logger.error('Failed to purge Cloudflare cache:', error);
      return false;
    }
  },

  // DNS management
  async createDNSRecord(name: string, type: string, content: string, ttl: number = 300) {
    if (!cloudflareConfig) return null;

    try {
      const response = await fetch(`${cloudflareConfig.apiUrl}/zones/${cloudflareConfig.zoneId}/dns_records`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cloudflareConfig.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          name,
          content,
          ttl
        })
      });

      const result = await response.json();
      
      if (result.success) {
        logger.info(`DNS record created: ${name} -> ${content}`);
        return result.result;
      } else {
        logger.error('Failed to create DNS record:', result.errors);
        return null;
      }
    } catch (error) {
      logger.error('Failed to create DNS record:', error);
      return null;
    }
  },

  // Analytics
  async getAnalytics(startDate: string, endDate: string) {
    if (!cloudflareConfig) return null;

    try {
      const response = await fetch(
        `${cloudflareConfig.apiUrl}/zones/${cloudflareConfig.zoneId}/analytics/dashboard?since=${startDate}&until=${endDate}`,
        {
          headers: {
            'Authorization': `Bearer ${cloudflareConfig.apiToken}`,
          }
        }
      );

      const result = await response.json();
      
      if (result.success) {
        return result.result;
      } else {
        logger.error('Failed to get Cloudflare analytics:', result.errors);
        return null;
      }
    } catch (error) {
      logger.error('Failed to get Cloudflare analytics:', error);
      return null;
    }
  },

  // Security settings
  async getSecuritySettings() {
    if (!cloudflareConfig) return null;

    try {
      const response = await fetch(`${cloudflareConfig.apiUrl}/zones/${cloudflareConfig.zoneId}/settings`, {
        headers: {
          'Authorization': `Bearer ${cloudflareConfig.apiToken}`,
        }
      });

      const result = await response.json();
      
      if (result.success) {
        return result.result;
      } else {
        logger.error('Failed to get security settings:', result.errors);
        return null;
      }
    } catch (error) {
      logger.error('Failed to get security settings:', error);
      return null;
    }
  }
};

// Middleware for automatic cache invalidation
export const createCacheInvalidationMiddleware = () => {
  return async (request: any, _reply: any, done: any) => {
    try {
      // Only invalidate cache for certain endpoints
      if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
        const url = request.url;
        
        // Invalidate cache for content-related endpoints
        if (url.includes('/movies') || url.includes('/tv-series') || url.includes('/auth')) {
          await cloudflareAPI.purgeCache([`${request.protocol}://${request.hostname}${url}`]);
        }
      }
    } catch (error) {
      logger.error('Cache invalidation failed:', error);
    }
    
    done();
  };
};

// Rate limiting using Cloudflare
export const createCloudflareRateLimit = (_requests: number, _window: number) => {
  return async (_request: any, _reply: any) => {
    // This would integrate with Cloudflare's rate limiting API
    // For now, we'll use our existing rate limiting
    return true; // Allow request
  };
};

export default cloudflareAPI;