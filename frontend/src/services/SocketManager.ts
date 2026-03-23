/**
 * Socket.IO Connection Manager
 * Handles WebSocket connections with automatic reconnection and error recovery
 */

import io from 'socket.io-client';

interface SocketConfig {
  url: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  reconnectionAttempts?: number;
  pingInterval?: number;
  pingTimeout?: number;
}

interface ConnectionState {
  isConnected: boolean;
  isAuthenticating: boolean;
  lastConnectTime: Date | null;
  reconnectAttempts: number;
  error: string | null;
}

class SocketManager {
  private socket: any = null;
  private config: SocketConfig;
  private state: ConnectionState = {
    isConnected: false,
    isAuthenticating: false,
    lastConnectTime: null,
    reconnectAttempts: 0,
    error: null,
  };
  private listeners: Map<string, Function[]> = new Map();
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SocketConfig) {
    this.config = {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      pingInterval: 25000,
      pingTimeout: 60000,
      ...config,
    };
  }

  /**
   * Connect to Socket.IO server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('[SOCKET] Connecting to', this.config.url);

        this.socket = io(this.config.url, {
          autoConnect: false,
          reconnection: this.config.reconnection,
          reconnectionDelay: this.config.reconnectionDelay,
          reconnectionDelayMax: this.config.reconnectionDelayMax,
          reconnectionAttempts: this.config.reconnectionAttempts,
          transports: ['websocket', 'polling'],
        } as any);

        // Connection events
        this.socket.on('connect', () => {
          this.state.isConnected = true;
          this.state.lastConnectTime = new Date();
          this.state.reconnectAttempts = 0;
          this.state.error = null;
          console.log('[SOCKET] ✓ Connected:', this.socket.id);
          this.emit('connected', this.socket.id);
          resolve();
        });

        this.socket.on('disconnect', (reason) => {
          this.state.isConnected = false;
          console.log('[SOCKET] Disconnected:', reason);
          this.emit('disconnected', reason);
        });

        this.socket.on('reconnect', () => {
          console.log('[SOCKET] ✓ Reconnected');
          this.emit('reconnected');
        });

        this.socket.on('reconnect_attempt', () => {
          this.state.reconnectAttempts++;
          console.log(`[SOCKET] Reconnect attempt ${this.state.reconnectAttempts}`);
          this.emit('reconnecting', this.state.reconnectAttempts);
        });

        this.socket.on('reconnect_error', (error) => {
          this.state.error = error.message;
          console.error('[SOCKET] Reconnect error:', error.message);
          this.emit('reconnect_error', error);
        });

        this.socket.on('reconnect_failed', () => {
          console.error('[SOCKET] Reconnection failed');
          this.emit('reconnect_failed');
        });

        this.socket.on('error', (error) => {
          console.error('[SOCKET] Socket error:', error);
          this.emit('error', error);
        });

        this.socket.on('connect_error', (error) => {
          console.error('[SOCKET] Connection error:', error.message);
          this.state.error = error.message;
          this.emit('connect_error', error);
        });

        // Connect the socket
        this.socket.connect();

        // Timeout for connection
        const timeout = setTimeout(() => {
          if (!this.state.isConnected) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);

        // Resolve on connect
        this.socket.once('connect', () => {
          clearTimeout(timeout);
        });

      } catch (error) {
        console.error('[SOCKET] Connection error:', error);
        reject(error);
      }
    });
  }

  /**
   * Authenticate driver connection
   */
  async authenticateDriver(token: string, busId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.state.isAuthenticating = true;

        this.socket.emit('driver_connect', { token, busId }, (response: any) => {
          this.state.isAuthenticating = false;

          if (response?.success) {
            console.log('[SOCKET] ✓ Driver authenticated');
            this.emit('driver_authenticated', response);
            resolve();
          } else {
            reject(new Error(response?.message || 'Authentication failed'));
          }
        });

        // Timeout for authentication
        setTimeout(() => {
          if (this.state.isAuthenticating) {
            this.state.isAuthenticating = false;
            reject(new Error('Authentication timeout'));
          }
        }, 5000);

      } catch (error) {
        this.state.isAuthenticating = false;
        reject(error);
      }
    });
  }

  /**
   * Subscribe to bus tracking
   */
  subscribeTobus(busId: number): void {
    if (!this.isConnected()) {
      console.error('[SOCKET] Not connected');
      return;
    }

    this.socket.emit('student_subscribe', { busId });
    console.log(`[SOCKET] Subscribed to bus ${busId}`);
  }

  /**
   * Send location update (driver)
   */
  updateLocation(latitude: number, longitude: number, speed?: number, accuracy?: number): void {
    if (!this.isConnected()) {
      console.warn('[SOCKET] Not connected, cannot send location');
      return;
    }

    this.socket.emit('location_update', {
      latitude,
      longitude,
      speed,
      accuracy,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Request all buses data
   */
  requestAllBuses(): void {
    if (!this.isConnected()) {
      console.warn('[SOCKET] Not connected, cannot request buses');
      return;
    }

    this.socket.emit('request_all_buses');
  }

  /**
   * Send health check ping
   */
  sendPing(): void {
    if (this.isConnected()) {
      this.socket.emit('ping');
    }
  }

  /**
   * On event listener (internal)
   */
  private emit(event: string, ...args: any[]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`[SOCKET] Error in listener for '${event}':`, error);
        }
      });
    }
  }

  /**
   * Register event listener (public API)
   */
  on(event: string, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
      
      // Listen to Socket.IO event
      if (this.socket && event !== 'connected' && event !== 'disconnected' && event !== 'reconnecting' && event !== 'reconnected') {
        this.socket.on(event, (...args: any[]) => {
          this.emit(event, ...args);
        });
      }
    }

    const callbacks = this.listeners.get(event)!;
    callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Once event listener
   */
  once(event: string, callback: Function): void {
    const unsubscribe = this.on(event, (...args: any[]) => {
      callback(...args);
      unsubscribe();
    });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state.isConnected && this.socket?.connected;
  }

  /**
   * Get connection state
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Start health check (periodic ping)
   */
  startHealthCheck(interval = 30000): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      if (this.isConnected()) {
        this.sendPing();
      }
    }, interval);
  }

  /**
   * Stop health check
   */
  stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    try {
      this.stopHealthCheck();
      
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }

      this.state.isConnected = false;
      console.log('[SOCKET] Disconnected');
    } catch (error) {
      console.error('[SOCKET] Error disconnecting:', error);
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    this.disconnect();
    this.listeners.clear();
  }
}

// Export singleton instance
let socketManagerInstance: SocketManager | null = null;

export function initializeSocketManager(config: SocketConfig): SocketManager {
  if (socketManagerInstance) {
    socketManagerInstance.destroy();
  }

  socketManagerInstance = new SocketManager(config);
  return socketManagerInstance;
}

export function getSocketManager(): SocketManager | null {
  return socketManagerInstance;
}

export default SocketManager;
