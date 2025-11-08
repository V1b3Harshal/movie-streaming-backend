// Standardized API response format for main backend
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export const createSuccessResponse = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
  timestamp: new Date().toISOString()
});

export const createErrorResponse = (
  code: string, 
  message: string, 
  details?: any
): ApiResponse => ({
  success: false,
  error: { code, message, details },
  timestamp: new Date().toISOString()
});

export const createPaginatedResponse = <T>(
  data: T[], 
  page: number, 
  limit: number, 
  total: number
): ApiResponse<{
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}> => ({
  success: true,
  data: {
    items: data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrevious: page > 1
    }
  },
  timestamp: new Date().toISOString()
});

// Movie/TV specific response types
export interface MovieResponse {
  id: string;
  title: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date: string;
  vote_average: number;
  genres: string[];
  runtime?: number;
  original_language: string;
}

export interface TVSeriesResponse {
  id: string;
  name: string;
  overview: string;
  poster_path?: string;
  backdrop_path?: string;
  first_air_date: string;
  vote_average: number;
  genres: string[];
  number_of_episodes: number;
  number_of_seasons: number;
  original_language: string;
}

export interface SearchResponse<T> {
  results: T[];
  page: number;
  total_results: number;
  total_pages: number;
}