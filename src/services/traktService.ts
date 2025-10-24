import axios from 'axios';
import { MovieMetadata, TvShowMetadata, SearchResults, SearchParams } from '../types/metadata';
import { getEnv } from '../config/environment';

interface TraktMovieResponse {
  title: string;
  year: number;
  ids: {
    trakt: number;
    imdb: string;
    tmdb: number;
  };
  overview: string;
  rating: number;
  votes: number;
  updated_at: string;
}

interface TraktTvResponse {
  title: string;
  year: number;
  ids: {
    trakt: number;
    imdb: string;
    tmdb: number;
  };
  overview: string;
  rating: number;
  votes: number;
  updated_at: string;
}

interface TraktSearchResponse {
  type: 'movie' | 'show';
  movie?: TraktMovieResponse;
  show?: TraktTvResponse;
}

class TraktService {
  private static instance: TraktService;
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;
  
  private constructor() {
    this.baseUrl = getEnv('TRAKT_API_URL') || 'https://api.trakt.tv';
    this.clientId = getEnv('TRAKT_CLIENT_ID') || '';
    this.clientSecret = getEnv('TRAKT_CLIENT_SECRET') || '';
    
    if (!this.clientId || this.clientId === 'your-trakt-client-id') {
      console.error('TRAKT_CLIENT_ID is not configured. Current value:', this.clientId);
      throw new Error('TRAKT_CLIENT_ID is not configured. Please set it in your environment variables.');
    }
  }
  
  public static getInstance(): TraktService {
    if (!TraktService.instance) {
      TraktService.instance = new TraktService();
    }
    return TraktService.instance;
  }
  
  private async makeRequest<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        params,
        headers: {
          'Content-Type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': this.clientId
        },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;
        
