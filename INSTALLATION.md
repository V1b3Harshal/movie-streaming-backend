# Installation Guide

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn

## Installation Steps

1. **Install dependencies**

```bash
npm install
```

2. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Configure Upstash Redis**

- Set your Upstash credentials in the .env file (already configured):

```
UPSTASH_REDIS_REST_URL=https://your-upstash-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-token
```

- No need to install Redis locally - Upstash handles everything!

5. **Start the application**

```bash
# Development mode:
npm run dev

# Production:
npm run build
npm start
```

## Environment Variables

Required variables:

- `JWT_SECRET`: Your JWT secret key (minimum 32 characters)
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `TMDB_API_KEY`: The Movie Database API key
- `TRAKT_CLIENT_ID`: Trakt.tv client ID
- `PROVIDERS_BACKEND_URL`: URL to your providers backend
- `INTERNAL_API_KEY`: Internal API key for backend communication

Core services (Free tier):

- `UPSTASH_REDIS_REST_URL`: Upstash Redis URL
- `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis token
- `SENTRY_DSN`: Sentry error tracking DSN
- `POSTHOG_API_KEY`: PostHog analytics API key
- `BETTER_UPTIME_HEARTBEAT_URL`: Better Uptime monitoring URL

Optional variables:

- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 3000)
- `FRONTEND_URL`: Frontend URL for CORS
- `FIREBASE_PROJECT_ID`: Firebase project ID (for push notifications)
- `CLOUDFLARE_API_TOKEN`: Cloudflare API token

## Troubleshooting

### Redis Connection Issues

If you see Redis connection errors:

1. Check your Upstash credentials in .env file:

   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

2. Verify your Upstash dashboard for correct connection details

3. Ensure your network allows connections to Upstash endpoints

### Supabase Connection Issues

- Ensure your Supabase project is active
- Check your SUPABASE_URL and keys format
- For production, ensure Row Level Security is configured

### TypeScript Errors

If you encounter TypeScript errors during development:

1. Run `npm install` to ensure all dependencies are installed
2. Restart your IDE or run `npm run dev` again
