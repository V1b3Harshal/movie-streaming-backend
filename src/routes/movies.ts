import { FastifyPluginAsync } from 'fastify';
import movieService from '../services/movieService';
import { authenticate } from '../middleware/auth';
import { sanitizeSearchQuery, sanitizeId } from '../utils/sanitizer';
import { createSafeErrorResponse, logErrorWithDetails } from '../utils/errorHandler';

const moviesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const movies = await movieService.getMovies();
      return movies;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get movies' });
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
      
      const results = await movieService.getMoviesSearch(sanitizedQuery, page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Search movies' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/details/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      
      if (!id || typeof id !== 'string') {
        return reply.code(400).send({ error: 'Movie ID is required' });
      }
      
      const sanitizedId = sanitizeId(id);
      if (!sanitizedId) {
        return reply.code(400).send({ error: 'Invalid movie ID' });
      }
      
      const movie = await movieService.getMovieDetails(parseInt(sanitizedId));
      return movie;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get movie details' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/similar/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { page } = request.query as { page?: number };
      const results = await movieService.getSimilarMovies(parseInt(id), page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get similar movies' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/trending', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { page } = request.query as { page?: number };
      const results = await movieService.getTrendingMovies(page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get trending movies' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/upcoming', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { page } = request.query as { page?: number };
      const results = await movieService.getUpcomingMovies(page);
      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get upcoming movies' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });
};

export default moviesRoutes;
