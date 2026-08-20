import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BusLocation, Coordinates } from '../types';
import { getApiUrl } from '../services/api';
import ColorMapLegend, { 
  COLOR_MAP, 
  createBusIconWithColor, 
  createStudentIcon,
  getMarkerColorByStatus,
  getRouteColorByStatus 
} from '../services/colorMap';

interface StudentMapProps {
  busNo: number;
  studentLocation: Coordinates | null;
}

// Map Controller for Zoom and Panning
const MapControls = ({ busLocation }: { busLocation: Coordinates | null }) => {
  const map = useMap();
  
  const handleZoomIn = () => map.zoomIn();
  const handleZoomOut = () => map.zoomOut();
  const handleFlyToBus = () => {
    if (busLocation) {
      map.flyTo([busLocation.lat, busLocation.lng], 16, { animate: true, duration: 1.5 });
    }
  };

  return (
    <div className="custom-map-controls" style={{
      position: 'absolute', bottom: '20px', right: '20px', zIndex: 1000,
      display: 'flex', flexDirection: 'column', gap: '10px'
    }}>
      <button onClick={handleZoomIn} style={controlStyle}>+</button>
      <button onClick={handleZoomOut} style={controlStyle}>−</button>
      <button onClick={handleFlyToBus} style={{...controlStyle, background: '#1a56db', color: 'white'}}>🎯</button>
    </div>
  );
};

const controlStyle: React.CSSProperties = {
  width: '44px', height: '44px', background: 'white', border: 'none',
  borderRadius: '12px', fontSize: '20px', fontWeight: 'bold',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center'
};

