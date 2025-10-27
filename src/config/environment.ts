import { env } from 'process';

export const validateEnvironment = () => {
  const required = ['JWT_SECRET', 'MONGODB_URI', 'TMDB_API_KEY', 'TRAKT_CLIENT_ID'];
  const missing = required.filter(envVar => !env[envVar]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  if (env.NODE_ENV === 'production' && (env.JWT_SECRET === 'accessTokenSecret' || (env.JWT_SECRET && env.JWT_SECRET.length < 32))) {
    throw new Error('Weak or default JWT secret detected in production. JWT_SECRET must be at least 32 characters long');
  }
  
  // Validate API keys are not empty
  if (env.TMDB_API_KEY && env.TMDB_API_KEY.trim() === '') {
    throw new Error('TMDB_API_KEY is empty');
  }
  
  if (env.TRAKT_CLIENT_ID && env.TRAKT_CLIENT_ID.trim() === '') {
    throw new Error('TRAKT_CLIENT_ID is empty');
  }
};

// TMDB API Configuration
export const TMDB_API_URL = env.TMDB_API_URL || 'https://api.themoviedb.org/3';
export const TMDB_API_KEY = env.TMDB_API_KEY || '';

// Trakt API Configuration
export const TRAKT_API_URL = env.TRAKT_API_URL || 'https://api.trakt.tv';
export const TRAKT_CLIENT_ID = env.TRAKT_CLIENT_ID || '';
export const TRAKT_CLIENT_SECRET = env.TRAKT_CLIENT_SECRET || '';

// Railway-specific configurations
export const RAILWAY_DOMAIN = env.RAILWAY_PUBLIC_DOMAIN || 'localhost:3000';
export const NODE_ENV = env.NODE_ENV || 'production';
export const PORT = env.PORT || 3000;

// Providers Backend Configuration
export const PROVIDERS_BACKEND_URL = env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
export const INTERNAL_API_KEY = env.INTERNAL_API_KEY || '';

// Create a function to get environment variables (for services that need them)
export const getEnv = (key: string) => {
  return env[key];
};