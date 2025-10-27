import { Server as SocketIOServer } from 'socket.io';
import { Server } from 'http';

interface SocketUser {
  userId: string;
  roomId: string;
  socketId: string;
}

interface RoomMessage {
  roomId: string;
  action: string;
  data: any;
  userId: string;
  timestamp: number;
}

export class WebSocketService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, SocketUser> = new Map();
  private roomSockets: Map<string, Set<string>> = new Map();

  constructor(server: Server) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`[WebSocket] User connected: ${socket.id}`);

      // Join a room for sync
      socket.on('join-room', (data: { roomId: string; userId: string }) => {
        const { roomId, userId } = data;
        
        if (!roomId || !userId) {
          socket.emit('error', { message: 'Missing roomId or userId' });
          return;
        }

        // Join the room
        socket.join(roomId);
        
        // Track user
        this.connectedUsers.set(socket.id, {
          userId,
          roomId,
          socketId: socket.id
        });

        // Track room sockets
        if (!this.roomSockets.has(roomId)) {
          this.roomSockets.set(roomId, new Set());
        }
        this.roomSockets.get(roomId)!.add(socket.id);

        console.log(`[WebSocket] User ${userId} joined room ${roomId}`);
        
        // Notify room about new user
        this.io.to(roomId).emit('user-joined', {
          userId,
          socketId: socket.id,
          timestamp: Date.now()
        });
      });

      // Leave a room
      socket.on('leave-room', (data: { roomId: string; userId: string }) => {
        const { roomId, userId } = data;
        
        if (!roomId || !userId) {
          socket.emit('error', { message: 'Missing roomId or userId' });
          return;
        }

        socket.leave(roomId);
        
        // Remove from tracking
        this.connectedUsers.delete(socket.id);
        
        // Remove from room tracking
        const roomSockets = this.roomSockets.get(roomId);
        if (roomSockets) {
          roomSockets.delete(socket.id);
          if (roomSockets.size === 0) {
            this.roomSockets.delete(roomId);
          }
        }

        console.log(`[WebSocket] User ${userId} left room ${roomId}`);
        
        // Notify room about user leaving
        this.io.to(roomId).emit('user-left', {
          userId,
          socketId: socket.id,
          timestamp: Date.now()
        });
      });

      // Handle sync messages
      socket.on('sync-message', (data: RoomMessage) => {
        const { roomId, action, data: messageData, userId } = data;
        
        if (!roomId || !action || !userId) {
          socket.emit('error', { message: 'Missing required fields' });
          return;
        }

        // Broadcast to all users in the room except sender
        socket.to(roomId).emit('sync-update', {
          action,
          data: messageData,
          userId,
          timestamp: Date.now()
        });

        console.log(`[WebSocket] Sync message broadcast to room ${roomId}:`, {
          action,
          userId,
          timestamp: Date.now()
        });
      });

      // Handle playback actions
      socket.on('playback-action', (data: RoomMessage) => {
        const { roomId, action, data: actionData, userId } = data;
        
        if (!roomId || !action || !userId) {
          socket.emit('error', { message: 'Missing required fields' });
          return;
        }

        // Broadcast to all users in the room
        this.io.to(roomId).emit('playback-update', {
          action,
          data: actionData,
          userId,
          timestamp: Date.now()
        });

        console.log(`[WebSocket] Playback action broadcast to room ${roomId}:`, {
          action,
          userId,
          timestamp: Date.now()
        });
      });

      // Handle admin change notifications
      socket.on('admin-change', (data: { roomId: string; newAdmin: string; oldAdmin: string }) => {
        const { roomId, newAdmin, oldAdmin } = data;
        
        if (!roomId || !newAdmin) {
          socket.emit('error', { message: 'Missing roomId or newAdmin' });
          return;
        }

        // Broadcast to all users in the room
        this.io.to(roomId).emit('admin-changed', {
          newAdmin,
          oldAdmin,
          timestamp: Date.now()
        });

        console.log(`[WebSocket] Admin change in room ${roomId}: ${oldAdmin} -> ${newAdmin}`);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        const user = this.connectedUsers.get(socket.id);
        if (user) {
          console.log(`[WebSocket] User disconnected: ${user.userId} from room ${user.roomId}`);
          
          // Remove from room tracking
          const roomSockets = this.roomSockets.get(user.roomId);
          if (roomSockets) {
            roomSockets.delete(socket.id);
            if (roomSockets.size === 0) {
              this.roomSockets.delete(user.roomId);
            }
          }

          // Notify room about user disconnect
          this.io.to(user.roomId).emit('user-disconnected', {
            userId: user.userId,
            socketId: socket.id,
            timestamp: Date.now()
          });
        }

        this.connectedUsers.delete(socket.id);
      });
    });
  }

  /**
   * Send a sync message to a specific room
   */
  public sendToRoom(roomId: string, message: RoomMessage): void {
    this.io.to(roomId).emit('sync-update', {
      ...message,
      timestamp: Date.now()
    });
  }

  /**
   * Send a playback action to a specific room
   */
  public sendPlaybackAction(roomId: string, action: string, data: any, userId: string): void {
    this.io.to(roomId).emit('playback-update', {
      action,
      data,
      userId,
      timestamp: Date.now()
    });
  }

  /**
   * Send admin change notification to a room
   */
  public sendAdminChange(roomId: string, newAdmin: string, oldAdmin: string): void {
    this.io.to(roomId).emit('admin-changed', {
      newAdmin,
      oldAdmin,
      timestamp: Date.now()
    });
  }

  /**
   * Get the number of connected users in a room
   */
  public getRoomUserCount(roomId: string): number {
    return this.roomSockets.get(roomId)?.size || 0;
  }

  /**
   * Get all connected users
   */
  public getConnectedUsers(): SocketUser[] {
    return Array.from(this.connectedUsers.values());
  }

  /**
   * Get all active rooms
   */
  public getActiveRooms(): string[] {
    return Array.from(this.roomSockets.keys());
  }

  /**
   * Clean up inactive rooms
   */
  public cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [roomId, sockets] of this.roomSockets.entries()) {
      if (sockets.size === 0) {
        this.roomSockets.delete(roomId);
        console.log(`[WebSocket] Cleaned up empty room: ${roomId}`);
      }
    }
  }
}

// Export singleton instance (will be initialized in server.ts)
export let webSocketService: WebSocketService;