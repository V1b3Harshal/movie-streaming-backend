import { FastifyJWT } from '@fastify/jwt';
import { JWTPayload, AuthTokens } from '../types/jwt';

export const generateTokens = (fastify: any, payload: JWTPayload): AuthTokens => {
  const tokenPayload = {
    userId: payload.userId,
    email: payload.email,
    sessionId: payload.sessionId,
    jti: payload.jti || crypto.randomUUID(), // Add JWT ID for token identification
    iat: Math.floor(Date.now() / 1000), // Issued at timestamp
  };
  
  const accessToken = fastify.jwt.sign(tokenPayload, {
    expiresIn: '15m',
    audience: 'access-token',
    issuer: 'movie-streaming-backend'
  });
  
  const refreshToken = fastify.jwt.sign({
    userId: payload.userId,
    email: payload.email,
    sessionId: payload.sessionId,
    jti: crypto.randomUUID(),
    iat: Math.floor(Date.now() / 1000),
  }, {
    expiresIn: '7d',
    audience: 'refresh-token',
    issuer: 'movie-streaming-backend'
  });

  return { accessToken, refreshToken };
};

export const generateAccessToken = (fastify: any, payload: JWTPayload): string => {
  const tokenPayload = {
    userId: payload.userId,
    email: payload.email,
    sessionId: payload.sessionId,
    jti: payload.jti || crypto.randomUUID(),
    iat: Math.floor(Date.now() / 1000),
  };
  
  return fastify.jwt.sign(tokenPayload, {
    expiresIn: '15m',
    audience: 'access-token',
    issuer: 'movie-streaming-backend'
  });
};

export const verifyToken = (fastify: any, token: string, audience?: string): any => {
  try {
    return fastify.jwt.verify(token, { audience });
  } catch (error) {
    throw new Error(`Token verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};