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
- `MONGODB_URI`: MongoDB connection string
- `TMDB_API_KEY`: The Movie Database API key
- `TRAKT_CLIENT_ID`: Trakt.tv client ID
- `PROVIDERS_BACKEND_URL`: URL to your providers backend
- `INTERNAL_API_KEY`: Internal API key for backend communication

Optional variables:

- `REDIS_URL`: Redis connection string (for traditional Redis)
- `UPSTASH_REDIS_URL`: Upstash Redis URL
- `UPSTASH_REDIS_TOKEN`: Upstash Redis token
- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 3000)
- `FRONTEND_URL`: Frontend URL for CORS

## Troubleshooting

### Redis Connection Issues

If you see Redis connection errors:

1. Check your Upstash credentials in .env file:

   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

2. Verify your Upstash dashboard for correct connection details

3. Ensure your network allows connections to Upstash endpoints

### MongoDB Connection Issues

- Ensure MongoDB is running
- Check your MONGODB_URI format
- For production, ensure SSL/TLS is enabled

### TypeScript Errors

If you encounter TypeScript errors during development:

1. Run `npm install` to ensure all dependencies are installed
2. Restart your IDE or run `npm run dev` again
