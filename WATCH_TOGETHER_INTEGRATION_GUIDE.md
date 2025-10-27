# Watch Together Feature Integration Guide

## Overview

The Watch Together feature has been successfully implemented across both backends with real-time synchronization capabilities. This guide provides comprehensive information on how to integrate and use this feature.

## Architecture

### Backend Separation

- **Main Backend** (Port 3000): Handles authentication, user management, and API routing
- **Providers Backend** (Port 3001): Handles WebSocket connections, real-time sync, and provider management

### Key Features Implemented

- ✅ Real-time media synchronization
- ✅ Room creation and management
- ✅ Admin controls (transfer admin, kick users)
- ✅ Provider switching (VidNest, VidSrc, EmbedStream)
- ✅ Media change capabilities
- ✅ Episode switching for TV shows
- ✅ Playback state synchronization
- ✅ Heartbeat mechanism for connection health
- ✅ Automatic room cleanup
- ✅ Redis-based state management

## API Endpoints

### Main Backend (Port 3000)

#### Room Management

```typescript
// Create a new watch-together room
POST /auth/watch-together/rooms
{
  "name": "Movie Night",
  "mediaId": "666243",
  "mediaType": "movie",
  "adminId": "user123",
  "providerId": "vidnest" // optional, defaults to 'vidnest'
}

// Join a room
POST /auth/watch-together/rooms/:roomId/join
{
  "userId": "user456"
}

// Leave a room
POST /auth/watch-together/rooms/:roomId/leave
{
  "userId": "user456"
}

// Get room information
GET /auth/watch-together/rooms/:roomId

// Get all rooms
GET /auth/watch-together/rooms

// Get room statistics
GET /auth/watch-together/stats
```

#### Playback Control

```typescript
// Send playback action
POST /auth/watch-together/rooms/:roomId/playback
{
  "action": {
    "type": "play" | "pause" | "seek" | "setPlaybackRate" | "updateTime" | "changeEpisode" | "changeProvider" | "changeMedia",
    "data": {
      "currentTime": 120, // for seek/updateTime
      "rate": 1.5, // for setPlaybackRate
      "episode": 2, // for changeEpisode
      "provider": "vidsrc", // for changeProvider
      "mediaId": "123456" // for changeMedia
    }
  },
  "userId": "user123"
}

// Request sync state
POST /auth/watch-together/rooms/:roomId/sync
{
  "userId": "user456"
}
```

#### Admin Controls

```typescript
// Transfer admin ownership
POST /auth/watch-together/rooms/:roomId/transfer-admin
{
  "currentAdminId": "user123",
  "newAdminId": "user456"
}

// Kick user from room
POST /auth/watch-together/rooms/:roomId/kick-user
{
  "adminId": "user123",
  "userIdToKick": "user789"
}

// Get available providers
GET /auth/watch-together/providers
```

### Providers Backend (Port 3001)

#### WebSocket Events

```typescript
// Client events
socket.emit("create_room", { name, mediaId, mediaType, adminId, providerId });
socket.emit("join_room", { roomId, userId });
socket.emit("leave_room", { roomId, userId });
socket.emit("playback_action", { roomId, action, userId });
socket.emit("sync_request", { roomId, userId });
socket.emit("heartbeat", { roomId, userId });

// Server events
socket.on("room_created", (room) => {});
socket.on("user_joined", ({ userId, participants }) => {});
socket.on("user_left", ({ userId, participants }) => {});
socket.on("playback_updated", ({ action, state, userId, timestamp }) => {});
socket.on("episode_changed", ({ action, state, userId, timestamp }) => {});
socket.on("provider_changed", ({ action, state, userId, timestamp }) => {});
socket.on("media_changed", ({ action, state, userId, timestamp }) => {});
socket.on("admin_changed", ({ newAdmin, oldAdmin, participants }) => {});
socket.on("user_kicked", ({ kickedUserId, participants }) => {});
socket.on("initial_state", ({ currentState, participants }) => {});
socket.on("sync_response", ({ currentState, timestamp, adminId }) => {});
```

## Frontend Integration

### 1. Setup Connection

```typescript
import io from "socket.io-client";

const socket = io("http://localhost:3001", {
  transports: ["websocket"],
  timeout: 10000,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
```

### 2. Room Creation

```typescript
async function createRoom(
  name: string,
  mediaId: string,
  mediaType: "movie" | "tv",
  adminId: string,
  providerId?: string
) {
  try {
    const response = await fetch(
      "http://localhost:3000/auth/watch-together/rooms",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, mediaId, mediaType, adminId, providerId }),
      }
    );

    const room = await response.json();
    return room.data;
  } catch (error) {
    console.error("Error creating room:", error);
  }
}
```

