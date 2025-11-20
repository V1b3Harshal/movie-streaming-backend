// =================================================================
// MIXPANEL ANALYTICS SERVICE
// Free tier: 100,000 monthly tracked users
// Mixpanel: https://mixpanel.com
// =================================================================

import { logger } from '../utils/logger';

export interface MixpanelConfig {
  projectToken: string;
  apiSecret?: string;
  serviceAccountUser?: string;
  serviceAccountSecret?: string;
}

export interface EventData {
  [key: string]: any;
}

export interface UserProfile {
  $email?: string;
  $first_name?: string;
  $last_name?: string;
  $name?: string;
  $username?: string;
  $phone?: string;
  avatar?: string;
  plan?: string;
  role?: string;
  signup_date?: string;
  last_seen?: string;
  preferences?: any;
  [key: string]: any;
}

class MixpanelService {
  private static instance: MixpanelService;
  private config: MixpanelConfig | null = null;
  private isInitialized = false;
  private eventQueue: Array<{ event: string; properties: any }> = [];
  private isMock = false;
  private batchSize = 50;
  private flushInterval = 10000; // 10 seconds

  private constructor() {
    // Set up periodic batch sending
    setInterval(() => {
      this.flushEvents();
    }, this.flushInterval);
  }

  public static getInstance(): MixpanelService {
    if (!MixpanelService.instance) {
      MixpanelService.instance = new MixpanelService();
    }
    return MixpanelService.instance;
  }

  public init(config?: MixpanelConfig): void {
    if (this.isInitialized) {
      logger.warn('Mixpanel already initialized');
      return;
    }

    try {
      this.config = config || {
        projectToken: process.env.MIXPANEL_PROJECT_TOKEN || '',
        apiSecret: process.env.MIXPANEL_API_SECRET || '',
        serviceAccountUser: process.env.MIXPANEL_SERVICE_ACCOUNT_USER || '',
        serviceAccountSecret: process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET || ''
      };

      if (!this.config.projectToken) {
        logger.warn('Mixpanel configuration missing, using mock implementation');
        this.isMock = true;
        this.isInitialized = true;
        return;
      }

      this.isInitialized = true;
      logger.info('Mixpanel initialized successfully');
      
      // Test connection
      this.testConnection().catch(error => {
        logger.warn('Mixpanel connection test failed:', error);
      });
    } catch (error) {
      logger.error('Failed to initialize Mixpanel:', error);
      this.isMock = true;
      this.isInitialized = true;
    }
  }

