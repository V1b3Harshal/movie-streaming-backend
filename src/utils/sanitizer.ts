/**
 * Input sanitization utilities to prevent XSS and injection attacks
 */

export const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/['"]/g, '\\$&') // Escape quotes
    .replace(/(\r\n|\n|\r)/gm, '') // Remove newlines
    .replace(/[^\w\s\-@.]/g, ''); // Allow only safe characters
};

export const sanitizeEmail = (email: string): string => {
  if (typeof email !== 'string') return '';
  
  // Basic email sanitization
  return email
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9@._-]/g, '');
};

export const sanitizeUsername = (username: string): string => {
  if (typeof username !== 'string') return '';
  
  return username
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '') // Allow letters, numbers, underscore, hyphen
    .substring(0, 50); // Limit length
};

export const sanitizeSearchQuery = (query: string): string => {
  if (typeof query !== 'string') return '';
  
  return query
    .trim()
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/['"]/g, '\\$&') // Escape quotes
    .substring(0, 100); // Limit length
};

export const sanitizeId = (id: string): string => {
  if (typeof id !== 'string') return '';
  
  // Basic ID sanitization - should be UUID anyway but extra protection
  return id.replace(/[^a-fA-F0-9-]/g, '');
};

export const validateInputLength = (input: string, minLength: number, maxLength: number): boolean => {
  if (typeof input !== 'string') return false;
  return input.length >= minLength && input.length <= maxLength;
};

export const containsMaliciousContent = (input: string): boolean => {
  if (typeof input !== 'string') return false;
  
  const maliciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /data:/i,
    /vbscript:/i,
    /eval\s*\(/i,
    /expression\s*\(/i,
    /<\?/i,
    /<%/i,
  ];
  
  return maliciousPatterns.some(pattern => pattern.test(input));
};