import { FastifyPluginAsync } from 'fastify';
import traktService from '../services/traktService';
import { sanitizeSearchQuery } from '../utils/sanitizer';
import { createSafeErrorResponse, logErrorWithDetails } from '../utils/errorHandler';

const traktRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/movies/search', async (request, reply) => {
    try {
      const { query, page } = request.query as { query: string; page?: number };
      
      if (!query || typeof query !== 'string') {
        return reply.code(400).send({ error: 'Search query is required' });
      }
      
      const sanitizedQuery = sanitizeSearchQuery(query);
      if (!sanitizedQuery) {
        return reply.code(400).send({ error: 'Invalid search query' });
      }
      
      const results = await traktService.searchMovies(sanitizedQuery, page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Search movies on Trakt' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/tv-series/search', async (request, reply) => {
    try {
      const { query, page } = request.query as { query: string; page?: number };
      
      if (!query || typeof query !== 'string') {
        return reply.code(400).send({ error: 'Search query is required' });
      }
      
      const sanitizedQuery = sanitizeSearchQuery(query);
      if (!sanitizedQuery) {
        return reply.code(400).send({ error: 'Invalid search query' });
      }
      
      const results = await traktService.searchTvShows(sanitizedQuery, page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Search TV series on Trakt' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/movies/trending', async (request, reply) => {
    try {
      const { page } = request.query as { page?: number };
      const results = await traktService.getTrendingMovies(page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get trending movies from Trakt' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/tv-series/trending', async (request, reply) => {
    try {
      const { page } = request.query as { page?: number };
      const results = await traktService.getTrendingTvShows(page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get trending TV series from Trakt' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/movies/popular', async (request, reply) => {
    try {
      const { page } = request.query as { page?: number };
      const results = await traktService.getPopularMovies(page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get popular movies from Trakt' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/tv-series/popular', async (request, reply) => {
    try {
      const { page } = request.query as { page?: number };
      const results = await traktService.getPopularTvShows(page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get popular TV series from Trakt' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });
};

export default traktRoutes;