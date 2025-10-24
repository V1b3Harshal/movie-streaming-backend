export interface TmdbMovieResponse {
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
  runtime: number;
  status: string;
  tagline: string;
  budget: number;
  revenue: number;
  genres: Array<{ id: number; name: string }>;
}

export interface TmdbTvResponse {
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
  last_air_date: string;
  status: string;
  number_of_episodes: number;
  number_of_seasons: number;
  episode_run_time: number[];
  genres: Array<{ id: number; name: string }>;
}

export interface TmdbSearchResponse {
  page: number;
  total_results: number;
  total_pages: number;
  results: TmdbMovieResponse[] | TmdbTvResponse[];
}

export interface TmdbGenreResponse {
  genres: Array<{ id: number; name: string }>;
}