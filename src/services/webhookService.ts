// Webhook service for real-time notifications
import { logger } from '../utils/logger';
import { mixpanelService } from '../config/mixpanel';

interface WebhookEvent {
  type: string;
  data: any;
  timestamp: Date;
  source: string;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  secret?: string;
  events: string[];
  active: boolean;
}

class WebhookService {
  private static instance: WebhookService;
  private endpoints: Map<string, WebhookEndpoint> = new Map();
  private defaultWebhookUrl?: string;
  
  private constructor() {
    // Load webhook configuration
    this.loadConfiguration();
  }
  
  public static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }
  
  private loadConfiguration(): void {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (webhookUrl) {
      this.defaultWebhookUrl = webhookUrl;
      logger.info('Webhook service initialized with default URL');
    }
  }
  
  // Send webhook notification
  async sendWebhook(event: WebhookEvent): Promise<void> {
    if (!this.defaultWebhookUrl) {
      logger.warn('Webhook URL not configured, skipping notification');
      return;
    }
    
    try {
      const payload = {
        id: `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: event.type,
        data: event.data,
        timestamp: event.timestamp.toISOString(),
        source: event.source || 'movie-streaming-backend'
      };
      
      const response = await fetch(this.defaultWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Movie-Streaming-Backend/1.0'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      if (response.ok) {
        logger.info(`Webhook sent successfully for event: ${event.type}`);
        
        // Track in Mixpanel
        mixpanelService.track('webhook_sent', {
          eventType: event.type,
          timestamp: event.timestamp.toISOString(),
          source: event.source
        }).catch(() => {});
      } else {
        throw new Error(`Webhook failed with status ${response.status}`);
      }
      
    } catch (error) {
      logger.error('Failed to send webhook:', error);
      
      // Track error
      mixpanelService.track('webhook_error', {
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
        timestamp: event.timestamp.toISOString()
      }).catch(() => {});
    }
  }
  
  // High-level methods for common events
  
  // User activity events
  async notifyUserActivity(userId: string, action: string, metadata?: any): Promise<void> {
    await this.sendWebhook({
      type: 'user_activity',
      data: {
        userId,
        action,
        metadata,
        sessionId: metadata?.sessionId,
        userAgent: metadata?.userAgent,
        ip: metadata?.ip
      },
      timestamp: new Date(),
      source: 'movie-streaming-backend'
    });
  }
  
  // Content events
  async notifyContentEvent(eventType: string, contentId: string, contentType: string, metadata?: any): Promise<void> {
    await this.sendWebhook({
      type: 'content_event',
      data: {
        eventType,
        contentId,
        contentType,
        metadata
      },
      timestamp: new Date(),
      source: 'movie-streaming-backend'
    });
  }
  
  // System events
  async notifySystemEvent(eventType: string, data: any): Promise<void> {
    await this.sendWebhook({
      type: 'system_event',
      data: {
        eventType,
        data,
        service: 'movie-streaming-backend'
      },
      timestamp: new Date(),
      source: 'movie-streaming-backend'
    });
  }
  
  // Error events
  async notifyError(error: any, context: string, metadata?: any): Promise<void> {
    await this.sendWebhook({
      type: 'error_event',
      data: {
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : 'UnknownError'
        },
        context,
        metadata,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date(),
      source: 'movie-streaming-backend'
    });
  }
  
  // Performance events
  async notifyPerformanceIssue(endpoint: string, duration: number, threshold: number): Promise<void> {
    await this.sendWebhook({
      type: 'performance_issue',
      data: {
        endpoint,
        duration,
        threshold,
        severity: duration > threshold * 2 ? 'high' : 'medium'
      },
      timestamp: new Date(),
      source: 'movie-streaming-backend'
    });
  }
  
  // Health check events
  async notifyHealthStatus(status: string, details?: any): Promise<void> {
    await this.sendWebhook({
      type: 'health_status',
      data: {
        status,
        details,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date(),
      source: 'movie-streaming-backend'
    });
  }
  
  // API usage events
  async notifyApiUsage(endpoint: string, method: string, statusCode: number, responseTime: number): Promise<void> {
    await this.sendWebhook({
      type: 'api_usage',
      data: {
        endpoint,
        method,
        statusCode,
        responseTime,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date(),
      source: 'movie-streaming-backend'
    });
  }
  
  // Get webhook statistics
  getStatistics(): any {
    return {
      configured: !!this.defaultWebhookUrl,
      endpointCount: this.endpoints.size,
      activeEndpoints: Array.from(this.endpoints.values()).filter(ep => ep.active).length
    };
  }
}

export const webhookService = WebhookService.getInstance();
export default webhookService;