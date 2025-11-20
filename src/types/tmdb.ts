export interface TmdbGenre {
  id: number;
  name: string;
}

export interface ProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface TmdbMovieResponse {
  id: number;
  imdb_id?: string;
  title: string;
  overview: string;
  release_date: string;
  original_language: string;
  genre_ids?: number[];
  genres?: TmdbGenre[];
  production_countries?: ProductionCountry[];
  vote_average: number;
  vote_count: number;
  poster_path?: string;
  backdrop_path?: string;
  popularity: number;
  runtime?: number;
  status?: string;
  tagline?: string;
  budget?: number;
  revenue?: number;
  adult?: boolean;
  video?: boolean;
}

export interface TmdbTVResponse {
  id: number;
  imdb_id?: string;
  name: string;
  overview: string;
  first_air_date: string;
  last_air_date?: string;
  original_language: string;
  genre_ids?: number[];
  genres?: TmdbGenre[];
  production_countries?: ProductionCountry[];
  vote_average: number;
  vote_count: number;
  poster_path?: string;
  backdrop_path?: string;
  popularity: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  status?: string;
  type?: string;
  origin_country?: string[];
}

export type TmdbTvResponse = TmdbTVResponse;

export interface TmdbSearchResponse {
  page: number;
  results: (TmdbMovieResponse | TmdbTVResponse)[];
  total_results: number;
  total_pages: number;
}