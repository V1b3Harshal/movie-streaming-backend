// Movie/TV specific monitoring and metrics system
import { logger } from './logger';

export interface APIUsageMetrics {
  tmdb: {
    requests: number;
    errors: number;
    avgResponseTime: number;
    lastUsed: number;
  };
  trakt: {
    requests: number;
    errors: number;
    avgResponseTime: number;
    lastUsed: number;
  };
  providers: {
    requests: number;
    errors: number;
    avgResponseTime: number;
    lastUsed: number;
  };
}

export interface SearchMetrics {
  movieSearches: number;
  tvSearches: number;
  multiSearches: number;
  avgResultsCount: number;
  popularQueries: string[];
  searchErrors: number;
  popularEndpoints?: { endpoint: string; count: number }[];
}

export interface UserMetrics {
  totalRequests: number;
  authRequests: number;
  watchTogetherRequests: number;
  popularEndpoints: { endpoint: string; count: number }[];
  errorRate: number;
}

export interface SystemMetrics {
  uptime: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  databaseConnections: number;
  cacheHits: number;
  cacheMisses: number;
  activeConnections: number;
}

class MainBackendMetrics {
  private startTime = Date.now();
  private apiUsage: APIUsageMetrics = {
    tmdb: { requests: 0, errors: 0, avgResponseTime: 0, lastUsed: 0 },
    trakt: { requests: 0, errors: 0, avgResponseTime: 0, lastUsed: 0 },
    providers: { requests: 0, errors: 0, avgResponseTime: 0, lastUsed: 0 }
  };
  private searchMetrics: SearchMetrics = {
    movieSearches: 0,
    tvSearches: 0,
    multiSearches: 0,
    avgResultsCount: 0,
    popularQueries: [],
    searchErrors: 0,
    popularEndpoints: []
  };
  private userMetrics: UserMetrics = {
    totalRequests: 0,
    authRequests: 0,
    watchTogetherRequests: 0,
    popularEndpoints: [],
    errorRate: 0
  };
  private responseTimes: number[] = [];
  private queryFrequency = new Map<string, number>();
  private endpointFrequency = new Map<string, number>();
  private errorCount = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  // API Usage tracking
  recordAPIUsage(service: keyof APIUsageMetrics, responseTime: number, success: boolean): void {
    const metrics = this.apiUsage[service];
    metrics.requests++;
    metrics.lastUsed = Date.now();
    
    // Update average response time
    if (success) {
      metrics.avgResponseTime = (metrics.avgResponseTime + responseTime) / 2;
    }
    
    if (!success) {
      metrics.errors++;
    }
  }

  // Search tracking
  recordSearch(type: 'movie' | 'tv' | 'multi', query: string, resultCount: number, success: boolean): void {
    const queryLower = query.toLowerCase();
    
    switch (type) {
      case 'movie':
        this.searchMetrics.movieSearches++;
        break;
      case 'tv':
        this.searchMetrics.tvSearches++;
        break;
      case 'multi':
        this.searchMetrics.multiSearches++;
        break;
    }
    
    // Track query frequency
    const current = this.queryFrequency.get(queryLower) || 0;
    this.queryFrequency.set(queryLower, current + 1);
    
    // Update average results count
    if (success) {
      this.searchMetrics.avgResultsCount = (this.searchMetrics.avgResultsCount + resultCount) / 2;
    } else {
      this.searchMetrics.searchErrors++;
    }
  }

  // Request tracking
  recordRequest(endpoint: string, success: boolean, responseTime: number): void {
    this.userMetrics.totalRequests++;
    this.responseTimes.push(responseTime);
    
    // Keep only last 1000 response times
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }
    
    // Track endpoint frequency
    const current = this.endpointFrequency.get(endpoint) || 0;
    this.endpointFrequency.set(endpoint, current + 1);
    
    if (!success) {
      this.errorCount++;
    }
    
