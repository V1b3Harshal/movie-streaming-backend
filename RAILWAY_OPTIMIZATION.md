# Railway Performance Optimization Guide

## Overview

This guide provides specific optimizations for deploying the Watch Together feature on Railway's free tier, ensuring optimal performance and resource usage.

## Free Tier Limitations & Optimizations

### 1. Memory Management

**Challenge**: Railway free tier has memory limits
**Solution**:

- Implement Redis for state management instead of in-memory storage
- Use efficient data structures
- Implement automatic cleanup

**Configuration**:

```env
# Redis Configuration
REDIS_URL=your-upstash-redis-url
REDIS_MAX_MEMORY=256mb
REDIS_MAX_MEMORY_POLICY=allkeys-lru

# Application Settings
NODE_ENV=production
MAX_PARTICIPANTS_PER_ROOM=10
ROOM_CLEANUP_INTERVAL=86400000  # 24 hours
```

### 2. CPU Optimization

**Challenge**: Limited CPU resources
**Solution**:

- Implement connection pooling
- Use efficient algorithms
- Minimize blocking operations

**Optimizations**:

```typescript
// Use connection pooling for HTTP requests
const axiosInstance = axios.create({
  timeout: 5000,
  maxRedirects: 5,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
});

// Efficient state management
const roomStateCache = new Map<string, RoomState>();
const MAX_CACHE_SIZE = 100;

function getRoomState(roomId: string): RoomState | null {
  return roomStateCache.get(roomId) || null;
}

function setRoomState(roomId: string, state: RoomState): void {
  roomStateCache.set(roomId, state);

  // Simple LRU cache eviction
  if (roomStateCache.size > MAX_CACHE_SIZE) {
    const firstKey = roomStateCache.keys().next().value;
    roomStateCache.delete(firstKey);
  }
}
```

### 3. Network Optimization

**Challenge**: Limited network bandwidth
**Solution**:

- Implement message compression
- Use efficient WebSocket protocols
- Minimize unnecessary data transfer

**WebSocket Configuration**:

```typescript
// Optimized WebSocket setup
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket"],
  upgrade: false,
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB
  allowEIO3: false,
});

// Message compression
io.engine.generateId = function (req) {
  return Math.random().toString(36).substr(2, 9);
};
```

## Railway-Specific Optimizations

### 1. Service Scaling

**Configuration**:

```toml
# railway.toml
[build]
command = "npm run build"

[deploy]
startCommand = "npm start"

[env]
NODE_ENV = "production"
PORT = "3001"

[service]
healthcheck = "/health"
healthcheckInterval = 30
healthcheckTimeout = 10
```

### 2. Resource Limits

**Environment Variables**:

```env
# Memory optimization
NODE_OPTIONS="--max-old-space-size=256"

# Database connection pooling
MONGODB_POOL_SIZE=5
MONGODB_POOL_MIN=2
MONGODB_POOL_MAX=5

# Redis optimization
REDIS_MAX_CLIENTS=10
REDIS_TIMEOUT=30000

# Rate limiting
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
```

### 3. Caching Strategy

**Redis Configuration**:

```typescript
// Optimized Redis setup
import { createClient } from "redis";

const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 1000),
  },
});

// Connection pooling
const redisPool = [];
const MAX_POOL_SIZE = 5;

async function getRedisConnection() {
  if (redisPool.length > 0) {
    return redisPool.pop();
  }
  return createClient({ url: process.env.REDIS_URL });
}

async function releaseRedisConnection(client) {
  if (redisPool.length < MAX_POOL_SIZE) {
    redisPool.push(client);
  } else {
    await client.quit();
  }
}
```

## Performance Monitoring

### 1. Metrics Collection

```typescript
// Performance monitoring
const performanceMetrics = {
  rooms: {
    total: 0,
    active: 0,
    totalParticipants: 0,
    averageParticipants: 0,
  },
  websocket: {
    connections: 0,
    messagesPerSecond: 0,
    averageLatency: 0,
  },
  memory: {
    usage: 0,
    limit:
      process.env.NODE_OPTIONS?.match(/--max-old-space-size=(\d+)/)?.[1] ||
      "512",
  },
};

// Monitor memory usage
setInterval(() => {
  const memoryUsage = process.memoryUsage();
  performanceMetrics.memory.usage = Math.round(
    memoryUsage.heapUsed / 1024 / 1024
  );

  if (performanceMetrics.memory.usage > performanceMetrics.memory.limit * 0.8) {
    console.warn(
      "High memory usage detected:",
      performanceMetrics.memory.usage
    );
  }
}, 30000);
```

