import { Capacitor } from '@capacitor/core';
import React, { useEffect, useRef, useState } from 'react';
import { socketService } from '../services/socketService';
import { Bus, Location } from '../types';
import MapComponent from './MapComponent';

interface StudentTrackingPageProps {
  selectedBus: Bus;
  studentLocation: Location | null;
  onBack: () => void;
  eta: number | null;
  isActive: boolean;
}

export type ViewMode = 'COLLAPSED' | 'HALF' | 'FULL' | 'HIDDEN';

const formatDistance = (distanceKm: number | null) => {
  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return '--';
  }

  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
};

const StudentTrackingPage: React.FC<StudentTrackingPageProps> = ({
  selectedBus,
  studentLocation,
  onBack,
  eta,
  isActive
}) => {
  void studentLocation;
  void eta;

  const [viewMode, setViewMode] = useState<ViewMode>('COLLAPSED');
  const [distanceText, setDistanceText] = useState<string>(formatDistance(selectedBus.distanceKm ?? null));
  const [etaDisplay, setEtaDisplay] = useState<string>(selectedBus.etaMinutes ? `${selectedBus.etaMinutes} mins` : '--');
  const [destinationLabel, setDestinationLabel] = useState<string>(
    selectedBus.DestinationName || selectedBus.route || 'Destination'
  );
  const [isLive, setIsLive] = useState(Boolean(selectedBus.location));
  const [focusRequestId, setFocusRequestId] = useState(0);

  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef<number | null>(null);
  const currentY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);

  const handleRouteUpdate = (data: {
    distanceKm: number | null;
    durationMinutes: number | null;
    destinationName?: string;
  }) => {
    if (!isActive) {
      setDistanceText('--');
      setEtaDisplay('--');
      return;
    }

    setDestinationLabel(data.destinationName || selectedBus.DestinationName || selectedBus.route || 'Destination');
    setDistanceText(formatDistance(data.distanceKm));
    setEtaDisplay(data.durationMinutes ? `${data.durationMinutes} mins` : '--');
  };

  useEffect(() => {
    if (!isActive) {
      setDistanceText('--');
      setEtaDisplay('--');
      setIsLive(false);
      return;
    }

    if (selectedBus.distanceKm != null) {
      setDistanceText(formatDistance(selectedBus.distanceKm));
    }

    if (selectedBus.etaMinutes != null) {
      setEtaDisplay(`${selectedBus.etaMinutes} mins`);
    }

    setDestinationLabel(selectedBus.DestinationName || selectedBus.route || 'Destination');

    if (selectedBus.location) {
      setIsLive(true);
    }
  }, [isActive, selectedBus]);

  useEffect(() => {
    if (!isActive || !selectedBus) return;

    let cleanup: (() => void) | undefined;

    const setupSocketConnection = async () => {
      try {
        if (!socketService.isConnected()) {
          await socketService.connect();
        }

        socketService.joinBus(selectedBus.busNumber);

        const unsubscribeBusLocation = socketService.onBusLocationUpdate((data) => {
          if (String(data.busNo) !== String(selectedBus.busNumber)) {
            return;
          }

          setIsLive(true);
          setDestinationLabel(data.destination || selectedBus.DestinationName || selectedBus.route || 'Destination');

          if (typeof data.distanceKm === 'number') {
            setDistanceText(formatDistance(data.distanceKm));
          }

          if (typeof data.etaMinutes === 'number') {
            setEtaDisplay(`${data.etaMinutes} mins`);
          }
        });

        const unsubscribeFleetUpdate = socketService.onFleetUpdate((data) => {
          if (String(data.busNo) !== String(selectedBus.busNumber)) {
            return;
          }

          setIsLive(true);
        });

        const unsubscribeConnected = socketService.onConnected(() => {
          setIsLive(true);
        });

        const unsubscribeDisconnected = socketService.onDisconnected(() => {
          setIsLive(false);
        });

        const unsubscribeError = socketService.onError(() => {
          setIsLive(false);
        });

        cleanup = () => {
          unsubscribeBusLocation();
          unsubscribeFleetUpdate();
          unsubscribeConnected();
          unsubscribeDisconnected();
          unsubscribeError();
          socketService.leaveBus(selectedBus.busNumber);
        };
      } catch (error) {
        console.error('Failed to setup socket connection:', error);
        setIsLive(false);
      }
    };

    void setupSocketConnection();

    return () => cleanup?.();
  }, [isActive, selectedBus]);

  const closeMap = () => {
    onBack();
    if (window.location.hash === '#map') {
      window.history.back();
    }
  };

  useEffect(() => {
    let backListener: any;

    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        backListener = App.addListener('backButton', () => {
          closeMap();
        });
      });
    }

    return () => {
      if (backListener) backListener.then((listener: any) => listener.remove());
    };
  }, []);

  useEffect(() => {
    window.history.pushState({ page: 'map' }, '', '#map');
    const handlePopState = () => closeMap();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTouchStart = (event: React.TouchEvent | React.MouseEvent) => {
    setIsDragging(true);

    if ('touches' in event) {
      startY.current = event.touches[0].clientY;
      currentY.current = event.touches[0].clientY;
      return;
    }

    startY.current = event.clientY;
    currentY.current = event.clientY;
  };

  const handleTouchMove = (event: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging || startY.current === null) return;

    const targetY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    currentY.current = targetY;
    const offset = targetY - startY.current;

    if (viewMode === 'FULL' && offset < 0) return;
    if (viewMode === 'HIDDEN' && offset > 0) return;

    setDragOffset(Math.max(-100, Math.min(offset, 100)));
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;

    setIsDragging(false);
    setDragOffset(0);

    if (startY.current !== null && currentY.current !== null) {
      const dragDistance = currentY.current - startY.current;
      const threshold = 50;

      if (dragDistance < -threshold) {
        if (viewMode === 'HIDDEN') setViewMode('COLLAPSED');
        else if (viewMode === 'COLLAPSED') setViewMode('HALF');
        else if (viewMode === 'HALF') setViewMode('FULL');
      } else if (dragDistance > threshold) {
        if (viewMode === 'FULL') setViewMode('HALF');
        else if (viewMode === 'HALF') setViewMode('COLLAPSED');
        else if (viewMode === 'COLLAPSED') setViewMode('HIDDEN');
      }
    }

    startY.current = null;
    currentY.current = null;
  };

  const getSheetStyle = (): React.CSSProperties => {
    let baseHeight = '132px';
    let bottomOffset = '0px';

    switch (viewMode) {
      case 'COLLAPSED':
        baseHeight = '132px';
        break;
      case 'HALF':
        baseHeight = '46vh';
        break;
      case 'FULL':
        baseHeight = '85vh';
        break;
      case 'HIDDEN':
        baseHeight = '132px';
        bottomOffset = '-132px';
        break;
    }

    return {
      height: baseHeight,
      bottom: bottomOffset,
      transform: isDragging ? `translateY(${Math.max(dragOffset, -100)}px)` : 'translateY(0)',
      transition: isDragging ? 'none' : 'height 0.3s ease, bottom 0.3s ease, transform 0.3s ease',
      position: 'fixed',
      left: 0,
      right: 0,
      background: 'white',
      borderRadius: '24px 24px 0 0',
      boxShadow: '0 -10px 30px rgba(15,23,42,0.12)',
      zIndex: 1000,
      touchAction: 'none'
    };
  };

  const headerText = isActive && etaDisplay !== '--' ? `Arriving in ${etaDisplay}` : 'Live bus tracking';
  const subHeaderText = isActive && distanceText !== '--' ? `${distanceText} left` : 'Waiting for location';

  return (
    <div className="fixed inset-0 bg-white z-[60] flex flex-col overflow-hidden select-none animate-in fade-in duration-500">
      <div className="absolute inset-0 z-0">
        <MapComponent
          busId={selectedBus.id}
          busNumber={selectedBus.busNumber}
          selectedBus={selectedBus}
          viewMode={viewMode}
          focusRequestId={focusRequestId}
          onRouteUpdate={handleRouteUpdate}
        />
      </div>

      <div className="absolute top-[calc(env(safe-area-inset-top)+16px)] left-0 right-0 px-4 z-[110] flex items-start gap-3 pointer-events-none">
        <button
          onClick={(event) => {
            event.stopPropagation();
            closeMap();
          }}
          className="w-11 h-11 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl border border-slate-50 text-slate-900 active:scale-95 transition-all flex items-center justify-center pointer-events-auto"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div className="flex-1 min-w-0 bg-white/92 backdrop-blur-md px-5 py-4 rounded-[1.75rem] shadow-[0_14px_40px_rgba(15,23,42,0.12)] border border-white/70 pointer-events-none">
            <div className="flex items-center gap-2 text-slate-900 whitespace-nowrap overflow-hidden">
              <span className="text-[clamp(20px,4vw,34px)] font-black tracking-tight truncate">{headerText}</span>
              <span className="text-slate-300 text-xl">•</span>
              <span className="text-[clamp(13px,2.7vw,18px)] font-bold text-slate-500 truncate">{subHeaderText}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.14em] ${isLive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                {isLive ? 'Live' : 'Offline'}
              </span>
              <span className="text-[11px] font-semibold text-slate-500 truncate">
                Destination: {destinationLabel}
              </span>
            </div>
          </div>

          <button
            onClick={(event) => {
              event.stopPropagation();
              setFocusRequestId((value) => value + 1);
            }}
            className="w-12 h-12 shrink-0 bg-white/92 backdrop-blur-md shadow-[0_14px_40px_rgba(15,23,42,0.12)] rounded-2xl border border-white/70 text-slate-900 active:scale-95 transition-all flex items-center justify-center pointer-events-auto"
            aria-label="Recenter route"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.75 12a7.25 7.25 0 0 1 12.38-5.13M19.25 12a7.25 7.25 0 0 1-12.38 5.13" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16.75 3.75v3.5h-3.5M7.25 20.25v-3.5h3.5" />
            </svg>
          </button>
        </div>
      </div>

      <div
        style={getSheetStyle()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseMove={handleTouchMove}
        onMouseUp={handleTouchEnd}
        onMouseLeave={handleTouchEnd}
        className="flex flex-col p-4 pointer-events-auto"
      >
        <div className="w-full flex justify-center mb-4 cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 bg-slate-300 rounded-full"></div>
        </div>

        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-[1.25rem] flex items-center justify-center text-[11px] font-black tracking-[0.16em] text-white shadow-lg ring-4 ring-indigo-50">
              BUS
            </div>
            <div className="flex flex-col">
              <h3 className="text-xl font-black text-slate-900 tracking-tighter leading-none mb-1">
                Bus {selectedBus.busNumber}
              </h3>
              <span className="text-xs font-semibold text-slate-500 mb-2">To {destinationLabel}</span>
              <div className="flex items-center gap-2">
                {isLive ? (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-green-200 bg-green-50">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-[9px] font-black text-green-700 uppercase tracking-widest leading-none">Live</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Offline</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {viewMode !== 'HIDDEN' && (
          <div className="grid grid-cols-2 gap-3 mt-2 px-2 animate-in fade-in duration-300">
            <div className="bg-slate-50 p-4 rounded-[1.25rem] border border-slate-100 flex flex-col justify-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Distance</p>
              <p className="text-2xl font-black text-slate-900 tracking-tighter leading-none">{distanceText}</p>
              <p className="text-xs font-semibold text-slate-400 mt-2">Remaining to destination</p>
            </div>
            <div className="bg-indigo-50 p-4 rounded-[1.25rem] border border-indigo-100 flex flex-col justify-center">
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1.5">Estimation</p>
              <p className="text-2xl font-black text-indigo-600 tracking-tighter leading-none">{etaDisplay}</p>
              <p className="text-xs font-semibold text-indigo-400 mt-2">Calculated from live route</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentTrackingPage;
