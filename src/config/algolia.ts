// =================================================================
// ALGOLIA SEARCH SERVICE
// Free tier: 20,000 searches/month
// Algolia: https://algolia.com
// =================================================================

import algoliasearch from 'algoliasearch';
import { logger } from '../utils/logger';

export interface AlgoliaConfig {
  appId: string;
  apiKey: string;
  searchApiKey: string;
}

export interface SearchableMovie {
  objectID: string;
  title: string;
  type: 'movie' | 'tv';
  overview: string;
  release_date?: string;
  genre_names: string[];
  rating: number;
  vote_count: number;
  poster_path?: string;
  backdrop_path?: string;
  popularity: number;
  tmdb_id: number;
  original_language: string;
  production_countries: string[];
  runtime?: number;
  tagline?: string;
  _tags?: string[];
}

export interface SearchableTVShow {
  objectID: string;
  title: string;
  type: 'tv';
  overview: string;
  first_air_date?: string;
  genre_names: string[];
  rating: number;
  vote_count: number;
  poster_path?: string;
  backdrop_path?: string;
  popularity: number;
  tmdb_id: number;
  original_language: string;
  production_countries: string[];
  number_of_episodes?: number;
  number_of_seasons?: number;
  status?: string;
  _tags?: string[];
}

export interface SearchOptions {
  query: string;
  page?: number;
  hitsPerPage?: number;
  filters?: string;
  facetFilters?: string[][];
  optionalFilters?: string[];
  getRankingInfo?: boolean;
  analytics?: boolean;
  synonyms?: boolean;
  keepDiacriticsOnCharacters?: string;
  advancedSyntax?: boolean;
  optionalWords?: string[];
  numericFilters?: string[];
  facets?: string[];
}

class AlgoliaService {
  private static instance: AlgoliaService;
  private config: AlgoliaConfig | null = null;
  private client: any = null;
  private moviesIndex: any = null;
  private tvShowsIndex: any = null;
  private isInitialized = false;
  private isMock = false;

  private constructor() {}

  public static getInstance(): AlgoliaService {
    if (!AlgoliaService.instance) {
      AlgoliaService.instance = new AlgoliaService();
    }
    return AlgoliaService.instance;
  }

  public init(config?: AlgoliaConfig): void {
    if (this.isInitialized) {
      logger.warn('Algolia already initialized');
      return;
    }

    try {
      this.config = config || {
        appId: process.env.ALGOLIA_APP_ID || '',
        apiKey: process.env.ALGOLIA_API_KEY || '',
        searchApiKey: process.env.ALGOLIA_SEARCH_API_KEY || process.env.ALGOLIA_API_KEY || ''
      };

      if (!this.config.appId || !this.config.apiKey) {
        logger.warn('Algolia configuration missing, using mock implementation');
        this.isMock = true;
        this.setupMock();
        this.isInitialized = true;
        return;
      }

      // Initialize real Algolia client
      this.client = algoliasearch(this.config.appId, this.config.apiKey);
      this.moviesIndex = this.client.initIndex('movies');
      this.tvShowsIndex = this.client.initIndex('tv_shows');

      this.isInitialized = true;
      logger.info('Algolia initialized successfully');

      // Configure indexes
      this.configureIndexes().catch(error => {
        logger.warn('Failed to configure Algolia indexes:', error);
      });

      // Test connection
      this.testConnection().catch(error => {
        logger.warn('Algolia connection test failed:', error);
      });
    } catch (error) {
      logger.error('Failed to initialize Algolia:', error);
      this.isMock = true;
      this.setupMock();
      this.isInitialized = true;
    }
  }

  private setupMock(): void {
    this.client = {
      initIndex: (_name: string) => ({
        search: async (_query: string) => ({
          hits: [],
          nbHits: 0,
          page: 0,
          nbPages: 0,
          hitsPerPage: 20,
          processingTimeMS: 0
        }),
        saveObjects: async () => ({ objectIDs: [] }),
        deleteObjects: async () => ({ objectIDs: [] }),
        setSettings: async () => ({})
      }),
      multipleQueries: async (queries: any[]) => ({
        results: queries.map(() => ({
          hits: [],
          nbHits: 0,
          page: 0,
          nbPages: 0
        }))
      }),
      listIndices: async () => ({ items: [] })
    };
    this.moviesIndex = this.client.initIndex('movies');
    this.tvShowsIndex = this.client.initIndex('tv_shows');
  }