        throw new Error(`Trakt API Error (${status}): ${message}`);
      }
      throw new Error(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async searchMovies(query: string, page: number = 1): Promise<SearchResults> {
    try {
      const response = await this.makeRequest<TraktSearchResponse[]>(`/search/movie`, {
        query,
        page,
        limit: 20
      });
      
      const movies: MovieMetadata[] = response.map(item => {
        const movie = item.movie;
        if (!movie) return null;
        
        return {
          tmdb_id: movie.ids.tmdb,
          imdb_id: movie.ids.imdb,
          title: movie.title,
          type: 'movie',
          overview: movie.overview,
          release_date: new Date(movie.year, 0, 1).toISOString().split('T')[0],
          language: 'en',
          country: 'US',
          genres: [],
          rating: {
            trakt_rating: movie.rating,
            votes: movie.votes
          },
          popularity: movie.rating,
          vote_average: movie.rating,
          vote_count: movie.votes
        };
      }).filter(Boolean) as MovieMetadata[];
      
      return {
        page,
        total_results: movies.length,
        total_pages: Math.ceil(movies.length / 20),
        results: movies
      };
    } catch (error) {
      console.error('Error searching movies on Trakt:', error);
      throw new Error('Failed to search movies on Trakt');
    }
  }
  
  async searchTvShows(query: string, page: number = 1): Promise<SearchResults> {
    try {
      const response = await this.makeRequest<TraktSearchResponse[]>(`/search/show`, {
        query,
        page,
        limit: 20
      });
      
      const shows: TvShowMetadata[] = response.map(item => {
        const show = item.show;
        if (!show) return null;
        
        return {
          tmdb_id: show.ids.tmdb,
          imdb_id: show.ids.imdb,
          title: show.title,
          type: 'tv',
          overview: show.overview,
          release_date: new Date(show.year, 0, 1).toISOString().split('T')[0],
          language: 'en',
          country: 'US',
          genres: [],
          rating: {
            trakt_rating: show.rating,
            votes: show.votes
          },
          popularity: show.rating,
          vote_average: show.rating,
          vote_count: show.votes
        };
      }).filter(Boolean) as TvShowMetadata[];
      
      return {
        page,
        total_results: shows.length,
        total_pages: Math.ceil(shows.length / 20),
        results: shows
      };
    } catch (error) {
      console.error('Error searching TV shows on Trakt:', error);
      throw new Error('Failed to search TV shows on Trakt');
    }
  }
  
  async getTrendingMovies(page: number = 1): Promise<SearchResults> {
    try {
      const response = await this.makeRequest<TraktMovieResponse[]>(`/movies/trending`, {
        page,
        limit: 20
      });
      
      const movies: MovieMetadata[] = response
        .filter(movie => movie.ids && movie.ids.tmdb && movie.ids.imdb)
        .map(movie => ({
          tmdb_id: movie.ids.tmdb,
          imdb_id: movie.ids.imdb,
          title: movie.title,
          type: 'movie',
          overview: movie.overview,
          release_date: new Date(movie.year, 0, 1).toISOString().split('T')[0],
          language: 'en',
          country: 'US',
          genres: [],
          rating: {
            trakt_rating: movie.rating,
            votes: movie.votes
          },
          popularity: movie.rating,
          vote_average: movie.rating,
          vote_count: movie.votes
        }));
      
      return {
        page,
        total_results: movies.length,
        total_pages: Math.ceil(movies.length / 20),
        results: movies
      };
    } catch (error) {
      console.error('Error fetching trending movies from Trakt:', error);
      throw new Error('Failed to fetch trending movies from Trakt');
    }
  }
  
  async getTrendingTvShows(page: number = 1): Promise<SearchResults> {
    try {
      const response = await this.makeRequest<TraktTvResponse[]>(`/shows/trending`, {
        page,
        limit: 20
      });
      
      const shows: TvShowMetadata[] = response.map(show => ({
        tmdb_id: show.ids.tmdb,
        imdb_id: show.ids.imdb,
        title: show.title,
        type: 'tv',
        overview: show.overview,
        release_date: new Date(show.year, 0, 1).toISOString().split('T')[0],
        language: 'en',
        country: 'US',
        genres: [],
        rating: {
          trakt_rating: show.rating,
          votes: show.votes
        },
        popularity: show.rating,
        vote_average: show.rating,
        vote_count: show.votes
      }));
      
      return {
        page,
        total_results: shows.length,
        total_pages: Math.ceil(shows.length / 20),
        results: shows
      };
    } catch (error) {
      console.error('Error fetching trending TV shows from Trakt:', error);
      throw new Error('Failed to fetch trending TV shows from Trakt');
    }
  }
  
  async getPopularMovies(page: number = 1): Promise<SearchResults> {
    try {
      const response = await this.makeRequest<TraktMovieResponse[]>(`/movies/popular`, {
        page,
        limit: 20
      });
      
      const movies: MovieMetadata[] = response.map(movie => ({
        tmdb_id: movie.ids.tmdb,
        imdb_id: movie.ids.imdb,
        title: movie.title,
        type: 'movie',
        overview: movie.overview,
        release_date: new Date(movie.year, 0, 1).toISOString().split('T')[0],
        language: 'en',
        country: 'US',
        genres: [],
        rating: {
          trakt_rating: movie.rating,
          votes: movie.votes
        },
        popularity: movie.rating,
        vote_average: movie.rating,
        vote_count: movie.votes
      }));
      
      return {
        page,
        total_results: movies.length,
        total_pages: Math.ceil(movies.length / 20),
        results: movies
      };
    } catch (error) {
      console.error('Error fetching popular movies from Trakt:', error);
      throw new Error('Failed to fetch popular movies from Trakt');
    }
  }
  
  async getPopularTvShows(page: number = 1): Promise<SearchResults> {
    try {
      const response = await this.makeRequest<TraktTvResponse[]>(`/shows/popular`, {
        page,
        limit: 20
      });
      
      const shows: TvShowMetadata[] = response.map(show => ({
        tmdb_id: show.ids.tmdb,
        imdb_id: show.ids.imdb,
        title: show.title,
        type: 'tv',
        overview: show.overview,
        release_date: new Date(show.year, 0, 1).toISOString().split('T')[0],
        language: 'en',
        country: 'US',
        genres: [],
        rating: {
          trakt_rating: show.rating,
          votes: show.votes
        },
        popularity: show.rating,
        vote_average: show.rating,
        vote_count: show.votes
      }));
      
      return {
        page,
        total_results: shows.length,
        total_pages: Math.ceil(shows.length / 20),
        results: shows
      };
    } catch (error) {
      console.error('Error fetching popular TV shows from Trakt:', error);
      throw new Error('Failed to fetch popular TV shows from Trakt');
    }
  }
}

export default TraktService.getInstance();