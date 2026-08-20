import React, { useEffect, useRef, useState } from 'react';
import { Coordinates } from '../types';
import { buseService } from '../services/busService';
import { socketService } from '../services/socketService';

interface DriverScreenProps {
  busNo: number;
  registration: string;
  route: string;
  token?: string;
  onLogout: () => void;
}

const DriverScreen: React.FC<DriverScreenProps> = ({ busNo, registration, route, token, onLogout }) => {
  const [isSharing, setIsSharing] = useState(false);
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [speed, setSpeed] = useState(0);
  const [sendCount, setSendCount] = useState(0);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [disconnectMessage, setDisconnectMessage] = useState<string | null>(null);

  const latestCoords = useRef<Coordinates | null>(null);
  const latestSpeed = useRef(0);
  const watchId = useRef<number | null>(null);
  const intervalId = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (token) {
      localStorage.setItem('authToken', token);
      localStorage.setItem('driver_token', token);
    }
  }, [token]);

  const stopSharing = async () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }

    if (intervalId.current !== null) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }

    try {
      const activeToken = token || localStorage.getItem('driver_token') || localStorage.getItem('authToken') || '';
      await buseService.disconnectDriver(activeToken);
      setDisconnectMessage('Disconnected successfully. Sharing stopped.');
      setSendCount(0);
      setLastSent(null);
      setTimeout(() => setDisconnectMessage(null), 3000);
    } catch (err) {
      console.error('Disconnect failed:', err);
      setDisconnectMessage('Disconnect failed, but sharing has stopped locally.');
      setTimeout(() => setDisconnectMessage(null), 4000);
    }

    socketService.leaveBus(busNo);

    setIsSharing(false);
    setCoords(null);
    setSpeed(0);
    setAccuracy(null);
    latestCoords.current = null;
    latestSpeed.current = 0;
  };

  const startSharing = async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    try {
      setError(null);
      setIsSharing(true);

      if (!socketService.isConnected()) {
        await socketService.connect(token);
      }

      socketService.joinBus(busNo);

      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, speed: mps, accuracy: gpsAccuracy } = pos.coords;
          const newCoords = { lat: latitude, lng: longitude };
          const newSpeed = mps ? Math.round(mps * 3.6) : 0;

          setCoords(newCoords);
          setSpeed(newSpeed);
          setAccuracy(gpsAccuracy);

          latestCoords.current = newCoords;
          latestSpeed.current = newSpeed;
        },
        (err) => {
          console.error('GPS Error:', err);
          setError(`GPS Error: ${err.message}`);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000
        }
      );

      intervalId.current = setInterval(async () => {
        if (latestCoords.current) {
          try {
            await buseService.updateBusLocation(busNo, {
              lat: latestCoords.current.lat,
              lng: latestCoords.current.lng,
              speed: latestSpeed.current,
              timestamp: Date.now()
            });
            setSendCount((prev) => prev + 1);
            setLastSent(new Date().toLocaleTimeString());
          } catch (err) {
            console.error('Location update failed:', err);
            setError(`Update failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        }
      }, 1000);
    } catch (err) {
      console.error('Failed to start sharing:', err);
      setError(err instanceof Error ? err.message : 'Failed to start sharing');
      setIsSharing(false);
    }
  };

  useEffect(() => {
    return () => {
      stopSharing();
    };
  }, []);

  const handleLogout = async () => {
    await stopSharing();
    localStorage.removeItem('authToken');
    localStorage.removeItem('driver_token');
    onLogout();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      color: '#1e293b',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '48px', margin: '0', fontWeight: '800', letterSpacing: '-2px', color: '#0f172a' }}>
          BUS {busNo}
        </h1>
        <div style={{
          display: 'inline-block',
          padding: '4px 12px',
          background: 'white',
          borderRadius: '20px',
          fontSize: '14px',
          marginTop: '8px',
          border: '1px solid #e2e8f0',
          color: '#64748b'
        }}>
          {registration}
        </div>
        <p style={{ color: '#2563eb', marginTop: '12px', fontSize: '18px', fontWeight: '500' }}>
          {route}
        </p>
      </div>

      {error && (
        <div style={{
          width: '100%',
          maxWidth: '400px',
          padding: '12px 16px',
          background: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          color: '#991b1b',
          fontSize: '14px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: '20px' }}
          >
            x
          </button>
        </div>
      )}

      {disconnectMessage && (
        <div style={{
          width: '100%',
          maxWidth: '400px',
          padding: '12px 16px',
          background: disconnectMessage.startsWith('Disconnected') ? '#d1fae5' : '#fee2e2',
          border: `1px solid ${disconnectMessage.startsWith('Disconnected') ? '#a7f3d0' : '#fca5a5'}`,
          borderRadius: '8px',
          color: disconnectMessage.startsWith('Disconnected') ? '#065f46' : '#991b1b',
          fontSize: '14px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{disconnectMessage}</span>
          <button
            onClick={() => setDisconnectMessage(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '20px' }}
          >
            x
          </button>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
        width: '100%',
        maxWidth: '400px',
        marginBottom: '32px'
      }}>
        <StatCard label="Speed" value={`${speed}`} unit="km/h" />
        <StatCard label="Sent" value={`${sendCount}`} unit="times" />
        <StatCard label="Last" value={lastSent || '--:--'} unit="" />
      </div>

      {accuracy && (
        <div style={{
          fontSize: '12px',
          color: '#64748b',
          marginBottom: '16px',
          textAlign: 'center'
        }}>
          Accuracy: +/-{accuracy.toFixed(1)}m
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: '40px' }}>
        {!isSharing ? (
          <button
            onClick={startSharing}
            style={{
              ...buttonStyle,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 10px 25px rgba(16, 185, 129, 0.4)'
            }}
          >
            START SHARING
          </button>
        ) : (
          <>
            <div className="pulse-button-ring"></div>
            <button
              onClick={stopSharing}
              style={{
                ...buttonStyle,
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                boxShadow: '0 10px 25px rgba(239, 68, 68, 0.4)',
                position: 'relative',
                zIndex: 2
              }}
            >
              STOP SHARING
            </button>
          </>
        )}
      </div>

      {isSharing && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: '600' }}>
            <div className="dot-blink"></div>
            Live - students can see your location
          </div>
          <div style={{ marginTop: '12px', fontSize: '13px', color: '#94a3b8' }}>
            Lat: {coords?.lat.toFixed(6)} | Lng: {coords?.lng.toFixed(6)}
          </div>
        </div>
      )}

      <button
        onClick={handleLogout}
        style={{
          marginTop: 'auto',
          background: 'transparent',
          color: '#64748b',
          border: '1px solid #e2e8f0',
          padding: '10px 24px',
          borderRadius: '12px',
          cursor: 'pointer',
          fontWeight: '600'
        }}
      >
        Logout
      </button>

      <style>{`
        .dot-blink { width: 8px; height: 8px; background: #10b981; border-radius: 50%; animation: blink 1s infinite; }
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
        .pulse-button-ring {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          border-radius: 40px;
          border: 4px solid #ef4444;
          animation: pulse-ring 1.5s infinite;
        }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.3); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

const StatCard = ({ label, value, unit }: { label: string, value: string, unit: string }) => (
  <div style={{
    background: 'white',
    padding: '16px 8px',
    borderRadius: '20px',
    textAlign: 'center',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
  }}>
    <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
    <div style={{ fontSize: '24px', fontWeight: '700' }}>{value}</div>
    <div style={{ fontSize: '10px', color: '#64748b' }}>{unit}</div>
  </div>
);

const buttonStyle: React.CSSProperties = {
  padding: '18px 48px',
  borderRadius: '40px',
  fontSize: '18px',
  fontWeight: '800',
  color: 'white',
  border: 'none',
  cursor: 'pointer',
  letterSpacing: '1px'
};

export default DriverScreen;
