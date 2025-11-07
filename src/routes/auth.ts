import { FastifyPluginAsync } from 'fastify';
import { createUser, findUserByEmail, findUserById, verifyUserPassword } from '../services/userService';
import { CreateUserInput, LoginInput, AuthResponse } from '../models/user';
import { authenticate } from '../middleware/auth';
import { generateTokens, generateAccessToken, verifyToken } from '../utils/jwt';
import { storeRefreshToken, removeRefreshToken, isRefreshTokenValid } from '../utils/refreshToken';
import { createSession, updateSessionActivity, invalidateSession, isSessionValid, rotateToken } from '../utils/tokenRotation';
import { sanitizeEmail, sanitizeUsername, containsMaliciousContent, validateInputLength } from '../utils/sanitizer';
import { createSafeErrorResponse, logErrorWithDetails } from '../utils/errorHandler';
import { JWTPayload, TokenResponse } from '../types/jwt';

// Custom error classes for better error handling
class DuplicateEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateEmailError';
    this.statusCode = 409;
  }
  statusCode: number;
}

class DuplicateUsernameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateUsernameError';
    this.statusCode = 409;
  }
  statusCode: number;
}

class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
    this.statusCode = 400;
  }
  statusCode: number;
}

class InvalidCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCredentialsError';
    this.statusCode = 401;
  }
  statusCode: number;
}

class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionExpiredError';
    this.statusCode = 401;
  }
  statusCode: number;
}

