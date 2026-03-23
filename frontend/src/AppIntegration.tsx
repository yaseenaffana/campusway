/**
 * ===================================================================
 * Main App Component
 * Integrates all tracking modules with proper initialization
 * ===================================================================
 */

import React, { useEffect, useState } from 'react';
import { initializeApiClient } from './services/ApiClient';
import { initializeSocketManager } from './services/SocketManager';
import { getApiUrl, getPreferredBrowserOrigin, getSocketUrl } from '../services/api';
import DriverTrackingDashboard from './components/DriverTracking';
import AdminDashboard from './components/AdminDashboard';
import './styles/App.css';

type AppMode = 'home' | 'driver' | 'admin';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('home');
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Initialize API and WebSocket clients
   */
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const apiUrl = getApiUrl();
        const socketUrl = getSocketUrl();

        console.log('[APP] Initializing...');
        console.log(`[APP] API URL: ${apiUrl}`);
        console.log(`[APP] Socket URL: ${socketUrl}`);

        // Initialize API client
        initializeApiClient(apiUrl);

        // Initialize Socket.IO manager
        await initializeSocketManager({
          url: socketUrl,
          autoConnect: false, // Connect on demand
        });

        setInitialized(true);
        console.log('[APP] ✓ Initialization complete');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Initialization error';
        setError(message);
        console.error('[APP] Initialization error:', message);
      }
    };

    initializeApp();
  }, []);

  if (!initialized) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p>Initializing MZSJS BUZZ...</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="app">
      {/* Navigation */}
      {mode === 'home' && (
        <nav className="main-nav">
          <div className="nav-brand">
            <h1>🚌 MZSJS BUZZ</h1>
            <p>Real-Time Bus Tracking System</p>
          </div>
        </nav>
      )}

      {/* Home Page */}
      {mode === 'home' && <HomePage onSelectMode={setMode} />}

      {/* Driver Mode */}
      {mode === 'driver' && (
        <>
          <nav className="back-nav">
            <button onClick={() => setMode('home')} className="btn-back">
              ← Back to Home
            </button>
          </nav>
          <DriverTrackingDashboard />
        </>
      )}

      {/* Admin Mode */}
      {mode === 'admin' && (
        <>
          <nav className="back-nav">
            <button onClick={() => setMode('home')} className="btn-back">
              ← Back to Home
            </button>
          </nav>
          <AdminDashboard />
        </>
      )}
    </div>
  );
};

/**
 * Home Page Component
 */
const HomePage: React.FC<{ onSelectMode: (mode: AppMode) => void }> = ({ onSelectMode }) => {
  return (
    <div className="home-page">
      <div className="hero">
        <h1>🚌 MZSJS BUZZ</h1>
        <p className="tagline">Real-Time Bus Tracking System</p>
        <p className="subtitle">Live GPS tracking for buses with 1-second updates</p>
      </div>

      <div className="mode-selector">
        <div className="mode-card driver-card">
          <div className="mode-icon">🚗</div>
          <h2>Driver Mode</h2>
          <p>Send your GPS location to students</p>
          <ul>
            <li>Login with license number</li>
            <li>Enable GPS tracking</li>
            <li>Send 1-second location updates</li>
            <li>See live map of your route</li>
          </ul>
          <button
            onClick={() => onSelectMode('driver')}
            className="btn btn-success btn-large"
          >
            Login as Driver
          </button>
        </div>

        <div className="mode-card admin-card">
          <div className="mode-icon">📊</div>
          <h2>Admin Dashboard</h2>
          <p>Monitor all buses and statistics</p>
          <ul>
            <li>View all buses status</li>
            <li>Real-time statistics</li>
            <li>Location history tracking</li>
            <li>System monitoring</li>
          </ul>
          <button
            onClick={() => onSelectMode('admin')}
            className="btn btn-info btn-large"
          >
            Open Dashboard
          </button>
        </div>
      </div>

      <footer className="app-footer">
        <p>MZSJS BUZZ v1.0.0 | Real-Time GPS Bus Tracking</p>
        <p className="server-info">
          API: {import.meta.env.VITE_API_URL || 'http://localhost:4010'} • Socket.IO: 
          {import.meta.env.VITE_SOCKET_URL || 'http://localhost:4010'}
        </p>
      </footer>
    </div>
  );
};

export default App;