    // Update error rate
    this.userMetrics.errorRate = (this.errorCount / this.userMetrics.totalRequests) * 100;
  }

  // Auth and watch together tracking
  recordAuthRequest(success: boolean): void {
    this.userMetrics.authRequests++;
    if (!success) {
      this.errorCount++;
      this.userMetrics.errorRate = (this.errorCount / this.userMetrics.totalRequests) * 100;
    }
  }

  recordWatchTogetherRequest(success: boolean): void {
    this.userMetrics.watchTogetherRequests++;
    if (!success) {
      this.errorCount++;
      this.userMetrics.errorRate = (this.errorCount / this.userMetrics.totalRequests) * 100;
    }
  }

  // Cache tracking
  recordCacheHit(): void {
    this.cacheHits++;
  }

  recordCacheMiss(): void {
    this.cacheMisses++;
  }

  // Getters
  getAPIMetrics(): APIUsageMetrics {
    return { ...this.apiUsage };
  }

  getSearchMetrics(): SearchMetrics {
    const popularQueries = Array.from(this.queryFrequency.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([query]) => query);
    
    const popularEndpoints = Array.from(this.endpointFrequency.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([endpoint, count]) => ({ endpoint, count }));
    
    return {
      ...this.searchMetrics,
      popularQueries,
      popularEndpoints
    };
  }

  getUserMetrics(): UserMetrics {
    return { ...this.userMetrics };
  }

  getSystemMetrics(): SystemMetrics {
    const memoryUsage = process.memoryUsage();
    const totalRequests = this.userMetrics.totalRequests;
    
    return {
      uptime: Date.now() - this.startTime,
      memoryUsage: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss
      },
      databaseConnections: 1, // MongoDB connection
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      activeConnections: 0 // WebSocket connections would be tracked here
    };
  }

  getOverallMetrics() {
    const responseTimeStats = this.calculateResponseTimeStats();
    const apiMetrics = this.getAPIMetrics();
    const searchMetrics = this.getSearchMetrics();
    const userMetrics = this.getUserMetrics();
    const systemMetrics = this.getSystemMetrics();
    
    return {
      timestamp: new Date().toISOString(),
      uptime: systemMetrics.uptime,
      responseTime: responseTimeStats,
      api: apiMetrics,
      search: searchMetrics,
      users: userMetrics,
      system: systemMetrics,
      summary: {
        totalRequests: userMetrics.totalRequests,
        errorRate: userMetrics.errorRate,
        cacheHitRate: this.cacheHits + this.cacheMisses > 0 
          ? (this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100 
          : 0,
        topEndpoints: searchMetrics.popularEndpoints || [],
        topQueries: searchMetrics.popularQueries
      }
    };
  }

  private calculateResponseTimeStats() {
    if (this.responseTimes.length === 0) {
      return { avg: 0, min: 0, max: 0, p95: 0, p99: 0 };
    }
    
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);
    
    return {
      avg: Math.round(avg),
      min,
      max,
      p95: sorted[p95Index] || max,
      p99: sorted[p99Index] || max
    };
  }

  // Reset metrics (for testing or maintenance)
  reset(): void {
    this.apiUsage = {
      tmdb: { requests: 0, errors: 0, avgResponseTime: 0, lastUsed: 0 },
      trakt: { requests: 0, errors: 0, avgResponseTime: 0, lastUsed: 0 },
      providers: { requests: 0, errors: 0, avgResponseTime: 0, lastUsed: 0 }
    };
    this.searchMetrics = {
      movieSearches: 0,
      tvSearches: 0,
      multiSearches: 0,
      avgResultsCount: 0,
      popularQueries: [],
      searchErrors: 0,
      popularEndpoints: []
    };
    this.userMetrics = {
      totalRequests: 0,
      authRequests: 0,
      watchTogetherRequests: 0,
      popularEndpoints: [],
      errorRate: 0
    };
    this.responseTimes = [];
    this.queryFrequency.clear();
    this.endpointFrequency.clear();
    this.errorCount = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}

// Global metrics instance
export const mainBackendMetrics = new MainBackendMetrics();

// Monitoring middleware factory
export const createMetricsMiddleware = (endpoint: string) => {
  return async (request: any, reply: any, done: Function) => {
    const startTime = Date.now();
    
    // Store original send method
    const originalSend = reply.send;
    
    reply.send = function(data: any) {
      const responseTime = Date.now() - startTime;
      const success = reply.statusCode >= 200 && reply.statusCode < 400;
      
      mainBackendMetrics.recordRequest(endpoint, success, responseTime);
      
      // Track auth requests
      if (endpoint.startsWith('/auth/')) {
        mainBackendMetrics.recordAuthRequest(success);
      }
      
      // Track watch together requests
      if (endpoint.startsWith('/watch-together/')) {
        mainBackendMetrics.recordWatchTogetherRequest(success);
      }
      
      return originalSend.call(this, data);
    };
    
    done();
  };
};

// API usage tracking decorators
export const trackAPIUsage = (service: keyof APIUsageMetrics) => {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      try {
        const result = await method.apply(this, args);
        const responseTime = Date.now() - startTime;
        mainBackendMetrics.recordAPIUsage(service, responseTime, true);
        return result;
      } catch (error) {
        const responseTime = Date.now() - startTime;
        mainBackendMetrics.recordAPIUsage(service, responseTime, false);
        throw error;
      }
    };
  };
};

// Search tracking decorator
export const trackSearch = (type: 'movie' | 'tv' | 'multi') => {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const query = args[0] || '';
      try {
        const result = await method.apply(this, args);
        const responseTime = Date.now() - startTime;
        const resultCount = result?.results?.length || 0;
        mainBackendMetrics.recordSearch(type, query, resultCount, true);
        return result;
      } catch (error) {
        const responseTime = Date.now() - startTime;
        mainBackendMetrics.recordSearch(type, query, 0, false);
        throw error;
      }
    };
  };
};

export default MainBackendMetrics;