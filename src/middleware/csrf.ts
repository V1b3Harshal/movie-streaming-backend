import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

// CSRF token storage (in production, use Redis or session storage)
const csrfTokenStore = new Map<string, string>();

export const generateCSRFToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const storeCSRFToken = (userId: string, token: string): void => {
  csrfTokenStore.set(userId, token);
};

export const validateCSRFToken = (userId: string, token: string): boolean => {
  const storedToken = csrfTokenStore.get(userId);
  return storedToken === token;
};

export const removeCSRFToken = (userId: string): void => {
  csrfTokenStore.delete(userId);
};

export const csrfProtection = async (request: FastifyRequest, reply: FastifyReply) => {
  // Skip CSRF protection for safe methods
  if (['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(request.method)) {
    return;
  }

  // Skip CSRF protection for API paths that don't require it
  if (request.url.startsWith('/auth/') || request.url.startsWith('/health') || request.url.startsWith('/docs')) {
    return;
  }

  // Check for CSRF token in header
  const csrfToken = request.headers['x-csrf-token'];
  
  // Extract user ID from token (in a real implementation, you'd get this from the session)
  const userId = (request.user as any)?.userId || 'anonymous';
  
  if (!csrfToken || !validateCSRFToken(userId, csrfToken as string)) {
    return reply.code(403).send({ error: 'Invalid CSRF token' });
  }
};

export const addCSRFToken = (request: FastifyRequest, reply: FastifyReply) => {
  const userId = (request.user as any)?.userId || 'anonymous';
  let csrfToken = csrfTokenStore.get(userId);
  
  if (!csrfToken) {
    csrfToken = generateCSRFToken();
    storeCSRFToken(userId, csrfToken);
  }
  
  reply.header('X-CSRF-Token', csrfToken);
};