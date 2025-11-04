import { FastifyRequest, FastifyReply } from 'fastify';
import { JWTPayload } from '../types/jwt';
import { verifyToken } from '../utils/jwt';
import { isSessionValid, updateSessionActivity } from '../utils/tokenRotation';

export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = request.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return reply.code(401).send({ error: 'Unauthorized - No token provided' });
  }
  
  try {
    const decoded = verifyToken(request.server, token) as JWTPayload;
    
    // Validate token payload fields
    if (!decoded.userId || !decoded.email) {
      return reply.code(401).send({ error: 'Invalid token payload' });
    }

    // Check if session is valid (if sessionId is present)
    if (decoded.sessionId && !isSessionValid(decoded.sessionId)) {
      return reply.code(401).send({ error: 'Session expired or invalid' });
    }

    // Update session activity if session exists
    if (decoded.sessionId) {
      updateSessionActivity(decoded.sessionId);
    }
    
    request.user = decoded;
  } catch (error) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
};

export const optionalAuthenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = request.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return; // Continue without authentication
  }
  
  try {
    const decoded = verifyToken(request.server, token) as JWTPayload;
    
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