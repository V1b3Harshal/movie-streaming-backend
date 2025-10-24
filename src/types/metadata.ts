export interface Genre {
  id: number;
  name: string;
}

export interface Rating {
  imdb_rating?: number;
  tmdb_rating?: number;
  trakt_rating?: number;
  votes?: number;
}

export interface BaseMetadata {
  tmdb_id: number;
  imdb_id: string;
  title: string;
  type: 'movie' | 'tv';
  overview?: string;
  release_date?: string;
  language?: string;
  country?: string;
  genres: Genre[];
  rating?: Rating;
  poster_path?: string;
  backdrop_path?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
}

export interface MovieMetadata extends BaseMetadata {
  type: 'movie';
  runtime?: number;
  status?: string;
  tagline?: string;
  budget?: number;
  revenue?: number;
  release_date: string;
}

export interface TvShowMetadata extends BaseMetadata {
  type: 'tv';
  first_air_date?: string;
  last_air_date?: string;
  status?: string;
  number_of_episodes?: number;
  number_of_seasons?: number;
  episode_run_time?: number[];
}

export type Metadata = MovieMetadata | TvShowMetadata;

export interface SearchResults {
  page: number;
  total_results: number;
  total_pages: number;
  results: Metadata[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SearchParams {
  query: string;
  page?: number;
  year?: number;
  language?: string;
  include_adult?: boolean;
}

export interface DetailsParams {
  tmdb_id: number;
  type: 'movie' | 'tv';
}