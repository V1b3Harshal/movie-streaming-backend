// Movie/TV specific validation utilities
import { sanitizeId, sanitizeInput, sanitizeSearchQuery, validateInputLength, containsMaliciousContent } from './sanitizer';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

// Common validation patterns
const TMDB_ID_PATTERN = /^[0-9]+$/;
const GENRE_PATTERN = /^[a-zA-Z0-9\s\-_]+$/;
const LANGUAGE_PATTERN = /^[a-z]{2}$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RATING_PATTERN = /^\d{1,2}\.\d$/;

// Base validation functions
const isValidPattern = (value: string, pattern: RegExp): boolean => {
  return pattern.test(value);
};

// Movie-specific validators
export const validateMovieId = (id: any): ValidationResult<string> => {
  if (typeof id !== 'string' && typeof id !== 'number') {
    return { success: false, errors: ['Movie ID must be a string or number'] };
  }
  
  const idStr = String(id);
  const sanitized = sanitizeId(idStr);
  
  if (!sanitized) {
    return { success: false, errors: ['Invalid movie ID format'] };
  }
  
  if (!isValidPattern(sanitized, TMDB_ID_PATTERN)) {
    return { success: false, errors: ['Movie ID must contain only numbers'] };
  }
  
  if (!validateInputLength(sanitized, 1, 20)) {
    return { success: false, errors: ['Movie ID must be between 1 and 20 characters'] };
  }
  
  return { success: true, data: sanitized };
};

export const validateTitle = (title: any): ValidationResult<string> => {
  if (typeof title !== 'string') {
    return { success: false, errors: ['Title must be a string'] };
  }
  
  const sanitized = sanitizeInput(title);
  if (!sanitized || sanitized.trim() === '') {
    return { success: false, errors: ['Title cannot be empty'] };
  }
  
  if (containsMaliciousContent(sanitized)) {
    return { success: false, errors: ['Title contains malicious content'] };
  }
  
  if (!validateInputLength(sanitized, 1, 255)) {
    return { success: false, errors: ['Title must be between 1 and 255 characters'] };
  }
  
  return { success: true, data: sanitized };
};

export const validateReleaseDate = (date: any): ValidationResult<string> => {
  if (typeof date !== 'string') {
    return { success: false, errors: ['Release date must be a string'] };
  }
  
  if (!isValidPattern(date, DATE_PATTERN)) {
    return { success: false, errors: ['Release date must be in YYYY-MM-DD format'] };
  }
  
  // Validate date logic
  const dateObj = new Date(date);
  const now = new Date();
  if (dateObj > now) {
    return { success: false, errors: ['Release date cannot be in the future'] };
  }
  
  return { success: true, data: date };
};

export const validateRating = (rating: any): ValidationResult<number> => {
  const num = Number(rating);
  
  if (isNaN(num)) {
    return { success: false, errors: ['Rating must be a number'] };
  }
  
  if (num < 0 || num > 10) {
    return { success: false, errors: ['Rating must be between 0 and 10'] };
  }
  
  if (!isValidPattern(num.toFixed(1), RATING_PATTERN)) {
    return { success: false, errors: ['Rating must have at most one decimal place'] };
  }
  
  return { success: true, data: num };
};

export const validateGenre = (genre: any): ValidationResult<string> => {
  if (typeof genre !== 'string') {
    return { success: false, errors: ['Genre must be a string'] };
  }
  
  const sanitized = sanitizeInput(genre);
  if (!sanitized || sanitized.trim() === '') {
    return { success: false, errors: ['Genre cannot be empty'] };
  }
  
  if (!isValidPattern(sanitized, GENRE_PATTERN)) {
    return { success: false, errors: ['Genre contains invalid characters'] };
  }
  
  if (!validateInputLength(sanitized, 1, 50)) {
    return { success: false, errors: ['Genre must be between 1 and 50 characters'] };
  }
  
  return { success: true, data: sanitized };
};

export const validateLanguage = (lang: any): ValidationResult<string> => {
  if (typeof lang !== 'string') {
    return { success: false, errors: ['Language must be a string'] };
  }
  
  const sanitized = lang.toLowerCase();
  if (!isValidPattern(sanitized, LANGUAGE_PATTERN)) {
    return { success: false, errors: ['Language must be a 2-letter ISO code'] };
  }
  
  return { success: true, data: sanitized };
};

