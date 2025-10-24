import { FastifyRequest, FastifyReply } from 'fastify';
import { JWTPayload } from '../types/jwt';
import { verifyToken } from '../utils/jwt';

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
    
    request.user = decoded;
  } catch (error) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
};