const StudentMap: React.FC<StudentMapProps> = ({ busNo, studentLocation }) => {
  const [bus, setBus] = useState<BusLocation | null>(null);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [eta, setEta] = useState<number | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [busStatus, setBusStatus] = useState<string>('offline');
  const API_URL = getApiUrl();

  // Get dynamic bus icon color based on status
  const getBusIcon = () => {
    const color = getMarkerColorByStatus(busStatus);
    return createBusIconWithColor(color);
  };

  // Get dynamic route color based on status
  const getRouteColor = () => {
    return getRouteColorByStatus(isOnline);
  };

  // Clear route when bus goes offline
  useEffect(() => {
    if (!isOnline) {
      setRoute([]);
    }
  }, [isOnline]);

  // Poll for location
  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const res = await fetch(`${API_URL}/api/buses`);
        const data = await res.json();
        if (data.buses && Array.isArray(data.buses)) {
          const foundBus = data.buses.find((b: any) => b.BusNo === busNo || String(b.BusNo) === String(busNo));
          if (foundBus && foundBus.location) {
            // Map the bus data to BusLocation format
            setBus({
              Latitude: foundBus.location.lat || foundBus.CurrentLat || 0,
              Longitude: foundBus.location.lng || foundBus.CurrentLng || 0,
              Speed: foundBus.location.speed || foundBus.Speed || 0,
              Route: foundBus.route || foundBus.DestinationName || '',
              Registration: foundBus.registrationNumber || foundBus.Username || '',
              ...foundBus
            } as any);
            setIsOnline(true);
            setBusStatus('online');
          } else {
            setIsOnline(false);
            setBusStatus('offline');
            setBus(null);
            setRoute([]);
          }
        }
      } catch (err) {
        console.error("Error fetching bus location:", err);
        setIsOnline(false);
        setBusStatus('offline');
      }
    };

    fetchLocation();
    const interval = setInterval(fetchLocation, 5000);
    return () => clearInterval(interval);
  }, [busNo, API_URL]);

  // Fetch OSRM Route
  useEffect(() => {
    if (!bus || !studentLocation) return;

    const fetchRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${bus.Longitude},${bus.Latitude};${studentLocation.lng},${studentLocation.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.routes && data.routes[0]) {
          const coords = data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
          setRoute(coords);
          
          const distMeters = data.routes[0].distance;
          setDistance(distMeters > 1000 ? `${(distMeters / 1000).toFixed(1)} km` : `${Math.round(distMeters)} m`);
          
          // ETA Calculation
          const speedKph = bus.Speed > 2 ? bus.Speed : 30; // Default 30km/h
          const timeMinutes = Math.round((distMeters / 1000) / (speedKph / 60));
          setEta(timeMinutes);
        } else {
          // Fallback to straight line
          setRoute([[bus.Latitude, bus.Longitude], [studentLocation.lat, studentLocation.lng]]);
        }
      } catch (err) {
        console.error("OSRM Error:", err);
        setRoute([[bus.Latitude, bus.Longitude], [studentLocation.lat, studentLocation.lng]]);
      }
    };

    fetchRoute();
  }, [bus, studentLocation]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Status Bar */}
      <div style={{
        position: 'absolute', top: '20px', left: '20px', zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.95)', padding: '15px', borderRadius: '16px',
        boxShadow: '0 8px 16px rgba(0,0,0,0.1)', backdropFilter: 'blur(8px)',
        minWidth: '220px', border: '1px solid rgba(255,255,255,0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div style={{ 
            width: '10px', height: '10px', borderRadius: '50%', 
            background: isOnline ? '#10b981' : '#ef4444',
            boxShadow: isOnline ? '0 0 10px #10b981' : 'none'
          }}></div>
          <span style={{ fontWeight: 'bold', fontSize: '18px' }}>Bus {busNo}</span>
          <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: 'auto' }}>
            {bus?.Registration}
          </span>
        </div>
        
        {isOnline ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px' }}>
            <div>
              <div style={{ color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Route</div>
              <div style={{ fontWeight: '600' }}>{bus?.Route}</div>
            </div>
            <div>
              <div style={{ color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Speed</div>
              <div style={{ fontWeight: '600' }}>{Math.round(bus?.Speed || 0)} km/h</div>
            </div>
            <div>
              <div style={{ color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Distance</div>
              <div style={{ fontWeight: '600', color: '#1a56db' }}>{distance || '--'}</div>
            </div>
            <div>
              <div style={{ color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>ETA</div>
              <div style={{ fontWeight: '600', color: '#1a56db' }}>{eta ? `${eta} mins` : '--'}</div>
            </div>
          </div>
        ) : (
          <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '14px' }}>
            ❌ GPS Sharing Stopped
          </div>
        )}
      </div>

      {/* Offline Banner */}
      {!isOnline && (
        <div style={{
          position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: '#fee2e2', color: '#991b1b', padding: '12px 20px',
          borderRadius: '30px', fontWeight: '600', border: '1px solid #fca5a5',
          boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
          fontSize: '14px'
        }}>
          ⚠️ Bus offline. Driver has ended GPS sharing.
        </div>
      )}

      <MapContainer
        center={[10.3159, 78.8242]}
        zoom={14}
        style={{ width: '100%', height: '100%', borderRadius: '24px' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='&copy; <a href="https://www.arcgis.com/">Esri</a>'
        />
        
        {isOnline && bus && (
          <Marker position={[bus.Latitude, bus.Longitude]} icon={getBusIcon()} />
        )}
        
        {studentLocation && (
          <Marker position={[studentLocation.lat, studentLocation.lng]} icon={createStudentIcon()} />
        )}

        {route.length > 0 && (
          <Polyline 
            positions={route} 
            pathOptions={{ color: getRouteColor(), weight: 5, opacity: 0.8 }} 
          />
        )}

        <ColorMapLegend position="top-left" />
        <MapControls busLocation={bus ? { lat: bus.Latitude, lng: bus.Longitude } : null} />
      </MapContainer>

      <style>{`
        .pulse-ring {
          position: absolute;
          width: 30px;
          height: 30px;
          border: 3px solid #10b981;
          border-radius: 50%;
          animation: pulse 1.5s infinite;
          margin-left: -5px;
          margin-top: -5px;
        }
        @keyframes pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        .leaflet-container {
          background: #f3f4f6;
        }
      `}</style>
    </div>
  );
};

export default StudentMap;
