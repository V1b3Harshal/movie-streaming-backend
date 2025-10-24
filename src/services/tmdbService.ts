import axios from 'axios';
import { MovieMetadata, TvShowMetadata, SearchResults, SearchParams, DetailsParams } from '../types/metadata';

interface TmdbMovieResponse {
  id: number;
  imdb_id: string;
  title: string;
  overview: string;
  release_date: string;
  original_language: string;
  production_countries: Array<{ iso_3166_1: string }>;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  poster_path: string;
  backdrop_path: string;
  popularity: number;
}

interface TmdbTvResponse {
  id: number;
  imdb_id: string;
  name: string;
  overview: string;
  first_air_date: string;
  original_language: string;
  origin_country: string[];
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  poster_path: string;
  backdrop_path: string;
  popularity: number;
}

interface TmdbSearchResponse {
  page: number;
  total_results: number;
  total_pages: number;
  results: TmdbMovieResponse[] | TmdbTvResponse[];
}

interface TmdbMovieDetailsResponse {
  id: number;
  imdb_id: string;
  title: string;
  overview: string;
  release_date: string;
  original_language: string;
  production_countries: Array<{ iso_3166_1: string }>;
  genres: Array<{ id: number; name: string }>;
  vote_average: number;
  vote_count: number;
  poster_path: string;
  backdrop_path: string;
  popularity: number;
  runtime: number;
  status: string;
  tagline: string;
  budget: number;
  revenue: number;
}

interface TmdbTvDetailsResponse {
  id: number;
  external_ids: { imdb_id: string };
  name: string;
  overview: string;
  first_air_date: string;
  original_language: string;
  origin_country: string[];
  genres: Array<{ id: number; name: string }>;
  vote_average: number;
  vote_count: number;
  poster_path: string;
  backdrop_path: string;
  popularity: number;
  last_air_date: string;
  status: string;
  number_of_episodes: number;
  number_of_seasons: number;
  episode_run_time: number[];
}

interface TmdbGenreResponse {
  genres: Array<{ id: number; name: string }>;
}