### 3. Join Room

```typescript
async function joinRoom(roomId: string, userId: string) {
  try {
    const response = await fetch(
      `http://localhost:3000/auth/watch-together/rooms/${roomId}/join`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      }
    );

    return await response.json();
  } catch (error) {
    console.error("Error joining room:", error);
  }
}
```

### 4. WebSocket Integration

```typescript
// Connect to room
socket.emit("join_room", { roomId, userId });

// Listen for room updates
socket.on("user_joined", (data) => {
  updateUserList(data.participants);
});

socket.on("user_left", (data) => {
  updateUserList(data.participants);
});

socket.on("playback_updated", (data) => {
  updatePlayerState(data.state);
});

socket.on("admin_changed", (data) => {
  updateAdminDisplay(data.newAdmin);
});

// Send playback actions
function sendPlaybackAction(action: PlaybackAction) {
  socket.emit("playback_action", {
    roomId: currentRoomId,
    action,
    userId: currentUser.id,
  });
}

// Request sync state
function requestSync() {
  socket.emit("sync_request", {
    roomId: currentRoomId,
    userId: currentUser.id,
  });
}

// Send heartbeat
function sendHeartbeat() {
  socket.emit("heartbeat", {
    roomId: currentRoomId,
    userId: currentUser.id,
  });
}
```

### 5. Player Integration

```typescript
class SyncPlayer {
  private video: HTMLVideoElement;
  private socket: Socket;
  private roomId: string;
  private userId: string;
  private isAdmin: boolean = false;

  constructor(
    video: HTMLVideoElement,
    socket: Socket,
    roomId: string,
    userId: string
  ) {
    this.video = video;
    this.socket = socket;
    this.roomId = roomId;
    this.userId = userId;

    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Sync video events with WebSocket
    this.video.addEventListener("play", () => {
      this.sendPlaybackAction({ type: "play", data: {} });
    });

    this.video.addEventListener("pause", () => {
      this.sendPlaybackAction({ type: "pause", data: {} });
    });

    this.video.addEventListener("timeupdate", () => {
      this.sendPlaybackAction({
        type: "updateTime",
        data: { currentTime: this.video.currentTime },
      });
    });

    this.video.addEventListener("seeked", () => {
      this.sendPlaybackAction({
        type: "seek",
        data: { currentTime: this.video.currentTime },
      });
    });

    // Listen for sync updates
    this.socket.on("playback_updated", (data) => {
      if (data.userId !== this.userId) {
        this.applySyncState(data.state);
      }
    });

    this.socket.on("initial_state", (data) => {
      this.applySyncState(data.currentState);
    });
  }

  private sendPlaybackAction(action: PlaybackAction) {
    if (
      this.isAdmin ||
      !["changeMedia", "changeProvider", "changeEpisode"].includes(action.type)
    ) {
      this.socket.emit("playback_action", {
        roomId: this.roomId,
        action,
        userId: this.userId,
      });
    }
  }

  private applySyncState(state: PlaybackState) {
    // Apply sync state to player
    if (state.isPlaying && this.video.paused) {
      this.video.play();
    } else if (!state.isPlaying && !this.video.paused) {
      this.video.pause();
    }

    // Smooth time synchronization
    const timeDiff = Math.abs(this.video.currentTime - state.currentTime);
    if (timeDiff > 0.5) {
      this.video.currentTime = state.currentTime;
    }
  }

  setAdmin(isAdmin: boolean) {
    this.isAdmin = isAdmin;
  }
}
```

## Provider Integration

### Available Providers

1. **VidNest** (`vidnest`)

   - Base URL: `https://vidnest.fun`
   - Template: `<iframe src="https://vidnest.fun/movie/{id}" frameborder="0" scrolling="no" allowfullscreen></iframe>`

2. **VidSrc** (`vidsrc`)

   - Base URL: `https://vidsrc.to`
   - Template: `<iframe src="https://vidsrc.to/embed-{id}" frameborder="0" scrolling="no" allowfullscreen></iframe>`

3. **EmbedStream** (`embed`)
   - Base URL: `https://embed.stream`
   - Template: `<iframe src="https://embed.stream/embed/{id}" frameborder="0" scrolling="no" allowfullscreen></iframe>`

### Provider Switching

