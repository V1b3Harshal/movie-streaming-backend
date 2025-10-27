import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { internalAuth } from '../middleware/internalAuth';
import { sanitizeId, sanitizeInput } from '../utils/sanitizer';
import { createSafeErrorResponse, logErrorWithDetails } from '../utils/errorHandler';
import { syncService } from '../services/syncService';

interface WatchTogetherRoom {
  id: string;
  name: string;
  adminId: string;
  mediaId: string;
  mediaType: 'movie' | 'tv';
  providerId?: string;
  participants: string[];
  currentState: {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    playbackRate: number;
    currentEpisode?: number;
    providerUrl?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface PlaybackAction {
  type: 'play' | 'pause' | 'seek' | 'setPlaybackRate' | 'updateTime' | 'changeEpisode' | 'changeProvider' | 'changeMedia';
  data: any;
}

const watchTogetherRoutes: FastifyPluginAsync = async (fastify: any) => {
  // Create a new watch-together room
  fastify.post('/rooms', { preHandler: [internalAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { name, mediaId, mediaType, adminId, providerId } = request.body as {
        name: string;
        mediaId: string;
        mediaType: 'movie' | 'tv';
        adminId: string;
        providerId?: string;
      };

      if (!name || !mediaId || !mediaType || !adminId) {
        return reply.code(400).send({ error: 'Missing required fields: name, mediaId, mediaType, adminId' });
      }

      // Call the Providers Backend API
      const providersBackendUrl = (process as any).env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(
        `${providersBackendUrl}/watch-together/rooms`,
        {
          name: sanitizeInput(name),
          mediaId: sanitizeId(mediaId),
          mediaType,
          adminId: sanitizeId(adminId),
          providerId: sanitizeInput(providerId || 'vidnest')
        },
        {
          headers: {
            'x-internal-key': (process as any).env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Create watch-together room' });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        return reply.code(error.response?.status || 500).send({
          error: 'Watch-together service error',
          message: error.response?.data?.error || 'Failed to create room'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Join a watch-together room
  fastify.post('/rooms/:roomId/join', { preHandler: [internalAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { roomId } = request.params as { roomId: string };
      const { userId } = request.body as { userId: string };

      if (!roomId || !userId) {
        return reply.code(400).send({ error: 'Missing roomId or userId' });
      }

      // Call the Providers Backend API
      const providersBackendUrl = (process as any).env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(
        `${providersBackendUrl}/watch-together/rooms/${sanitizeId(roomId)}/join`,
        {
          userId: sanitizeId(userId)
        },
        {
          headers: {
            'x-internal-key': (process as any).env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logErrorWithDetails(error, { 
        context: 'Join watch-together room',
        roomId: (request.params as any).roomId,
        userId: (request.body as any).userId
      });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        return reply.code(error.response?.status || 500).send({ 
          error: 'Watch-together service error',
          message: error.response?.data?.error || 'Failed to join room'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Leave a watch-together room
  fastify.post('/rooms/:roomId/leave', { preHandler: [internalAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { roomId } = request.params as { roomId: string };
      const { userId } = request.body as { userId: string };

      if (!roomId || !userId) {
        return reply.code(400).send({ error: 'Missing roomId or userId' });
      }

      // Call the Providers Backend API
      const providersBackendUrl = (process as any).env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(
        `${providersBackendUrl}/watch-together/rooms/${sanitizeId(roomId)}/leave`,
        {
          userId: sanitizeId(userId)
        },
        {
          headers: {
            'x-internal-key': (process as any).env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logErrorWithDetails(error, { 
        context: 'Leave watch-together room',
        roomId: (request.params as any).roomId,
        userId: (request.body as any).userId
      });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        return reply.code(error.response?.status || 500).send({ 
          error: 'Watch-together service error',
          message: error.response?.data?.error || 'Failed to leave room'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Get room information
  fastify.get('/rooms/:roomId', { preHandler: [internalAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { roomId } = request.params as { roomId: string };

      if (!roomId) {
        return reply.code(400).send({ error: 'Missing roomId' });
      }

      // Call the Providers Backend API
      const providersBackendUrl = (process as any).env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.get(
        `${providersBackendUrl}/watch-together/rooms/${sanitizeId(roomId)}`,
        {
          headers: {
            'x-internal-key': (process as any).env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logErrorWithDetails(error, { 
        context: 'Get watch-together room',
        roomId: (request.params as any).roomId
      });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        if (error.response?.status === 404) {
          return reply.code(404).send({ error: 'Room not found' });
        }
        return reply.code(error.response?.status || 500).send({ 
          error: 'Watch-together service error',
          message: error.response?.data?.error || 'Failed to get room'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Get all rooms
  fastify.get('/rooms', { preHandler: [internalAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Call the Providers Backend API
      const providersBackendUrl = (process as any).env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.get(
        `${providersBackendUrl}/watch-together/rooms`,
        {
          headers: {
            'x-internal-key': (process as any).env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get all watch-together rooms' });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        return reply.code(error.response?.status || 500).send({ 
          error: 'Watch-together service error',
          message: error.response?.data?.error || 'Failed to get rooms'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Get room statistics
  fastify.get('/stats', { preHandler: [internalAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Call the Providers Backend API
      const providersBackendUrl = (process as any).env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.get(
        `${providersBackendUrl}/watch-together/stats`,
        {
          headers: {
            'x-internal-key': (process as any).env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get watch-together statistics' });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        return reply.code(error.response?.status || 500).send({ 
          error: 'Watch-together service error',
          message: error.response?.data?.error || 'Failed to get statistics'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Send playback action (for sync media player)
  fastify.post('/rooms/:roomId/playback', { preHandler: [internalAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { roomId } = request.params as { roomId: string };
      const { action, userId } = request.body as { action: PlaybackAction; userId: string };

      if (!roomId || !action || !userId) {
        return reply.code(400).send({ error: 'Missing roomId, action, or userId' });
      }

      // Call the Providers Backend API directly for real-time processing
      const providersBackendUrl = (process as any).env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(
        `${providersBackendUrl}/watch-together/rooms/${sanitizeId(roomId)}/playback`,
        {
          action,
          userId: sanitizeId(userId)
        },
        {
          headers: {
            'x-internal-key': (process as any).env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logErrorWithDetails(error, {
        context: 'Send playback action',
        roomId: (request.params as any).roomId
      });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        return reply.code(error.response?.status || 500).send({
          error: 'Watch-together service error',
          message: error.response?.data?.error || 'Failed to process playback action'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Request sync (for sync media player)
  fastify.post('/rooms/:roomId/sync', { preHandler: [internalAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { roomId } = request.params as { roomId: string };
      const { userId } = request.body as { userId: string };

      if (!roomId || !userId) {
        return reply.code(400).send({ error: 'Missing roomId or userId' });
      }

      // Join the room for sync
      await syncService.joinRoom(sanitizeId(roomId), sanitizeId(userId));
      
      // Get current room state
      const roomState = syncService.getRoomState(sanitizeId(roomId));
      
      return {
        success: true,
        message: 'Sync request processed',
        roomId: sanitizeId(roomId),
        userId: sanitizeId(userId),
        roomState
      };
    } catch (error) {
      logErrorWithDetails(error, {
        context: 'Request sync',
        roomId: (request.params as any).roomId
      });
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Leave sync room
  fastify.post('/rooms/:roomId/leave-sync', { preHandler: [internalAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { roomId } = request.params as { roomId: string };
      const { userId } = request.body as { userId: string };

      if (!roomId || !userId) {
        return reply.code(400).send({ error: 'Missing roomId or userId' });
      }

      await syncService.leaveRoom(sanitizeId(roomId), sanitizeId(userId));
      
      return {
        success: true,
        message: 'Left sync room successfully',
        roomId: sanitizeId(roomId),
        userId: sanitizeId(userId)
      };
    } catch (error) {
      logErrorWithDetails(error, {
        context: 'Leave sync room',
        roomId: (request.params as any).roomId
      });
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Get sync room state
  fastify.get('/rooms/:roomId/sync-state', { preHandler: [internalAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { roomId } = request.params as { roomId: string };

      if (!roomId) {
        return reply.code(400).send({ error: 'Missing roomId' });
      }

      // Call the Providers Backend API for real-time state
      const providersBackendUrl = (process as any).env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(
        `${providersBackendUrl}/watch-together/rooms/${sanitizeId(roomId)}/sync`,
        {
          userId: 'system' // System request for state
        },
        {
          headers: {
            'x-internal-key': (process as any).env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logErrorWithDetails(error, {
        context: 'Get sync room state',
        roomId: (request.params as any).roomId
      });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        if (error.response?.status === 404) {
          return reply.code(404).send({ error: 'Room not found' });
        }
        return reply.code(error.response?.status || 500).send({
          error: 'Watch-together service error',
          message: error.response?.data?.error || 'Failed to get sync state'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Transfer admin ownership
  fastify.post('/rooms/:roomId/transfer-admin', { preHandler: [internalAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { roomId } = request.params as { roomId: string };
      const { currentAdminId, newAdminId } = request.body as { currentAdminId: string; newAdminId: string };

      if (!roomId || !currentAdminId || !newAdminId) {
        return reply.code(400).send({ error: 'Missing roomId, currentAdminId, or newAdminId' });
      }

      // Call the Providers Backend API
      const providersBackendUrl = (process as any).env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(
        `${providersBackendUrl}/watch-together/rooms/${sanitizeId(roomId)}/transfer-admin`,
        {
          currentAdminId: sanitizeId(currentAdminId),
          newAdminId: sanitizeId(newAdminId)
        },
        {
          headers: {
            'x-internal-key': (process as any).env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logErrorWithDetails(error, {
        context: 'Transfer admin',
        roomId: (request.params as any).roomId
      });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        return reply.code(error.response?.status || 500).send({
          error: 'Watch-together service error',
          message: error.response?.data?.error || 'Failed to transfer admin'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Kick user from room
  fastify.post('/rooms/:roomId/kick-user', { preHandler: [internalAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { roomId } = request.params as { roomId: string };
      const { adminId, userIdToKick } = request.body as { adminId: string; userIdToKick: string };

      if (!roomId || !adminId || !userIdToKick) {
        return reply.code(400).send({ error: 'Missing roomId, adminId, or userIdToKick' });
      }

      // Call the Providers Backend API
      const providersBackendUrl = (process as any).env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(
        `${providersBackendUrl}/watch-together/rooms/${sanitizeId(roomId)}/kick-user`,
        {
          adminId: sanitizeId(adminId),
          userIdToKick: sanitizeId(userIdToKick)
        },
        {
          headers: {
            'x-internal-key': (process as any).env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logErrorWithDetails(error, {
        context: 'Kick user',
        roomId: (request.params as any).roomId
      });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        return reply.code(error.response?.status || 500).send({
          error: 'Watch-together service error',
          message: error.response?.data?.error || 'Failed to kick user'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Get available providers
  fastify.get('/providers', { preHandler: [internalAuth] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Call the Providers Backend API
      const providersBackendUrl = (process as any).env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.get(
        `${providersBackendUrl}/watch-together/providers`,
        {
          headers: {
            'x-internal-key': (process as any).env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get providers' });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        return reply.code(error.response?.status || 500).send({
          error: 'Watch-together service error',
          message: error.response?.data?.error || 'Failed to get providers'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });
};

export default watchTogetherRoutes;