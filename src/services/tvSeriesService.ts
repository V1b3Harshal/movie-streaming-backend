import { TvShowMetadata, SearchResults } from '../types/metadata';
import { TmdbTvResponse } from '../types/tmdb';
import { TMDB_API_URL, TMDB_API_KEY } from '../config/environment';
import axios from 'axios';

class TvSeriesService {
  private static instance: TvSeriesService;
  
  private constructor() {}
  
  public static getInstance(): TvSeriesService {
    if (!TvSeriesService.instance) {
      TvSeriesService.instance = new TvSeriesService();
    }
    return TvSeriesService.instance;
  }
  
  async getTvSeries(): Promise<TvShowMetadata[]> {
    try {
      const response = await axios.get(`${TMDB_API_URL}/tv/popular`, {
        params: {
          api_key: TMDB_API_KEY,
          language: 'en-US',
          page: 1
        }
      });
      
      return this.mapTvSeries(response.data.results);
    } catch (error) {
      console.error('Error fetching TV series:', error);
      throw new Error('Failed to fetch TV series');
    }
  }
  
  async getTvSeriesSearch(query: string, page?: number): Promise<SearchResults> {
    try {
      const response = await axios.get(`${TMDB_API_URL}/search/tv`, {
        params: {
          api_key: TMDB_API_KEY,
          query,
          language: 'en-US',
          page: page || 1
        }
      });
      
      return {
        page: response.data.page,
        total_results: response.data.total_results,
        total_pages: response.data.total_pages,
        results: this.mapTvSeries(response.data.results)
      };
    } catch (error) {
      console.error('Error searching TV series:', error);
      throw new Error('Failed to search TV series');
    }
  }
  
  async getTvSeriesDetails(tmdbId: number): Promise<TvShowMetadata> {
    try {
      const response = await axios.get(`${TMDB_API_URL}/tv/${tmdbId}`, {
        params: {
          api_key: TMDB_API_KEY,
          language: 'en-US'
        }
      });
      
      return this.mapTvSeriesDetails(response.data);
    } catch (error) {
      console.error('Error fetching TV series details:', error);
      throw new Error('Failed to fetch TV series details');
    }
  }
  
  async getSimilarTvSeries(tmdbId: number, page?: number): Promise<SearchResults> {
    try {
      const response = await axios.get(`${TMDB_API_URL}/tv/${tmdbId}/similar`, {
        params: {
          api_key: TMDB_API_KEY,
          language: 'en-US',
          page: page || 1
        }
      });
      
      return {
        page: response.data.page,
        total_results: response.data.total_results,
        total_pages: response.data.total_pages,
        results: this.mapTvSeries(response.data.results)
      };
    } catch (error) {
      console.error('Error fetching similar TV series:', error);
      throw new Error('Failed to fetch similar TV series');
    }
  }
  
  async getTrendingTvSeries(page?: number): Promise<SearchResults> {
    try {
      const response = await axios.get(`${TMDB_API_URL}/trending/tv/day`, {
        params: {
          api_key: TMDB_API_KEY,
          language: 'en-US',
          page: page || 1
        }
      });
      
      return {
        page: response.data.page,
        total_results: response.data.total_results,
        total_pages: response.data.total_pages,
        results: this.mapTvSeries(response.data.results)
      };
    } catch (error) {
      console.error('Error fetching trending TV series:', error);
      throw new Error('Failed to fetch trending TV series');
    }
  }
  
  async getAiringToday(page?: number): Promise<SearchResults> {
    try {
      const response = await axios.get(`${TMDB_API_URL}/tv/airing_today`, {
        params: {
          api_key: TMDB_API_KEY,
          language: 'en-US',
          page: page || 1
        }
      });
      
      return {
        page: response.data.page,
        total_results: response.data.total_results,
        total_pages: response.data.total_pages,
        results: this.mapTvSeries(response.data.results)
      };
    } catch (error) {
      console.error('Error fetching airing today TV series:', error);
      throw new Error('Failed to fetch airing today TV series');
    }
  }
  
  async getOnTheAir(page?: number): Promise<SearchResults> {
    try {
      const response = await axios.get(`${TMDB_API_URL}/tv/on_the_air`, {
        params: {
          api_key: TMDB_API_KEY,
          language: 'en-US',
          page: page || 1
        }
      });
      
      return {
        page: response.data.page,
        total_results: response.data.total_results,
        total_pages: response.data.total_pages,
        results: this.mapTvSeries(response.data.results)
      };
    } catch (error) {
      console.error('Error fetching on the air TV series:', error);
      throw new Error('Failed to fetch on the air TV series');
    }
  }
  
  private mapTvSeries(shows: TmdbTvResponse[]): TvShowMetadata[] {
   return shows.map(show => ({
     tmdb_id: show.id,
     imdb_id: show.imdb_id || '',
     title: show.name,
     type: 'tv',
     overview: show.overview,
     release_date: show.first_air_date,
     language: show.original_language,
     country: show.origin_country?.[0] || '',
     genres: (show.genre_ids || []).map((id: number) => ({ id, name: '' })),
     rating: {
       imdb_rating: show.vote_average,
       votes: show.vote_count
     },
     poster_path: show.poster_path,
     backdrop_path: show.backdrop_path,
     popularity: show.popularity,
     vote_average: show.vote_average,
     vote_count: show.vote_count,
     first_air_date: show.first_air_date,
     last_air_date: show.last_air_date,
     status: show.status,
     number_of_episodes: show.number_of_episodes,
     number_of_seasons: show.number_of_seasons,
     episode_run_time: show.episode_run_time
   }));
  }
  
  private mapTvSeriesDetails(show: TmdbTvResponse): TvShowMetadata {
    return {
      tmdb_id: show.id,
      imdb_id: show.imdb_id || '',
      title: show.name,
      type: 'tv',
      overview: show.overview,
      first_air_date: show.first_air_date,
      language: show.original_language,
      country: show.origin_country?.[0] || '',
      genres: (show.genres || []).map((genre: { id: number; name: string }) => ({ id: genre.id, name: genre.name })),
      rating: {
        imdb_rating: show.vote_average,
        votes: show.vote_count
      },
      poster_path: show.poster_path,
      backdrop_path: show.backdrop_path,
      popularity: show.popularity,
      vote_average: show.vote_average,
      vote_count: show.vote_count,
      last_air_date: show.last_air_date,
      status: show.status,
      number_of_episodes: show.number_of_episodes,
      number_of_seasons: show.number_of_seasons,
      episode_run_time: show.episode_run_time
    };
  }
}

export default TvSeriesService.getInstance();
