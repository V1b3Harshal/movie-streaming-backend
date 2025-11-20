// Security service for enhanced protection
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { mixpanelService } from '../config/mixpanel';

interface SecurityConfig {
  enableRateLimitLogging: boolean;
  enableSecurityHeaders: boolean;
  enableRequestValidation: boolean;
  enableIPBlocking: boolean;
  maxRequestSize: number;
  allowedMethods: string[];
  blockedIPs: string[];
}

class SecurityService {
  private static instance: SecurityService;
  private config: SecurityConfig;
  private suspiciousRequests: Map<string, { count: number; lastSeen: number }> = new Map();
  private blockedIPs: Set<string> = new Set();
  
  private constructor() {
    this.config = {
      enableRateLimitLogging: process.env.ENABLE_RATE_LIMIT_LOGGING === 'true',
      enableSecurityHeaders: process.env.ENABLE_SECURITY_HEADERS !== 'false',
      enableRequestValidation: process.env.ENABLE_REQUEST_VALIDATION !== 'false',
      enableIPBlocking: process.env.ENABLE_IP_BLOCKING === 'true',
      maxRequestSize: parseInt(process.env.MAX_REQUEST_SIZE || '10485760'), // 10MB
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
      blockedIPs: this.parseBlockedIPs()
    };
    
    logger.info('Security service initialized with enhanced protection');
  }
  
  public static getInstance(): SecurityService {
    if (!SecurityService.instance) {
      SecurityService.instance = new SecurityService();
    }
    return SecurityService.instance;
  }
  
  private parseBlockedIPs(): string[] {
    const blockedIPs = process.env.BLOCKED_IPS;
    return blockedIPs ? blockedIPs.split(',').map(ip => ip.trim()) : [];
  }
  
  // Security headers middleware
  addSecurityHeaders(_request: FastifyRequest, reply: FastifyReply): void {
    if (!this.config.enableSecurityHeaders) return;
    
    const csp = "default-src 'self'; " +
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.themoviedb.org https://api.trakt.tv; " +
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
                "img-src 'self' data: https: blob: *.themoviedb.org *.trakt.tv; " +
                "font-src 'self' data: https://fonts.gstatic.com; " +
                "connect-src 'self' https://api.themoviedb.org https://api.trakt.tv wss: ws: https:; " +
                "media-src 'self' https: blob: *.themoviedb.org; " +
                "object-src 'none'; " +
                "base-uri 'self'; " +
                "form-action 'self'; " +
                "frame-ancestors 'none'; " +
                "frame-src 'none';";
    
    reply.header('Content-Security-Policy', csp);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    reply.header('X-Permitted-Cross-Domain-Policies', 'none');
    reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
  }
  
  // Request validation
  validateRequest(request: FastifyRequest): { valid: boolean; reason?: string } {
    if (!this.config.enableRequestValidation) return { valid: true };
    
    // Check HTTP method
    if (!this.config.allowedMethods.includes(request.method)) {
      return { valid: false, reason: 'Method not allowed' };
    }
    
    // Check request size
    const contentLength = request.headers['content-length'];
    if (contentLength && parseInt(contentLength) > this.config.maxRequestSize) {
      return { valid: false, reason: 'Request too large' };
    }
    
    // Check for suspicious patterns
    const url = request.url.toLowerCase();
    const suspiciousPatterns = [
      '../', '..\\', '%2e%2e%2f', '%2e%2e%5c',
      'script', 'javascript:', 'vbscript:', 'data:',
      'sql', 'union', 'select', 'insert', 'delete', 'drop',
      'eval', 'function', 'constructor', 'prototype'
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (url.includes(pattern)) {
        return { valid: false, reason: 'Suspicious pattern detected' };
      }
    }
    
    return { valid: true };
  }
  
