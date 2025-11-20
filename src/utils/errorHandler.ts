import { logger } from './logger';
/**
 * Enhanced error handling to prevent information leakage
 */

export const sanitizeError = (error: unknown): string => {
  if (typeof error === 'string') {
    // Remove potential sensitive information from error messages
    return error
      .replace(/password/gi, '[REDACTED]')
      .replace(/token/gi, '[REDACTED]')
      .replace(/secret/gi, '[REDACTED]')
      .replace(/key/gi, '[REDACTED]')
      .replace(/supabase:\/\/[^:]+:[^@]+@/g, 'supabase://[REDACTED]:[REDACTED]@')
      .substring(0, 500); // Limit error message length
  }
  
  if (error instanceof Error) {
    return sanitizeError(error.message);
  }
  
  return 'An unexpected error occurred';
};

export const createSafeErrorResponse = (error: unknown, statusCode: number = 500) => {
  const sanitizedError = sanitizeError(error);
  
  // Don't expose stack traces in production
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    statusCode,
    error: isProduction ? 'Internal Server Error' : sanitizedError,
    message: isProduction ? 'Something went wrong' : sanitizedError,
    ...(isProduction ? {} : { timestamp: new Date().toISOString() }),
  };
};

export const isOperationalError = (error: unknown): boolean => {
  // Operational errors are expected errors (e.g., validation errors, not found)
  // Non-operational errors are programming errors or system failures
  if (typeof error === 'string') {
    return error.includes('validation') || 
           error.includes('not found') || 
           error.includes('unauthorized') ||
           error.includes('forbidden');
  }
  
  if (error instanceof Error) {
    return isOperationalError(error.message);
  }
  
  return false;
};

export const logErrorWithDetails = (error: unknown, context?: Record<string, unknown>) => {
  const errorDetails = {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  };
  
  logger.error('Error Details:', errorDetails);
};