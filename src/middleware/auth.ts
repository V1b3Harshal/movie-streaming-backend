import { FastifyRequest, FastifyReply } from 'fastify';
import { JWTPayload } from '../types/jwt';
import { verifyToken } from '../utils/jwt';
import { isSessionValid, updateSessionActivity } from '../utils/tokenRotation';
import { logErrorWithDetails } from '../utils/errorHandler';

export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = request.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'No access token provided'
    });
  }
  
  try {
    const decoded = verifyToken(request.server, token, 'access-token') as JWTPayload;
    
    // Validate token payload fields
    if (!decoded.userId || !decoded.email) {
      logErrorWithDetails(new Error('Invalid token payload'), {
        token: token.substring(0, 10) + '...',
        payload: decoded
      });
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid token payload'
      });
    }

    // Check if session is valid (if sessionId is present)
    if (decoded.sessionId && !isSessionValid(decoded.sessionId)) {
      logErrorWithDetails(new Error('Session expired or invalid'), {
        sessionId: decoded.sessionId,
        userId: decoded.userId
      });
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Session expired or invalid'
      });
    }

    // Update session activity if session exists
    if (decoded.sessionId) {
      updateSessionActivity(decoded.sessionId);
    }
    
    request.user = decoded;
  } catch (error) {
    logErrorWithDetails(error, {
      token: token.substring(0, 10) + '...',
      url: request.url,
      method: request.method
    });
    return reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired access token'
    });
  }
};

export const optionalAuthenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = request.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return; // Continue without authentication
  }
  
  try {
    const decoded = verifyToken(request.server, token, 'access-token') as JWTPayload;
    
    // Validate token payload fields
    if (!decoded.userId || !decoded.email) {
      return; // Continue without authentication
    }

    // Check if session is valid (if sessionId is present)
    if (decoded.sessionId && !isSessionValid(decoded.sessionId)) {
      return; // Continue without authentication
    }

    // Update session activity if session exists
    if (decoded.sessionId) {
      updateSessionActivity(decoded.sessionId);
    }
    
    request.user = decoded;
  } catch (error) {
    // Continue without authentication
  }
};