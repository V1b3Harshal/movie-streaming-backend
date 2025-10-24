import { FastifyJWT } from '@fastify/jwt';
import { JWTPayload, AuthTokens } from '../types/jwt';

export const generateTokens = (fastify: any, payload: JWTPayload): AuthTokens => {
  const accessToken = fastify.jwt.sign(
    { userId: payload.userId, email: payload.email },
    { expiresIn: '15m' }
  );
  
  const refreshToken = fastify.jwt.sign(
    { userId: payload.userId, email: payload.email },
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

export const generateAccessToken = (fastify: any, payload: JWTPayload): string => {
  return fastify.jwt.sign(
    { userId: payload.userId, email: payload.email },
    { expiresIn: '15m' }
  );
};

export const verifyToken = (fastify: any, token: string): any => {
  return fastify.jwt.verify(token);
};