// Performance monitoring service
import { logger } from '../utils/logger';
import { mixpanelService } from '../config/mixpanel';

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

interface RequestMetrics {
  duration: number;
  statusCode: number;
  endpoint: string;
  method: string;
  userAgent?: string;
  ip?: string;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private startTime: number = Date.now();
  private requestCount: number = 0;
  private errorCount: number = 0;
  
  private constructor() {
    // Track system metrics every 30 seconds
    setInterval(() => {
      this.trackSystemMetrics();
    }, 30000);
  }
  
  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }
  
  // Track request performance
  trackRequest(metrics: RequestMetrics): void {
    this.requestCount++;
    if (metrics.statusCode >= 400) {
      this.errorCount++;
    }
    
    // Add to metrics
    this.addMetric('request_duration', metrics.duration, 'ms', {
      endpoint: metrics.endpoint,
      method: metrics.method,
      status_code: metrics.statusCode.toString()
    });
    
    // Track in Mixpanel
    mixpanelService.track('api_performance', {
      endpoint: metrics.endpoint,
      method: metrics.method,
      duration: metrics.duration,
      statusCode: metrics.statusCode,
      timestamp: new Date().toISOString()
    }).catch(() => {});
    
    // Log slow requests
    if (metrics.duration > 1000) {
      logger.warn(`Slow request detected: ${metrics.method} ${metrics.endpoint} took ${metrics.duration}ms`);
    }
  }
  
  // Track custom metrics
  private addMetric(name: string, value: number, unit: string, tags?: Record<string, string>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: new Date(),
      tags: tags || {}
    };
    
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    this.metrics.get(name)!.push(metric);
    
    // Keep only last 1000 metrics per name
    const metrics = this.metrics.get(name)!;
    if (metrics.length > 1000) {
      metrics.splice(0, metrics.length - 1000);
    }
  }
  
  // Track system metrics
  private trackSystemMetrics(): void {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Memory metrics
      this.addMetric('memory_heap_used', memUsage.heapUsed, 'bytes');
      this.addMetric('memory_heap_total', memUsage.heapTotal, 'bytes');
      this.addMetric('memory_external', memUsage.external, 'bytes');
      this.addMetric('memory_rss', memUsage.rss, 'bytes');
      
      // CPU metrics
      this.addMetric('cpu_user', cpuUsage.user, 'microseconds');
      this.addMetric('cpu_system', cpuUsage.system, 'microseconds');
      
      // Uptime
      this.addMetric('uptime', Date.now() - this.startTime, 'ms');
      
      // Request rate
      const requestsPerMinute = (this.requestCount / ((Date.now() - this.startTime) / 60000));
      this.addMetric('requests_per_minute', requestsPerMinute, 'requests');
      
      // Error rate
      const errorRate = this.errorCount / this.requestCount * 100;
      this.addMetric('error_rate', errorRate, 'percentage');
      
    } catch (error) {
      logger.error('Failed to track system metrics:', error);
    }
  }
  
  // Get current performance stats
  getStats(): any {
    const uptime = Date.now() - this.startTime;
    const requestsPerMinute = (this.requestCount / (uptime / 60000));
    const avgErrorRate = this.errorCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;
    
    return {
      uptime,
      totalRequests: this.requestCount,
      totalErrors: this.errorCount,
      requestsPerMinute: Math.round(requestsPerMinute * 100) / 100,
      errorRate: Math.round(avgErrorRate * 100) / 100,
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }
  
  // Get performance summary for health checks
  getPerformanceSummary(): any {
    const stats = this.getStats();
    const healthScore = this.calculateHealthScore(stats);
    
    return {
      ...stats,
      healthScore,
      status: healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'degraded' : 'unhealthy',
      recommendations: this.getRecommendations(stats)
    };
  }
  
  private calculateHealthScore(stats: any): number {
   let score = 100;

   // Deduct points for high error rate
   if (stats.errorRate > 5) score -= 30;
   else if (stats.errorRate > 2) score -= 15;
   else if (stats.errorRate > 1) score -= 5;

   // Deduct points for high memory usage (less aggressive in development)
   const memUsage = (stats.memory.heapUsed / stats.memory.heapTotal) * 100;
   const isDevelopment = process.env.NODE_ENV === 'development';

   if (isDevelopment) {
     // More lenient thresholds for development
     if (memUsage > 95) score -= 20;
     else if (memUsage > 90) score -= 10;
     else if (memUsage > 85) score -= 5;
   } else {
     // Production thresholds
     if (memUsage > 90) score -= 20;
     else if (memUsage > 80) score -= 10;
     else if (memUsage > 70) score -= 5;
   }

   // Deduct points for low request rate (could indicate traffic issues)
   // Less strict in development where traffic is low
   if (!isDevelopment && stats.requestsPerMinute < 1) score -= 10;

   return Math.max(0, score);
 }
  
  private getRecommendations(stats: any): string[] {
    const recommendations: string[] = [];
    
    if (stats.errorRate > 2) {
      recommendations.push('High error rate detected. Check logs and error tracking.');
    }
    
    const memUsage = (stats.memory.heapUsed / stats.memory.heapTotal) * 100;
    if (memUsage > 80) {
      recommendations.push('High memory usage detected. Consider optimizing memory-intensive operations.');
    }
    
    if (stats.requestsPerMinute < 1) {
      recommendations.push('Low request rate detected. Check API accessibility and load balancing.');
    }
    
    return recommendations;
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
export default performanceMonitor;