```typescript
async function switchProvider(
  roomId: string,
  newProvider: string,
  mediaId: string
) {
  const action = {
    type: "changeProvider" as const,
    data: { provider: newProvider },
  };

  await sendPlaybackAction(action);

  // Update iframe source
  const iframe = document.querySelector("iframe");
  const newUrl = generateProviderUrl(newProvider, mediaId);
  iframe.src = newUrl;
}

function generateProviderUrl(providerId: string, mediaId: string): string {
  const providers = {
    vidnest: `https://vidnest.fun/movie/${mediaId}`,
    vidsrc: `https://vidsrc.to/embed-${mediaId}`,
    embed: `https://embed.stream/embed/${mediaId}`,
  };

  return providers[providerId] || providers.vidnest;
}
```

## Performance Optimizations

### 1. Free Tier Deployment

- **Redis**: Using Upstash Redis for state management (free tier available)
- **WebSocket**: Socket.IO with Redis adapter for horizontal scaling
- **Rate Limiting**: Built-in rate limiting to prevent abuse
- **Connection Pooling**: Efficient connection management
- **Caching**: Redis caching for frequently accessed data

### 2. Memory Management

- **Automatic Cleanup**: Rooms are cleaned up after 24 hours of inactivity
- **Heartbeat Mechanism**: Regular heartbeat to track active connections
- **Connection Limits**: Maximum 10 participants per room
- **State Compression**: Efficient state serialization

### 3. Error Handling

- **Graceful Degradation**: Fallback mechanisms for WebSocket failures
- **Retry Logic**: Automatic reconnection with exponential backoff
- **Error Boundaries**: Comprehensive error handling throughout the stack
- **Logging**: Structured logging for debugging

## Deployment Instructions

### Railway Deployment

1. **Main Backend**

   ```bash
   # Create service
   railway init

   # Set environment variables
   railway variable set NODE_ENV production
   railway variable set JWT_SECRET your-secret-key
   railway variable set MONGODB_URI your-mongodb-uri
   railway variable set REDIS_URL your-redis-url
   railway variable set PROVIDERS_BACKEND_URL https://your-providers-backend.railway.app
   railway variable set INTERNAL_API_KEY your-internal-api-key
   railway variable set CORS_ORIGIN https://your-frontend-url
   ```

2. **Providers Backend**

   ```bash
   # Create service
   railway init

   # Set environment variables
   railway variable set NODE_ENV production
   railway variable set PORT 3001
   railway variable set REDIS_URL your-redis-url
   railway variable set INTERNAL_API_KEY your-internal-api-key
   railway variable set CORS_ORIGIN https://your-frontend-url
   ```

### Environment Variables

```env
# Main Backend (.env)
NODE_ENV=production
PORT=3000
JWT_SECRET=your-super-secret-jwt-key
MONGODB_URI=mongodb://localhost:27017/moviestream
REDIS_URL=redis://localhost:6379
PROVIDERS_BACKEND_URL=https://providers-backend.railway.app
INTERNAL_API_KEY=your-internal-api-key
CORS_ORIGIN=https://your-frontend-url

# Providers Backend (.env)
NODE_ENV=production
PORT=3001
REDIS_URL=redis://localhost:6379
INTERNAL_API_KEY=your-internal-api-key
CORS_ORIGIN=https://your-frontend-url
```

## Troubleshooting

### Common Issues

1. **WebSocket Connection Issues**

   - Check CORS settings
   - Verify Redis connection
   - Ensure proper port configuration

2. **Sync Problems**

   - Verify user is in the room
   - Check admin permissions
   - Ensure heartbeat is being sent

3. **Provider Issues**
   - Verify provider URL format
   - Check media ID validity
   - Ensure provider is enabled

### Debug Commands

```bash
# Check Redis connection
redis-cli ping

# Check WebSocket connections
curl -I http://localhost:3001/socket.io/

# Monitor room activity
redis-cli --scan --pattern "room:*"
```

## Best Practices

1. **Security**

   - Always validate user permissions
   - Use HTTPS in production
   - Implement proper rate limiting
   - Sanitize all user inputs

2. **Performance**

   - Use heartbeat mechanism
   - Implement proper error handling
   - Monitor Redis memory usage
   - Optimize WebSocket message size

3. **User Experience**
   - Provide clear error messages
   - Implement loading states
   - Add connection status indicators
   - Handle disconnections gracefully

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review the API documentation
3. Check browser console for errors
4. Verify network connectivity

## Future Enhancements

1. **Video Quality Selection**
2. **Subtitle Synchronization**
3. **Chat Integration**
4. **Screen Sharing**
5. **Mobile App Support**
6. **Advanced Analytics**
