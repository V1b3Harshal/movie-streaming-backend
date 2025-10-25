# Migration Guide: Redis Cloud to Upstash Redis

## Why Migrate to Upstash Redis?

### Benefits for Your Project:

- **Better Performance**: Global edge network (faster response times)
- **Real-time Ready**: Optimized for WebSocket pub/sub (perfect for "Watch Together")
- **Serverless Optimized**: Built for Railway/Vercel deployment
- **Cost-Effective**: Free tier available
- **Consistent Architecture**: Same Redis setup across both services
- **Easy Integration**: Simple REST API + Redis client

## Step 1: Create Upstash Redis Account

1. **Sign up**: Go to [https://upstash.com/](https://upstash.com/)
2. **Create Database**: Select Redis database
3. **Choose Region**: Select region closest to your users
4. **Get Connection String**: Copy the Redis URL from dashboard

## Step 2: Update Environment Variables

### Current Redis Cloud Configuration:

```env
REDIS_URL=redis://default:brjvXIxwAvaZ3iMN9G2jrZpaBjFztz9F@redis-11003.c244.us-east-1-2.ec2.redns.redis-cloud.com:11003
REDIS_PASSWORD=brjvXIxwAvaZ3iMN9G2jrZpaBjFztz9F
```

### New Upstash Configuration:

```env
REDIS_URL=your-upstash-redis-url
```

## Step 3: Update Railway Dashboard

### Main Backend Railway Environment Variables:

```env
# Replace Redis Cloud URL with Upstash URL
REDIS_URL=your-upstash-redis-url

# Keep existing variables
INTERNAL_API_KEY=5ef0ad5c74b1c1a361c289ae1f71aa5ce3bf90b06b3effd9fb9cd13d636c9163
PROVIDERS_BACKEND_URL=https://your-providers-backend.railway.app
```

### Providers Backend Railway Environment Variables:

```env
INTERNAL_API_KEY=5ef0ad5c74b1c1a361c289ae1f71aa5ce3bf90b06b3effd9fb9cd13d636c9163
REDIS_URL=your-upstash-redis-url
TMDB_API_KEY=your-tmdb-api-key
CORS_ORIGIN=https://your-main-backend.railway.app
```

## Step 4: Test the Migration

### Test Commands:

```bash
# Test Redis connection
redis-cli -u your-upstash-redis-url ping

# Test basic operations
redis-cli -u your-upstash-redis-url set test "Hello Upstash"
redis-cli -u your-upstash-redis-url get test
```

### Test in Application:

```bash
# Start your main backend
npm run dev

# Test health endpoint
curl http://localhost:3000/health
```

## Step 5: Deploy Changes

1. **Update .env file** with new Redis URL
2. **Commit changes** to GitHub
3. **Push to Railway** - Railway will automatically redeploy
4. **Monitor logs** for any Redis connection issues

## Step 6: Verify Functionality

### Test "Watch Together" Features:

1. Create a WebSocket room
2. Test room persistence
3. Test proxy caching
4. Test provider caching

### Test Provider Integration:

1. Test provider embed URLs
2. Test provider status checks
3. Test provider list

## Upstash Redis Features for Your Use Case

### 🎬 "Watch Together" Features:

- **Pub/Sub**: Real-time room updates
- **Lists**: Room participant management
- **Hashes**: Room state storage
- **TTL**: Automatic cleanup of expired rooms

### 🔄 Proxy Management:

- **Sets**: Healthy proxy tracking
- **Hashes**: Proxy health status
- **TTL**: Proxy health caching

### 🎬 Provider Caching:

- **Strings**: Provider responses
- **Hashes**: Provider metadata
- **TTL**: 6-hour cache expiration

## Troubleshooting

### Common Issues:

1. **Connection Error**: Check Redis URL format
2. **Permission Error**: Verify Upstash database permissions
3. **Timeout Error**: Check network connectivity

### Debug Commands:

```bash
# Check Redis connection
redis-cli -u your-upstash-redis-url info

# Test specific operations
redis-cli -u your-upstash-redis-url keys "*"
```

## Benefits Summary

### Performance:

- **Lower Latency**: Global edge network
- **Faster Responses**: Optimized for serverless
- **Better UX**: Real-time updates

### Reliability:

- **High Availability**: 99.9% uptime
- **Auto-scaling**: Handles traffic spikes
- **Global Coverage**: Multiple regions

### Cost:

- **Free Tier**: Generous free tier available
- **Pay-per-use**: Only pay for what you use
- **No Overheads**: No server management

### Development:

- **Easy Setup**: Simple configuration
- **Great Documentation**: Clear API docs
- **Active Community**: Good support

## Conclusion

Migrating to Upstash Redis will:

1. **Improve Performance**: Faster responses for your users
2. **Enhance Real-time Features**: Better WebSocket support
3. **Simplify Architecture**: Consistent Redis setup
4. **Reduce Costs**: Free tier available
5. **Improve Scalability**: Ready for growth

The migration is straightforward and will provide significant benefits for your streaming platform!
