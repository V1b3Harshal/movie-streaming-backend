import { FastifyPluginAsync } from 'fastify';
import axios from 'axios';
import { internalAuth } from '../middleware/internalAuth';
import { sanitizeId } from '../utils/sanitizer';
import { createSafeErrorResponse, logErrorWithDetails } from '../utils/errorHandler';

interface ProviderEmbedResponse {
  iframeUrl: string;
  provider: string;
  movieId: string;
}

const providersRoutes: FastifyPluginAsync = async (fastify) => {
  // Get provider embed URL
  fastify.get('/:provider/:id', { preHandler: [internalAuth] }, async (request, reply) => {
    try {
      const { provider, id } = request.params as { provider: string; id: string };
      
      if (!provider || typeof provider !== 'string') {
        return reply.code(400).send({ error: 'Provider name is required' });
      }
      
      if (!id || typeof id !== 'string') {
        return reply.code(400).send({ error: 'Movie ID is required' });
      }
      
      const sanitizedId = sanitizeId(id);
      if (!sanitizedId) {
        return reply.code(400).send({ error: 'Invalid movie ID' });
      }
      
      // Call the Providers Backend API
      const providersBackendUrl = process.env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.get<ProviderEmbedResponse>(
        `${providersBackendUrl}/${provider}/${sanitizedId}`,
        {
          headers: {
            'x-internal-key': process.env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      return response.data;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get provider embed URL', provider: (request.params as any).provider });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        if (error.response?.status === 404) {
          return reply.code(404).send({ error: 'Provider not found' });
        }
        if (error.response?.status === 429) {
          return reply.code(429).send({ error: 'Rate limit exceeded' });
        }
        return reply.code(error.response?.status || 500).send({ 
          error: 'Provider service error',
          message: error.response?.data?.error || 'Failed to get provider URL'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Get supported providers list
  fastify.get('/list', { preHandler: [internalAuth] }, async (request, reply) => {
    try {
      // Call the Providers Backend API
      const providersBackendUrl = process.env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.get(
        `${providersBackendUrl}/providers/list`,
        {
          headers: {
            'x-internal-key': process.env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      return response.data;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get providers list' });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        return reply.code(error.response?.status || 500).send({ 
          error: 'Provider service error',
          message: error.response?.data?.error || 'Failed to get providers list'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });

  // Check provider status
  fastify.get('/status/:provider', { preHandler: [internalAuth] }, async (request, reply) => {
    try {
      const { provider } = request.params as { provider: string };
      
      if (!provider || typeof provider !== 'string') {
        return reply.code(400).send({ error: 'Provider name is required' });
      }
      
      // Call the Providers Backend API
      const providersBackendUrl = process.env.PROVIDERS_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.get(
        `${providersBackendUrl}/status/${provider}`,
        {
          headers: {
            'x-internal-key': process.env.INTERNAL_API_KEY || 'your-secure-internal-api-key-here',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      return response.data;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get provider status', provider: (request.params as any).provider });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return reply.code(401).send({ error: 'Invalid internal API key' });
        }
        return reply.code(error.response?.status || 500).send({ 
          error: 'Provider service error',
          message: error.response?.data?.error || 'Failed to check provider status'
        });
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(safeError.statusCode).send(safeError);
    }
  });
};

export default providersRoutes;