  private async testConnection(): Promise<void> {
    if (!this.client || this.isMock) return;

    try {
      await this.client.listIndices();
      logger.info('Algolia connection test successful');
    } catch (error) {
      logger.error('Algolia connection test failed:', error);
      throw error;
    }
  }

  /**
   * Search across all content
   */
  async searchAll(options: SearchOptions): Promise<any> {
    if (!this.client) {
      throw new Error('Algolia not initialized');
    }

    try {
      const searchResults = await this.client.multipleQueries([
        {
          indexName: 'movies',
          query: options.query,
          params: {
            page: options.page || 0,
            hitsPerPage: options.hitsPerPage || 20,
            ...this.buildSearchParams(options)
          }
        },
        {
          indexName: 'tv_shows',
          query: options.query,
          params: {
            page: options.page || 0,
            hitsPerPage: options.hitsPerPage || 20,
            ...this.buildSearchParams(options)
          }
        }
      ]);

      return {
        movies: searchResults.results[0],
        tvShows: searchResults.results[1],
        totalResults: (searchResults.results[0].nbHits || 0) + (searchResults.results[1].nbHits || 0)
      };
    } catch (error) {
      logger.error('Algolia search failed:', error);
      throw error;
    }
  }

  /**
   * Search movies only
   */
  async searchMovies(options: SearchOptions): Promise<any> {
    if (!this.moviesIndex) {
      throw new Error('Algolia movies index not initialized');
    }

    try {
      const result = await this.moviesIndex.search(options.query, {
        page: options.page || 0,
        hitsPerPage: options.hitsPerPage || 20,
        ...this.buildSearchParams(options)
      });

      return result;
    } catch (error) {
      logger.error('Algolia movie search failed:', error);
      throw error;
    }
  }

  /**
   * Search TV shows only
   */
  async searchTVShows(options: SearchOptions): Promise<any> {
    if (!this.tvShowsIndex) {
      throw new Error('Algolia TV shows index not initialized');
    }

    try {
      const result = await this.tvShowsIndex.search(options.query, {
        page: options.page || 0,
        hitsPerPage: options.hitsPerPage || 20,
        ...this.buildSearchParams(options)
      });

      return result;
    } catch (error) {
      logger.error('Algolia TV show search failed:', error);
      throw error;
    }
  }

  /**
   * Get search suggestions/autocomplete
   */
  async getSuggestions(query: string, limit: number = 5): Promise<any> {
    if (!this.client) {
      throw new Error('Algolia not initialized');
    }

    try {
      const results = await this.client.multipleQueries([
        {
          indexName: 'movies',
          query,
          params: {
            hitsPerPage: limit,
            attributesToRetrieve: ['title', 'type', 'poster_path', 'tmdb_id'],
            attributesToHighlight: ['title'],
            typoTolerance: true
          }
        },
        {
          indexName: 'tv_shows',
          query,
          params: {
            hitsPerPage: limit,
            attributesToRetrieve: ['title', 'type', 'poster_path', 'tmdb_id'],
            attributesToHighlight: ['title'],
            typoTolerance: true
          }
        }
      ]);

      const suggestions = [
        ...results.results[0].hits,
        ...results.results[1].hits
      ];

      return suggestions;
    } catch (error) {
      logger.error('Algolia suggestions failed:', error);
      return [];
    }
  }

  /**
   * Add or update movies in search index
   */
  async indexMovies(movies: SearchableMovie[]): Promise<any> {
    if (!this.moviesIndex) {
      throw new Error('Algolia movies index not initialized');
    }

    try {
      const result = await this.moviesIndex.saveObjects(movies);
      logger.info(`Indexed ${movies.length} movies to Algolia`);
      return result;
    } catch (error) {
      logger.error('Failed to index movies:', error);
      throw error;
    }
  }

  /**
   * Add or update TV shows in search index
   */
  async indexTVShows(tvShows: SearchableTVShow[]): Promise<any> {
    if (!this.tvShowsIndex) {
      throw new Error('Algolia TV shows index not initialized');
    }

    try {
      const result = await this.tvShowsIndex.saveObjects(tvShows);
      logger.info(`Indexed ${tvShows.length} TV shows to Algolia`);
      return result;
    } catch (error) {
      logger.error('Failed to index TV shows:', error);
      throw error;
    }
  }