### 2. Health Checks

```typescript
// Enhanced health check
fastify.get("/health", async (request, reply) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "providers-backend",
    version: "1.0.0",
    metrics: {
      memory: performanceMetrics.memory,
      rooms: performanceMetrics.rooms,
      uptime: process.uptime(),
    },
    checks: {
      redis: await checkRedisHealth(),
      websocket: performanceMetrics.websocket.connections > 0,
    },
  };

  return health;
});

async function checkRedisHealth() {
  try {
    await redisClient.ping();
    return { status: "healthy", latency: Date.now() };
  } catch (error) {
    return { status: "unhealthy", error: error.message };
  }
}
```

## Cost Optimization

### 1. Database Optimization

```typescript
// Efficient MongoDB queries
const getRoomsWithParticipants = async () => {
  return await db
    .collection("rooms")
    .find({
      participants: { $exists: true, $ne: [] },
    })
    .project({
      participants: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .toArray();
};

// Index optimization
await db.collection("rooms").createIndex({
  participants: 1,
  updatedAt: -1,
});
```

### 2. Redis Optimization

```typescript
// Efficient Redis operations
const ROOM_EXPIRY = 86400; // 24 hours

async function setRoomWithExpiry(roomId: string, room: Room) {
  await redisClient.setex(`room:${roomId}`, ROOM_EXPIRY, JSON.stringify(room));
}

async function addParticipantWithExpiry(roomId: string, userId: string) {
  const key = `room:${roomId}:participants`;
  await redisClient.sadd(key, userId);
  await redisClient.expire(key, ROOM_EXPIRY);
}
```

### 3. Network Optimization

```typescript
// Efficient WebSocket message handling
const messageQueue = new Map<string, any[]>();

function queueMessage(roomId: string, message: any) {
  if (!messageQueue.has(roomId)) {
    messageQueue.set(roomId, []);
  }
  messageQueue.get(roomId)!.push(message);

  // Process queue
  processMessageQueue(roomId);
}

async function processMessageQueue(roomId: string) {
  const messages = messageQueue.get(roomId) || [];
  if (messages.length === 0) return;

  // Batch process messages
  const batch = messages.splice(0, 10); // Process 10 messages at a time
  for (const message of batch) {
    await io.to(roomId).emit(message.event, message.data);
  }

  // Clean up empty queue
  if (messages.length === 0) {
    messageQueue.delete(roomId);
  }
}
```

## Deployment Checklist

### Before Deployment

- [ ] Set up Redis connection
- [ ] Configure environment variables
- [ ] Implement health checks
- [ ] Set up monitoring
- [ ] Test with multiple participants
- [ ] Verify error handling

### After Deployment

- [ ] Monitor memory usage
- [ ] Check WebSocket connections
- [ ] Verify Redis performance
- [ ] Monitor error rates
- [ ] Check response times
- [ ] Review logs for issues

## Troubleshooting Common Issues

### 1. Memory Issues

**Symptoms**: Slow response times, crashes
**Solutions**:

- Increase Redis cache efficiency
- Implement more aggressive cleanup
- Reduce message frequency
- Use connection pooling

### 2. WebSocket Issues

**Symptoms**: Connection drops, sync problems
**Solutions**:

- Check WebSocket timeout settings
- Implement heartbeat mechanism
- Use connection retry logic
- Monitor connection count

### 3. Database Issues

**Symptoms**: Slow queries, timeouts
**Solutions**:

- Optimize database queries
- Add proper indexes
- Implement connection pooling
- Use caching for frequent queries

## Performance Testing

### Load Testing Commands

```bash
# Test WebSocket connections
npx artillery quick-test -t 100 -d 30 ws://localhost:3001/socket.io/ --count 1000

# Test API endpoints
npx artillery quick-test -t 50 -d 60 http://localhost:3000/health --count 500

# Test room creation
npx artillery quick-test -t 20 -d 30 http://localhost:3000/watch-together/rooms --count 200
```

### Monitoring Commands

```bash
# Monitor memory usage
node -e "setInterval(() => console.log('Memory:', process.memoryUsage().heapUsed / 1024 / 1024 + 'MB'), 5000)"

# Monitor Redis connections
redis-cli info clients

# Monitor WebSocket connections
curl -s http://localhost:3001/stats | jq '.websocket.connections'
```

## Conclusion

By implementing these optimizations, the Watch Together feature will perform well on Railway's free tier while providing a seamless real-time experience for users. The key is to leverage Redis for state management, implement efficient algorithms, and monitor performance metrics proactively.
