/**
 * Socket.IO Service with Environment-Based Configuration
 * Handles real-time bus tracking and live location updates
 */

import io, { Socket } from 'socket.io-client';
import { getSocketUrl } from './api';

type BusLocationUpdate = {
  busNo: string | number;
  lat: number;
  lng: number;
  speed: number;
  timestamp: string;
  distance?: string | null;
  distanceText?: string | null;
  distanceKm?: number | null;
  etaMinutes?: number | null;
  trackingMode?: 'MORNING' | 'EVENING';
};

type SocketListener = (data: any) => void;

class SocketService {
  private socket: Socket | null = null;
  private apiUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private listeners: Map<string, SocketListener[]> = new Map();

  constructor() {
    this.apiUrl = getSocketUrl();
  }

  /**
   * Connect to Socket.IO server
   */
  connect(token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      try {
        const socketUrl = this.apiUrl.replace(/\/$/, ''); // Remove trailing slash
        
        this.socket = io(socketUrl, {
          path: '/socket.io/',
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: this.maxReconnectAttempts,
          transports: ['websocket'],
          auth: token ? { token } : undefined,
          forceNew: true,
          multiplex: true,
        });

        this.socket.on('connect', () => {
          console.log('✅ Socket.IO connected:', this.socket?.id);
          this.reconnectAttempts = 0;
          this.emitToListeners('connected', { socketId: this.socket?.id });
          resolve();
        });

        this.socket.on('disconnect', (reason) => {
          console.log('❌ Socket.IO disconnected:', reason);
          this.emitToListeners('disconnected', { reason });
        });

        this.socket.on('error', (error) => {
          console.error('❌ Socket.IO error:', error);
          this.emitToListeners('error', { error });
          reject(error);
        });

        this.socket.on('connect_error', (error) => {
          this.reconnectAttempts++;
          console.warn(
            `⚠️ Connection error (${this.reconnectAttempts}/${this.maxReconnectAttempts}):`,
            error.message
          );
          this.emitToListeners('connect_error', { error });
        });

        // Listen for bus location updates
        this.socket.on('busLocationUpdated', (data: BusLocationUpdate) => {
          this.emitToListeners('busLocationUpdated', data);
        });

        this.socket.on('fleetUpdate', (data: BusLocationUpdate) => {
          this.emitToListeners('fleetUpdate', data);
        });

      } catch (error) {
        console.error('❌ Socket connection failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from Socket.IO server
   */
  disconnect(): void {
    if (this.socket) {
      console.log('Disconnecting from Socket.IO...');
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Get socket ID
   */
  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  /**
   * Join a bus room (for receiving bus-specific updates)
   */
  joinBus(busNo: string | number): void {
    if (!this.socket) {
      console.warn('⚠️ Socket not connected. Cannot join bus.');
      return;
    }
    console.log(`🔌 Joining bus_${busNo}`);
    this.socket.emit('join-bus', busNo);
  }

  /**
   * Leave a bus room
   */
  leaveBus(busNo: string | number): void {
    if (!this.socket) return;
    console.log(`🔌 Leaving bus_${busNo}`);
    this.socket.emit('leave-bus', busNo);
  }

  /**
   * Listen to bus location updates
   */
  onBusLocationUpdate(callback: SocketListener): () => void {
    this.addListener('busLocationUpdated', callback);
    return () => this.removeListener('busLocationUpdated', callback);
  }

  /**
   * Listen to fleet updates
   */
  onFleetUpdate(callback: SocketListener): () => void {
    this.addListener('fleetUpdate', callback);
    return () => this.removeListener('fleetUpdate', callback);
  }

  /**
   * Listen to connection events
   */
  onConnected(callback: SocketListener): () => void {
    this.addListener('connected', callback);
    return () => this.removeListener('connected', callback);
  }

  /**
   * Listen to disconnect events
   */
  onDisconnected(callback: SocketListener): () => void {
    this.addListener('disconnected', callback);
    return () => this.removeListener('disconnected', callback);
  }

  /**
   * Listen to error events
   */
  onError(callback: SocketListener): () => void {
    this.addListener('error', callback);
    return () => this.removeListener('error', callback);
  }

  /**
   * Add event listener
   */
  private addListener(event: string, callback: SocketListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener
   */
  private removeListener(event: string, callback: SocketListener): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  private emitToListeners(event: string, data: any): void {
    const listeners = this.listeners.get(event) || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in listener for ${event}:`, error);
      }
    });
  }

  /**
   * Raw socket emit (for custom events)
   */
  emit(event: string, data?: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn(`⚠️ Cannot emit ${event}: Socket not connected`);
    }
  }

  /**
   * Raw socket on (for custom events)
   */
  on(event: string, callback: SocketListener): () => void {
    if (!this.socket) return () => {};
    this.socket.on(event, callback);
    return () => this.socket?.off(event, callback);
  }
}

// Create singleton instance
const socketService = new SocketService();

export { socketService, SocketService };
export type { BusLocationUpdate };
