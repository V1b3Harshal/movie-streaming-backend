import { FastifyPluginAsync } from 'fastify';
import { createUser, findUserByEmail, findUserById, verifyUserPassword } from '../services/userService';
import { CreateUserInput, LoginInput, AuthResponse } from '../models/user';
import { authenticate } from '../middleware/auth';
import { generateTokens, generateAccessToken, verifyToken } from '../utils/jwt';
import { storeRefreshToken, removeRefreshToken, isRefreshTokenValid } from '../utils/refreshToken';
import { sanitizeEmail, sanitizeUsername, containsMaliciousContent, validateInputLength } from '../utils/sanitizer';
import { createSafeErrorResponse, logErrorWithDetails } from '../utils/errorHandler';
import { JWTPayload, TokenResponse } from '../types/jwt';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register endpoint
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'username', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          username: { type: 'string', minLength: 3 },
          password: { type: 'string', minLength: 6 }
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
            refreshToken: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        409: {
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
      const { email, username, password }: CreateUserInput = request.body as CreateUserInput;

      // Validate input
      if (!email || !username || !password) {
        return reply.code(400).send({ error: 'Email, username, and password are required' });
      }

      // Sanitize and validate inputs
      const sanitizedEmail = sanitizeEmail(email);
      const sanitizedUsername = sanitizeUsername(username);

      if (!validateInputLength(sanitizedEmail, 5, 100) || !validateInputLength(sanitizedUsername, 3, 50)) {
        return reply.code(400).send({ error: 'Invalid email or username length' });
      }

      if (containsMaliciousContent(email) || containsMaliciousContent(username)) {
        return reply.code(400).send({ error: 'Invalid input content detected' });
      }

      // Check if user already exists
      const existingUser = await findUserByEmail(sanitizedEmail);
      if (existingUser) {
        return reply.code(409).send({ error: 'User with this email already exists' });
      }

      // Create user
      const user = await createUser({ email: sanitizedEmail, username: sanitizedUsername, password });

      // Generate tokens
      const tokens = generateTokens(fastify, { userId: user.id, email: user.email });
      
      // Store refresh token for server-side management
      storeRefreshToken(tokens.refreshToken, { userId: user.id, email: user.email });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      return reply.code(201).send({
        user: userWithoutPassword,
        ...tokens,
      } as AuthResponse);
    } catch (error) {
      logErrorWithDetails(error, { context: 'User registration' });
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
            refreshToken: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        401: {
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
      const { email, password }: LoginInput = request.body as LoginInput;

      // Validate input
      if (!email || !password) {
        return reply.code(400).send({ error: 'Email and password are required' });
      }

      // Sanitize email
      const sanitizedEmail = sanitizeEmail(email);

      if (!validateInputLength(sanitizedEmail, 5, 100)) {
        return reply.code(400).send({ error: 'Invalid email format' });
      }

      // Find user
      const user = await findUserByEmail(sanitizedEmail);
      if (!user) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // Verify password
      const isPasswordValid = await verifyUserPassword(user, password);
      if (!isPasswordValid) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // Generate tokens
      const tokens = generateTokens(fastify, { userId: user.id, email: user.email });
      
      // Store refresh token for server-side management
      storeRefreshToken(tokens.refreshToken, { userId: user.id, email: user.email });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      return reply.send({
        user: userWithoutPassword,
        ...tokens,
      } as AuthResponse);
    } catch (error) {
      logErrorWithDetails(error, { context: 'User login' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
    }
  });

  // Refresh token endpoint
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
      const body = request.body as { refreshToken?: string };
      const { refreshToken } = body;

      if (!refreshToken) {
        return reply.code(401).send({ error: 'Refresh token is required' });
      }

      // Verify refresh token exists and is valid
      if (!isRefreshTokenValid(refreshToken)) {
        return reply.code(401).send({ error: 'Invalid or expired refresh token' });
      }

      // Verify refresh token
      const decoded = verifyToken(fastify, refreshToken);
      
      // Validate token payload fields
      if (!decoded.userId || !decoded.email) {
        return reply.code(401).send({ error: 'Invalid refresh token payload' });
      }
      
      // Generate new access token
      const newAccessToken = generateAccessToken(fastify, { userId: decoded.userId, email: decoded.email });

      return reply.send({ accessToken: newAccessToken });
    } catch (error) {
      logErrorWithDetails(error, { context: 'Token refresh' });
      const safeError = createSafeErrorResponse(error, 401);
      return reply.code(401).send(safeError);
    }
  });

  // Logout endpoint - revoke refresh token
  fastify.post('/logout', {
    schema: {
      body: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string' }
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
      const body = request.body as { refreshToken?: string };
      const { refreshToken } = body;

      if (refreshToken) {
        // Remove the refresh token from storage
        removeRefreshToken(refreshToken);
      }

      return reply.send({ message: 'Successfully logged out' });
    } catch (error) {
      logErrorWithDetails(error, { context: 'User logout' });
      const safeError = createSafeErrorResponse(error);
      return reply.code(500).send(safeError);
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
};

export default authRoutes;