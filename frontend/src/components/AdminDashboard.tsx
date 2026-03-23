/**
 * Admin Dashboard - View all buses and statistics
 */

import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/ApiClient';
import { getSocketManager } from '../services/SocketManager';
import './AdminDashboard.css';
import './AdminDashboard.css';

interface AdminStats {
  totalBuses: number;
  activeBuses: number;
  busesTrackedLastHour: number;
  onlineNow: number;
}

interface BusDetail {
  bus_id: number;
  bus_name: string;
  is_active: number;
  isActive: boolean;
  locationHistory?: any[];
}

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [buses, setBuses] = useState<BusDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const apiClient = getApiClient();
  const socketManager = getSocketManager();

  /**
   * Fetch admin data
   */
  const fetchAdminData = async () => {
    try {
      setError(null);

      // Fetch stats
      const statsResponse = await apiClient.getStats();
      if (statsResponse.success) {
        setStats(statsResponse.data);
      }

      // Fetch buses
      const busesResponse = await apiClient.getAdminBuses();
      if (busesResponse.success) {
        setBuses(busesResponse.data);
      }

      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error loading data';
      setError(message);
      setLoading(false);
    }
  };

  /**
   * Initialize
   */
  useEffect(() => {
    fetchAdminData();

    if (autoRefresh) {
      const interval = setInterval(fetchAdminData, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  /**
   * Listen to socket events
   */
  useEffect(() => {
    if (!socketManager) return;

    const unsubOnline = socketManager.on('bus_online', () => {
      fetchAdminData();
    });

    const unsubOffline = socketManager.on('bus_offline', () => {
      fetchAdminData();
    });

    return () => {
      unsubOnline();
      unsubOffline();
    };
  }, [socketManager]);

  if (loading && !stats) {
    return <div className="loading">Loading admin dashboard...</div>;
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <h1>📊 Admin Dashboard</h1>
        <div className="header-controls">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            Auto Refresh (5s)
          </label>
          <button onClick={fetchAdminData} className="btn btn-small">
            🔄 Refresh Now
          </button>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Statistics Cards */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Buses</h3>
            <p className="stat-value">{stats.totalBuses}</p>
          </div>
          <div className="stat-card">
            <h3>Active Buses</h3>
            <p className="stat-value">{stats.activeBuses}</p>
          </div>
          <div className="stat-card">
            <h3>Tracked (Last Hour)</h3>
            <p className="stat-value">{stats.busesTrackedLastHour}</p>
          </div>
          <div className="stat-card">
            <h3>Online Now</h3>
            <p className="stat-value">{stats.onlineNow}</p>
          </div>
        </div>
      )}

      {/* Buses Table */}
      <div className="buses-table-container">
        <h2>All Buses</h2>
        <table className="buses-table">
          <thead>
            <tr>
              <th>Bus ID</th>
              <th>Bus Name</th>
              <th>Status</th>
              <th>Tracking</th>
              <th>Locations (Last 10)</th>
            </tr>
          </thead>
          <tbody>
            {buses.map(bus => (
              <tr key={bus.bus_id}>
                <td>{bus.bus_id}</td>
                <td>{bus.bus_name}</td>
                <td>
                  <span className={`status-badge ${bus.is_active ? 'active' : 'inactive'}`}>
                    {bus.is_active ? '✓ Active' : '✗ Inactive'}
                  </span>
                </td>
                <td>
                  <span className={`tracking-badge ${bus.isActive ? 'tracking' : 'idle'}`}>
                    {bus.isActive ? '📍 Tracking' : '⏸ Idle'}
                  </span>
                </td>
                <td>{bus.locationHistory?.length || 0} records</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDashboard;
