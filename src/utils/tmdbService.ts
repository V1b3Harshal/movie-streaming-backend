// TMDB API service integration
import { logger } from './logger';

export interface TMDBSearchResult {
  page: number;
  results: any[];
  total_pages: number;
  total_results: number;
}

export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date: string;
  vote_average: number;
  genres: { id: number; name: string }[];
  runtime?: number;
  original_language: string;
  status: string;
  tagline?: string;
  budget?: number;
  revenue?: number;
}

export interface TMDBTVShow {
  id: number;
  name: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  first_air_date: string;
  vote_average: number;
  genres: { id: number; name: string }[];
  number_of_episodes: number;
  number_of_seasons: number;
  original_language: string;
  status: string;
  networks: { id: number; name: string }[];
  episode_run_time: number[];
}

class TMDBService {
  private baseUrl = 'https://api.themoviedb.org/3';
  private apiKey: string;
  private imageBaseUrl = 'https://image.tmdb.org/t/p/';
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheTimeout = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.apiKey = process.env.TMDB_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('TMDB_API_KEY is required');
    }
  }

  private getCacheKey(endpoint: string, params: Record<string, any>): string {
    return `${endpoint}?${new URLSearchParams(params).toString()}`;
  }

  private getCachedData<T>(cacheKey: string): T | null {
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data as T;
    }
    return null;
  }

  private setCachedData(cacheKey: string, data: any): void {
    this.cache.set(cacheKey, { data, timestamp: Date.now() });
    // Clean old cache entries
    if (this.cache.size > 100) {
      const oldest = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0];
      this.cache.delete(oldest[0]);
    }
  }

  private async makeRequest<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    const cacheKey = this.getCacheKey(endpoint, params);
    const cached = this.getCachedData<T>(cacheKey);
    if (cached) {
      return cached;
    }

    const url = new URL(`${this.baseUrl}/${endpoint}`);
    url.searchParams.set('api_key', this.apiKey);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });

    try {
      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this.setCachedData(cacheKey, data);
      return data;
    } catch (error) {
      logger.error('TMDB API request failed:', { endpoint, params, error });
      throw error;
    }
  }

  // Movie methods
  async searchMovies(query: string, page: number = 1): Promise<TMDBSearchResult> {
    return this.makeRequest<TMDBSearchResult>('search/movie', {
      query,
      page,
      include_adult: 'false',
      language: 'en-US'
    });
  }

  async getMovie(movieId: number): Promise<TMDBMovie> {
    return this.makeRequest<TMDBMovie>(`movie/${movieId}`, {
      language: 'en-US'
    });
  }

  async getPopularMovies(page: number = 1): Promise<TMDBSearchResult> {
    return this.makeRequest<TMDBSearchResult>('movie/popular', {
      page,
      language: 'en-US'
    });
  }

  async getTopRatedMovies(page: number = 1): Promise<TMDBSearchResult> {
    return this.makeRequest<TMDBSearchResult>('movie/top_rated', {
      page,
      language: 'en-US'
    });
  }

  async getUpcomingMovies(page: number = 1): Promise<TMDBSearchResult> {
    return this.makeRequest<TMDBSearchResult>('movie/upcoming', {
      page,
      language: 'en-US'
    });
  }

  async getNowPlayingMovies(page: number = 1): Promise<TMDBSearchResult> {
    return this.makeRequest<TMDBSearchResult>('movie/now_playing', {
      page,
      language: 'en-US'
    });
  }

  async getMovieCredits(movieId: number): Promise<any> {
    return this.makeRequest(`movie/${movieId}/credits`, {
      language: 'en-US'
    });
  }

  async getMovieVideos(movieId: number): Promise<any> {
    return this.makeRequest(`movie/${movieId}/videos`, {
      language: 'en-US'
    });
  }

  async getMovieRecommendations(movieId: number, page: number = 1): Promise<TMDBSearchResult> {
    return this.makeRequest<TMDBSearchResult>(`movie/${movieId}/recommendations`, {
      page,
      language: 'en-US'
    });
  }

  // TV Show methods
  async searchTVShows(query: string, page: number = 1): Promise<TMDBSearchResult> {
    return this.makeRequest<TMDBSearchResult>('search/tv', {
      query,
      page,
      include_adult: 'false',
      language: 'en-US'
    });
  }

  async getTVShow(tvId: number): Promise<TMDBTVShow> {
    return this.makeRequest<TMDBTVShow>(`tv/${tvId}`, {
      language: 'en-US'
    });
  }

  async getPopularTVShows(page: number = 1): Promise<TMDBSearchResult> {
    return this.makeRequest<TMDBSearchResult>('tv/popular', {
      page,
      language: 'en-US'
    });
  }

  async getTopRatedTVShows(page: number = 1): Promise<TMDBSearchResult> {
    return this.makeRequest<TMDBSearchResult>('tv/top_rated', {
      page,
      language: 'en-US'
    });
  }

  async getOnTheAirTVShows(page: number = 1): Promise<TMDBSearchResult> {
    return this.makeRequest<TMDBSearchResult>('tv/on_the_air', {
      page,
      language: 'en-US'
    });
  }

  async getAiringTodayTVShows(page: number = 1): Promise<TMDBSearchResult> {
    return this.makeRequest<TMDBSearchResult>('tv/airing_today', {
      page,
      language: 'en-US'
    });
  }

  async getTVShowCredits(tvId: number): Promise<any> {
    return this.makeRequest(`tv/${tvId}/credits`, {
      language: 'en-US'
    });
  }

  async getTVShowVideos(tvId: number): Promise<any> {
    return this.makeRequest(`tv/${tvId}/videos`, {
      language: 'en-US'
    });
  }

  async getTVShowRecommendations(tvId: number, page: number = 1): Promise<TMDBSearchResult> {
    return this.makeRequest<TMDBSearchResult>(`tv/${tvId}/recommendations`, {
      page,
      language: 'en-US'
    });
  }

  // Genre methods
  async getMovieGenres(): Promise<{ genres: { id: number; name: string }[] }> {
    return this.makeRequest<{ genres: { id: number; name: string }[] }>('genre/movie/list', {
      language: 'en-US'
    });
  }

  async getTVGenres(): Promise<{ genres: { id: number; name: string }[] }> {
    return this.makeRequest<{ genres: { id: number; name: string }[] }>('genre/tv/list', {
      language: 'en-US'
    });
  }

  // Multi-search
  async multiSearch(query: string, page: number = 1): Promise<TMDBSearchResult> {
    return this.makeRequest<TMDBSearchResult>('search/multi', {
      query,
      page,
      include_adult: 'false',
      language: 'en-US'
    });
  }

  // Helper methods
  getImageUrl(path: string, size: string = 'w500'): string {
    if (!path) return '';
    return `${this.imageBaseUrl}${size}${path}`;
  }

  getBackdropUrl(path: string, size: string = 'w1280'): string {
    if (!path) return '';
    return `${this.imageBaseUrl}${size}${path}`;
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('TMDB cache cleared');
  }

  getCacheStats(): { size: number; oldestEntry: number | null } {
    if (this.cache.size === 0) {
      return { size: 0, oldestEntry: null };
    }
    
    const oldest = Math.min(...Array.from(this.cache.values()).map(entry => entry.timestamp));
    return { size: this.cache.size, oldestEntry: oldest };
  }
}

// Global TMDB service instance
export const tmdbService = new TMDBService();

export default TMDBService;