// Supabase database configuration
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

const logger = {
  info: console.log,
  error: console.error,
  warn: console.warn
};

let supabaseClient: SupabaseClient | null = null;

export const connectToDatabase = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase configuration missing. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  try {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false // Backend only
        },
        global: {
          headers: {
            'User-Agent': 'Movie-Streaming-Backend/1.0'
          }
        }
      }
    );

    // Test the connection with a simple RPC call or skip table-specific test
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      // Use a simple query that doesn't require specific tables
      // Try to get server version or just test basic connectivity
      const { data, error } = await supabaseClient.rpc('version').abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) {
        // If RPC fails, try a different approach - just test basic auth
        logger.warn('RPC version check failed, testing basic connectivity:', error.message);

        // Test with a simple select that should work if tables exist
        try {
          await supabaseClient.from('_supabase_tables').select('name').limit(1).abortSignal(controller.signal);
        } catch (tableError: any) {
          if (tableError?.code === 'PGRST205' || tableError?.code === 'PGRST116') {
            // This is expected if tables don't exist yet - connection is still valid
            logger.info('Supabase connected (tables not yet created)');
          } else {
            throw tableError;
          }
        }
      } else {
        logger.info('Supabase connected successfully, version:', data);
      }

      logger.info('Connected to Supabase successfully');
      return supabaseClient;
    } catch (timeoutError: any) {
      clearTimeout(timeoutId);
      if (timeoutError?.name === 'AbortError') {
        throw new Error('Supabase connection timeout after 10 seconds');
      }
      throw timeoutError;
    }
  } catch (error: any) {
    logger.error('Failed to connect to Supabase:', {
      message: error instanceof Error ? error.message : String(error),
      code: error?.code,
      status: error?.status
    });
    
    // Provide helpful error messages
    if (error?.message?.includes('invalid url')) {
      throw new Error('Invalid SUPABASE_URL format. Please check your configuration.');
    }
    
    if (error?.message?.includes('invalid key')) {
      throw new Error('Invalid SUPABASE_ANON_KEY. Please check your configuration.');
    }
    
    throw new Error(`Database connection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const getDb = () => {
  if (!supabaseClient) {
    throw new Error('Database not connected. Call connectToDatabase() first.');
  }
  
  // Check if client is still valid
  if (!supabaseClient?.auth) {
    throw new Error('Database client is invalid. Please reconnect.');
  }
  
  return supabaseClient;
};

export const getDatabaseStatus = () => {
  // Use the same client that's initialized in supabase.ts
  const client = getSupabase();
  return {
    isConnected: !!client,
    type: 'Supabase PostgreSQL',
    environment: process.env.NODE_ENV || 'development'
  };
};

export default {
  connectToDatabase,
  getDb,
  getDatabaseStatus
};