# Frontend Implementation Sample

This sample demonstrates how to integrate the Watch Together feature into a frontend application.

## 1. Setup and Dependencies

```bash
# Install required packages
npm install socket.io-client axios
npm install --save-dev @types/socket.io-client
```

## 2. Core Components

### RoomService.ts

```typescript
import axios from "axios";
import io, { Socket } from "socket.io-client";

interface Room {
  id: string;
  name: string;
  adminId: string;
  mediaId: string;
  mediaType: "movie" | "tv";
  providerId?: string;
  participants: string[];
  currentState: PlaybackState;
  createdAt: Date;
  updatedAt: Date;
}

interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  currentEpisode?: number;
  providerUrl?: string;
}

interface PlaybackAction {
  type:
    | "play"
    | "pause"
    | "seek"
    | "setPlaybackRate"
    | "updateTime"
    | "changeEpisode"
    | "changeProvider"
    | "changeMedia";
  data: any;
}

export class RoomService {
  private socket: Socket | null = null;
  private currentRoom: Room | null = null;
  private currentUser: { id: string; name: string } | null = null;
  private isAdmin: boolean = false;

  constructor(private apiUrl: string = "http://localhost:3000") {}

  // Initialize user
  initializeUser(userId: string, userName: string) {
    this.currentUser = { id: userId, name: userName };
  }

  // Create a new room
  async createRoom(
    name: string,
    mediaId: string,
    mediaType: "movie" | "tv",
    providerId?: string
  ): Promise<Room> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/auth/watch-together/rooms`,
        {
          name,
          mediaId,
          mediaType,
          adminId: this.currentUser?.id,
          providerId,
        },
        {
          headers: {
            Authorization: `Bearer ${this.getAuthToken()}`,
          },
        }
      );

      this.currentRoom = response.data.data;
      this.isAdmin = true;
      this.connectToRoom(this.currentRoom.id);

      return this.currentRoom;
    } catch (error) {
      console.error("Error creating room:", error);
      throw error;
    }
  }

  // Join an existing room
  async joinRoom(roomId: string): Promise<Room> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/auth/watch-together/rooms/${roomId}/join`,
        {
          userId: this.currentUser?.id,
        },
        {
          headers: {
            Authorization: `Bearer ${this.getAuthToken()}`,
          },
        }
      );

      this.currentRoom = response.data.data;
      this.isAdmin = this.currentRoom.adminId === this.currentUser?.id;
      this.connectToRoom(roomId);

      return this.currentRoom;
    } catch (error) {
      console.error("Error joining room:", error);
      throw error;
    }
  }

  // Leave current room
  async leaveRoom(): Promise<void> {
    if (!this.currentRoom || !this.currentUser) return;

    try {
      await axios.post(
        `${this.apiUrl}/auth/watch-together/rooms/${this.currentRoom.id}/leave`,
        {
          userId: this.currentUser.id,
        },
        {
          headers: {
            Authorization: `Bearer ${this.getAuthToken()}`,
          },
        }
      );

      this.disconnectFromRoom();
      this.currentRoom = null;
      this.isAdmin = false;
    } catch (error) {
      console.error("Error leaving room:", error);
    }
  }

  // Connect to WebSocket room
  private connectToRoom(roomId: string) {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io("http://localhost:3001", {
      transports: ["websocket"],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.setupSocketListeners(roomId);
  }

  // Disconnect from WebSocket room
  private disconnectFromRoom() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Setup WebSocket event listeners
  private setupSocketListeners(roomId: string) {
    if (!this.socket) return;

    // Connection events
    this.socket.on("connect", () => {
      console.log("Connected to WebSocket server");
      this.socket?.emit("join_room", { roomId, userId: this.currentUser?.id });
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from WebSocket server");
    });

    // Room events
    this.socket.on("room_created", (room: Room) => {
      console.log("Room created:", room);
      this.currentRoom = room;
    });

    this.socket.on(
      "user_joined",
      (data: { userId: string; participants: string[] }) => {
        console.log("User joined:", data.userId);
        this.updateParticipants(data.participants);
      }
    );

    this.socket.on(
      "user_left",
      (data: { userId: string; participants: string[] }) => {
        console.log("User left:", data.userId);
        this.updateParticipants(data.participants);
      }
    );

    this.socket.on(
      "admin_changed",
      (data: {
        newAdmin: string;
        oldAdmin: string;
        participants: string[];
      }) => {
        console.log("Admin changed:", data.oldAdmin, "->", data.newAdmin);
        this.isAdmin = data.newAdmin === this.currentUser?.id;
        this.updateParticipants(data.participants);
      }
    );

    this.socket.on(
      "user_kicked",
      (data: { kickedUserId: string; participants: string[] }) => {
        console.log("User kicked:", data.kickedUserId);
        if (data.kickedUserId === this.currentUser?.id) {
          this.leaveRoom();
        } else {
          this.updateParticipants(data.participants);
        }
      }
    );

    // Playback events
    this.socket.on(
      "playback_updated",
      (data: {
        action: PlaybackAction;
        state: PlaybackState;
        userId: string;
        timestamp: Date;
      }) => {
        console.log("Playback updated:", data.action.type, "by", data.userId);
        this.onPlaybackUpdate(data.state);
      }
    );

    this.socket.on(
      "episode_changed",
      (data: {
        action: PlaybackAction;
        state: PlaybackState;
        userId: string;
        timestamp: Date;
      }) => {
        console.log(
          "Episode changed:",
          data.action.data.episode,
          "by",
          data.userId
        );
        this.onEpisodeChange(data.state);
      }
    );

    this.socket.on(
      "provider_changed",
      (data: {
        action: PlaybackAction;
        state: PlaybackState;
        userId: string;
        timestamp: Date;
      }) => {
        console.log(
          "Provider changed:",
          data.action.data.provider,
          "by",
          data.userId
        );
        this.onProviderChange(data.state);
      }
    );

    this.socket.on(
      "media_changed",
      (data: {
        action: PlaybackAction;
        state: PlaybackState;
        userId: string;
        timestamp: Date;
      }) => {
        console.log(
          "Media changed:",
          data.action.data.mediaId,
          "by",
          data.userId
        );
        this.onMediaChange(data.state);
      }
    );

    // Initial state
    this.socket.on(
      "initial_state",
      (data: { currentState: PlaybackState; participants: string[] }) => {
        console.log("Initial state received");
        this.onInitialState(data.currentState);
        this.updateParticipants(data.participants);
      }
    );

    // Sync response
    this.socket.on(
      "sync_response",
      (data: {
        currentState: PlaybackState;
        timestamp: Date;
        adminId: string;
      }) => {
        console.log("Sync response received");
        this.onSyncResponse(data.currentState);
      }
    );

    // Error handling
    this.socket.on("error", (error: { message: string }) => {
      console.error("WebSocket error:", error.message);
    });
  }

  // Playback control methods
  sendPlaybackAction(action: PlaybackAction) {
    if (!this.currentRoom || !this.socket) return;

    // Only allow admin to perform certain actions
    const adminOnlyActions = ["changeMedia", "changeProvider", "changeEpisode"];
    if (adminOnlyActions.includes(action.type) && !this.isAdmin) {
      console.warn("Only admin can perform this action:", action.type);
      return;
    }

    this.socket.emit("playback_action", {
      roomId: this.currentRoom.id,
      action,
      userId: this.currentUser?.id,
    });
  }

  requestSync() {
    if (!this.currentRoom || !this.socket) return;

    this.socket.emit("sync_request", {
      roomId: this.currentRoom.id,
      userId: this.currentUser?.id,
    });
  }

  sendHeartbeat() {
    if (!this.currentRoom || !this.socket) return;

    this.socket.emit("heartbeat", {
      roomId: this.currentRoom.id,
      userId: this.currentUser?.id,
    });
  }

  // Admin control methods
  async transferAdmin(newAdminId: string): Promise<boolean> {
    if (!this.currentRoom || !this.isAdmin) return false;

    try {
      const response = await axios.post(
        `${this.apiUrl}/auth/watch-together/rooms/${this.currentRoom.id}/transfer-admin`,
        {
          currentAdminId: this.currentRoom.adminId,
          newAdminId,
        },
        {
          headers: {
            Authorization: `Bearer ${this.getAuthToken()}`,
          },
        }
      );

      return response.data.success;
    } catch (error) {
      console.error("Error transferring admin:", error);
      return false;
    }
  }

  async kickUser(userIdToKick: string): Promise<boolean> {
    if (!this.currentRoom || !this.isAdmin) return false;

    try {
      const response = await axios.post(
        `${this.apiUrl}/auth/watch-together/rooms/${this.currentRoom.id}/kick-user`,
        {
          adminId: this.currentRoom.adminId,
          userIdToKick,
        },
        {
          headers: {
            Authorization: `Bearer ${this.getAuthToken()}`,
          },
        }
      );

      return response.data.success;
    } catch (error) {
      console.error("Error kicking user:", error);
      return false;
    }
  }

  // Utility methods
  private getAuthToken(): string {
    // Implement your auth token retrieval logic
    return localStorage.getItem("authToken") || "";
  }

  private updateParticipants(participants: string[]) {
    // Emit event to update UI
    this.emit("participantsUpdated", participants);
  }

  private onPlaybackUpdate(state: PlaybackState) {
    this.emit("playbackStateUpdate", state);
  }

  private onEpisodeChange(state: PlaybackState) {
    this.emit("episodeChange", state);
  }

  private onProviderChange(state: PlaybackState) {
    this.emit("providerChange", state);
  }

  private onMediaChange(state: PlaybackState) {
    this.emit("mediaChange", state);
  }

  private onInitialState(state: PlaybackState) {
    this.emit("initialState", state);
  }

  private onSyncResponse(state: PlaybackState) {
    this.emit("syncResponse", state);
  }

  // Event emitter pattern
  private listeners: { [event: string]: Function[] } = {};

  on(event: string, callback: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  private emit(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => callback(data));
    }
  }

  // Getters
  getCurrentRoom(): Room | null {
    return this.currentRoom;
  }

  isAdminUser(): boolean {
    return this.isAdmin;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}
```

