// Watch History Service
import { getDb } from '../config/database';
import { logger } from '../utils/logger';
import { mixpanelService } from '../config/mixpanel';
import { Sentry } from '../config/sentry';

export interface WatchHistoryEntry {
  id: string;
  userId: string;
  contentId: string;
  contentType: 'movie' | 'tv';
  watchedDuration: number; // in seconds
  totalDuration: number; // in seconds
  lastWatched: Date;
  completionPercentage: number; // 0-100
  favorite: boolean;
  watchSessionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateWatchHistoryData {
  userId: string;
  contentId: string;
  contentType: 'movie' | 'tv';
  watchedDuration: number;
  totalDuration: number;
  addToFavorites?: boolean;
  removeFromFavorites?: boolean;
  watchSessionId?: string;
}

export interface WatchHistoryFilters {
  contentType?: 'movie' | 'tv';
  isFavorite?: boolean;
  minCompletion?: number;
  maxCompletion?: number;
  limit?: number;
  offset?: number;
}

class WatchHistoryService {
  private getDb() {
    return getDb();
  }

  /**
   * Update or create watch history entry
   */
  async updateWatchHistory(data: UpdateWatchHistoryData): Promise<WatchHistoryEntry> {
    try {
      logger.info('Updating watch history', {
        userId: data.userId,
        contentId: data.contentId,
        watchedDuration: data.watchedDuration
      });

      const completionPercentage = data.totalDuration > 0
        ? Math.min((data.watchedDuration / data.totalDuration) * 100, 100)
        : 0;

      // Check if entry exists
      const { data: existing } = await this.getDb()
        .from('watch_history')
        .select('*')
        .eq('user_id', data.userId)
        .eq('content_id', data.contentId)
        .single();

      let result;
      if (existing) {
        // Update existing entry
        const updateData: any = {
          watched_duration: Math.max(data.watchedDuration, existing.watched_duration || 0),
          total_duration: data.totalDuration,
          completion_percentage: Math.max(completionPercentage, existing.completion_percentage || 0),
          last_watched: new Date().toISOString(),
          watch_session_id: data.watchSessionId,
          updated_at: new Date().toISOString()
        };

        if (data.addToFavorites !== undefined) {
          updateData.favorite = data.addToFavorites;
        }
        if (data.removeFromFavorites !== undefined) {
          updateData.favorite = !data.removeFromFavorites;
        }

        const { data: updated, error } = await this.getDb()
          .from('watch_history')
          .update(updateData)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          throw new Error(`Failed to update watch history: ${error.message}`);
        }
        result = updated;
      } else {
        // Create new entry
        const { data: created, error } = await this.getDb()
          .from('watch_history')
          .insert({
            user_id: data.userId,
            content_id: data.contentId,
            content_type: data.contentType,
            watched_duration: data.watchedDuration,
            total_duration: data.totalDuration,
            completion_percentage: completionPercentage,
            favorite: data.addToFavorites || false,
            watch_session_id: data.watchSessionId
          })
          .select()
          .single();

        if (error) {
          throw new Error(`Failed to create watch history: ${error.message}`);
        }
        result = created;
      }

      // Track watch history update
      await mixpanelService.track('watch_history_updated', {
        contentId: data.contentId,
        contentType: data.contentType,
        watchedDuration: data.watchedDuration,
        completionPercentage: completionPercentage,
        isFavorite: result.favorite
      }, data.userId);

      logger.info('Watch history updated successfully', { 
        entryId: result.id,
        completionPercentage: completionPercentage
      });

      return this.mapDbToEntry(result);
    } catch (error) {
      logger.error('Error updating watch history:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get watch history for a user
   */
  async getWatchHistory(userId: string, filters: WatchHistoryFilters = {}): Promise<WatchHistoryEntry[]> {
    try {
      let query = this.getDb()
        .from('watch_history')
        .select('*')
        .eq('user_id', userId)
        .order('last_watched', { ascending: false });

      // Apply filters
      if (filters.contentType) {
        query = query.eq('content_type', filters.contentType);
      }
      if (filters.isFavorite !== undefined) {
        query = query.eq('favorite', filters.isFavorite);
      }
      if (filters.minCompletion !== undefined) {
        query = query.gte('completion_percentage', filters.minCompletion);
      }
      if (filters.maxCompletion !== undefined) {
        query = query.lte('completion_percentage', filters.maxCompletion);
      }
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to get watch history: ${error.message}`);
      }

      // Track watch history access
      await mixpanelService.track('watch_history_accessed', {
        filters,
        resultCount: data?.length || 0
      }, userId);

      return data?.map((entry: any) => this.mapDbToEntry(entry)) || [];
    } catch (error) {
      logger.error('Error getting watch history:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get specific content watch history
   */
  async getContentWatchHistory(userId: string, contentId: string): Promise<WatchHistoryEntry | null> {
    try {
      const { data, error } = await this.getDb()
        .from('watch_history')
        .select('*')
        .eq('user_id', userId)
        .eq('content_id', contentId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data ? this.mapDbToEntry(data) : null;
    } catch (error) {
      logger.error('Error getting content watch history:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(userId: string, contentId: string, contentType: 'movie' | 'tv'): Promise<WatchHistoryEntry> {
    try {
      // Check if entry exists
      const { data: existing } = await this.getDb()
        .from('watch_history')
        .select('*')
        .eq('user_id', userId)
        .eq('content_id', contentId)
        .single();

      if (existing) {
        // Toggle favorite
        const { data: updated, error } = await this.getDb()
          .from('watch_history')
          .update({ 
            favorite: !existing.favorite,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          throw new Error(`Failed to toggle favorite: ${error.message}`);
        }

        // Track favorite toggle
        await mixpanelService.track('favorite_toggled', {
          contentId,
          contentType,
          isFavorite: !existing.favorite
        }, userId);

        return this.mapDbToEntry(updated);
      } else {
        // Create new entry with favorite=true
        const { data: created, error } = await this.getDb()
          .from('watch_history')
          .insert({
            user_id: userId,
            content_id: contentId,
            content_type: contentType,
            watched_duration: 0,
            total_duration: 0,
            completion_percentage: 0,
            favorite: true
          })
          .select()
          .single();

        if (error) {
          throw new Error(`Failed to create favorite: ${error.message}`);
        }

        // Track favorite creation
        await mixpanelService.track('favorite_created', {
          contentId,
          contentType
        }, userId);

        return this.mapDbToEntry(created);
      }
    } catch (error) {
      logger.error('Error toggling favorite:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Remove watch history entry
   */
  async removeWatchHistory(userId: string, contentId: string): Promise<boolean> {
    try {
      const { error } = await this.getDb()
        .from('watch_history')
        .delete()
        .eq('user_id', userId)
        .eq('content_id', contentId);

      if (error) {
        throw new Error(`Failed to remove watch history: ${error.message}`);
      }

      // Track removal
      await mixpanelService.track('watch_history_removed', {
        contentId
      }, userId);

      logger.info('Watch history removed', { userId, contentId });
      return true;
    } catch (error) {
      logger.error('Error removing watch history:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Clear all watch history for user
   */
  async clearWatchHistory(userId: string, contentType?: 'movie' | 'tv'): Promise<number> {
    try {
      let query = this.getDb()
        .from('watch_history')
        .delete()
        .eq('user_id', userId);

      if (contentType) {
        query = query.eq('content_type', contentType);
      }

      const { data, error } = await query.select('id');

      if (error) {
        throw new Error(`Failed to clear watch history: ${error.message}`);
      }

      const deletedCount = data?.length || 0;

      // Track clear action
      await mixpanelService.track('watch_history_cleared', {
        contentType,
        deletedCount
      }, userId);

      logger.info('Watch history cleared', { userId, contentType, deletedCount });
      return deletedCount;
    } catch (error) {
      logger.error('Error clearing watch history:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get watch statistics
   */
  async getWatchStatistics(userId: string, days: number = 30): Promise<any> {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await this.getDb()
        .from('watch_history')
        .select('*')
        .eq('user_id', userId)
        .gte('last_watched', startDate);

      if (error) {
        throw new Error(`Failed to get watch statistics: ${error.message}`);
      }

      const entries = data || [];
      const totalWatchTime = entries.reduce((sum: number, entry: any) => sum + (entry.watched_duration || 0), 0);
      const uniqueContent = new Set(entries.map((entry: any) => entry.content_id)).size;
      const completedContent = entries.filter((entry: any) => entry.completion_percentage >= 90).length;
      const favoriteContent = entries.filter((entry: any) => entry.favorite).length;

      // Content type breakdown
      const movies = entries.filter((entry: any) => entry.content_type === 'movie').length;
      const tvShows = entries.filter((entry: any) => entry.content_type === 'tv').length;

      return {
        totalEntries: entries.length,
        totalWatchTime, // in seconds
        uniqueContent,
        completedContent,
        favoriteContent,
        movies,
        tvShows,
        averageCompletion: entries.length > 0
          ? entries.reduce((sum: number, entry: any) => sum + entry.completion_percentage, 0) / entries.length
          : 0,
        days
      };
    } catch (error) {
      logger.error('Error getting watch statistics:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get recently watched content
   */
  async getRecentlyWatched(userId: string, limit: number = 10): Promise<WatchHistoryEntry[]> {
    try {
      const { data, error } = await this.getDb()
        .from('watch_history')
        .select('*')
        .eq('user_id', userId)
        .gt('watched_duration', 0) // Only content actually watched
        .order('last_watched', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to get recently watched: ${error.message}`);
      }

      return data?.map((entry: any) => this.mapDbToEntry(entry)) || [];
    } catch (error) {
      logger.error('Error getting recently watched:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get continue watching list
   */
  async getContinueWatching(userId: string, limit: number = 10): Promise<WatchHistoryEntry[]> {
    try {
      const { data, error } = await this.getDb()
        .from('watch_history')
        .select('*')
        .eq('user_id', userId)
        .gt('watched_duration', 0) // Only content actually watched
        .lt('completion_percentage', 90) // Not completed
        .order('last_watched', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to get continue watching: ${error.message}`);
      }

      return data?.map((entry: any) => this.mapDbToEntry(entry)) || [];
    } catch (error) {
      logger.error('Error getting continue watching:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Map database row to WatchHistoryEntry interface
   */
  private mapDbToEntry(dbEntry: any): WatchHistoryEntry {
    return {
      id: dbEntry.id,
      userId: dbEntry.user_id,
      contentId: dbEntry.content_id,
      contentType: dbEntry.content_type,
      watchedDuration: dbEntry.watched_duration || 0,
      totalDuration: dbEntry.total_duration || 0,
      lastWatched: new Date(dbEntry.last_watched),
      completionPercentage: dbEntry.completion_percentage || 0,
      favorite: dbEntry.favorite || false,
      watchSessionId: dbEntry.watch_session_id,
      createdAt: new Date(dbEntry.created_at),
      updatedAt: new Date(dbEntry.updated_at)
    };
  }
}

export const watchHistoryService = new WatchHistoryService();
export default watchHistoryService;
