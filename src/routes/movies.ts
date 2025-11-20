import { FastifyPluginAsync } from 'fastify';
import movieService from '../services/movieService';
import { sanitizeSearchQuery, sanitizeId } from '../utils/sanitizer';
import { createSafeErrorResponse, logErrorWithDetails } from '../utils/errorHandler';
import { mixpanelService } from '../config/mixpanel';
import { algoliaService } from '../config/algolia';
import '../utils/logger';

const moviesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    schema: {
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tmdb_id: { type: 'number' },
              imdb_id: { type: 'string' },
              title: { type: 'string' },
              type: { type: 'string' },
              overview: { type: 'string' },
              release_date: { type: 'string' },
              language: { type: 'string' },
              country: { type: 'string' },
              genres: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    name: { type: 'string' }
                  }
                }
              },
              rating: {
                type: 'object',
                properties: {
                  imdb_rating: { type: 'number' },
                  votes: { type: 'number' }
                }
              },
              poster_path: { type: ['string', 'null'] },
              backdrop_path: { type: ['string', 'null'] },
              popularity: { type: 'number' },
              vote_average: { type: 'number' },
              vote_count: { type: 'number' },
              runtime: { type: 'number' },
              status: { type: 'string' },
              tagline: { type: 'string' },
              budget: { type: 'number' },
              revenue: { type: 'number' }
            }
          }
        },
        500: {
          type: 'object',
          required: ['statusCode', 'error', 'message'],
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const movies = await movieService.getMovies();

      // Track analytics
      mixpanelService.track('movies_browse', {
        endpoint: '/movies',
        count: movies.length,
        timestamp: new Date().toISOString(),
        userAgent: request.headers['user-agent'],
        ip: request.ip
      }).catch(() => {});

      return movies;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get movies' });

      // Track error
      mixpanelService.track('movies_error', {
        endpoint: '/movies',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }).catch(() => {});

      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/search', {
    schema: {
      querystring: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 100 },
          page: { type: 'number', minimum: 1, maximum: 1000, default: 1 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            total_results: { type: 'number' },
            total_pages: { type: 'number' },
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tmdb_id: { type: 'number' },
                  imdb_id: { type: 'string' },
                  title: { type: 'string' },
                  type: { type: 'string' },
                  overview: { type: 'string' },
                  release_date: { type: 'string' },
                  language: { type: 'string' },
                  country: { type: 'string' },
                  genres: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'number' },
                        name: { type: 'string' }
                      }
                    }
                  },
                  rating: {
                    type: 'object',
                    properties: {
                      imdb_rating: { type: 'number' },
                      votes: { type: 'number' }
                    }
                  },
                  poster_path: { type: ['string', 'null'] },
                  backdrop_path: { type: ['string', 'null'] },
                  popularity: { type: 'number' },
                  vote_average: { type: 'number' },
                  vote_count: { type: 'number' }
                }
              }
            }
          }
        },
        400: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          required: ['statusCode', 'error', 'message'],
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { query, page } = request.query as { query: string; page?: number };

      const sanitizedQuery = sanitizeSearchQuery(query);
      if (!sanitizedQuery) {
        return reply.code(400).send({ error: 'Invalid search query' });
      }

      const results = await movieService.getMoviesSearch(sanitizedQuery, page);

      // Track search analytics
      mixpanelService.track('movie_search', {
        endpoint: '/movies/search',
        query: sanitizedQuery,
        page: page || 1,
        resultsCount: results.results?.length || 0,
        timestamp: new Date().toISOString(),
        userAgent: request.headers['user-agent'],
        ip: request.ip
      }).catch(() => {});

      return results;
    } catch (error) {
      logErrorWithDetails(error, { context: 'Search movies' });

      // Track search error
      mixpanelService.track('movie_search_error', {
        endpoint: '/movies/search',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }).catch(() => {});

      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  // Algolia-powered instant search
  fastify.get('/search/instant', async (request, reply) => {
    try {
      const { q, type, page, limit } = request.query as {
        q: string;
        type?: 'movie' | 'tv';
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
        facets: ['genre_names', 'original_language', 'rating'],
        getRankingInfo: true
      };

      let results;
      if (type === 'tv') {
        results = await algoliaService.searchTVShows(searchOptions);
      } else if (type === 'movie') {
        results = await algoliaService.searchMovies(searchOptions);
      } else {
        // Search both movies and TV shows
        const allResults = await algoliaService.searchAll(searchOptions);
        results = {
          movies: allResults.movies,
          tvShows: allResults.tvShows,
          totalResults: allResults.totalResults
        };
      }

      // Track instant search analytics
      mixpanelService.track('movie_instant_search', {
        endpoint: '/movies/search/instant',
        query: sanitizedQuery,
        type: type || 'all',
        page: page || 0,
        limit: limit || 20,
        resultsCount: type ? results.hits?.length || 0 : results.totalResults || 0,
        timestamp: new Date().toISOString(),
        userAgent: request.headers['user-agent'],
        ip: request.ip
      }).catch(() => {});

      return {
        success: true,
        data: results,
        query: sanitizedQuery,
        type: type || 'all',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Instant search movies' });

      // Track search error
      mixpanelService.track('movie_instant_search_error', {
        endpoint: '/movies/search/instant',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }).catch(() => {});

      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  // Search suggestions/autocomplete
  fastify.get('/search/suggestions', async (request, reply) => {
    try {
      const { q, limit } = request.query as { q: string; limit?: number };

      if (!q || typeof q !== 'string') {
        return reply.code(400).send({ error: 'Search query is required' });
      }

      const sanitizedQuery = sanitizeSearchQuery(q);
      if (!sanitizedQuery) {
        return reply.code(400).send({ error: 'Invalid search query' });
      }

      const suggestions = await algoliaService.getSuggestions(
        sanitizedQuery,
        Math.min(limit || 5, 10) // Max 10 suggestions
      );

      return {
        success: true,
        data: suggestions,
        query: sanitizedQuery,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get search suggestions' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  fastify.get('/details/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9]+$' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            tmdb_id: { type: 'number' },
            imdb_id: { type: 'string' },
            title: { type: 'string' },
            type: { type: 'string' },
            overview: { type: 'string' },
            release_date: { type: 'string' },
            language: { type: 'string' },
            country: { type: 'string' },
            genres: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  name: { type: 'string' }
                }
              }
            },
            rating: {
              type: 'object',
              properties: {
                imdb_rating: { type: 'number' },
                votes: { type: 'number' }
              }
            },
            poster_path: { type: ['string', 'null'] },
            backdrop_path: { type: ['string', 'null'] },
            popularity: { type: 'number' },
            vote_average: { type: 'number' },
            vote_count: { type: 'number' },
            runtime: { type: 'number' },
            status: { type: 'string' },
            tagline: { type: 'string' },
            budget: { type: 'number' },
            revenue: { type: 'number' }
          }
        },
        400: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          required: ['statusCode', 'error', 'message'],
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

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

  fastify.get('/similar/:id', async (request, reply) => {
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

  fastify.get('/trending', async (request, reply) => {
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

  fastify.get('/upcoming', async (request, reply) => {
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
