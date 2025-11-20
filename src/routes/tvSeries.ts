import { FastifyPluginAsync } from 'fastify';
import tvSeriesService from '../services/tvSeriesService';
import { sanitizeSearchQuery, sanitizeId } from '../utils/sanitizer';
import { createSafeErrorResponse, logErrorWithDetails } from '../utils/errorHandler';
import { mixpanelService } from '../config/mixpanel';
import { algoliaService } from '../config/algolia';
import '../utils/logger';

const tvSeriesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    try {
      const shows = await tvSeriesService.getTvSeries();
      
      // Track analytics
      mixpanelService.track('tv_series_browse', {
        endpoint: '/tv-series',
        count: shows.length,
        timestamp: new Date().toISOString(),
        userAgent: request.headers['user-agent'],
        ip: request.ip
      }).catch(() => {});
      
      return shows;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get TV series' });
      
      // Track error
      mixpanelService.track('tv_series_error', {
        endpoint: '/tv-series',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }).catch(() => {});
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/search', async (request, reply) => {
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

      // Track search analytics
      mixpanelService.track('tv_series_search', {
        endpoint: '/tv-series/search',
        query: sanitizedQuery,
        page: page || 1,
        resultsCount: results.results?.length || 0,
        timestamp: new Date().toISOString(),
        userAgent: request.headers['user-agent'],
        ip: request.ip
      }).catch(() => {});

      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Search TV series' });

      // Track search error
      mixpanelService.track('tv_series_search_error', {
        endpoint: '/tv-series/search',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }).catch(() => {});

      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  // Algolia-powered instant search for TV series
  fastify.get('/search/instant', async (request, reply) => {
    try {
      const { q, page, limit } = request.query as {
        q: string;
        page?: number;
        limit?: number;
      };

      if (!q || typeof q !== 'string') {
        return reply.code(400).send({ error: 'Search query is required' });
      }

      const sanitizedQuery = sanitizeSearchQuery(q);
      if (!sanitizedQuery) {
        return reply.code(400).send({ error: 'Invalid search query' });
      }

      // Use Algolia for instant search
      const searchOptions = {
        query: sanitizedQuery,
        page: page || 0,
        hitsPerPage: Math.min(limit || 20, 50), // Max 50 results
        facets: ['genre_names', 'original_language', 'status', 'rating'],
        getRankingInfo: true
      };

      const results = await algoliaService.searchTVShows(searchOptions);

      // Track instant search analytics
      mixpanelService.track('tv_series_instant_search', {
        endpoint: '/tv-series/search/instant',
        query: sanitizedQuery,
        page: page || 0,
        limit: limit || 20,
        resultsCount: results.hits?.length || 0,
        timestamp: new Date().toISOString(),
        userAgent: request.headers['user-agent'],
        ip: request.ip
      }).catch(() => {});

      return {
        success: true,
        data: results,
        query: sanitizedQuery,
        type: 'tv',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Instant search TV series' });

      // Track search error
      mixpanelService.track('tv_series_instant_search_error', {
        endpoint: '/tv-series/search/instant',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }).catch(() => {});

      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/details/:id', async (request, reply) => {
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

  fastify.get('/similar/:id', async (request, reply) => {
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

  fastify.get('/trending', async (request, reply) => {
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

  fastify.get('/airing-today', async (request, reply) => {
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

  fastify.get('/on-the-air', async (request, reply) => {
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