export class TmdbService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.TMDB_API_KEY || '';
    this.baseUrl = process.env.TMDB_API_URL || 'https://api.themoviedb.org/3';
    
    if (!this.apiKey || this.apiKey === 'your-tmdb-api-key') {
      console.error('TMDB_API_KEY is not configured. Current value:', this.apiKey);
      console.error('Environment variables loaded:', Object.keys(process.env).filter(key => key.includes('TMDB')));
      throw new Error('TMDB_API_KEY is not configured. Please set it in your environment variables.');
    }
  }

  private async makeRequest<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        params: {
          api_key: this.apiKey,
          ...params
        },
        timeout: 10000 // 10 second timeout
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;
        
        throw new Error(`TMDB API Error (${status}): ${message}`);
      }
      throw new Error(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async searchMovies(params: SearchParams): Promise<SearchResults> {
    const { query, page = 1, year, language = 'en-US', include_adult = false } = params;
    
    const response = await this.makeRequest<TmdbSearchResponse>('/search/movie', {
      query,
      page,
      year,
      language,
      include_adult
    });

    const movies: MovieMetadata[] = (response.results as TmdbMovieResponse[]).map((movie) => ({
      tmdb_id: movie.id,
      imdb_id: movie.imdb_id || '',
      title: movie.title,
      type: 'movie',
      overview: movie.overview,
      release_date: movie.release_date,
      language: movie.original_language,
      country: movie.production_countries?.[0]?.iso_3166_1 || 'US',
      genres: movie.genre_ids?.map((id: number) => ({ id, name: '' })) || [],
      rating: {
        tmdb_rating: movie.vote_average,
        votes: movie.vote_count
      },
      poster_path: movie.poster_path,
      backdrop_path: movie.backdrop_path,
      popularity: movie.popularity,
      vote_average: movie.vote_average,
      vote_count: movie.vote_count
    }));

    return {
      page: response.page,
      total_results: response.total_results,
      total_pages: response.total_pages,
      results: movies
    };
  }

  async searchTvShows(params: SearchParams): Promise<SearchResults> {
    const { query, page = 1, year, language = 'en-US', include_adult = false } = params;
    
    const response = await this.makeRequest<TmdbSearchResponse>('/search/tv', {
      query,
      page,
      year,
      language,
      include_adult
    });

    const shows: TvShowMetadata[] = (response.results as TmdbTvResponse[]).map((show) => ({
      tmdb_id: show.id,
      imdb_id: show.imdb_id || '',
      title: show.name,
      type: 'tv',
      overview: show.overview,
      release_date: show.first_air_date,
      language: show.original_language,
      country: show.origin_country?.[0] || 'US',
      genres: show.genre_ids?.map((id: number) => ({ id, name: '' })) || [],
      rating: {
        tmdb_rating: show.vote_average,
        votes: show.vote_count
      },
      poster_path: show.poster_path,
      backdrop_path: show.backdrop_path,
      popularity: show.popularity,
      vote_average: show.vote_average,
      vote_count: show.vote_count
    }));

    return {
      page: response.page,
      total_results: response.total_results,
      total_pages: response.total_pages,
      results: shows
    };
  }

  async getMovieDetails(tmdbId: number): Promise<MovieMetadata> {
    const response = await this.makeRequest<TmdbMovieDetailsResponse>(`/movie/${tmdbId}`, {
      language: 'en-US',
      append_to_response: 'credits,release_dates'
    });

    const genres = response.genres?.map((genre: any) => ({
      id: genre.id,
      name: genre.name
    })) || [];

    return {
      tmdb_id: response.id,
      imdb_id: response.imdb_id || '',
      title: response.title,
      type: 'movie',
      overview: response.overview,
      release_date: response.release_date,
      language: response.original_language,
      country: response.production_countries?.[0]?.iso_3166_1 || 'US',
      genres,
      rating: {
        tmdb_rating: response.vote_average,
        votes: response.vote_count
      },
      poster_path: response.poster_path,
      backdrop_path: response.backdrop_path,
      popularity: response.popularity,
      vote_average: response.vote_average,
      vote_count: response.vote_count,
      runtime: response.runtime,
      status: response.status,
      tagline: response.tagline,
      budget: response.budget,
      revenue: response.revenue
    };
  }

  async getTvShowDetails(tmdbId: number): Promise<TvShowMetadata> {
    const response = await this.makeRequest<TmdbTvDetailsResponse>(`/tv/${tmdbId}`, {
      language: 'en-US',
      append_to_response: 'credits,external_ids'
    });

    const genres = response.genres?.map((genre: any) => ({
      id: genre.id,
      name: genre.name
    })) || [];

    return {
      tmdb_id: response.id,
      imdb_id: response.external_ids?.imdb_id || '',
      title: response.name,
      type: 'tv',
      overview: response.overview,
      release_date: response.first_air_date,
      language: response.original_language,
      country: response.origin_country?.[0] || 'US',
      genres,
      rating: {
        tmdb_rating: response.vote_average,
        votes: response.vote_count
      },
      poster_path: response.poster_path,
      backdrop_path: response.backdrop_path,
      popularity: response.popularity,
      vote_average: response.vote_average,
      vote_count: response.vote_count,
      first_air_date: response.first_air_date,
      last_air_date: response.last_air_date,
      status: response.status,
      number_of_episodes: response.number_of_episodes,
      number_of_seasons: response.number_of_seasons,
      episode_run_time: response.episode_run_time
    };
  }

  async getMovieGenres(): Promise<Array<{ id: number; name: string }>> {
    const response = await this.makeRequest<TmdbGenreResponse>('/genre/movie/list', {
      language: 'en-US'
    });
    return response.genres;
  }

  async getTvGenres(): Promise<Array<{ id: number; name: string }>> {
    const response = await this.makeRequest<TmdbGenreResponse>('/genre/tv/list', {
      language: 'en-US'
    });
    return response.genres;
  }
}

export const tmdbService = new TmdbService();