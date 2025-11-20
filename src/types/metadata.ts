export interface Genre {
  id: number;
  name: string;
}

export interface Rating {
  imdb_rating?: number;
  trakt_rating?: number;
  votes: number;
}

export interface MovieMetadata {
  tmdb_id: number;
  imdb_id: string;
  title: string;
  type: 'movie' | 'tv';
  overview: string;
  release_date: string;
  language: string;
  country: string;
  genres: Genre[];
  rating: Rating;
  poster_path: string | undefined;
  backdrop_path: string | undefined;
  popularity: number;
  vote_average: number;
  vote_count: number;
  runtime: number | undefined;
  status: string | undefined;
  tagline: string | undefined;
  budget: number | undefined;
  revenue: number | undefined;
}

export interface TVSeriesMetadata {
  tmdb_id: number;
  imdb_id: string;
  title: string;
  type: 'tv';
  overview: string;
  first_air_date: string;
  language: string;
  country: string;
  genres: Genre[];
  rating: Rating;
  poster_path: string | undefined;
  backdrop_path: string | undefined;
  popularity: number;
  vote_average: number;
  vote_count: number;
  number_of_seasons: number | undefined;
  number_of_episodes: number | undefined;
  status: string | undefined;
  last_air_date: string | undefined;
  episode_run_time: number[] | undefined;
}

export type TvShowMetadata = TVSeriesMetadata;

export interface SearchResults {
  page: number;
  total_results: number;
  total_pages: number;
  results: (MovieMetadata | TVSeriesMetadata)[];
}