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

const toTitleCase = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

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
  const [isLive, setIsLive] = useState(Boolean(selectedBus.location) || isActive);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef<number | null>(null);
  const currentY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);

  const handleRouteUpdate = (data: {
    distanceKm: number | null;
    durationMinutes: number | null;
    destinationName?: string;
  }) => {
    if (!isLive && !isActive && !selectedBus.location) {
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

    setIsLive(Boolean(selectedBus.location) || isActive);
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

  const handleRefresh = () => {
    setIsRefreshing(true);
    setFocusRequestId((current) => current + 1);
    window.setTimeout(() => setIsRefreshing(false), 900);
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

  void handleTouchStart;
  void handleTouchMove;
  void handleTouchEnd;
  void dragOffset;
  void viewMode;

  const routeLabel = toTitleCase(selectedBus.route || selectedBus.DestinationName || 'Route not assigned');
  const statusLabel = isLive ? 'Live Tracking' : 'Waiting for GPS';
  const statusTone = isLive
    ? 'bg-emerald-400 text-emerald-950 border-emerald-200'
    : 'bg-amber-300 text-amber-950 border-amber-100';
  const summaryLabel = distanceText !== '--' ? `${distanceText} remaining` : 'Distance unavailable';

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

      <div className="absolute top-[calc(env(safe-area-inset-top)+16px)] left-4 right-4 z-[110] pointer-events-auto">
        <div className="overflow-hidden rounded-[1.9rem] border border-slate-900/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.94))] px-4 py-3.5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.42)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.28),transparent_34%),radial-gradient(circle_at_left_center,rgba(16,185,129,0.16),transparent_28%)]"></div>
          <div className="flex items-center gap-3">
            <button
              onClick={(event) => {
                event.stopPropagation();
                closeMap();
              }}
              className="relative z-10 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white transition-all active:scale-90 hover:bg-white/18"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="relative z-10 min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-300">
                  Bus {selectedBus.busNumber}
                </span>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] shadow-sm ${statusTone}`}>
                  <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${isLive ? 'bg-emerald-700 animate-pulse' : 'bg-amber-800'}`}></span>
                  {statusLabel}
                </span>
              </div>
              <div className="truncate text-base font-black uppercase tracking-[0.08em] text-white sm:text-lg">
                {routeLabel}
              </div>
              <div className="mt-1.5 truncate text-[11px] font-bold tracking-[0.16em] text-slate-200 uppercase">
                {summaryLabel}
              </div>
            </div>

            <button
              onClick={(event) => {
                event.stopPropagation();
                handleRefresh();
              }}
              className="relative z-10 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white transition-all active:scale-90 hover:bg-white/18"
              aria-label="Refresh tracking"
            >
              <svg
                className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 4v5h5M20 20v-5h-5M5.64 18.36A9 9 0 0018.36 5.64M18.36 18.36A9 9 0 015.64 5.64" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-6 right-6 z-[100] pointer-events-auto">
        <div className="bg-white/98 backdrop-blur-xl p-5 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-white/70 flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-3xl flex items-center justify-center flex-shrink-0 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5z" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">
              Broadcasting
            </p>
            <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none mb-2.5">
              {isLive ? 'Live GPS Active' : 'Waiting for GPS'}
            </h3>

            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-sky-100 text-sky-700 text-[10px] font-bold uppercase tracking-widest leading-none">
                {distanceText !== '--' ? `${distanceText} left` : 'Waiting for distance'}
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest leading-none">
                {destinationLabel}
              </span>
            </div>
            <p className="text-[12px] font-extrabold text-slate-500 uppercase tracking-[0.16em] leading-none">
              {distanceText !== '--' ? `${distanceText} remaining` : 'Distance unavailable'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentTrackingPage;
