import { FastifyPluginAsync } from 'fastify';
import tvSeriesService from '../services/tvSeriesService';
import { authenticate } from '../middleware/auth';
import { sanitizeSearchQuery, sanitizeId } from '../utils/sanitizer';
import { createSafeErrorResponse, logErrorWithDetails } from '../utils/errorHandler';

const tvSeriesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const shows = await tvSeriesService.getTvSeries();
      return shows;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get TV series' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/search', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { query, page } = request.query as { query: string; page?: number };
      
      if (!query || typeof query !== 'string') {
        return reply.code(400).send({ error: 'Search query is required' });
      }
      
      const sanitizedQuery = sanitizeSearchQuery(query);
      if (!sanitizedQuery) {
        return reply.code(400).send({ error: 'Invalid search query' });
      }
      
      const results = await tvSeriesService.getTvSeriesSearch(sanitizedQuery, page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Search TV series' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/details/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      
      if (!id || typeof id !== 'string') {
        return reply.code(400).send({ error: 'TV series ID is required' });
      }
      
      const sanitizedId = sanitizeId(id);
      if (!sanitizedId) {
        return reply.code(400).send({ error: 'Invalid TV series ID' });
      }
      
      const show = await tvSeriesService.getTvSeriesDetails(parseInt(sanitizedId));
      return show;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get TV series details' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/similar/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { page } = request.query as { page?: number };
      const results = await tvSeriesService.getSimilarTvSeries(parseInt(id), page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get similar TV series' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/trending', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { page } = request.query as { page?: number };
      const results = await tvSeriesService.getTrendingTvSeries(page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get trending TV series' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/airing-today', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { page } = request.query as { page?: number };
      const results = await tvSeriesService.getAiringToday(page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get airing today TV series' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/on-the-air', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { page } = request.query as { page?: number };
      const results = await tvSeriesService.getOnTheAir(page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get on the air TV series' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });
};

export default tvSeriesRoutes;