### SyncPlayer.ts

```typescript
import { RoomService } from "./RoomService";

export class SyncPlayer {
  private video: HTMLVideoElement;
  private roomService: RoomService;
  private isInitialized: boolean = false;
  private lastSyncTime: number = 0;
  private syncInterval: number = 5000; // 5 seconds
  private heartbeatInterval: number = 30000; // 30 seconds

  constructor(
    videoElement: HTMLVideoElement,
    roomService: RoomService,
    private syncThreshold: number = 0.5 // seconds
  ) {
    this.video = videoElement;
    this.roomService = roomService;
    this.initializePlayer();
  }

  private initializePlayer() {
    if (this.isInitialized) return;

    // Setup video event listeners
    this.video.addEventListener("play", () => this.onPlay());
    this.video.addEventListener("pause", () => this.onPause());
    this.video.addEventListener("timeupdate", () => this.onTimeUpdate());
    this.video.addEventListener("seeked", () => this.onSeeked());
    this.video.addEventListener("ratechange", () => this.onRateChange());

    // Setup room service listeners
    this.roomService.on("playbackStateUpdate", (state) =>
      this.onPlaybackStateUpdate(state)
    );
    this.roomService.on("initialState", (state) => this.onInitialState(state));
    this.roomService.on("syncResponse", (state) => this.onSyncResponse(state));

    // Start intervals
    this.startSyncInterval();
    this.startHeartbeatInterval();

    this.isInitialized = true;
  }

  private onPlay() {
    if (this.isLocalAction()) {
      this.roomService.sendPlaybackAction({ type: "play", data: {} });
    }
  }

  private onPause() {
    if (this.isLocalAction()) {
      this.roomService.sendPlaybackAction({ type: "pause", data: {} });
    }
  }

  private onTimeUpdate() {
    if (this.isLocalAction()) {
      this.roomService.sendPlaybackAction({
        type: "updateTime",
        data: { currentTime: this.video.currentTime },
      });
    }
  }

  private onSeeked() {
    if (this.isLocalAction()) {
      this.roomService.sendPlaybackAction({
        type: "seek",
        data: { currentTime: this.video.currentTime },
      });
    }
  }

  private onRateChange() {
    if (this.isLocalAction()) {
      this.roomService.sendPlaybackAction({
        type: "setPlaybackRate",
        data: { rate: this.video.playbackRate },
      });
    }
  }

  private onPlaybackStateUpdate(state: any) {
    if (!this.isLocalAction()) {
      this.applyPlaybackState(state);
    }
  }

  private onInitialState(state: any) {
    this.applyPlaybackState(state);
  }

  private onSyncResponse(state: any) {
    this.applyPlaybackState(state);
  }

  private applyPlaybackState(state: any) {
    const now = Date.now();

    // Throttle state updates to prevent excessive synchronization
    if (now - this.lastSyncTime < 100) return;
    this.lastSyncTime = now;

    try {
      // Apply play/pause state
      if (state.isPlaying && this.video.paused) {
        this.video.play().catch((error) => {
          console.error("Error playing video:", error);
        });
      } else if (!state.isPlaying && !this.video.paused) {
        this.video.pause();
      }

      // Apply time synchronization with threshold
      const timeDiff = Math.abs(this.video.currentTime - state.currentTime);
      if (timeDiff > this.syncThreshold) {
        this.video.currentTime = state.currentTime;
      }

      // Apply playback rate
      if (
        state.playbackRate &&
        state.playbackRate !== this.video.playbackRate
      ) {
        this.video.playbackRate = state.playbackRate;
      }

      // Apply episode changes
      if (
        state.currentEpisode &&
        state.currentEpisode !== this.getCurrentEpisode()
      ) {
        this.changeEpisode(state.currentEpisode);
      }

      // Apply provider URL changes
      if (
        state.providerUrl &&
        state.providerUrl !== this.getCurrentProviderUrl()
      ) {
        this.changeProvider(state.providerUrl);
      }
    } catch (error) {
      console.error("Error applying playback state:", error);
    }
  }

  private isLocalAction(): boolean {
    // Check if the action originated from this client
    // This is a simplified implementation - you may need to track action origins
    return true;
  }

  private startSyncInterval() {
    setInterval(() => {
      if (this.roomService.isConnected()) {
        this.roomService.requestSync();
      }
    }, this.syncInterval);
  }

  private startHeartbeatInterval() {
    setInterval(() => {
      if (this.roomService.isConnected()) {
        this.roomService.sendHeartbeat();
      }
    }, this.heartbeatInterval);
  }

  // Public methods for external control
  play(): void {
    this.video.play();
  }

  pause(): void {
    this.video.pause();
  }

  seekTo(time: number): void {
    this.video.currentTime = time;
  }

  setPlaybackRate(rate: number): void {
    this.video.playbackRate = rate;
  }

  changeEpisode(episode: number): void {
    // Implement episode change logic
    console.log("Changing to episode:", episode);
    this.roomService.sendPlaybackAction({
      type: "changeEpisode",
      data: { episode },
    });
  }

  changeProvider(providerUrl: string): void {
    // Implement provider change logic
    console.log("Changing provider to:", providerUrl);
    this.roomService.sendPlaybackAction({
      type: "changeProvider",
      data: { provider: this.extractProviderId(providerUrl) },
    });
  }

  private getCurrentEpisode(): number {
    // Implement episode detection logic
    return 1;
  }

  private getCurrentProviderUrl(): string {
    // Implement current provider URL detection
    return this.video.src;
  }

  private extractProviderId(url: string): string {
    // Extract provider ID from URL
    if (url.includes("vidnest.fun")) return "vidnest";
    if (url.includes("vidsrc.to")) return "vidsrc";
    if (url.includes("embed.stream")) return "embed";
    return "vidnest"; // default
  }

  // Cleanup
  destroy(): void {
    this.video.removeEventListener("play", this.onPlay);
    this.video.removeEventListener("pause", this.onPause);
    this.video.removeEventListener("timeupdate", this.onTimeUpdate);
    this.video.removeEventListener("seeked", this.onSeeked);
    this.video.removeEventListener("ratechange", this.onRateChange);

    this.isInitialized = false;
  }
}
```

