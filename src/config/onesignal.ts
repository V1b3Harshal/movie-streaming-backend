// =================================================================
// ONESIGNAL PUSH NOTIFICATION INTEGRATION
// Free tier: 10,000 monthly active users
// OneSignal: https://onesignal.com
// =================================================================

import axios from 'axios';
import { logger } from '../utils/logger';

export interface OneSignalConfig {
  appId: string;
  restApiKey: string;
}

export interface PushNotificationOptions {
  includedSegments?: string[];
  excludedPlayerIds?: string[];
  includePlayerIds?: string[];
  data?: Record<string, any>;
  buttons?: Array<{
    id: string;
    text: string;
    icon?: string;
  }>;
  url?: string;
  priority?: 'high' | 'normal';
  ttl?: number; // Time to live in seconds
}

export interface PushNotification {
  headings: {
    en: string;
  };
  contents: {
    en: string;
  };
  data?: Record<string, any>;
  include_player_ids?: string[];
  include_external_user_ids?: string[];
  included_segments?: string[];
  app_id?: string;
  small_icon?: string;
  large_icon?: string;
  big_picture?: string;
  buttons?: Array<{
    id: string;
    text: string;
    icon?: string;
  }>;
  url?: string;
  template_id?: string;
  android_channel_id?: string;
  ios_attachments?: Record<string, string>;
  chrome_icon?: string;
  chrome_big_picture?: string;
  chrome_web_image?: string;
  ad_id?: string;
  delay_send_time?: number;
  ttl?: number;
  priority?: number;
  subtitle?: {
    en: string;
  };
}