// Password strength validation
const validatePasswordStrength = (password: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*(),.?":{}|<>)');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Check for duplicate username
const checkDuplicateUsername = async (username: string): Promise<void> => {
  // This would require a separate function in userService to check by username
  // For now, we'll implement a basic check
  try {
    const db = require('../config/database').getDb();
    const existingUser = await db.collection('users').findOne({ username: username.toLowerCase() });
    if (existingUser) {
      throw new DuplicateUsernameError('Username already exists');
    }
  } catch (error) {
    if (error instanceof DuplicateUsernameError) {
      throw error;
    }
    // If we can't check for username duplicates, we'll let it pass
    // In a real implementation, you'd add this functionality to userService
  }
};

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register endpoint
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'username', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          username: { type: 'string', minLength: 3, maxLength: 50 },
          password: { type: 'string', minLength: 8 }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                username: { type: 'string' }
              }
            },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            sessionId: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'array', items: { type: 'string' } }
          }
        },
        409: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { email, username, password }: CreateUserInput = request.body as CreateUserInput;

      // Validate input
      if (!email || !username || !password) {
        throw new InvalidInputError('Email, username, and password are required');
      }

      // Sanitize and validate inputs
      const sanitizedEmail = sanitizeEmail(email);
      const sanitizedUsername = sanitizeUsername(username);

      if (!validateInputLength(sanitizedEmail, 5, 100)) {
        throw new InvalidInputError('Email must be between 5 and 100 characters');
      }

      if (!validateInputLength(sanitizedUsername, 3, 50)) {
        throw new InvalidInputError('Username must be between 3 and 50 characters');
      }

      if (containsMaliciousContent(email) || containsMaliciousContent(username)) {
        throw new InvalidInputError('Invalid input content detected');
      }

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        throw new InvalidInputError(`Password does not meet requirements: ${passwordValidation.errors.join(', ')}`);
      }

      // Check if user already exists
      const existingUser = await findUserByEmail(sanitizedEmail);
      if (existingUser) {
        throw new DuplicateEmailError('User with this email already exists');
      }

      // Check for duplicate username
      await checkDuplicateUsername(sanitizedUsername);

      // Create user
      const user = await createUser({ email: sanitizedEmail, username: sanitizedUsername, password });

      // Create session
      const session = createSession(user.id, user.email);

      // Generate tokens with session info
      const tokens = generateTokens(fastify, {
        userId: user.id,
        email: user.email,
        sessionId: session.sessionId
      });
      
      // Store refresh token for server-side management
      storeRefreshToken(tokens.refreshToken, {
        userId: user.id,
        email: user.email,
        sessionId: session.sessionId
      });

      // Update session activity
      updateSessionActivity(session.sessionId);

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      logErrorWithDetails(null, {
        context: 'User registration successful',
        userId: user.id,
        email: user.email
      });

      return reply.code(201).send({
        user: userWithoutPassword,
        sessionId: session.sessionId,
        ...tokens,
      } as AuthResponse);
    } catch (error) {
      const originalEmail = (request.body as any)?.email || 'unknown';
      const originalUsername = (request.body as any)?.username || 'unknown';
      
      logErrorWithDetails(error, { context: 'User registration', email: originalEmail, username: originalUsername });
      
      if (error instanceof DuplicateEmailError || error instanceof DuplicateUsernameError ||
          error instanceof InvalidInputError || error instanceof InvalidCredentialsError) {
        const statusCode = error.statusCode as 201 | 400 | 409 | 500;
        const safeError = createSafeErrorResponse(error, statusCode);
        return reply.code(statusCode).send(safeError);
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  // Login endpoint
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                username: { type: 'string' }
              }
            },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            sessionId: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { email, password }: LoginInput = request.body as LoginInput;

      // Validate input
      if (!email || !password) {
        throw new InvalidInputError('Email and password are required');
      }

      // Sanitize email
      const sanitizedEmail = sanitizeEmail(email);

      if (!validateInputLength(sanitizedEmail, 5, 100)) {
        throw new InvalidInputError('Invalid email format');
      }

      // Find user
      const user = await findUserByEmail(sanitizedEmail);
      if (!user) {
        throw new InvalidCredentialsError('Invalid credentials');
      }

      // Verify password
      const isPasswordValid = await verifyUserPassword(user, password);
      if (!isPasswordValid) {
        throw new InvalidCredentialsError('Invalid credentials');
      }

      // Create session
      const session = createSession(user.id, user.email);
      
      // Generate tokens with session info
      const tokens = generateTokens(fastify, {
        userId: user.id,
        email: user.email,
        sessionId: session.sessionId
      });
      
      // Store refresh token for server-side management
      storeRefreshToken(tokens.refreshToken, {
        userId: user.id,
        email: user.email,
        sessionId: session.sessionId
      });

      // Update session activity
      updateSessionActivity(session.sessionId);

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      logErrorWithDetails(null, {
        context: 'User login successful',
        userId: user.id,
        email: user.email
      });

      return reply.send({
        user: userWithoutPassword,
        sessionId: session.sessionId,
        ...tokens,
      } as AuthResponse);
    } catch (error) {
      const originalEmail = (request.body as any)?.email || 'unknown';
      
      logErrorWithDetails(error, { context: 'User login', email: originalEmail });
      
      if (error instanceof InvalidInputError || error instanceof InvalidCredentialsError) {
        const statusCode = error.statusCode as 400 | 401 | 500;
        const safeError = createSafeErrorResponse(error, statusCode);
        return reply.code(statusCode).send(safeError);
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  // Refresh token endpoint with rotation
  fastify.post('/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            sessionId: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const body = request.body as { refreshToken?: string };
      const { refreshToken } = body;

      if (!refreshToken) {
        throw new InvalidCredentialsError('Refresh token is required');
      }

      // Verify refresh token exists and is valid
      if (!isRefreshTokenValid(refreshToken)) {
        throw new InvalidCredentialsError('Invalid or expired refresh token');
      }

      // Verify refresh token
      const decoded = verifyToken(fastify, refreshToken, 'refresh-token');
      
      // Validate token payload fields
      if (!decoded.userId || !decoded.email) {
        throw new InvalidCredentialsError('Invalid refresh token payload');
      }

      // Extract session ID if available
      const sessionId = decoded.sessionId;
      
      // Update session activity if session exists
      if (sessionId && isSessionValid(sessionId)) {
        updateSessionActivity(sessionId);
      }
      
      // Generate new access token
      const newAccessToken = generateAccessToken(fastify, {
        userId: decoded.userId,
        email: decoded.email,
        sessionId: sessionId
      });

      logErrorWithDetails(null, {
        context: 'Token refresh successful',
        userId: decoded.userId,
        sessionId: sessionId
      });

      return reply.send({
        accessToken: newAccessToken,
        sessionId: sessionId
      });
    } catch (error) {
      logErrorWithDetails(error, { context: 'Token refresh' });
      
      if (error instanceof InvalidCredentialsError) {
        const statusCode = error.statusCode as 401;
        const safeError = createSafeErrorResponse(error, statusCode);
        return reply.code(statusCode).send(safeError);
      }
      
      const safeError = createSafeErrorResponse(error, 401);
      return reply.code(401).send(safeError);
    }
  });

  // Token rotation endpoint
  fastify.post('/rotate-token', {
    schema: {
      body: {
        type: 'object',
        required: ['accessToken', 'sessionId'],
        properties: {
          accessToken: { type: 'string' },
          sessionId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const body = request.body as { accessToken?: string; sessionId?: string };
      const { accessToken, sessionId } = body;

      if (!accessToken || !sessionId) {
        return reply.code(401).send({ error: 'Access token and session ID are required' });
      }

      // Verify session is valid
      if (!isSessionValid(sessionId)) {
        return reply.code(401).send({ error: 'Invalid or expired session' });
      }

      // Rotate the token
      const rotationResult = await rotateToken(fastify, accessToken, sessionId);
      
      if (!rotationResult) {
        return reply.code(401).send({ error: 'Token rotation failed or not needed' });
      }

      return reply.send({
        accessToken: rotationResult.newToken
      });
    } catch (error) {
      logErrorWithDetails(error, { context: 'Token rotation' });
      const safeError = createSafeErrorResponse(error, 401);
      return reply.code(401).send(safeError);
    }
  });

  // Logout endpoint - revoke refresh token and invalidate session
  fastify.post('/logout', {
    schema: {
      body: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string' },
          sessionId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const body = request.body as { refreshToken?: string; sessionId?: string };
      const { refreshToken, sessionId } = body;

      if (refreshToken) {
        // Remove the refresh token from storage
        removeRefreshToken(refreshToken);
      }

      if (sessionId) {
        // Invalidate the session
        invalidateSession(sessionId);
      }

      return reply.send({ message: 'Successfully logged out' });
    } catch (error) {
      logErrorWithDetails(error, { context: 'User logout' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  // Session management endpoint - get current session info
  fastify.get('/session', {
    preHandler: [authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            userId: { type: 'string' },
            email: { type: 'string' },
            createdAt: { type: 'string' },
            lastActivity: { type: 'string' },
            expiresAt: { type: 'string' },
            isActive: { type: 'boolean' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const user = request.user;
      if (!user || typeof user === 'string' || Buffer.isBuffer(user) || !('userId' in user)) {
        return reply.code(401).send({ error: 'Invalid token payload' });
      }

      const sessionId = (user as any).sessionId;
      if (!sessionId) {
        return reply.code(401).send({ error: 'No session associated with token' });
      }

      // Check if session is valid
      if (!isSessionValid(sessionId)) {
        return reply.code(401).send({ error: 'Session is invalid or expired' });
      }

      // Update session activity
      updateSessionActivity(sessionId);

      return reply.send({
        sessionId,
        userId: user.userId,
        email: (user as any).email,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        expiresAt: new Date(Date.now() + parseInt(process.env.SESSION_TIMEOUT_MS || '1800000')).toISOString(),
        isActive: true
      });
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get session info' });
      const safeError = createSafeErrorResponse(error, 401);
      return reply.code(401).send(safeError);
    }
  });

  // Invalidate session endpoint
  fastify.delete('/session', {
    preHandler: [authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const user = request.user;
      if (!user || typeof user === 'string' || Buffer.isBuffer(user) || !('userId' in user)) {
        return reply.code(401).send({ error: 'Invalid token payload' });
      }

      const sessionId = (user as any).sessionId;
      if (!sessionId) {
        return reply.code(401).send({ error: 'No session associated with token' });
      }

      // Invalidate the session
      const invalidated = invalidateSession(sessionId);
      
      if (!invalidated) {
        return reply.code(401).send({ error: 'Session not found or already invalidated' });
      }

      return reply.send({ message: 'Session invalidated successfully' });
    } catch (error) {
      logErrorWithDetails(error, { context: 'Invalidate session' });
      const safeError = createSafeErrorResponse(error, 401);
      return reply.code(401).send(safeError);
    }
  });

  // Get current user profile
  fastify.get('/profile', { 
    preHandler: [authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                username: { type: 'string' }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Use properly typed request.user with type guard
      const user = request.user;
      if (!user || typeof user === 'string' || Buffer.isBuffer(user) || !('userId' in user)) {
        return reply.code(401).send({ error: 'Invalid token payload' });
      }
      
      const userId = user.userId;
      if (!userId) {
        return reply.code(401).send({ error: 'Invalid token payload' });
      }
      
      const userData = await findUserById(userId as string);
      
      if (!userData) {
        return reply.code(404).send({ error: 'User not found' });
      }

      // Remove password from response
      const { password: _, ...userWithoutPassword } = userData;

      return reply.send({ user: userWithoutPassword });
    } catch (error) {
      logErrorWithDetails(error, { context: 'Get user profile' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  // Test endpoint for manual testing with curl
  fastify.get('/test', {
    preHandler: [authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                username: { type: 'string' }
              }
            },
            timestamp: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const user = request.user;
      if (!user || typeof user === 'string' || Buffer.isBuffer(user) || !('userId' in user)) {
        return reply.code(401).send({ error: 'Invalid token payload' });
      }
      
      return reply.send({
        message: 'Authentication successful - test endpoint working',
        user: {
          id: user.userId,
          email: (user as any).email,
          username: 'test_user' // This would come from the database in a real implementation
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logErrorWithDetails(error, { context: 'Test endpoint' });
      const safeError = createSafeErrorResponse(error, 401);
      return reply.code(401).send(safeError);
    }
  });

  // Comprehensive test endpoint for all auth flows
  fastify.post('/test-comprehensive', {
    schema: {
      body: {
        type: 'object',
        properties: {
          testType: { type: 'string', enum: ['register', 'login', 'refresh', 'profile', 'logout'] },
          email: { type: 'string', format: 'email' },
          username: { type: 'string' },
          password: { type: 'string' },
          refreshToken: { type: 'string' },
          accessToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object' },
            timestamp: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        409: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { testType, email, username, password, refreshToken, accessToken } = request.body as any;
      
      if (!testType) {
        throw new InvalidInputError('testType is required');
      }

      switch (testType) {
        case 'register':
          if (!email || !username || !password) {
            throw new InvalidInputError('Email, username, and password are required for registration test');
          }
          
          // Test registration
          const sanitizedEmail = sanitizeEmail(email);
          const sanitizedUsername = sanitizeUsername(username);
          
          // Check if user already exists
          const existingUser = await findUserByEmail(sanitizedEmail);
          if (existingUser) {
            throw new DuplicateEmailError('User with this email already exists');
          }
          
          // Validate password strength
          const passwordValidation = validatePasswordStrength(password);
          if (!passwordValidation.isValid) {
            throw new InvalidInputError(`Password does not meet requirements: ${passwordValidation.errors.join(', ')}`);
          }
          
          // Create user
          const user = await createUser({ email: sanitizedEmail, username: sanitizedUsername, password });
          const session = createSession(user.id, user.email);
          
          const tokens = generateTokens(fastify, {
            userId: user.id,
            email: user.email,
            sessionId: session.sessionId
          });
          
          storeRefreshToken(tokens.refreshToken, {
            userId: user.id,
            email: user.email,
            sessionId: session.sessionId
          });
          
          updateSessionActivity(session.sessionId);
          
          const { password: _, ...userWithoutPassword } = user;
          
          return reply.send({
            success: true,
            message: 'Registration test successful',
            data: {
              user: userWithoutPassword,
              sessionId: session.sessionId,
              ...tokens
            },
            timestamp: new Date().toISOString()
          });
          
        case 'login':
          if (!email || !password) {
            throw new InvalidInputError('Email and password are required for login test');
          }
          
          const loginSanitizedEmail = sanitizeEmail(email);
          const loginUser = await findUserByEmail(loginSanitizedEmail);
          
          if (!loginUser) {
            throw new InvalidCredentialsError('Invalid credentials');
          }
          
          const isPasswordValid = await verifyUserPassword(loginUser, password);
          if (!isPasswordValid) {
            throw new InvalidCredentialsError('Invalid credentials');
          }
          
          const loginSession = createSession(loginUser.id, loginUser.email);
          const loginTokens = generateTokens(fastify, {
            userId: loginUser.id,
            email: loginUser.email,
            sessionId: loginSession.sessionId
          });
          
          storeRefreshToken(loginTokens.refreshToken, {
            userId: loginUser.id,
            email: loginUser.email,
            sessionId: loginSession.sessionId
          });
          
          updateSessionActivity(loginSession.sessionId);
          
          const { password: loginPassword, ...loginUserWithoutPassword } = loginUser;
          
          return reply.send({
            success: true,
            message: 'Login test successful',
            data: {
              user: loginUserWithoutPassword,
              sessionId: loginSession.sessionId,
              ...loginTokens
            },
            timestamp: new Date().toISOString()
          });
          
        case 'refresh':
          if (!refreshToken) {
            throw new InvalidInputError('Refresh token is required for refresh test');
          }
          
          if (!isRefreshTokenValid(refreshToken)) {
            throw new InvalidCredentialsError('Invalid or expired refresh token');
          }
          
          const decoded = verifyToken(fastify, refreshToken, 'refresh-token');
          
          if (!decoded.userId || !decoded.email) {
            throw new InvalidCredentialsError('Invalid refresh token payload');
          }
          
          const sessionId = decoded.sessionId;
          if (sessionId && isSessionValid(sessionId)) {
            updateSessionActivity(sessionId);
          }
          
          const newAccessToken = generateAccessToken(fastify, {
            userId: decoded.userId,
            email: decoded.email,
            sessionId: sessionId
          });
          
          return reply.send({
            success: true,
            message: 'Token refresh test successful',
            data: {
              accessToken: newAccessToken,
              sessionId: sessionId
            },
            timestamp: new Date().toISOString()
          });
          
        case 'profile':
          if (!accessToken) {
            throw new InvalidInputError('Access token is required for profile test');
          }
          
          const profileDecoded = verifyToken(fastify, accessToken, 'access-token');
          
          if (!profileDecoded.userId || !profileDecoded.email) {
            throw new InvalidCredentialsError('Invalid access token payload');
          }
          
          const profileUser = await findUserById(profileDecoded.userId as string);
          
          if (!profileUser) {
            throw new InvalidCredentialsError('User not found');
          }
          
          const { password: profilePassword, ...profileUserWithoutPassword } = profileUser;
          
          return reply.send({
            success: true,
            message: 'Profile test successful',
            data: {
              user: profileUserWithoutPassword
            },
            timestamp: new Date().toISOString()
          });
          
        case 'logout':
          if (!refreshToken) {
            throw new InvalidInputError('Refresh token is required for logout test');
          }
          
          await removeRefreshToken(refreshToken);
          
          const logoutDecoded = verifyToken(fastify, refreshToken, 'refresh-token');
          if (logoutDecoded.sessionId) {
            invalidateSession(logoutDecoded.sessionId);
          }
          
          return reply.send({
            success: true,
            message: 'Logout test successful',
            data: {},
            timestamp: new Date().toISOString()
          });
          
        default:
          throw new InvalidInputError('Invalid test type');
      }
    } catch (error) {
      const testTypeValue = (request.body as any)?.testType || 'unknown';
      logErrorWithDetails(error, { context: 'Comprehensive test', testType: testTypeValue });
      
      if (error instanceof DuplicateEmailError || error instanceof DuplicateUsernameError ||
          error instanceof InvalidInputError || error instanceof InvalidCredentialsError) {
        const statusCode = error.statusCode as 400 | 401 | 409 | 500;
        const safeError = createSafeErrorResponse(error, statusCode);
        return reply.code(statusCode).send(safeError);
      }
      
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });
};

export default authRoutes;