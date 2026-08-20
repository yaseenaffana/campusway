import React, { useState, useEffect } from 'react';
import schoolLogo from '../school_logo.jpg';
import { apiClient } from '../services/api';
import { FLEET_CATALOG, findFleetCatalogItem, normalizeBusNo } from '../data/fleetCatalog';
import RouteCard from './RouteCard';

interface BusItem {
  busNo: number | string;
  registration: string;
  route: string;
  isSpare: boolean;
  isOnline: boolean;
  meta?: string;
  username?: string;
}

interface Props {
  onDriverLogin: (session: {
    busNo: number | string;
    registration: string;
    route: string;
  }) => void;
  onCancel: () => void;
}

const FALLBACK_BUSES: BusItem[] = FLEET_CATALOG.map((bus) => ({
  busNo: bus.busNo,
  registration: bus.registration,
  route: bus.route,
  isSpare: bus.isSpare,
  isOnline: false,
  meta: '',
  username: `bus${bus.busNo}`
}));

const DriverLogin: React.FC<Props> = ({ onDriverLogin, onCancel }) => {
  const [loading, setLoading] = useState(true);
  const [buses, setBuses] = useState<BusItem[]>([]);
  const [selectedBus, setSelectedBus] = useState<BusItem | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    const fetchBuses = async () => {
      try {
        setLoading(true);
        const list = await apiClient.getBuses();
        if (list.length === 0) {
          setBuses(FALLBACK_BUSES);
          return;
        }
        const transformed: BusItem[] = list.map((b: any) => {
          const catalogItem = findFleetCatalogItem({
            busNo: b.busNumber || b.BusNo || b.Username,
            registration: b.registrationNumber || b.Registration || b.BusNo,
            route: b.route || b.DestinationName
          });
          const busNum = catalogItem?.busNo || normalizeBusNo(b.busNumber || b.BusNo || b.Username) || b.BusNo;
          const backendRoute = String(b.DestinationName || b.Route || b.route || '').trim();
          const backendRegistration = String(b.registrationNumber || b.Registration || b.BusNo || '').trim();
          const isSpare =
            typeof b.IsActive !== 'undefined'
              ? !Boolean(b.IsActive)
              : (catalogItem?.isSpare || backendRoute === 'Spare');
          const effectiveRoute = backendRoute || catalogItem?.route || 'Unknown';
          const meta = '';

          return {
            busNo: busNum || b.BusNo,
            registration: backendRegistration || catalogItem?.registration || b.BusNo,
            route: effectiveRoute,
            isSpare,
            isOnline: Boolean(b.isOnline || b.IsOnline),
            meta,
            username: b.Username
          };
        });
        setBuses(transformed);
      } catch (err) {
        setBuses(FALLBACK_BUSES);
      } finally {
        setLoading(false);
      }
    };
    fetchBuses();
  }, []);

  const handleBusClick = (bus: BusItem) => {
    if (bus.isSpare) return;
    setSelectedBus(bus);
    setLoginError('');
    setPassword('');
  };

  const handleLogin = async () => {
    if (!selectedBus || !password.trim()) return;
    
    setLoginLoading(true);
    setLoginError('');
    
    try {
      const loginIdentifier = String(selectedBus.username || selectedBus.registration || `bus${selectedBus.busNo}`).trim();
      const email = loginIdentifier;
      const response = await apiClient.driverLogin(email, password.trim());
      
      if (!response.success) {
        throw new Error(response.error || 'Login failed');
      }

      onDriverLogin({
        busNo: selectedBus.busNo,
        registration: selectedBus.registration,
        route: response.busDetails.route || selectedBus.route
      });
    } catch (err: any) {
      triggerShake();
      setLoginError(err.message === 'Failed to fetch' ? 'Cannot reach server. Check connection.' : (err.message || 'Login failed. Try again.'));
    } finally {
      setLoginLoading(false);
    }
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  if (loading) return <LoadingSpinner />;
  if (buses.length === 0) return <EmptyState />;

  return (
    <div style={{ height: '100vh', backgroundColor: '#f4f7fb', color: '#1e293b', overflowY: 'auto', fontFamily: "'Inter', sans-serif", width: '100%', boxSizing: 'border-box', paddingBottom: '80px' }}>
      <div style={{ padding: '16px', maxWidth: '480px', margin: '0 auto', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10 }}>
          <button onClick={onCancel} style={{ width: '40px', height: '40px', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>

        <div style={{ textAlign: 'center', padding: '12px 0', marginBottom: '20px' }}>
          <div style={{ marginBottom: '8px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={schoolLogo} alt="School Logo" style={{ height: '48px', width: 'auto', objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', margin: '0', color: '#0f172a', letterSpacing: '-0.5px' }}>MZSJS BUZZ</h1>
          <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase', marginTop: '4px' }}>SELECT YOUR BUS</p>
        </div>

        <BusGrid buses={[...buses].sort((a, b) => (parseInt(String(a.busNo).replace(/\D/g, '')) || 0) - (parseInt(String(b.busNo).replace(/\D/g, '')) || 0))} onBusClick={handleBusClick} />
      </div>

      {selectedBus && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '24px', width: '100%', maxWidth: '360px', padding: '32px', color: '#1e293b', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', animation: 'modalOpen 0.3s ease-out' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '800', margin: '0 0 8px 0' }}>Bus {selectedBus.busNo}</h2>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 24px 0' }}>Enter your password</p>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '16px 48px 16px 16px',
                    borderRadius: '12px',
                    border: `2px solid ${loginError ? '#ef4444' : '#e2e8f0'}`,
                    fontSize: '16px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box'
                  }}
                  className={isShaking ? 'shake' : ''}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              {loginError && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px', fontWeight: '600' }}>{loginError}</p>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button onClick={handleLogin} disabled={loginLoading} style={{ width: '100%', padding: '16px', borderRadius: '12px', backgroundColor: '#2563eb', color: 'white', fontSize: '16px', fontWeight: '700', border: 'none', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)' }}>
                {loginLoading ? 'Authenticating...' : 'CONFIRM'}
              </button>
              <button onClick={() => setSelectedBus(null)} style={{ width: '100%', padding: '12px', borderRadius: '12px', backgroundColor: 'transparent', color: '#64748b', fontSize: '14px', fontWeight: '600', border: 'none', cursor: 'pointer' }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes modalOpen { from { opacity: 0; transform: scale(0.9) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes shake { 0%,100%{transform:translateX(0);}20%,60%{transform:translateX(-6px);}40%,80%{transform:translateX(6px);} }
        .shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
};

const BusGrid: React.FC<{ buses: BusItem[], onBusClick: (bus: BusItem) => void }> = ({ buses, onBusClick }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px', width: '100%' }}>
    {buses.map((bus, idx) => (
      <RouteCard
        key={`bus-${bus.busNo}-${idx}`}
        route={bus.route || 'Route not assigned'}
        busLabel={`Bus ${bus.busNo}`}
        status={bus.isSpare ? 'spare' : bus.isOnline ? 'live' : 'ready'}
        meta={bus.meta || ''}
        disabled={bus.isSpare}
        onClick={() => onBusClick(bus)}
      />
    ))}
  </div>
);

const LoadingSpinner = () => (
  <div style={{ height: '100vh', display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '40px 20px', backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'flex-start' }}>
    <div style={{ width: '100%', maxWidth: '480px', display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
      {[1,2,3,4,5,6].map(i => <div key={i} style={{ height: '132px', backgroundColor: '#e2e8f0', borderRadius: '20px', animation: 'pulse-bg 1.5s infinite ease-in-out' }}></div>)}
    </div>
    <style>{`@keyframes pulse-bg { 0%{background-color:#f1f5f9;} 50%{background-color:#e2e8f0;} 100%{background-color:#f1f5f9;} }`}</style>
  </div>
);

const EmptyState = () => (
  <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', color: '#64748b', fontFamily: "'Inter', sans-serif" }}>
    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
    <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>No Buses Found</h3>
    <p style={{ fontSize: '14px', marginTop: '4px' }}>Please check your internet connection.</p>
    <button onClick={() => window.location.reload()} style={{ marginTop: '24px', padding: '10px 24px', borderRadius: '8px', backgroundColor: '#2563eb', color: 'white', border: 'none', fontWeight: '600', cursor: 'pointer' }}>Retry</button>
  </div>
);

export default DriverLogin;
