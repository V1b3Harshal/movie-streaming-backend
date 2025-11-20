// User Session Management Service
import { getDb } from '../config/database';
import { logger } from '../utils/logger';
import { mixpanelService } from '../config/mixpanel';
import { Sentry } from '../config/sentry';

export interface UserSession {
  id: string;
  userId: string;
  contentId: string;
  contentType: 'movie' | 'tv';
  startTime: Date;
  lastProgress: number; // in seconds
  endTime?: Date;
  totalDuration?: number; // in seconds
  completionPercentage: number; // 0-100
  watchTogetherRoomId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSessionData {
  userId: string;
  contentId: string;
  contentType: 'movie' | 'tv';
  watchTogetherRoomId?: string;
  initialProgress?: number;
}

export interface UpdateProgressData {
  sessionId: string;
  currentTime: number;
  totalDuration?: number;
}

class UserSessionService {
  private getDb() {
    return getDb();
  }

  /**
   * Create a new user session
   */
  async createSession(data: CreateSessionData): Promise<UserSession> {
    try {
      logger.info('Creating user session', { 
        userId: data.userId, 
        contentId: data.contentId, 
        contentType: data.contentType 
      });

      const { data: session, error } = await this.getDb()
        .from('user_sessions')
        .insert({
          user_id: data.userId,
          content_id: data.contentId,
          content_type: data.contentType,
          start_time: new Date().toISOString(),
          last_progress: data.initialProgress || 0,
          completion_percentage: 0,
          watch_together_room_id: data.watchTogetherRoomId,
          is_active: true
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create session: ${error.message}`);
      }

      // Track session creation
      await mixpanelService.track('session_created', {
        contentId: data.contentId,
        contentType: data.contentType,
        sessionId: session.id
      }, data.userId);

      logger.info('User session created successfully', { sessionId: session.id });
      return this.mapDbToSession(session);
    } catch (error) {
      logger.error('Error creating user session:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Update session progress
   */
  async updateProgress(data: UpdateProgressData): Promise<UserSession> {
    try {
      const completionPercentage = data.totalDuration 
        ? (data.currentTime / data.totalDuration) * 100 
        : 0;

      const { data: session, error } = await this.getDb()
        .from('user_sessions')
        .update({
          last_progress: data.currentTime,
          total_duration: data.totalDuration,
          completion_percentage: Math.min(completionPercentage, 100),
          updated_at: new Date().toISOString()
        })
        .eq('id', data.sessionId)
        .eq('is_active', true)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update session: ${error.message}`);
      }

      // Track progress update
      await mixpanelService.track('session_progress_updated', {
        sessionId: data.sessionId,
        currentTime: data.currentTime,
        totalDuration: data.totalDuration,
        completionPercentage: Math.min(completionPercentage, 100)
      });

      logger.info('Session progress updated', { 
        sessionId: data.sessionId, 
        currentTime: data.currentTime,
        completionPercentage: Math.min(completionPercentage, 100)
      });

      return this.mapDbToSession(session);
    } catch (error) {
      logger.error('Error updating session progress:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * End a session
   */
  async endSession(sessionId: string, finalProgress?: number, totalDuration?: number): Promise<UserSession> {
    try {
      const completionPercentage = totalDuration && finalProgress
        ? (finalProgress / totalDuration) * 100
        : 0;

      const { data: session, error } = await this.getDb()
        .from('user_sessions')
        .update({
          end_time: new Date().toISOString(),
          is_active: false,
          last_progress: finalProgress || undefined,
          total_duration: totalDuration || undefined,
          completion_percentage: Math.min(completionPercentage, 100),
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to end session: ${error.message}`);
      }

      // Track session end
      await mixpanelService.track('session_ended', {
        sessionId,
        finalProgress,
        totalDuration,
        completionPercentage: Math.min(completionPercentage, 100)
      });

      logger.info('Session ended', { 
        sessionId, 
        finalProgress, 
        totalDuration,
        completionPercentage: Math.min(completionPercentage, 100)
      });

      return this.mapDbToSession(session);
    } catch (error) {
      logger.error('Error ending session:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get active session for user and content
   */
  async getActiveSession(userId: string, contentId: string): Promise<UserSession | null> {
    try {
      const { data: session, error } = await this.getDb()
        .from('user_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('content_id', contentId)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        throw error;
      }

      return session ? this.mapDbToSession(session) : null;
    } catch (error) {
      logger.error('Error getting active session:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserActiveSessions(userId: string): Promise<UserSession[]> {
    try {
      const { data: sessions, error } = await this.getDb()
        .from('user_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to get user sessions: ${error.message}`);
      }

      return sessions?.map((session: any) => this.mapDbToSession(session)) || [];
    } catch (error) {
      logger.error('Error getting user sessions:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<UserSession | null> {
    try {
      const { data: session, error } = await this.getDb()
        .from('user_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return session ? this.mapDbToSession(session) : null;
    } catch (error) {
      logger.error('Error getting session:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Clean up stale sessions (older than 24 hours)
   */
  async cleanupStaleSessions(): Promise<number> {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Get count of sessions to be cleaned before updating
      const { data: sessionsToClean, error: countError } = await this.getDb()
        .from('user_sessions')
        .select('id', { count: 'exact' })
        .lt('updated_at', twentyFourHoursAgo)
        .eq('is_active', true);

      if (countError) {
        throw new Error(`Failed to count stale sessions: ${countError.message}`);
      }

      const cleanedCount = sessionsToClean?.length || 0;

      // Update sessions to inactive
      const { error } = await this.getDb()
        .from('user_sessions')
        .update({ is_active: false })
        .lt('updated_at', twentyFourHoursAgo)
        .eq('is_active', true);

      if (error) {
        throw new Error(`Failed to cleanup stale sessions: ${error.message}`);
      }

      if (cleanedCount > 0) {
        await mixpanelService.track('stale_sessions_cleaned', { count: cleanedCount });
        logger.info('Cleaned up stale sessions', { count: cleanedCount });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Error cleaning up stale sessions:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get session statistics for analytics
   */
  async getSessionStats(userId: string, days: number = 7): Promise<any> {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await this.getDb()
        .from('user_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', startDate);

      if (error) {
        throw new Error(`Failed to get session stats: ${error.message}`);
      }

      const sessions = data || [];
      const totalSessions = sessions.length;
      const completedSessions = sessions.filter((s: any) => s.completion_percentage >= 90).length;
      const totalWatchTime = sessions.reduce((sum: number, s: any) => sum + (s.last_progress || 0), 0);
      const averageCompletion = totalSessions > 0
        ? sessions.reduce((sum: number, s: any) => sum + s.completion_percentage, 0) / totalSessions
        : 0;

      return {
        totalSessions,
        completedSessions,
        totalWatchTime,
        averageCompletion: Math.round(averageCompletion * 100) / 100,
        days
      };
    } catch (error) {
      logger.error('Error getting session stats:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Map database row to UserSession interface
   */
  private mapDbToSession(dbSession: any): UserSession {
    return {
      id: dbSession.id,
      userId: dbSession.user_id,
      contentId: dbSession.content_id,
      contentType: dbSession.content_type,
      startTime: new Date(dbSession.start_time),
      lastProgress: dbSession.last_progress || 0,
      endTime: dbSession.end_time ? new Date(dbSession.end_time) : undefined!,
      totalDuration: dbSession.total_duration,
      completionPercentage: dbSession.completion_percentage || 0,
      watchTogetherRoomId: dbSession.watch_together_room_id,
      isActive: dbSession.is_active,
      createdAt: new Date(dbSession.created_at),
      updatedAt: new Date(dbSession.updated_at)
    };
  }
}

export const userSessionService = new UserSessionService();
export default userSessionService;