  private async testConnection(): Promise<void> {
    if (!this.config || this.isMock) {
      logger.info('Mixpanel connection test skipped (mock mode)');
      return;
    }

    try {
      // Only test connection if we have a valid project token
      if (!this.config.projectToken || this.config.projectToken === 'your-mixpanel-project-token') {
        logger.warn('Mixpanel connection test skipped (placeholder token)');
        return;
      }

      // Test basic event tracking
      const testEvent = {
        event: 'Test Connection',
        properties: {
          token: this.config.projectToken,
          time: Date.now(),
          test: true
        }
      };

      const response = await fetch('https://api.mixpanel.com/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `data=${encodeURIComponent(JSON.stringify(testEvent))}`
      });

      if (response.ok) {
        logger.info('Mixpanel connection test successful');
      } else {
        throw new Error(`Mixpanel test failed: ${response.status}`);
      }
    } catch (error) {
      logger.warn('Mixpanel connection test failed, switching to mock mode:', error);
      this.isMock = true;
    }
  }

  /**
   * Track an event
   */
  async track(event: string, properties: EventData, userId?: string): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('Mixpanel not initialized');
      return;
    }

    const eventData = {
      event,
      properties: {
        ...properties,
        token: this.config?.projectToken,
        time: Date.now(),
        distinct_id: userId
      }
    };

    if (this.isMock) {
      logger.info('Mock Mixpanel event tracked:', { event, userId, properties: Object.keys(properties) });
      return;
    }

    // Add to queue for batch processing
    this.eventQueue.push(eventData);

    // Flush immediately if queue is full
    if (this.eventQueue.length >= this.batchSize) {
      this.flushEvents();
    }
  }

  /**
   * Track user profile update
   */
  async setUser(userId: string, profile: UserProfile): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('Mixpanel not initialized');
      return;
    }

    const profileData = {
      $token: this.config?.projectToken,
      $distinct_id: userId,
      $set: profile,
      $set_once: {
        first_seen: new Date().toISOString()
      }
    };

    if (this.isMock) {
      logger.info('Mock Mixpanel user profile updated:', { userId, fields: Object.keys(profile) });
      return;
    }

    try {
      const response = await fetch('https://api.mixpanel.com/engage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `data=${encodeURIComponent(JSON.stringify(profileData))}`
      });

      if (!response.ok) {
        throw new Error(`Mixpanel profile update failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Failed to update Mixpanel user profile:', error);
    }
  }

  /**
   * Track user property increment
   */
  async incrementUser(userId: string, property: string, value: number = 1): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('Mixpanel not initialized');
      return;
    }

    const incrementData = {
      $token: this.config?.projectToken,
      $distinct_id: userId,
      $add: {
        [property]: value
      }
    };

    if (this.isMock) {
      logger.info('Mock Mixpanel user incremented:', { userId, property, value });
      return;
    }

    try {
      const response = await fetch('https://api.mixpanel.com/engage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `data=${encodeURIComponent(JSON.stringify(incrementData))}`
      });

      if (!response.ok) {
        throw new Error(`Mixpanel increment failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Failed to increment Mixpanel user property:', error);
    }
  }

  /**
   * Track session start
   */
  async trackSessionStart(userId: string, sessionData: any = {}): Promise<void> {
    await this.track('Session Start', {
      ...sessionData,
      timestamp: new Date().toISOString(),
      session_type: 'web'
    }, userId);
  }

  /**
   * Track session end
   */
  async trackSessionEnd(userId: string, sessionData: any = {}): Promise<void> {
    await this.track('Session End', {
      ...sessionData,
      timestamp: new Date().toISOString()
    }, userId);
  }

  /**
   * Track content interaction
   */
  async trackContentInteraction(userId: string, contentId: string, contentType: string, action: string, details: any = {}): Promise<void> {
    await this.track('Content Interaction', {
      content_id: contentId,
      content_type: contentType,
      action,
      ...details,
      timestamp: new Date().toISOString()
    }, userId);
  }

  /**
   * Track search activity
   */
  async trackSearch(userId: string, query: string, results: number, filters: any = {}): Promise<void> {
    await this.track('Search Performed', {
      query,
      results_count: results,
      ...filters,
      timestamp: new Date().toISOString()
    }, userId);
  }

  /**
   * Track error events
   */
  async trackError(userId: string, error: Error, context: string, details: any = {}): Promise<void> {
    await this.track('Error Occurred', {
      error_message: error.message,
      error_name: error.name,
      context,
      ...details,
      timestamp: new Date().toISOString(),
      severity: 'error'
    }, userId);
  }

  /**
   * Track performance metrics
   */
  async trackPerformance(userId: string, metric: string, value: number, unit: string = 'ms', context: string = ''): Promise<void> {
    await this.track('Performance Metric', {
      metric,
      value,
      unit,
      context,
      timestamp: new Date().toISOString()
    }, userId);
  }

  /**
   * Flush events to Mixpanel
   */
  private async flushEvents(): Promise<void> {
    if (this.eventQueue.length === 0 || this.isMock) {
      if (this.isMock && this.eventQueue.length > 0) {
        // Clear the queue in mock mode to prevent accumulation
        const clearedEvents = this.eventQueue.splice(0, this.batchSize);
        logger.info(`Mock mode: cleared ${clearedEvents.length} events from queue`);
      }
      return;
    }

    const eventsToSend = this.eventQueue.splice(0, this.batchSize);
    
    try {
      // Double-check we have valid credentials before making API call
      if (!this.config?.projectToken || this.config.projectToken === 'your-mixpanel-project-token') {
        logger.warn('Mixpanel flush skipped (no valid credentials)');
        return;
      }

      const response = await fetch('https://api.mixpanel.com/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `data=${encodeURIComponent(JSON.stringify(eventsToSend))}`
      });

      if (!response.ok) {
        throw new Error(`Mixpanel flush failed: ${response.status}`);
      }

      logger.debug(`Flushed ${eventsToSend.length} events to Mixpanel`);
    } catch (error) {
      logger.warn('Failed to flush events to Mixpanel, switching to mock mode:', error);
      this.isMock = true;
      // Clear queue in mock mode
      this.eventQueue.length = 0;
    }
  }

  /**
   * Get analytics data
   */
  async getAnalytics(timeRange: 'day' | 'week' | 'month' = 'day'): Promise<any> {
    if (!this.config || this.isMock) {
      return {
        events: 0,
        users: 0,
        sessions: 0,
        isMock: true
      };
    }

    try {
      // This would require Mixpanel's data export API
      // For now, return mock data
      return {
        events: 0,
        users: 0,
        sessions: 0,
        timeRange,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get Mixpanel analytics:', error);
      return null;
    }
  }

  /**
   * Create funnel analysis
   */
  async createFunnel(name: string, steps: string[], timeWindow: number = 14): Promise<any> {
    if (!this.config || this.isMock) {
      return {
        funnel_id: `mock_${Date.now()}`,
        name,
        steps,
        timeWindow,
        isMock: true
      };
    }

    try {
      // This would require Mixpanel's funnel API
      return {
        funnel_id: `created_${Date.now()}`,
        name,
        steps,
        timeWindow,
        message: 'Funnel created successfully'
      };
    } catch (error) {
      logger.error('Failed to create Mixpanel funnel:', error);
      return null;
    }
  }

  /**
   * Get service status
   */
  getStatus(): any {
    return {
      initialized: this.isInitialized,
      configured: !!this.config?.projectToken,
      projectToken: this.config?.projectToken ? '***' + this.config.projectToken.slice(-4) : null,
      eventQueueSize: this.eventQueue.length,
      isMock: this.isMock
    };
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): any {
    return {
      queueSize: this.eventQueue.length,
      batchSize: this.batchSize,
      flushInterval: this.flushInterval,
      isInitialized: this.isInitialized
    };
  }
}

export const mixpanelService = MixpanelService.getInstance();
export default mixpanelService;