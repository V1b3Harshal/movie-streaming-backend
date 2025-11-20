// Supabase configuration and client
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

let supabaseClient: SupabaseClient | null = null;

export const initSupabase = () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    logger.warn('Supabase configuration missing, skipping Supabase initialization');
    return;
  }

  try {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: false, // Since this is backend only
          detectSessionInUrl: false
        }
      }
    );

    logger.info('Supabase initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Supabase:', error);
  }
};

export const getSupabase = () => {
  if (!supabaseClient) {
    logger.warn('Supabase not initialized, returning null client');
    return null;
  }
  return supabaseClient;
};

// Enhanced database operations using Supabase
export const supabaseOperations = {
  // User management
  async getUser(userId: string) {
    const client = getSupabase();
    if (!client) return null;
    
    try {
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Failed to get user:', error);
      return null;
    }
  },

  async createUser(userData: any) {
    const client = getSupabase();
    if (!client) return null;
    
    try {
      const { data, error } = await client
        .from('users')
        .insert([userData])
        .select()
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Failed to create user:', error);
      return null;
    }
  },

  // Watch history
  async getWatchHistory(userId: string) {
    const client = getSupabase();
    if (!client) return [];
    
    try {
      const { data, error } = await client
        .from('watch_history')
        .select('*')
        .eq('user_id', userId)
        .order('watched_at', { ascending: false });
        
      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Failed to get watch history:', error);
      return [];
    }
  },

  async addWatchHistory(entry: any) {
    const client = getSupabase();
    if (!client) return false;
    
    try {
      const { error } = await client
        .from('watch_history')
        .insert([entry]);
        
      if (error) throw error;
      return true;
    } catch (error) {
      logger.error('Failed to add watch history:', error);
      return false;
    }
  },

  // User preferences
  async getUserPreferences(userId: string) {
    const client = getSupabase();
    if (!client) return {};
    
    try {
      const { data, error } = await client
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();
        
      if (error) throw error;
      return data || {};
    } catch (error) {
      logger.error('Failed to get user preferences:', error);
      return {};
    }
  },

  async updateUserPreferences(userId: string, preferences: any) {
    const client = getSupabase();
    if (!client) return false;
    
    try {
      const { error } = await client
        .from('user_preferences')
        .upsert({ user_id: userId, ...preferences });
        
      if (error) throw error;
      return true;
    } catch (error) {
      logger.error('Failed to update user preferences:', error);
      return false;
    }
  },

  // Analytics events
  async trackAnalyticsEvent(eventName: string, properties: any) {
    const client = getSupabase();
    if (!client) return false;
    
    try {
      const { error } = await client
        .from('analytics_events')
        .insert([{
          event_name: eventName,
          properties,
          timestamp: new Date().toISOString(),
          user_id: properties.userId || null
        }]);
        
      if (error) throw error;
      return true;
    } catch (error) {
      logger.error('Failed to track analytics event:', error);
      return false;
    }
  }
};

export default supabaseOperations;