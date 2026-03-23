import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import '../styles/tracking.css';
import { getApiUrl } from '../services/api';

const API_URL = getApiUrl();

const busIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%237C3AED"><path d="M18 18.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM9 18.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM4 8h16v6H4zm13-4H7v2h10z"/></svg>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16]
});

export default function BusTrackingPage({ busNo = 'BUS-001' }) {
  const [busStatus, setBusStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mapCenter, setMapCenter] = useState([10.105871781656774, 78.64251386094996]);
  const mapRef = useRef(null);

  const fetchBusStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/bus/${busNo}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setBusStatus(data);
      setError(null);

      const bus = data?.bus;
      if (bus?.CurrentLat != null && bus?.CurrentLng != null) {
        setMapCenter([Number(bus.CurrentLat), Number(bus.CurrentLng)]);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error fetching bus status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchBusStatus();

    const interval = setInterval(fetchBusStatus, 3000);
    return () => clearInterval(interval);
  }, [busNo]);

  if (loading && !busStatus) {
    return (
      <div className="tracking-container">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading bus location...</p>
        </div>
      </div>
    );
  }

  if (error && !busStatus) {
    return (
      <div className="tracking-container">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={fetchBusStatus}>Retry</button>
        </div>
      </div>
    );
  }

  const bus = busStatus?.bus;
  const busPosition =
    bus?.CurrentLat != null && bus?.CurrentLng != null
      ? [Number(bus.CurrentLat), Number(bus.CurrentLng)]
      : null;

  return (
    <div className="tracking-container">
      <div className="map-wrapper">
        <MapContainer
          center={mapCenter}
          zoom={15}
          className="tracking-map"
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          {busPosition && (
            <Marker position={busPosition} icon={busIcon}>
              <Popup>
                <div className="popup-content">
                  <p className="bus-name">{bus?.BusNo}</p>
                  <p className="route-name">{bus?.DestinationName || bus?.BusName}</p>
                  <p className="speed">{Number(bus?.Speed || 0).toFixed(1)} km/h</p>
                  <p className="distance">{bus?.distanceText || bus?.distance || '--'}</p>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      <div className="info-card">
        <div className="bus-header">
          <div>
            <h2>{bus?.BusNo}</h2>
            <p className="route">{bus?.DestinationName || bus?.BusName}</p>
          </div>
        </div>

        <div className="section bus-info-section">
          <h3>Bus Details</h3>
          <div className="bus-details-grid">
            <div className="detail">
              <span className="label">Distance</span>
              <span className="value">{bus?.distanceText || bus?.distance || '--'}</span>
            </div>
            <div className="detail">
              <span className="label">ETA</span>
              <span className="value">{bus?.etaMinutes ? `${bus.etaMinutes} min` : '--'}</span>
            </div>
            <div className="detail">
              <span className="label">Speed</span>
              <span className="value">{Number(bus?.Speed || 0).toFixed(1)} km/h</span>
            </div>
            <div className="detail">
              <span className="label">Last Updated</span>
              <span className="value">{bus?.LastUpdated ? new Date(bus.LastUpdated).toLocaleTimeString() : '--'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