  // IP-based security
  checkIPSecurity(request: FastifyRequest): { allowed: boolean; reason?: string } {
    const clientIP = this.getClientIP(request);
    
    // Check if IP is blocked
    if (this.blockedIPs.has(clientIP)) {
      return { allowed: false, reason: 'IP blocked' };
    }
    
    // Check blocked IPs from config
    if (this.config.blockedIPs.includes(clientIP)) {
      this.blockedIPs.add(clientIP);
      return { allowed: false, reason: 'IP blocked by configuration' };
    }
    
    // Track suspicious requests
    this.trackSuspiciousRequest(clientIP);
    
    return { allowed: true };
  }
  
  private getClientIP(request: FastifyRequest): string {
    return (request.headers['x-forwarded-for'] as string)?.split(',')[0] || 
           request.ip || 
           request.socket?.remoteAddress || 
           'unknown';
  }
  
  private trackSuspiciousRequest(ip: string): void {
    const now = Date.now();
    const record = this.suspiciousRequests.get(ip) || { count: 0, lastSeen: 0 };
    
    // Reset if last seen more than 5 minutes ago
    if (now - record.lastSeen > 300000) {
      record.count = 0;
    }
    
    record.count++;
    record.lastSeen = now;
    this.suspiciousRequests.set(ip, record);
    
    // Block IP if too many suspicious requests
    if (record.count > 100) {
      this.blockedIPs.add(ip);
      logger.warn(`IP ${ip} blocked due to suspicious activity`);
      
      // Track in Mixpanel
      mixpanelService.track('ip_blocked', {
        ip,
        reason: 'excessive_suspicious_requests',
        count: record.count,
        timestamp: new Date().toISOString()
      }).catch(() => {});
    }
  }
  
  // Rate limiting with enhanced tracking
  async checkRateLimit(_request: FastifyRequest, identifier: string, limit: number, window: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    // const _windowStart = now - window;
    
    // This would integrate with Redis in production
    // For now, return a simple check
    // const _key = `rate_limit:${identifier}`;
    
    // Simulate rate limiting check
    const isAllowed = Math.random() > 0.05; // 95% allow rate for demo
    
    if (this.config.enableRateLimitLogging && !isAllowed) {
      const clientIP = this.getClientIP(_request);
      logger.warn(`Rate limit exceeded for IP: ${clientIP}, identifier: ${identifier}`);
      
      // Track in Mixpanel
      mixpanelService.track('rate_limit_exceeded', {
        ip: clientIP,
        identifier,
        limit,
        window,
        timestamp: new Date().toISOString()
      }).catch(() => {});
    }
    
    return {
      allowed: isAllowed,
      remaining: Math.max(0, limit - 1),
      resetTime: now + window
    };
  }
  
  // Security event logging
  logSecurityEvent(event: string, details: any, request?: FastifyRequest): void {
    const clientIP = request ? this.getClientIP(request) : 'system';
    const userAgent = request?.headers['user-agent'] || 'unknown';
    
    logger.warn(`Security event: ${event}`, {
      ...details,
      clientIP,
      userAgent,
      timestamp: new Date().toISOString()
    });
    
    // Track in Mixpanel
    mixpanelService.track('security_event', {
      event,
      clientIP,
      userAgent,
      ...details,
      timestamp: new Date().toISOString()
    }).catch(() => {});
  }
  
  // Get security status
  getSecurityStatus(): any {
    const activeBlockedIPs = this.blockedIPs.size;
    const suspiciousIPs = this.suspiciousRequests.size;
    
    return {
      config: this.config,
      stats: {
        activeBlockedIPs,
        suspiciousIPs,
        totalSuspiciousRequests: Array.from(this.suspiciousRequests.values()).reduce((sum, record) => sum + record.count, 0)
      },
      timestamp: new Date().toISOString()
    };
  }
  
  // Cleanup old suspicious request records
  cleanup(): void {
    const now = Date.now();
    const fiveMinutesAgo = now - 300000;
    
    for (const [ip, record] of this.suspiciousRequests.entries()) {
      if (record.lastSeen < fiveMinutesAgo) {
        this.suspiciousRequests.delete(ip);
      }
    }
  }
}

export const securityService = SecurityService.getInstance();
export default securityService;