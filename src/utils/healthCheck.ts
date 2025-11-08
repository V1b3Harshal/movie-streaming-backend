// Health check and monitoring for main backend
import { getDatabaseStatus } from '../config/database';
import { logger } from './logger';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  checks: {
    database: {
      status: 'ok' | 'error' | 'warning';
      message?: string;
      responseTime?: number;
      details?: any;
    };
    redis: {
      status: 'ok' | 'error' | 'warning';
      message?: string;
      responseTime?: number;
    };
    providersBackend: {
      status: 'ok' | 'error' | 'warning';
      message?: string;
      responseTime?: number;
    };
    tmdb: {
      status: 'ok' | 'error' | 'warning';
      message?: string;
      responseTime?: number;
    };
    trakt: {
      status: 'ok' | 'error' | 'warning';
      message?: string;
      responseTime?: number;
    };
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  version: string;
}

export interface ServiceHealth {
  name: string;
  url: string;
  timeout: number;
  critical: boolean;
  headers?: Record<string, string>;
}

class MainBackendHealthMonitor {
  private startTime = Date.now();
  private version = '1.0.0';

  async performHealthCheck(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {
      database: { status: 'ok' },
      redis: { status: 'ok' },
      providersBackend: { status: 'ok' },
      tmdb: { status: 'ok' },
      trakt: { status: 'ok' }
    };
    const overallStatus: Array<'healthy' | 'unhealthy' | 'degraded'> = ['healthy'];

    // Database health check
    try {
      const dbStart = Date.now();
      const dbStatus = getDatabaseStatus();
      const responseTime = Date.now() - dbStart;
      
      if (dbStatus.isConnected) {
        checks.database = {
          status: 'ok',
          responseTime,
          message: 'Database connected successfully',
          details: dbStatus
        };
      } else {
        checks.database = {
          status: 'error',
          responseTime,
          message: 'Database connection failed',
          details: dbStatus
        };
        overallStatus.push('unhealthy');
      }
    } catch (error) {
      checks.database = {
        status: 'error',
        message: 'Database health check failed',
        details: error instanceof Error ? error.message : String(error)
      };
      overallStatus.push('unhealthy');
    }

    // Redis health check
    try {
      const redisStart = Date.now();
      const { getRedisClient } = await import('../config/redis');
      const client = await getRedisClient();
      
      if (client) {
        // Use a simple operation available in our mock
        await client.hSet('health_check', 'status', 'ok');
        checks.redis = {
          status: 'ok',
          responseTime: Date.now() - redisStart,
          message: 'Redis connection successful'
        };
      } else {
        checks.redis = {
          status: 'warning',
          message: 'Using in-memory fallback'
        };
        overallStatus.push('degraded');
      }
    } catch (error) {
      checks.redis = {
        status: 'error',
        message: 'Redis connection failed',
        details: error instanceof Error ? error.message : String(error)
      };
      overallStatus.push('unhealthy');
    }

    // Providers backend health check
    try {
      const providerStart = Date.now();
      const { PROVIDERS_BACKEND_URL } = await import('../config/environment');
      const response = await fetch(`${PROVIDERS_BACKEND_URL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': process.env.INTERNAL_API_KEY || ''
        },
        signal: AbortSignal.timeout(5000)
      });
      
      const responseTime = Date.now() - providerStart;
      
      if (response.ok) {
        checks.providersBackend = {
          status: 'ok',
          responseTime,
          message: 'Providers backend responding'
        };
      } else {
        checks.providersBackend = {
          status: 'warning',
          responseTime,
          message: `Providers backend error (${response.status})`
        };
        overallStatus.push('degraded');
      }
    } catch (error) {
      checks.providersBackend = {
        status: 'error',
        message: 'Providers backend unreachable',
        details: error instanceof Error ? error.message : String(error)
      };
      overallStatus.push('unhealthy');
    }

    // TMDB API health check
    try {
      const tmdbStart = Date.now();
      const { TMDB_API_KEY } = await import('../config/environment');
      const response = await fetch(`https://api.themoviedb.org/3/movie/550?api_key=${TMDB_API_KEY}`, {
        signal: AbortSignal.timeout(5000)
      });
      
      const responseTime = Date.now() - tmdbStart;
      
      if (response.ok) {
        checks.tmdb = {
          status: 'ok',
          responseTime,
          message: 'TMDB API accessible'
        };
      } else {
        checks.tmdb = {
          status: 'error',
          responseTime,
          message: `TMDB API error (${response.status})`
        };
        overallStatus.push('unhealthy');
      }
    } catch (error) {
      checks.tmdb = {
        status: 'error',
        message: 'TMDB API unreachable',
        details: error instanceof Error ? error.message : String(error)
      };
      overallStatus.push('unhealthy');
    }

    // Trakt API health check
    try {
      const traktStart = Date.now();
      const { TRAKT_API_URL, TRAKT_CLIENT_ID } = await import('../config/environment');
      const response = await fetch(`${TRAKT_API_URL}/users/me`, {
        headers: {
          'trakt-api-key': TRAKT_CLIENT_ID,
          'trakt-api-version': '2'
        },
        signal: AbortSignal.timeout(5000)
      });
      
      const responseTime = Date.now() - traktStart;
      
      if (response.ok || response.status === 401) {
        // 401 is expected without auth, but shows API is reachable
        checks.trakt = {
          status: 'ok',
          responseTime,
          message: 'Trakt API accessible'
        };
      } else {
        checks.trakt = {
          status: 'error',
          responseTime,
          message: `Trakt API error (${response.status})`
        };
        overallStatus.push('degraded');
      }
    } catch (error) {
      checks.trakt = {
        status: 'error',
        message: 'Trakt API unreachable',
        details: error instanceof Error ? error.message : String(error)
      };
      overallStatus.push('degraded');
    }

    // Memory usage
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal;
    const usedMemory = memoryUsage.heapUsed;
    const memoryPercentage = (usedMemory / totalMemory) * 100;

    if (memoryPercentage > 90) {
      overallStatus.push('unhealthy');
    } else if (memoryPercentage > 75) {
      overallStatus.push('degraded');
    }

    // Determine overall status
    let finalStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    if (overallStatus.includes('unhealthy')) {
      finalStatus = 'unhealthy';
    } else if (overallStatus.includes('degraded')) {
      finalStatus = 'degraded';
    }

    return {
      status: finalStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      checks,
      memory: {
        used: usedMemory,
        total: totalMemory,
        percentage: memoryPercentage
      },
      version: this.version
    };
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }

  getStatus(): { healthy: boolean; uptime: number } {
    return {
      healthy: true,
      uptime: this.getUptime()
    };
  }
}

// Global health monitor instance
export const mainBackendHealthMonitor = new MainBackendHealthMonitor();

// Middleware for health check endpoint
export const healthCheckMiddleware = () => {
  return async (request: any, reply: any) => {
    try {
      const result = await mainBackendHealthMonitor.performHealthCheck();
      
      const statusCode = result.status === 'healthy' ? 200 : 
                        result.status === 'degraded' ? 200 : 503;
      
      reply.code(statusCode).send(result);
    } catch (error) {
      logger.error('Health check failed:', error);
      reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check system failure',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  };
};