export const validateRuntime = (runtime: any): ValidationResult<number> => {
  const num = Number(runtime);
  
  if (isNaN(num)) {
    return { success: false, errors: ['Runtime must be a number'] };
  }
  
  if (num < 1 || num > 1000) {
    return { success: false, errors: ['Runtime must be between 1 and 1000 minutes'] };
  }
  
  return { success: true, data: num };
};

// Search and pagination validation
export const validateSearchQuery = (query: any): ValidationResult<string> => {
  if (typeof query !== 'string') {
    return { success: false, errors: ['Search query must be a string'] };
  }
  
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized || sanitized.trim() === '') {
    return { success: false, errors: ['Search query cannot be empty'] };
  }
  
  if (!validateInputLength(sanitized, 1, 100)) {
    return { success: false, errors: ['Search query must be between 1 and 100 characters'] };
  }
  
  return { success: true, data: sanitized };
};

export const validatePageNumber = (page: any): ValidationResult<number> => {
  const num = Number(page);
  
  if (isNaN(num)) {
    return { success: false, errors: ['Page number must be a number'] };
  }
  
  if (num < 1 || num > 1000) {
    return { success: false, errors: ['Page number must be between 1 and 1000'] };
  }
  
  return { success: true, data: num };
};

export const validatePageSize = (size: any): ValidationResult<number> => {
  const num = Number(size);
  
  if (isNaN(num)) {
    return { success: false, errors: ['Page size must be a number'] };
  }
  
  if (num < 1 || num > 100) {
    return { success: false, errors: ['Page size must be between 1 and 100'] };
  }
  
  return { success: true, data: num };
};

// Watch Together specific validation
export const validateRoomId = (roomId: any): ValidationResult<string> => {
  if (typeof roomId !== 'string') {
    return { success: false, errors: ['Room ID must be a string'] };
  }
  
  const sanitized = sanitizeId(roomId);
  if (!sanitized) {
    return { success: false, errors: ['Invalid room ID format'] };
  }
  
  if (!validateInputLength(sanitized, 1, 50)) {
    return { success: false, errors: ['Room ID must be between 1 and 50 characters'] };
  }
  
  return { success: true, data: sanitized };
};

export const validateUsername = (username: any): ValidationResult<string> => {
  if (typeof username !== 'string') {
    return { success: false, errors: ['Username must be a string'] };
  }
  
  // Use the existing sanitizeUsername function
  const sanitized = username.trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
  if (!sanitized || sanitized.trim() === '') {
    return { success: false, errors: ['Username cannot be empty'] };
  }
  
  if (!validateInputLength(sanitized, 3, 30)) {
    return { success: false, errors: ['Username must be between 3 and 30 characters'] };
  }
  
  // Only allow alphanumeric characters, underscores, and hyphens
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    return { success: false, errors: ['Username can only contain letters, numbers, underscores, and hyphens'] };
  }
  
  return { success: true, data: sanitized };
};

// Composite validation functions
export const validateMovie = (data: {
  id: any;
  title: any;
  release_date: any;
  vote_average: any;
  runtime?: any;
}): ValidationResult<{
  id: string;
  title: string;
  release_date: string;
  vote_average: number;
  runtime?: number;
}> => {
  const idResult = validateMovieId(data.id);
  const titleResult = validateTitle(data.title);
  const dateResult = validateReleaseDate(data.release_date);
  const ratingResult = validateRating(data.vote_average);
  const runtimeResult = data.runtime ? validateRuntime(data.runtime) : { success: true };
  
  const allErrors = [
    ...(idResult.errors || []),
    ...(titleResult.errors || []),
    ...(dateResult.errors || []),
    ...(ratingResult.errors || []),
    ...(runtimeResult.errors || [])
  ];
  
  if (allErrors.length > 0) {
    return { success: false, errors: allErrors };
  }
  
  return {
    success: true,
    data: {
      id: idResult.data!,
      title: titleResult.data!,
      release_date: dateResult.data!,
      vote_average: ratingResult.data!,
      ...(runtimeResult.data && { runtime: runtimeResult.data })
    }
  };
};