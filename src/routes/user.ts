// User Management Routes
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { userSessionService } from '../services/userSessionService';
import { watchHistoryService } from '../services/watchHistoryService';
import { userProfileService } from '../services/userProfileService';
import { createSafeErrorResponse, logErrorWithDetails } from '../utils/errorHandler';
import { logger } from '../utils/logger';
import { mixpanelService } from '../config/mixpanel';
import { getRedisClient, RedisKeys } from '../config/redis';
import axios from 'axios';

const userRoutes: FastifyPluginAsync = async (fastify) => {
  // Authentication middleware for all user routes
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      // Verify Supabase token
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new Error('No authorization header');
      }

      const token = authHeader.replace('Bearer ', '');
      const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': process.env.SUPABASE_ANON_KEY!
        }
      });

      if (!response.ok) {
        throw new Error('Invalid token');
      }

      const user = await response.json();
      (request as any).user = user;
    } catch (error) {
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or missing authentication token'
      });
    }
  });

  // =====================
  // USER SESSION ENDPOINTS
  // =====================

  // Start a new user session
  fastify.post('/session/start', {
    schema: {
      body: {
        type: 'object',
        required: ['contentId', 'contentType'],
        properties: {
          contentId: { type: 'string', maxLength: 50 },
          contentType: { type: 'string', enum: ['movie', 'tv'] },
          watchTogetherRoomId: { type: 'string', maxLength: 50 },
          initialProgress: { type: 'number', minimum: 0 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { contentId, contentType, watchTogetherRoomId, initialProgress } = request.body as any;

      // Check for existing active session
      const existingSession = await userSessionService.getActiveSession(user.id, contentId);
      if (existingSession) {
        return reply.code(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: 'Active session already exists for this content'
        });
      }

      const session = await userSessionService.createSession({
        userId: user.id,
        contentId,
        contentType,
        watchTogetherRoomId,
        initialProgress
      });

      // Cache session in Redis for quick access
      const redis = getRedisClient();
      await redis.set(
        `${RedisKeys.sessions}active_${user.id}_${contentId}`,
        JSON.stringify(session),
        { EX: 3600 }
      );

      // Track session start event
      await mixpanelService.track('user_session_started', {
        contentId,
        contentType,
        hasWatchTogetherRoom: !!watchTogetherRoomId
      }, user.id);
      return { success: true, data: session };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Start user session' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Update session progress
  fastify.put('/session/:sessionId/progress', {
    schema: {
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string', maxLength: 50 }
        }
      },
      body: {
        type: 'object',
        required: ['currentTime'],
        properties: {
          currentTime: { type: 'number', minimum: 0 },
          totalDuration: { type: 'number', minimum: 0 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { sessionId } = request.params as any;
      const { currentTime, totalDuration } = request.body as any;

      // Verify session belongs to user
      const session = await userSessionService.getSession(sessionId);
      if (!session || session.userId !== user.id) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Session not found or access denied'
        });
      }

      const updatedSession = await userSessionService.updateProgress({
        sessionId,
        currentTime,
        totalDuration
      });

      // Track progress update event (only for significant progress updates)
      if (Math.abs(currentTime - session.lastProgress) > 30) { // Every 30 seconds
        await mixpanelService.track('user_progress_updated', {
          contentId: session.contentId,
          contentType: session.contentType,
          currentTime,
          totalDuration: totalDuration || session.totalDuration,
          sessionId
        }, user.id);
      }

      // Update watch history
      await watchHistoryService.updateWatchHistory({
        userId: user.id,
        contentId: session.contentId,
        contentType: session.contentType,
        watchedDuration: currentTime,
        totalDuration: totalDuration || session.totalDuration,
        watchSessionId: sessionId
      });

      return { success: true, data: updatedSession };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Update session progress' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // End a session
  fastify.post('/session/:sessionId/end', {
    schema: {
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string', maxLength: 50 }
        }
      },
      body: {
        type: 'object',
        properties: {
          finalProgress: { type: 'number', minimum: 0 },
          totalDuration: { type: 'number', minimum: 0 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { sessionId } = request.params as any;
      const { finalProgress, totalDuration } = request.body as any;

      // Verify session belongs to user
      const session = await userSessionService.getSession(sessionId);
      if (!session || session.userId !== user.id) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Session not found or access denied'
        });
      }

      const endedSession = await userSessionService.endSession(
        sessionId,
        finalProgress,
        totalDuration
      );

      // Remove from Redis cache
      // Track session end event
      await mixpanelService.track('user_session_ended', {
        contentId: session.contentId,
        contentType: session.contentType,
        finalProgress: finalProgress || session.lastProgress,
        totalDuration: totalDuration || session.totalDuration,
        completionPercentage: endedSession.completionPercentage,
        wasWatchTogether: !!session.watchTogetherRoomId
      }, user.id);
      const redis = getRedisClient();
      await redis.del(`${RedisKeys.sessions}active_${user.id}_${session.contentId}`);

      // Share session data with providers backend
      if (session.watchTogetherRoomId) {
        try {
          await axios.post(
            `${process.env.PROVIDERS_BACKEND_URL}/session/share-to-main`,
            {
              sessionId,
              userId: user.id,
              contentId: session.contentId,
              contentType: session.contentType,
              finalProgress: finalProgress || session.lastProgress,
              totalDuration: totalDuration || session.totalDuration,
              watchTogetherRoomId: session.watchTogetherRoomId,
              completionPercentage: endedSession.completionPercentage
            },
            {
              headers: {
                'x-internal-key': process.env.INTERNAL_API_KEY,
                'Content-Type': 'application/json'
              },
              timeout: 5000
            }
          );
        } catch (error) {
          logger.warn('Failed to share session data with providers backend:', error);
        }
      }

      return { success: true, data: endedSession };
    } catch (error) {
      logErrorWithDetails(error, { context: 'End user session' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Get user active sessions
  fastify.get('/sessions/active', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const sessions = await userSessionService.getUserActiveSessions(user.id);
      return { success: true, data: sessions };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get user active sessions' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // =====================
  // WATCH HISTORY ENDPOINTS
  // =====================

  // Get watch history
  fastify.get('/watch-history', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          contentType: { type: 'string', enum: ['movie', 'tv'] },
          isFavorite: { type: 'boolean' },
          minCompletion: { type: 'number', minimum: 0, maximum: 100 },
          maxCompletion: { type: 'number', minimum: 0, maximum: 100 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          offset: { type: 'number', minimum: 0 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const filters = request.query as any;

      const history = await watchHistoryService.getWatchHistory(user.id, filters);
      return { success: true, data: history };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get watch history' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Get recently watched
  fastify.get('/recently-watched', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 50 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { limit = 10 } = request.query as any;

      const recentlyWatched = await watchHistoryService.getRecentlyWatched(user.id, limit);
      return { success: true, data: recentlyWatched };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get recently watched' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Get continue watching
  fastify.get('/continue-watching', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 50 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { limit = 10 } = request.query as any;

      const continueWatching = await watchHistoryService.getContinueWatching(user.id, limit);
      return { success: true, data: continueWatching };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get continue watching' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Toggle favorite
  fastify.post('/favorites/:contentId', {
    schema: {
      params: {
        type: 'object',
        required: ['contentId'],
        properties: {
          contentId: { type: 'string', maxLength: 50 }
        }
      },
      body: {
        type: 'object',
        required: ['contentType'],
        properties: {
          contentType: { type: 'string', enum: ['movie', 'tv'] }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { contentId } = request.params as any;
      const { contentType } = request.body as any;

      const favorite = await watchHistoryService.toggleFavorite(user.id, contentId, contentType);
      return { success: true, data: favorite };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Toggle favorite' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Remove from watch history
  fastify.delete('/watch-history/:contentId', {
    schema: {
      params: {
        type: 'object',
        required: ['contentId'],
        properties: {
          contentId: { type: 'string', maxLength: 50 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { contentId } = request.params as any;

      const success = await watchHistoryService.removeWatchHistory(user.id, contentId);
      return { success };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Remove watch history' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Clear watch history
  fastify.delete('/watch-history', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          contentType: { type: 'string', enum: ['movie', 'tv'] }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { contentType } = request.query as any;

      const deletedCount = await watchHistoryService.clearWatchHistory(user.id, contentType);
      return { success: true, deletedCount };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Clear watch history' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Get watch statistics
  fastify.get('/watch-statistics', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'number', minimum: 1, maximum: 365 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const { days = 30 } = request.query as any;

      const stats = await watchHistoryService.getWatchStatistics(user.id, days);
      return { success: true, data: stats };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get watch statistics' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // =====================
  // USER PROFILE ENDPOINTS
  // =====================

  // Get user profile
  fastify.get('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const profile = await userProfileService.getOrCreateProfile(user.id);
      return { success: true, data: profile };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get user profile' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Update user profile
  fastify.put('/profile', {
    schema: {
      body: {
        type: 'object',
        properties: {
          displayName: { type: 'string', maxLength: 100 },
          avatar: { type: 'string', maxLength: 500 },
          bio: { type: 'string', maxLength: 500 },
          preferences: { type: 'object' },
          watchPreferences: { type: 'object' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const updateData = request.body as any;

      const profile = await userProfileService.updateProfile(user.id, updateData);
      return { success: true, data: profile };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Update user profile' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Get profile statistics
  fastify.get('/profile/statistics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = (request as any).user;
      const stats = await userProfileService.getProfileStatistics(user.id);
      return { success: true, data: stats };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get profile statistics' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });
};

export default userRoutes;