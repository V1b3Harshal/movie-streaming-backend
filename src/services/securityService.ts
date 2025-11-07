import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { rateLimitService, RateLimitResult } from './rateLimitService';

export interface SecurityHeaders {
  'X-Content-Type-Options': string;
  'X-Frame-Options': string;
  'X-XSS-Protection': string;
  'Referrer-Policy': string;
  'Permissions-Policy': string;
  'Strict-Transport-Security'?: string;
}

export class SecurityService {
  private static instance: SecurityService;

  public static getInstance(): SecurityService {
    if (!SecurityService.instance) {
      SecurityService.instance = new SecurityService();
    }
    return SecurityService.instance;
  }

  // Add security headers to response
  addSecurityHeaders(reply: FastifyReply): void {
    const headers: SecurityHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    };

    // Add HSTS in production
    if (process.env.NODE_ENV === 'production') {
      headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
    }

    Object.entries(headers).forEach(([key, value]) => {
      reply.header(key, value);
    });
  }

  // Apply rate limiting
  async applyRateLimit(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const ip = request.ip;
    const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');
    const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');

    try {
      const result: RateLimitResult = await rateLimitService.checkRateLimit(ip, maxRequests, windowMs);
      
      if (!result.allowed) {
        reply.code(429).send({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          headers: {
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': new Date(result.resetTime).toUTCString()
          }
        });
        return false;
      }

      // Add rate limit headers
      reply.header('X-RateLimit-Limit', maxRequests.toString());
      reply.header('X-RateLimit-Remaining', result.remaining.toString());
      reply.header('X-RateLimit-Reset', new Date(result.resetTime).toUTCString());

      return true;
    } catch (error) {
      logger.error('Rate limiting error:', error);
      // If rate limiting fails, allow the request to proceed
      logger.warn('Rate limiting failed, allowing request to proceed');
      return true;
    }
  }

  // Log security events
  logSecurityEvent(event: string, details: any): void {
    logger.warn(`Security Event: ${event}`, details);
  }

  // Validate CSRF token
  validateCSRFToken(request: FastifyRequest, token: string): boolean {
    // Implement CSRF validation logic
    // This is a basic implementation - you might want to enhance it
    const expectedToken = request.headers['x-csrf-token'] as string;
    return expectedToken === token;
  }

  // Check if request is suspicious
  isSuspiciousRequest(request: FastifyRequest): boolean {
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i,
      /document\./i,
      /window\./i
    ];

    const userAgent = request.headers['user-agent'] || '';
    const body = request.body as string || '';

    return suspiciousPatterns.some(pattern => 
      pattern.test(userAgent) || pattern.test(body)
    );
  }

  // Handle suspicious requests
  handleSuspiciousRequest(request: FastifyRequest, reply: FastifyReply): void {
    this.logSecurityEvent('Suspicious Request Detected', {
      ip: request.ip,
      url: request.url,
      method: request.method,
      userAgent: request.headers['user-agent'],
      timestamp: new Date().toISOString()
    });

    reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Suspicious activity detected'
    });
  }
}

export const securityService = SecurityService.getInstance();