## 3. React Component Example

### WatchTogetherRoom.tsx

```typescript
import React, { useState, useEffect, useRef } from "react";
import { RoomService } from "./RoomService";
import { SyncPlayer } from "./SyncPlayer";

interface WatchTogetherRoomProps {
  roomId?: string;
  userId: string;
  userName: string;
  mediaId: string;
  mediaType: "movie" | "tv";
}

export const WatchTogetherRoom: React.FC<WatchTogetherRoomProps> = ({
  roomId,
  userId,
  userName,
  mediaId,
  mediaType,
}) => {
  const [roomService] = useState(() => new RoomService());
  const [syncPlayer, setSyncPlayer] = useState<SyncPlayer | null>(null);
  const [currentRoom, setCurrentRoom] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Initialize room service
    roomService.initializeUser(userId, userName);

    // Setup event listeners
    roomService.on("participantsUpdated", (participants: string[]) => {
      setParticipants(participants);
    });

    roomService.on("playbackStateUpdate", (state: any) => {
      // Update UI based on playback state
      console.log("Playback state updated:", state);
    });

    roomService.on("initialState", (state: any) => {
      console.log("Initial state received:", state);
    });

    roomService.on("syncResponse", (state: any) => {
      console.log("Sync response received:", state);
    });

    // Join or create room
    const initializeRoom = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (roomId) {
          // Join existing room
          const room = await roomService.joinRoom(roomId);
          setCurrentRoom(room);
          setIsAdmin(room.adminId === userId);
        } else {
          // Create new room
          const room = await roomService.createRoom(
            `Watch Party - ${userName}`,
            mediaId,
            mediaType
          );
          setCurrentRoom(room);
          setIsAdmin(true);
        }

        // Initialize sync player
        if (videoRef.current) {
          const player = new SyncPlayer(videoRef.current, roomService);
          setSyncPlayer(player);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to initialize room"
        );
      } finally {
        setIsLoading(false);
      }
    };

    initializeRoom();

    // Cleanup
    return () => {
      roomService.leaveRoom();
      if (syncPlayer) {
        syncPlayer.destroy();
      }
    };
  }, [roomId, userId, userName, mediaId, mediaType, roomService]);

  const handlePlay = () => {
    syncPlayer?.play();
  };

  const handlePause = () => {
    syncPlayer?.pause();
  };

  const handleSeek = (time: number) => {
    syncPlayer?.seekTo(time);
  };

  const handleRateChange = (rate: number) => {
    syncPlayer?.setPlaybackRate(rate);
  };

  const handleTransferAdmin = async (newAdminId: string) => {
    const success = await roomService.transferAdmin(newAdminId);
    if (success) {
      setIsAdmin(false);
    }
  };

  const handleKickUser = async (userIdToKick: string) => {
    await roomService.kickUser(userIdToKick);
  };

  const handleProviderChange = (providerId: string) => {
    const providerUrls = {
      vidnest: `https://vidnest.fun/movie/${mediaId}`,
      vidsrc: `https://vidsrc.to/embed-${mediaId}`,
      embed: `https://embed.stream/embed/${mediaId}`,
    };

    const newUrl =
      providerUrls[providerId as keyof typeof providerUrls] ||
      providerUrls.vidnest;
    syncPlayer?.changeProvider(newUrl);
  };

  if (isLoading) {
    return <div className="loading">Loading room...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="watch-together-room">
      <div className="room-header">
        <h2>{currentRoom?.name}</h2>
        <div className="room-info">
          <span>Admin: {currentRoom?.adminId}</span>
          <span>Participants: {participants.length}</span>
          <span>Media: {currentRoom?.mediaId}</span>
        </div>
      </div>

      <div className="video-container">
        <video
          ref={videoRef}
          src={currentRoom?.currentState?.providerUrl}
          controls
          className="video-player"
        />
        {/* Alternative iframe for providers */}
        {currentRoom?.currentState?.providerUrl && (
          <iframe
            ref={iframeRef}
            src={currentRoom.currentState.providerUrl}
            frameBorder="0"
            scrolling="no"
            allowFullScreen
            className="video-iframe"
            style={{ display: "none" }}
          />
        )}
      </div>

      <div className="controls">
        <button onClick={handlePlay} disabled={!syncPlayer}>
          Play
        </button>
        <button onClick={handlePause} disabled={!syncPlayer}>
          Pause
        </button>
        <input
          type="range"
          min="0"
          max={currentRoom?.currentState?.duration || 100}
          value={currentRoom?.currentState?.currentTime || 0}
          onChange={(e) => handleSeek(parseFloat(e.target.value))}
        />
        <select
          value={currentRoom?.providerId || "vidnest"}
          onChange={(e) => handleProviderChange(e.target.value)}
        >
          <option value="vidnest">VidNest</option>
          <option value="vidsrc">VidSrc</option>
          <option value="embed">EmbedStream</option>
        </select>
      </div>

      <div className="participants">
        <h3>Participants</h3>
        <ul>
          {participants.map((participant) => (
            <li key={participant}>
              {participant}
              {isAdmin && participant !== userId && (
                <button onClick={() => handleKickUser(participant)}>
                  Kick
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isAdmin && (
        <div className="admin-controls">
          <h3>Admin Controls</h3>
          <div className="transfer-admin">
            <label>Transfer Admin to:</label>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  handleTransferAdmin(e.target.value);
                }
              }}
            >
              <option value="">Select user</option>
              {participants
                .filter((p) => p !== userId)
                .map((participant) => (
                  <option key={participant} value={participant}>
                    {participant}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      <div className="connection-status">
        Status: {roomService.isConnected() ? "Connected" : "Disconnected"}
      </div>
    </div>
  );
};
```

## 4. Usage Example

```typescript
// App.tsx
import React from "react";
import { WatchTogetherRoom } from "./WatchTogetherRoom";

function App() {
  const [currentUserId] = useState("user123");
  const [currentUserName] = useState("John Doe");
  const [currentMediaId] = useState("666243");
  const [currentMediaType] = useState<"movie" | "tv">("movie");

  return (
    <div className="app">
      <h1>Movie Watch Together</h1>

      <WatchTogetherRoom
        userId={currentUserId}
        userName={currentUserName}
        mediaId={currentMediaId}
        mediaType={currentMediaType}
        // roomId="optional-room-id" // Uncomment to join existing room
      />
    </div>
  );
}

export default App;
```

## 5. CSS Styling

```css
/* WatchTogetherRoom.css */
.watch-together-room {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

.room-header {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.room-header h2 {
  margin: 0 0 10px 0;
  color: #333;
}

.room-info {
  display: flex;
  gap: 20px;
  font-size: 14px;
  color: #666;
}

.video-container {
  position: relative;
  width: 100%;
  max-width: 800px;
  margin: 0 auto 20px;
}

.video-player {
  width: 100%;
  height: auto;
  border-radius: 8px;
}

.video-iframe {
  width: 100%;
  height: 450px;
  border-radius: 8px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
  padding: 15px;
  background: #f9f9f9;
  border-radius: 8px;
}

.controls button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: #007bff;
  color: white;
  cursor: pointer;
}

.controls button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.controls input[type="range"] {
  flex: 1;
}

.controls select {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.participants {
  background: #f9f9f9;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.participants h3 {
  margin: 0 0 10px 0;
}

.participants ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.participants li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}

.participants li:last-child {
  border-bottom: none;
}

.participants button {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: #dc3545;
  color: white;
  cursor: pointer;
  font-size: 12px;
}

.admin-controls {
  background: #e8f4fd;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.admin-controls h3 {
  margin: 0 0 10px 0;
}

.transfer-admin {
  display: flex;
  align-items: center;
  gap: 10px;
}

.transfer-admin select {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.connection-status {
  text-align: center;
  padding: 10px;
  background: #f0f0f0;
  border-radius: 4px;
  font-size: 14px;
}

.connection-status.connected {
  background: #d4edda;
  color: #155724;
}

.connection-status.disconnected {
  background: #f8d7da;
  color: #721c24;
}

.loading,
.error {
  text-align: center;
  padding: 40px;
  font-size: 18px;
}

.error {
  color: #dc3545;
  background: #f8d7da;
  border-radius: 8px;
}
```

This comprehensive frontend implementation provides everything needed to integrate the Watch Together feature, including room management, real-time synchronization, admin controls, and a polished user interface.
