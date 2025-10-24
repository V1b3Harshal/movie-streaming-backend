import { MovieMetadata, SearchResults, SearchParams, DetailsParams } from '../types/metadata';
import { TmdbMovieResponse } from '../types/tmdb';
import { getEnv } from '../config/environment';
import axios from 'axios';

class MovieService {
  private static instance: MovieService;
  
  private constructor() {}
  
  public static getInstance(): MovieService {
    if (!MovieService.instance) {
      MovieService.instance = new MovieService();
    }
    return MovieService.instance;
  }
  
  async getMovies(): Promise<MovieMetadata[]> {
    try {
      const response = await axios.get(`${getEnv('TMDB_API_URL') || 'https://api.themoviedb.org/3'}/movie/popular`, {
        params: {
          api_key: getEnv('TMDB_API_KEY') || '',
          language: 'en-US',
          page: 1
        }
      });
      
      return this.mapMovies(response.data.results);
    } catch (error) {
      console.error('Error fetching movies:', error);
      throw new Error('Failed to fetch movies');
    }
  }
  
  async getMoviesSearch(query: string, page?: number): Promise<SearchResults> {
    try {
      const response = await axios.get(`${getEnv('TMDB_API_URL') || 'https://api.themoviedb.org/3'}/search/movie`, {
        params: {
          api_key: getEnv('TMDB_API_KEY') || '',
          query,
          language: 'en-US',
          page: page || 1
        }
      });
      
      return {
        page: response.data.page,
        total_results: response.data.total_results,
        total_pages: response.data.total_pages,
        results: this.mapMovies(response.data.results)
      };
    } catch (error) {
      console.error('Error searching movies:', error);
      throw new Error('Failed to search movies');
    }
  }
  
  async getMovieDetails(tmdbId: number): Promise<MovieMetadata> {
    try {
      const response = await axios.get(`${getEnv('TMDB_API_URL') || 'https://api.themoviedb.org/3'}/movie/${tmdbId}`, {
        params: {
          api_key: getEnv('TMDB_API_KEY') || '',
          language: 'en-US'
        }
      });
      
      return this.mapMovieDetails(response.data);
    } catch (error) {
      console.error('Error fetching movie details:', error);
      throw new Error('Failed to fetch movie details');
    }
  }
  
  async getSimilarMovies(tmdbId: number, page?: number): Promise<SearchResults> {
    try {
      const response = await axios.get(`${getEnv('TMDB_API_URL') || 'https://api.themoviedb.org/3'}/movie/${tmdbId}/similar`, {
        params: {
          api_key: getEnv('TMDB_API_KEY') || '',
          language: 'en-US',
          page: page || 1
        }
      });
      
      return {
        page: response.data.page,
        total_results: response.data.total_results,
        total_pages: response.data.total_pages,
        results: this.mapMovies(response.data.results)
      };
    } catch (error) {
      console.error('Error fetching similar movies:', error);
      throw new Error('Failed to fetch similar movies');
    }
  }
  
  async getTrendingMovies(page?: number): Promise<SearchResults> {
    try {
      const response = await axios.get(`${getEnv('TMDB_API_URL') || 'https://api.themoviedb.org/3'}/trending/movie/day`, {
        params: {
          api_key: getEnv('TMDB_API_KEY') || '',
          language: 'en-US',
          page: page || 1
        }
      });
      
      return {
        page: response.data.page,
        total_results: response.data.total_results,
        total_pages: response.data.total_pages,
        results: this.mapMovies(response.data.results)
      };
    } catch (error) {
      console.error('Error fetching trending movies:', error);
      throw new Error('Failed to fetch trending movies');
    }
  }
  
  async getUpcomingMovies(page?: number): Promise<SearchResults> {
    try {
      const response = await axios.get(`${getEnv('TMDB_API_URL') || 'https://api.themoviedb.org/3'}/movie/upcoming`, {
        params: {
          api_key: getEnv('TMDB_API_KEY') || '',
          language: 'en-US',
          page: page || 1
        }
      });
      
      return {
        page: response.data.page,
        total_results: response.data.total_results,
        total_pages: response.data.total_pages,
        results: this.mapMovies(response.data.results)
      };
    } catch (error) {
      console.error('Error fetching upcoming movies:', error);
      throw new Error('Failed to fetch upcoming movies');
    }
  }
  
  private mapMovies(movies: TmdbMovieResponse[]): MovieMetadata[] {
    return movies.map(movie => ({
      tmdb_id: movie.id,
      imdb_id: movie.imdb_id,
      title: movie.title,
      type: 'movie',
      overview: movie.overview,
      release_date: movie.release_date,
      language: movie.original_language,
      country: movie.production_countries?.[0]?.iso_3166_1,
      genres: movie.genre_ids.map((id: number) => ({ id, name: '' })),
      rating: {
        imdb_rating: movie.vote_average,
        votes: movie.vote_count
      },
      poster_path: movie.poster_path,
      backdrop_path: movie.backdrop_path,
      popularity: movie.popularity,
      vote_average: movie.vote_average,
      vote_count: movie.vote_count,
      runtime: movie.runtime,
      status: movie.status,
      tagline: movie.tagline,
      budget: movie.budget,
      revenue: movie.revenue
    }));
  }
  
  private mapMovieDetails(movie: TmdbMovieResponse): MovieMetadata {
    return {
      tmdb_id: movie.id,
      imdb_id: movie.imdb_id,
      title: movie.title,
      type: 'movie',
      overview: movie.overview,
      release_date: movie.release_date,
      language: movie.original_language,
      country: movie.production_countries?.[0]?.iso_3166_1,
      genres: movie.genres.map((genre: { id: number; name: string }) => ({ id: genre.id, name: genre.name })),
      rating: {
        imdb_rating: movie.vote_average,
        votes: movie.vote_count
      },
      poster_path: movie.poster_path,
      backdrop_path: movie.backdrop_path,
      popularity: movie.popularity,
      vote_average: movie.vote_average,
      vote_count: movie.vote_count,
      runtime: movie.runtime,
      status: movie.status,
      tagline: movie.tagline,
      budget: movie.budget,
      revenue: movie.revenue
    };
  }
}

export default MovieService.getInstance();
