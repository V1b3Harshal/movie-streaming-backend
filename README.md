# Movie Streaming Backend

A comprehensive backend API for movie streaming platform with content discovery, user management, and real-time features.

## 🚀 Features

### Core Services

- **Content Discovery**: TMDB and Trakt integration for movies/TV shows
- **User Management**: Profiles, watch history, favorites, sessions
- **Authentication**: Supabase JWT authentication
- **Search**: Algolia-powered instant search and suggestions
- **Caching**: Redis-based performance optimization
- **Real-time**: WebSocket support for watch-together

### Monitoring & Analytics

- **Better Uptime**: 24/7 health monitoring (50 monitors free)
- **OneSignal**: Push notifications (10K users free)
- **PostHog**: User analytics and event tracking (1M events free)
- **Sentry**: Error tracking and performance monitoring (free tier)
- **ImageKit**: Image optimization (20GB bandwidth free)

### Security & Performance

- **Rate Limiting**: Distributed rate limiting with Redis
- **Security Headers**: Helmet.js integration
- **IP Blocking**: Suspicious activity detection
- **Request Validation**: Input sanitization and validation
- **Webhook Monitoring**: Real-time alerts and notifications

## 📡 API Endpoints

### Content Discovery

```bash
GET  /movies/search?query=batman     # TMDB movie search
GET  /movies/trending                # Trending movies
GET  /tv-series/search?query=stranger # TV series search
GET  /tv-series/trending             # Trending TV shows
GET  /trakt/movies/trending          # Trakt trending
```

### Search & Suggestions

```bash
GET  /movies/search/instant?q=bat    # Algolia instant search
GET  /movies/search/suggestions?q=ba # Autocomplete suggestions
```

### User Management (Requires Auth)

```bash
GET  /user/profile                   # User profile
GET  /user/watch-history             # Watch history
POST /user/session/start             # Start watch session
PUT  /user/session/:id/progress      # Update progress
POST /user/favorites/:contentId      # Toggle favorites
```

### Providers (Proxy to Providers Backend)

```bash
GET  /providers/list                 # Available providers
GET  /providers/:provider/:id       # Embed URLs
```

### Watch Together (Proxy to Providers Backend)

```bash
GET  /watch-together/rooms           # Active rooms
POST /watch-together/rooms           # Create room
```

### Monitoring

```bash
GET  /health                         # Service health
GET  /security/status                # Security config
GET  /health/providers               # Providers backend health
```

## 🛠️ Setup & Installation

### Prerequisites

- Node.js 18+
- Railway account (free)
- Supabase project
- Upstash Redis (free tier)
- TMDB API key

### Local Development

```bash
npm install
cp .env.example .env  # Configure environment variables
npm run dev          # Start development server
```

### Environment Variables

```bash
# Core
NODE_ENV=development
PORT=3000
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
UPSTASH_REDIS_REST_URL=your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# APIs
TMDB_API_KEY=your-tmdb-key
ONESIGNAL_APP_ID=your-onesignal-id
ONESIGNAL_REST_API_KEY=your-onesignal-key

# Monitoring (Optional)
SENTRY_DSN=your-sentry-dsn
POSTHOG_API_KEY=your-posthog-key
BETTER_UPTIME_API_KEY=your-betteruptime-key
ALGOLIA_APP_ID=your-algolia-id
ALGOLIA_API_KEY=your-algolia-key

# Providers Backend Integration
PROVIDERS_BACKEND_URL=http://localhost:3001
INTERNAL_API_KEY=your-internal-key
```

### Deployment

```bash
railway init
railway up
# Set environment variables in Railway dashboard
railway deploy
```

## 🔗 Architecture

This backend serves as the main API for content discovery and user management:

- **Main Backend**: Content search, user profiles, watch history
- **Providers Backend**: Streaming providers, watch-together, real-time features

## 📊 Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Fastify
- **Database**: Supabase PostgreSQL
- **Cache**: Upstash Redis
- **Auth**: Supabase JWT
- **Search**: Algolia (instant search)
- **Monitoring**: Better Uptime, Sentry, PostHog
- **Notifications**: OneSignal
- **CDN**: Cloudflare

## 📈 Performance & Monitoring

- **Health Checks**: `/health` endpoint with service monitoring
- **Rate Limiting**: Redis-based distributed rate limiting
- **Caching**: TTL-based caching for API responses
- **Analytics**: PostHog event tracking and user behavior
- **Error Tracking**: Sentry integration with performance monitoring
- **Search**: Algolia-powered instant search and autocomplete

## 🔒 Security

- Supabase JWT authentication for protected routes
- Rate limiting and request sanitization
- Security headers via Helmet.js
- IP blocking for suspicious activity
- CSRF protection and input validation

## 📝 License

MIT License
