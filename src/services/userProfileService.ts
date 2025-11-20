// User Profile Service
import { getSupabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { mixpanelService } from '../config/mixpanel';
import { Sentry } from '../config/sentry';

export interface UserProfile {
  id: string;
  userId: string;
  displayName?: string;
  avatar?: string;
  bio?: string;
  preferences: UserPreferences;
  watchPreferences: WatchPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  language: string;
  region: string;
  maturityRating: string;
  autoplay: boolean;
  subtitles: boolean;
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    push: boolean;
    newContent: boolean;
    watchParty: boolean;
  };
}

export interface WatchPreferences {
  preferredQuality: 'auto' | '480p' | '720p' | '1080p' | '4k';
  preferredAudio: string;
  subtitleLanguage: string;
  skipIntro: boolean;
  skipCredits: boolean;
  playbackSpeed: number;
}

export interface UpdateProfileData {
  displayName?: string;
  avatar?: string;
  bio?: string;
  preferences?: Partial<UserPreferences>;
  watchPreferences?: Partial<WatchPreferences>;
}

class UserProfileService {
  private getDb() {
    // Use service role client for backend operations (bypasses RLS)
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient } = require('@supabase/supabase-js');
      return createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );
    }

    // Fallback to global client (should not be used for user data)
    return getSupabase();
  }

  /**
   * Get or create user profile
   */
  async getOrCreateProfile(userId: string): Promise<UserProfile> {
    try {
      // Try to get existing profile
      const { data: existing, error } = await this.getDb()
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (existing) {
        return this.mapDbToProfile(existing);
      }

      // Create new profile with defaults
      const defaultProfile = this.getDefaultProfile();
      const { data: created, error: createError } = await this.getDb()
        .from('user_profiles')
        .insert({
          user_id: userId,
          display_name: defaultProfile.displayName,
          preferences: defaultProfile.preferences,
          watch_preferences: defaultProfile.watchPreferences
        })
        .select()
        .single();

      if (createError) {
        throw new Error(`Failed to create user profile: ${createError.message}`);
      }

      // Track profile creation
      await mixpanelService.track('user_profile_created', {}, userId);

      logger.info('User profile created', { userId });
      return this.mapDbToProfile(created);
    } catch (error) {
      logger.error('Error getting/creating user profile:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get user profile
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await this.getDb()
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data ? this.mapDbToProfile(data) : null;
    } catch (error) {
      logger.error('Error getting user profile:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: UpdateProfileData): Promise<UserProfile> {
    try {
      logger.info('Updating user profile', { userId, updateData: data });

      // Get current profile
      const currentProfile = await this.getOrCreateProfile(userId);
      
      const updatePayload: any = {
        updated_at: new Date().toISOString()
      };

      if (data.displayName !== undefined) updatePayload.display_name = data.displayName;
      if (data.avatar !== undefined) updatePayload.avatar = data.avatar;
      if (data.bio !== undefined) updatePayload.bio = data.bio;

      if (data.preferences) {
        updatePayload.preferences = {
          ...currentProfile.preferences,
          ...data.preferences
        };
      }

      if (data.watchPreferences) {
        updatePayload.watch_preferences = {
          ...currentProfile.watchPreferences,
          ...data.watchPreferences
        };
      }

      const { data: updated, error } = await this.getDb()
        .from('user_profiles')
        .update(updatePayload)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update user profile: ${error.message}`);
      }

      // Track profile update
      await mixpanelService.track('user_profile_updated', {
        updatedFields: Object.keys(data)
      }, userId);

      logger.info('User profile updated successfully', { userId });
      return this.mapDbToProfile(updated);
    } catch (error) {
      logger.error('Error updating user profile:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Delete user profile
   */
  async deleteProfile(userId: string): Promise<boolean> {
    try {
      const { error } = await this.getDb()
        .from('user_profiles')
        .delete()
        .eq('user_id', userId);

      if (error) {
        throw new Error(`Failed to delete user profile: ${error.message}`);
      }

      // Track profile deletion
      await mixpanelService.track('user_profile_deleted', {}, userId);

      logger.info('User profile deleted', { userId });
      return true;
    } catch (error) {
      logger.error('Error deleting user profile:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId: string, preferences: Partial<UserPreferences>): Promise<UserProfile> {
    try {
      const currentProfile = await this.getOrCreateProfile(userId);
      
      const updatedPreferences = {
        ...currentProfile.preferences,
        ...preferences
      };

      const { data, error } = await this.getDb()
        .from('user_profiles')
        .update({
          preferences: updatedPreferences,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update preferences: ${error.message}`);
      }

      // Track preferences update
      await mixpanelService.track('user_preferences_updated', {
        updatedPreferences: Object.keys(preferences)
      }, userId);

      logger.info('User preferences updated', { userId, updatedKeys: Object.keys(preferences) });
      return this.mapDbToProfile(data);
    } catch (error) {
      logger.error('Error updating user preferences:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Update watch preferences
   */
  async updateWatchPreferences(userId: string, watchPreferences: Partial<WatchPreferences>): Promise<UserProfile> {
    try {
      const currentProfile = await this.getOrCreateProfile(userId);
      
      const updatedWatchPreferences = {
        ...currentProfile.watchPreferences,
        ...watchPreferences
      };

      const { data, error } = await this.getDb()
        .from('user_profiles')
        .update({
          watch_preferences: updatedWatchPreferences,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update watch preferences: ${error.message}`);
      }

      // Track watch preferences update
      await mixpanelService.track('user_watch_preferences_updated', {
        updatedPreferences: Object.keys(watchPreferences)
      }, userId);

      logger.info('User watch preferences updated', { userId, updatedKeys: Object.keys(watchPreferences) });
      return this.mapDbToProfile(data);
    } catch (error) {
      logger.error('Error updating user watch preferences:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get user profiles with pagination (for admin)
   */
  async getUserProfiles(limit: number = 50, offset: number = 0): Promise<UserProfile[]> {
    try {
      const { data, error } = await this.getDb()
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new Error(`Failed to get user profiles: ${error.message}`);
      }

      return data?.map((profile: any) => this.mapDbToProfile(profile)) || [];
    } catch (error) {
      logger.error('Error getting user profiles:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get user profile statistics
   */
  async getProfileStatistics(userId: string): Promise<any> {
    try {
      const profile = await this.getOrCreateProfile(userId);
      
      // Get watch history stats
      const { data: watchHistory, error: historyError } = await this.getDb()
        .from('watch_history')
        .select('*')
        .eq('user_id', userId);

      if (historyError) {
        throw historyError;
      }

      // Get session stats
      const { data: sessions, error: sessionError } = await this.getDb()
        .from('user_sessions')
        .select('*')
        .eq('user_id', userId);

      if (sessionError) {
        throw sessionError;
      }

      const totalWatchTime = sessions?.reduce((sum: number, session: any) => sum + (session.last_progress || 0), 0) || 0;
      const uniqueContent = new Set(watchHistory?.map((entry: any) => entry.content_id) || []).size;
      const favoriteContent = watchHistory?.filter((entry: any) => entry.favorite).length || 0;

      return {
        profileCreated: profile.createdAt,
        lastProfileUpdate: profile.updatedAt,
        totalWatchTime, // in seconds
        uniqueContent,
        favoriteContent,
        sessionCount: sessions?.length || 0,
        preferences: profile.preferences,
        watchPreferences: profile.watchPreferences
      };
    } catch (error) {
      logger.error('Error getting profile statistics:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get default profile structure
   */
  private getDefaultProfile(): Partial<UserProfile> {
    return {
      displayName: 'User',
      preferences: {
        language: 'en',
        region: 'US',
        maturityRating: 'PG-13',
        autoplay: true,
        subtitles: false,
        theme: 'system',
        notifications: {
          email: true,
          push: true,
          newContent: true,
          watchParty: true
        }
      },
      watchPreferences: {
        preferredQuality: 'auto',
        preferredAudio: 'en',
        subtitleLanguage: 'en',
        skipIntro: false,
        skipCredits: false,
        playbackSpeed: 1.0
      }
    };
  }

  /**
   * Map database row to UserProfile interface
   */
  private mapDbToProfile(dbProfile: any): UserProfile {
    return {
      id: dbProfile.id,
      userId: dbProfile.user_id,
      displayName: dbProfile.display_name,
      avatar: dbProfile.avatar,
      bio: dbProfile.bio,
      preferences: dbProfile.preferences || this.getDefaultProfile().preferences!,
      watchPreferences: dbProfile.watch_preferences || this.getDefaultProfile().watchPreferences!,
      createdAt: new Date(dbProfile.created_at),
      updatedAt: new Date(dbProfile.updated_at)
    };
  }
}

export const userProfileService = new UserProfileService();
export default userProfileService;