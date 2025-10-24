# Movie Streaming Backend API

A robust and secure backend API for a movie streaming platform built with Fastify, TypeScript, MongoDB, and Redis. This API provides authentication, movie and TV series management, and integration with external services like TMDB and Trakt.

## Features

- 🔐 **Authentication & Authorization**: JWT-based authentication with refresh tokens
- 🎬 **Movie Management**: CRUD operations for movies with TMDB integration
- 📺 **TV Series Management**: Complete TV series handling with episode tracking
- 🔄 **External API Integration**: TMDB and Trakt API integration
- 🛡️ **Security**: Comprehensive security headers, rate limiting, and input sanitization
- 📊 **API Documentation**: Auto-generated Swagger documentation
- 🚀 **Performance**: Redis caching for improved performance
- 🧪 **Testing**: Jest test framework setup

## Tech Stack

- **Framework**: [Fastify](https://www.fastify.io/) - Fast and low-overhead web framework
- **Language**: [TypeScript](https://www.typescriptlang.org/) - Typed JavaScript
- **Database**: [MongoDB](https://www.mongodb.com/) - NoSQL database
- **Cache**: [Redis](https://redis.io/) - In-memory data store
- **Authentication**: [JWT](https://jwt.io/) - JSON Web Tokens
- **External APIs**: TMDB, Trakt
- **Package Manager**: [pnpm](https://pnpm.io/) - Fast, disk space efficient package manager

## API Endpoints

### Authentication

- `POST /auth/register` - Register new user
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - User logout

### Movies

- `GET /movies` - Get all movies with pagination
- `GET /movies/:id` - Get movie by ID
- `POST /movies` - Create new movie (admin)
- `PUT /movies/:id` - Update movie (admin)
- `DELETE /movies/:id` - Delete movie (admin)

### TV Series

- `GET /tv-series` - Get all TV series
- `GET /tv-series/:id` - Get TV series by ID
- `GET /tv-series/:id/episodes` - Get episodes for TV series
- `POST /tv-series` - Create new TV series (admin)
- `PUT /tv-series/:id` - Update TV series (admin)
- `DELETE /tv-series/:id` - Delete TV series (admin)

### Trakt Integration

- `GET /trakt/trending` - Get trending movies from Trakt
- `GET /trakt/popular` - Get popular movies from Trakt
- `GET /trakt/search` - Search movies on Trakt

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
NODE_ENV=production
PORT=3000

# JWT Configuration
JWT_SECRET=your_super_secure_jwt_secret_here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Database Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name

# Redis Configuration (Optional)
REDIS_URL=redis://localhost:6379

# External API Keys
TMDB_API_KEY=your_tmdb_api_key_here
TMDB_API_URL=https://api.themoviedb.org/3

TRAKT_CLIENT_ID=your_trakt_client_id_here
TRAKT_CLIENT_SECRET=your_trakt_client_secret_here
TRAKT_API_URL=https://api.trakt.tv

# CORS Configuration
CORS_ORIGIN=https://your-frontend-domain.com
CORS_CREDENTIALS=true

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000

# Swagger Configuration
SWAGGER_TITLE=Movie Streaming Backend API
SWAGGER_DESCRIPTION=API for Movie Streaming Backend
SWAGGER_VERSION=1.0.0
SWAGGER_HOST=api.yourdomain.com
```

## Installation

1. Clone the repository:

```bash
git clone https://github.com/your-username/movie-streaming-backend.git
cd movie-streaming-backend
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up MongoDB:

- Create a MongoDB Atlas account or use local MongoDB
- Update `MONGODB_URI` in your `.env` file

5. Set up Redis (Optional):

- Install Redis locally or use Redis Cloud
- Update `REDIS_URL` in your `.env` file

6. Get API keys:

- [TMDB API Key](https://www.themoviedb.org/documentation/api)
- [Trakt API Key](https://trakt.tv/oauth/applications)

7. Build the project:

```bash
pnpm run build
```

8. Start the server:

```bash
pnpm start
```

## Development

### Start in development mode:

```bash
pnpm run dev
```

### Run tests:

```bash
pnpm test
```

### Run tests in watch mode:

```bash
pnpm run test:watch
```

### Lint code:

```bash
pnpm run lint
```

### Fix linting issues:

```bash
pnpm run lint:fix
```

## API Documentation

Once the server is running, you can access the interactive API documentation at:

- `http://localhost:3000/docs` (Swagger UI)

## Project Structure

```
src/
├── config/           # Configuration files
│   ├── database.ts   # MongoDB connection
│   ├── environment.ts # Environment variables
│   └── redis.ts      # Redis connection
├── middleware/       # Custom middleware
│   └── auth.ts       # Authentication middleware
├── models/           # Database models
│   └── user.ts       # User model
├── routes/           # API routes
│   ├── auth.ts       # Authentication routes
│   ├── movies.ts     # Movie routes
│   ├── tvSeries.ts   # TV series routes
│   └── trakt.ts      # Trakt integration routes
├── services/         # Business logic
│   ├── movieService.ts
│   ├── tmdbService.ts
│   ├── traktService.ts
│   ├── tvSeriesService.ts
│   └── userService.ts
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
│   ├── errorHandler.ts
│   ├── jwt.ts
│   ├── refreshToken.ts
│   └── sanitizer.ts
└── server.ts         # Main server file
```

## Security Features

- JWT-based authentication with refresh tokens
- Rate limiting to prevent abuse
- CORS configuration for cross-origin requests
- Helmet for security headers
- Input sanitization to prevent XSS attacks
- Comprehensive error handling
- Request logging for security monitoring

## Deployment

### Render.com (Recommended)

1. Create a Render account
2. Connect your GitHub repository
3. Configure environment variables
4. Set build command: `pnpm run build`
5. Set start command: `pnpm start`

### Heroku

1. Create a Heroku account
2. Install Heroku CLI
3. Run `heroku create`
4. Set environment variables: `heroku config:set VAR=value`
5. Deploy: `git push heroku main`

### Railway.app

1. Create a Railway account
2. Connect your GitHub repository
3. Configure environment variables
4. Deploy automatically

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit your changes: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin feature/new-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/your-username/movie-streaming-backend/issues) page
2. Create a new issue with detailed description
3. Provide steps to reproduce the problem

## Acknowledgments

- [Fastify](https://www.fastify.io/) for the amazing web framework
- [MongoDB](https://www.mongodb.com/) for the excellent database
- [Redis](https://redis.io/) for the fast caching solution
- [TMDB](https://www.themoviedb.org/) for the movie database API
- [Trakt](https://trakt.tv/) for the TV and movie tracking API