  /**
   * Delete movies from search index
   */
  async deleteMovies(movieIds: string[]): Promise<any> {
    if (!this.moviesIndex) {
      throw new Error('Algolia movies index not initialized');
    }

    try {
      const result = await this.moviesIndex.deleteObjects(movieIds);
      logger.info(`Deleted ${movieIds.length} movies from Algolia index`);
      return result;
    } catch (error) {
      logger.error('Failed to delete movies:', error);
      throw error;
    }
  }

  /**
   * Delete TV shows from search index
   */
  async deleteTVShows(tvShowIds: string[]): Promise<any> {
    if (!this.tvShowsIndex) {
      throw new Error('Algolia TV shows index not initialized');
    }

    try {
      const result = await this.tvShowsIndex.deleteObjects(tvShowIds);
      logger.info(`Deleted ${tvShowIds.length} TV shows from Algolia index`);
      return result;
    } catch (error) {
      logger.error('Failed to delete TV shows:', error);
      throw error;
    }
  }

  /**
   * Configure search settings (facets, ranking, etc.)
   */
  async configureIndexes(): Promise<any> {
    if (!this.moviesIndex || !this.tvShowsIndex) {
      throw new Error('Algolia indexes not initialized');
    }

    try {
      if (this.isMock) {
        logger.info('Mock Algolia indexes configured');
        return { movie: {}, tvShow: {} };
      }

      const movieSettings = {
        searchableAttributes: [
          'title,overview,original_title',
          'genre_names',
          'production_countries',
          'original_language'
        ],
        attributesForFaceting: [
          'genre_names',
          'production_countries',
          'original_language',
          'rating',
          'type'
        ],
        customRanking: [
          'desc(popularity)',
          'desc(rating)',
          'desc(vote_count)'
        ],
        replicas: ['movies_popularity', 'movies_rating']
      };

      const tvShowSettings = {
        ...movieSettings,
        attributesForFaceting: [
          ...movieSettings.attributesForFaceting,
          'status',
          'number_of_seasons'
        ],
        replicas: ['tv_shows_popularity', 'tv_shows_rating']
      };

      const movieResult = await this.moviesIndex.setSettings(movieSettings);
      const tvShowResult = await this.tvShowsIndex.setSettings(tvShowSettings);

      logger.info('Algolia indexes configured successfully');
      return { movie: movieResult, tvShow: tvShowResult };
    } catch (error) {
      logger.error('Failed to configure Algolia indexes:', error);
      if (this.isMock) {
        return { movie: {}, tvShow: {} };
      }
      throw error;
    }
  }

  /**
   * Get search analytics
   */
  async getAnalytics(period: 'day' | 'week' | 'month' = 'day'): Promise<any> {
    if (!this.client) {
      throw new Error('Algolia not initialized');
    }

    try {
      // Mock analytics data
      return {
        period,
        totalSearches: 0,
        totalResults: 0,
        popularQueries: [],
        isMock: this.isMock
      };
    } catch (error) {
      logger.error('Failed to get Algolia analytics:', error);
      return null;
    }
  }

  /**
   * Build search parameters
   */
  private buildSearchParams(options: SearchOptions): any {
    const params: any = {};

    if (options.filters) params.filters = options.filters;
    if (options.facetFilters) params.facetFilters = options.facetFilters;
    if (options.optionalFilters) params.optionalFilters = options.optionalFilters;
    if (options.getRankingInfo) params.getRankingInfo = options.getRankingInfo;
    if (typeof options.analytics === 'boolean') params.analytics = options.analytics;
    // Removed synonyms parameter as it's not supported by current Algolia API
    if (options.keepDiacriticsOnCharacters) params.keepDiacriticsOnCharacters = options.keepDiacriticsOnCharacters;
    if (options.advancedSyntax) params.advancedSyntax = options.advancedSyntax;
    if (options.optionalWords) params.optionalWords = options.optionalWords;
    if (options.numericFilters) params.numericFilters = options.numericFilters;
    if (options.facets) params.facets = options.facets;

    return params;
  }

  /**
   * Get service status
   */
  getStatus(): any {
    return {
      initialized: this.isInitialized,
      configured: !!this.config?.appId && !!this.config?.apiKey,
      appId: this.config?.appId || null,
      hasMoviesIndex: !!this.moviesIndex,
      hasTVShowsIndex: !!this.tvShowsIndex,
      isMock: this.isMock
    };
  }
}

export const algoliaService = AlgoliaService.getInstance();
export default algoliaService;