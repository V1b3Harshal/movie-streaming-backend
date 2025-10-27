import { FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { createSafeErrorResponse, logErrorWithDetails } from '../utils/errorHandler';
import { webSocketService } from './webSocketService';

// Simple in-memory storage for active rooms (in production, use Redis)
const activeRooms = new Map<string, {
  adminId: string;
  participants: Set<string>;
  currentState: any;
  lastSync: number;
}>();

// Sync action types
export type SyncAction = 
  | 'play'
  | 'pause'
  | 'seek'
  | 'setPlaybackRate'
  | 'updateTime'
  | 'changeEpisode'
  | 'changeProvider'
  | 'changeMedia';

interface SyncData {
  action: SyncAction;
  data: any;
  userId: string;
  timestamp: number;
}

export class SyncService {
  /**
   * Process a sync action and broadcast to all room participants
   */
  async processSyncAction(roomId: string, syncData: SyncData): Promise<{ success: boolean; message: string }> {
    try {
      // Get room state
      const room = activeRooms.get(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // Validate admin permissions for certain actions
      const adminActions: SyncAction[] = ['changeEpisode', 'changeProvider', 'changeMedia'];
      if (adminActions.includes(syncData.action) && syncData.userId !== room.adminId) {
        throw new Error('Only admin can perform this action');
      }

      // Update room state
      this.updateRoomState(room, syncData);

      // Broadcast to all participants (except the one who initiated)
      await this.broadcastToRoom(roomId, syncData, syncData.userId);

      return { success: true, message: 'Sync action processed successfully' };
    } catch (error) {
      logErrorWithDetails(error, { 
        context: 'Process sync action',
        roomId,
        action: syncData.action,
        userId: syncData.userId
      });
      throw error;
    }
  }

  /**
   * Join a room for sync
   */
  async joinRoom(roomId: string, userId: string): Promise<void> {
    let room = activeRooms.get(roomId);
    
    if (!room) {
      // Create new room entry
      room = {
        adminId: userId, // First user becomes admin
        participants: new Set([userId]),
        currentState: {
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          playbackRate: 1,
          currentEpisode: 1,
          currentProvider: '',
          currentMedia: ''
        },
        lastSync: Date.now()
      };
      activeRooms.set(roomId, room);
    } else {
      // Add participant
      room.participants.add(userId);
    }
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const room = activeRooms.get(roomId);
    if (room) {
      room.participants.delete(userId);
      
      // If admin leaves, promote another participant to admin
      if (room.adminId === userId && room.participants.size > 0) {
        const newAdmin = room.participants.values().next().value;
        if (newAdmin) {
          room.adminId = newAdmin;
          
          // Notify about admin change
          if (webSocketService) {
            webSocketService.sendAdminChange(roomId, newAdmin, userId);
          } else {
            await this.broadcastToRoom(roomId, {
              action: 'adminChange' as any,
              data: { newAdmin },
              userId: 'system',
              timestamp: Date.now()
            }, userId);
          }
        }
      }
      
      // Clean up empty rooms
      if (room.participants.size === 0) {
        activeRooms.delete(roomId);
      }
    }
  }

  /**
   * Get room state
   */
  getRoomState(roomId: string): any | null {
    const room = activeRooms.get(roomId);
    return room ? room.currentState : null;
  }

  /**
   * Get room participants
   */
  getRoomParticipants(roomId: string): string[] {
    const room = activeRooms.get(roomId);
    return room ? Array.from(room.participants) : [];
  }

  /**
   * Update room state based on sync action
   */
  private updateRoomState(room: any, syncData: SyncData): void {
    const { action, data } = syncData;
    
    switch (action) {
      case 'play':
        room.currentState.isPlaying = true;
        break;
        
      case 'pause':
        room.currentState.isPlaying = false;
        break;
        
      case 'seek':
      case 'updateTime':
        room.currentState.currentTime = data.currentTime || 0;
        break;
        
      case 'setPlaybackRate':
        room.currentState.playbackRate = data.rate || 1;
        break;
        
      case 'changeEpisode':
        room.currentState.currentEpisode = data.episode || 1;
        room.currentState.currentTime = 0; // Reset time for new episode
        break;
        
      case 'changeProvider':
        room.currentState.currentProvider = data.provider || '';
        break;
        
      case 'changeMedia':
        room.currentState.currentMedia = data.mediaId || '';
        room.currentState.currentEpisode = 1;
        room.currentState.currentTime = 0;
        break;
    }
    
    room.lastSync = Date.now();
  }

  /**
   * Broadcast sync action to room participants
   */
  private async broadcastToRoom(roomId: string, syncData: SyncData, excludeUserId?: string): Promise<void> {
    const room = activeRooms.get(roomId);
    if (!room) return;

    // Use WebSocket service for real-time broadcasting
    if (webSocketService) {
      // Send to WebSocket room
      webSocketService.sendToRoom(roomId, {
        roomId,
        action: syncData.action,
        data: syncData.data,
        userId: syncData.userId,
        timestamp: syncData.timestamp
      });
    } else {
      // Fallback to simulated broadcast
      const broadcastPromises = Array.from(room.participants)
        .filter(userId => userId !== excludeUserId)
        .map(userId => this.sendSyncToUser(userId, syncData));

      await Promise.allSettled(broadcastPromises);
    }
  }

  /**
   * Send sync data to a specific user (simulated)
   */
  private async sendSyncToUser(userId: string, syncData: SyncData): Promise<void> {
    // In a real implementation, this would send via WebSocket or push notification
    // For now, we'll just log it
    console.log(`[SYNC] Sending to user ${userId}:`, syncData);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  /**
   * Get room statistics
   */
  getRoomStats(): any {
    const stats = {
      totalRooms: activeRooms.size,
      totalParticipants: 0,
      roomsWithParticipants: 0,
      averageParticipantsPerRoom: 0
    };

    activeRooms.forEach(room => {
      const participantCount = room.participants.size;
      stats.totalParticipants += participantCount;
      if (participantCount > 0) {
        stats.roomsWithParticipants++;
      }
    });

    stats.averageParticipantsPerRoom = stats.totalRooms > 0 ? 
      Math.round((stats.totalParticipants / stats.totalRooms) * 100) / 100 : 0;

    return stats;
  }

  /**
   * Clean up old rooms
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [roomId, room] of activeRooms.entries()) {
      if (now - room.lastSync > maxAge) {
        activeRooms.delete(roomId);
        console.log(`Cleaned up inactive room: ${roomId}`);
      }
    }
  }
}

// Export singleton instance
export const syncService = new SyncService();