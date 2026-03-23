/**
 * ===================================================================
 * Driver Bus Tracking Dashboard
 * ===================================================================
 * 
 * Driver interface to send real-time GPS location
 * Authenticate with license number and send 1-second updates
 */

import React, { useState, useEffect, useRef } from 'react';
import { getApiClient } from '../services/ApiClient';
import { initializeSocketManager, getSocketManager } from '../services/SocketManager';
import { getSocketUrl } from '../../services/api';
import './DriverTracking.css';

interface DriverState {
  isAuthenticated: boolean;
  isTracking: boolean;
  busId: number | null;
  busName: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speed: number | null;
  error: string | null;
}

const DriverTrackingDashboard: React.FC = () => {
  const [state, setState] = useState<DriverState>({
    isAuthenticated: false,
    isTracking: false,
    busId: null,
    busName: null,
    latitude: null,
    longitude: null,
    accuracy: null,
    speed: null,
    error: null,
  });

  const [credentials, setCredentials] = useState({
    licenseNumber: '',
    password: '',
  });

  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected');
  const watchIdRef = useRef<number | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiClient = getApiClient();

  /**
   * Initialize Socket.IO connection
   */
  useEffect(() => {
    const initSocket = async () => {
      try {
        const socketManager = await initializeSocketManager({
          url: getSocketUrl(),
          autoConnect: true,
        });

        socketManager.on('connected', () => {
          setConnectionStatus('Connected');
          console.log('[DRIVER] Socket connected');
        });

        socketManager.on('disconnected', () => {
          setConnectionStatus('Disconnected');
          console.log('[DRIVER] Socket disconnected');
        });

        socketManager.on('error', (error: any) => {
          setState(prev => ({ ...prev, error: `Connection error: ${error.message}` }));
        });
      } catch (error) {
        console.error('[DRIVER] Socket init error:', error);
        setState(prev => ({
          ...prev,
          error: 'Failed to initialize connection',
        }));
      }
    };

    initSocket();
  }, []);

  /**
   * Handle driver login
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setState(prev => ({ ...prev, error: null }));

      if (!credentials.licenseNumber || !credentials.password) {
        setState(prev => ({
          ...prev,
          error: 'Please enter license number and password',
        }));
        return;
      }

      console.log('[DRIVER] Attempting login...');
      const response = await apiClient.loginDriver(
        credentials.licenseNumber,
        credentials.password
      );

      if (!response.success) {
        setState(prev => ({
          ...prev,
          error: response.error || 'Login failed',
        }));
        return;
      }

      const busId = response.data?.bus?.busId;
      const busName = response.data?.bus?.busName;

      setState(prev => ({
        ...prev,
        isAuthenticated: true,
        busId,
        busName,
      }));

      console.log(`[DRIVER] Logged in to bus ${busId}: ${busName}`);

      // Authenticate with Socket.IO
      const socketManager = getSocketManager();
      if (socketManager) {
        await socketManager.connect();
        await socketManager.authenticateDriver(response.data?.token, busId);
        socketManager.startHealthCheck();
      }

      // Start tracking
      startLocationTracking();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login error';
      setState(prev => ({ ...prev, error: message }));
      console.error('[DRIVER] Login error:', message);
    }
  };

  /**
   * Start watching GPS location
   */
  const startLocationTracking = () => {
    console.log('[DRIVER] Starting location tracking...');

    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        error: 'Geolocation not supported on this device',
      }));
      return;
    }

    // Watch GPS position
    watchIdRef.current = navigator.geolocation.watchPosition(
      position => {
        const { latitude, longitude, accuracy } = position.coords;
        const speed = position.coords.speed || 0;

        setState(prev => ({
          ...prev,
          latitude,
          longitude,
          accuracy,
          speed,
          isTracking: true,
        }));

        console.log(`[DRIVER] GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      },
      error => {
        console.error('[DRIVER] GPS error:', error.message);
        setState(prev => ({
          ...prev,
          error: `GPS error: ${error.message}`,
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    // Send location every 1 second
    locationIntervalRef.current = setInterval(() => {
      if (state.latitude && state.longitude && state.busId) {
        sendLocationUpdate();
      }
    }, 1000);

    setState(prev => ({ ...prev, isTracking: true }));
  };

  /**
   * Send location to backend
   */
  const sendLocationUpdate = async () => {
    if (!state.latitude || !state.longitude || !state.busId) return;

    try {
      const socketManager = getSocketManager();
      
      if (socketManager?.isConnected()) {
        // Send via Socket.IO (1-second update)
        socketManager.updateLocation(
          state.latitude,
          state.longitude,
          state.speed || undefined,
          state.accuracy || undefined
        );
      } else {
        // Fallback to HTTP API
        await apiClient.updateLocation(
          state.latitude,
          state.longitude,
          state.speed || undefined,
          state.accuracy || undefined
        );
      }
    } catch (error) {
      console.error('[DRIVER] Location update failed:', error);
    }
  };

  /**
   * Stop tracking
   */
  const stopTracking = async () => {
    console.log('[DRIVER] Stopping location tracking...');

    // Stop GPS watching
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Stop sending location
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }

    // Disconnect from server
    try {
      await apiClient.disconnect();
    } catch (error) {
      console.error('[DRIVER] Disconnect error:', error);
    }

    const socketManager = getSocketManager();
    if (socketManager) {
      socketManager.disconnect();
    }

    setState(prev => ({
      ...prev,
      isAuthenticated: false,
      isTracking: false,
      busId: null,
      busName: null,
      latitude: null,
      longitude: null,
    }));

    setCredentials({ licenseNumber: '', password: '' });
  };

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="driver-tracking-dashboard">
      <header className="driver-header">
        <h1>🚗 Driver Tracking System</h1>
        <p>Send real-time GPS location to students</p>
        <div className="connection-status">
          <span className={`status-dot ${connectionStatus === 'Connected' ? 'connected' : 'disconnected'}`}></span>
          <span>{connectionStatus}</span>
        </div>
      </header>

      {state.error && <div className="alert alert-error">{state.error}</div>}

      {!state.isAuthenticated ? (
        /* Login Form */
        <div className="login-container">
          <div className="login-card">
            <h2>Driver Login</h2>
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label htmlFor="licenseNumber">License Number (Bus No.)</label>
                <input
                  id="licenseNumber"
                  type="text"
                  placeholder="e.g., BUS-EXP-001"
                  value={credentials.licenseNumber}
                  onChange={e =>
                    setCredentials(prev => ({
                      ...prev,
                      licenseNumber: e.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password (License Number)</label>
                <input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={credentials.password}
                  onChange={e =>
                    setCredentials(prev => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary">
                Login & Start Tracking
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Tracking Dashboard */
        <div className="tracking-dashboard">
          <div className="dashboard-header">
            <div className="bus-info">
              <h2>{state.busName}</h2>
              <p className="bus-id">Bus ID: {state.busId}</p>
            </div>
            <button onClick={stopTracking} className="btn btn-danger">
              Stop & Logout
            </button>
          </div>

          {state.isTracking && (
            <div className="tracking-info">
              <div className="info-grid">
                <div className="info-card">
                  <h4>Current Location</h4>
                  <p>
                    Latitude: <code>{state.latitude?.toFixed(6)}</code>
                  </p>
                  <p>
                    Longitude: <code>{state.longitude?.toFixed(6)}</code>
                  </p>
                </div>

                <div className="info-card">
                  <h4>GPS Accuracy</h4>
                  <p>±{state.accuracy?.toFixed(1)} meters</p>
                </div>

                <div className="info-card">
                  <h4>Speed</h4>
                  <p>{state.speed ? (state.speed * 3.6).toFixed(1) : '0'} km/h</p>
                </div>

                <div className="info-card">
                  <h4>Tracking Status</h4>
                  <p className="status-active">✓ Active (1-second updates)</p>
                </div>
              </div>

              {/* Map showing current location */}
              {state.latitude && state.longitude && (
                <div className="map-container">
                  <div className="location-display">
                    <h3>📍 Current Location</h3>
                    <div className="coordinates">
                      <p><strong>Latitude:</strong> {state.latitude.toFixed(6)}</p>
                      <p><strong>Longitude:</strong> {state.longitude.toFixed(6)}</p>
                    </div>
                    <p className="note">View this location on your preferred map app (Google Maps, Apple Maps, etc.)</p>
                  </div>
                </div>
              )}

              <div className="tracking-notice">
                <p>✓ Location is being sent every 1 second to students</p>
                <p>✓ GPS accuracy: {state.accuracy?.toFixed(1)} meters</p>
                <p>✓ Battery usage: High (GPS + Network active)</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DriverTrackingDashboard;