class OneSignalService {
  private static instance: OneSignalService;
  private config: OneSignalConfig | null = null;
  private baseUrl = 'https://onesignal.com/api/v1';
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): OneSignalService {
    if (!OneSignalService.instance) {
      OneSignalService.instance = new OneSignalService();
    }
    return OneSignalService.instance;
  }

  public init(config?: OneSignalConfig): void {
    if (this.isInitialized) {
      logger.warn('OneSignal already initialized');
      return;
    }

    try {
      this.config = config || {
        appId: process.env.ONESIGNAL_APP_ID || '',
        restApiKey: process.env.ONESIGNAL_REST_API_KEY || ''
      };

      if (!this.config.appId || !this.config.restApiKey ||
          this.config.appId === 'your-onesignal-app-id' ||
          this.config.restApiKey === 'your-onesignal-rest-api-key') {
        logger.info('OneSignal configuration missing, using mock implementation');
        this.isInitialized = true;
        return;
      }

      this.isInitialized = true;
      logger.info('OneSignal initialized successfully');
      
      // Test connection
      this.testConnection().catch(error => {
        logger.warn('OneSignal connection test failed, continuing with mock mode:', error);
      });
    } catch (error) {
      logger.error('Failed to initialize OneSignal:', error);
      this.isInitialized = true;
    }
  }

  private async testConnection(): Promise<void> {
    if (!this.config) {
      logger.info('OneSignal connection test skipped (no config)');
      return;
    }

    try {
      // Check for placeholder values
      if (this.config.appId === 'your-onesignal-app-id' || this.config.restApiKey === 'your-onesignal-rest-api-key') {
        logger.info('OneSignal connection test skipped (placeholder values)');
        return;
      }

      const response = await axios.get(`${this.baseUrl}/apps/${this.config.appId}`, {
        headers: {
          Authorization: `Basic ${this.config.restApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      logger.info('OneSignal connection test successful', {
        appName: response.data.name,
        players: response.data.players
      });
    } catch (error) {
      logger.warn('OneSignal connection test failed, switching to mock mode:', error);
    }
  }

  /**
   * Send notification to specific users by player IDs
   */
  async sendNotificationToPlayers(
    playerIds: string[],
    notification: PushNotification
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.isInitialized || !this.config) {
      return { success: false, error: 'OneSignal not initialized' };
    }

    try {
      const payload: PushNotification = {
        ...notification,
        include_player_ids: playerIds,
        app_id: this.config.appId
      };

      const response = await axios.post(
        `${this.baseUrl}/notifications`,
        payload,
        {
          headers: {
            Authorization: `Basic ${this.config.restApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.id) {
        logger.info('OneSignal notification sent successfully', {
          notificationId: response.data.id,
          recipientCount: response.data.recipients
        });
        
        return { 
          success: true, 
          id: response.data.id 
        };
      } else {
        return { success: false, error: 'No notification ID received' };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send OneSignal notification:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send notification to specific users by external user IDs (your user IDs)
   */
  async sendNotificationToUsers(
    userIds: string[],
    notification: PushNotification
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.isInitialized || !this.config) {
      return { success: false, error: 'OneSignal not initialized' };
    }

    try {
      const payload: PushNotification = {
        ...notification,
        include_external_user_ids: userIds,
        app_id: this.config.appId
      };

      const response = await axios.post(
        `${this.baseUrl}/notifications`,
        payload,
        {
          headers: {
            Authorization: `Basic ${this.config.restApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.id) {
        logger.info('OneSignal notification sent to users', {
          notificationId: response.data.id,
          userIds: userIds.length
        });
        
        return { 
          success: true, 
          id: response.data.id 
        };
      } else {
        return { success: false, error: 'No notification ID received' };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send OneSignal notification to users:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send notification to all users in a segment
   */
  async sendNotificationToSegment(
    segment: string,
    notification: PushNotification
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.isInitialized || !this.config) {
      return { success: false, error: 'OneSignal not initialized' };
    }

    try {
      const payload: PushNotification = {
        ...notification,
        included_segments: [segment],
        app_id: this.config.appId
      };

      const response = await axios.post(
        `${this.baseUrl}/notifications`,
        payload,
        {
          headers: {
            Authorization: `Basic ${this.config.restApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.id) {
        logger.info('OneSignal notification sent to segment', {
          notificationId: response.data.id,
          segment
        });
        
        return { 
          success: true, 
          id: response.data.id 
        };
      } else {
        return { success: false, error: 'No notification ID received' };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send OneSignal notification to segment:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send bulk notification to multiple targets
   */
  async sendBulkNotification(
    targets: {
      playerIds?: string[];
      userIds?: string[];
      segments?: string[];
    },
    notification: PushNotification
  ): Promise<{ success: boolean; results?: any; error?: string }> {
    if (!this.isInitialized || !this.config) {
      return { success: false, error: 'OneSignal not initialized' };
    }

    try {
      const payload: PushNotification = {
        ...notification,
        app_id: this.config.appId
      };

      if (targets.playerIds) {
        payload.include_player_ids = targets.playerIds;
      }
      if (targets.userIds) {
        payload.include_external_user_ids = targets.userIds;
      }
      if (targets.segments) {
        payload.included_segments = targets.segments;
      }

      const response = await axios.post(
        `${this.baseUrl}/notifications`,
        payload,
        {
          headers: {
            Authorization: `Basic ${this.config.restApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('OneSignal bulk notification sent', {
        notificationId: response.data.id,
        targets
      });

      return { 
        success: true, 
        results: response.data 
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send OneSignal bulk notification:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get app statistics
   */
  async getAppStats(): Promise<any> {
    if (!this.isInitialized || !this.config) {
      return { error: 'OneSignal not initialized' };
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/apps/${this.config.appId}`,
        {
          headers: {
            Authorization: `Basic ${this.config.restApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get OneSignal app stats:', error);
      return { error: errorMessage };
    }
  }

  /**
   * Cancel a scheduled notification
   */
  async cancelNotification(notificationId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isInitialized || !this.config) {
      return { success: false, error: 'OneSignal not initialized' };
    }

    try {
      await axios.delete(
        `${this.baseUrl}/notifications/${notificationId}`,
        {
          headers: {
            Authorization: `Basic ${this.config.restApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('OneSignal notification cancelled', { notificationId });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to cancel OneSignal notification:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get service status
   */
  getStatus(): any {
    return {
      initialized: this.isInitialized,
      configured: !!(this.config?.appId && this.config?.restApiKey),
      appId: this.config?.appId ? '***' + this.config.appId.slice(-4) : null
    };
  }
}

export const oneSignalService = OneSignalService.getInstance();
export default oneSignalService;