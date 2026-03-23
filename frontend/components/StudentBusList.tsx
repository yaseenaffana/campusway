import React, { useMemo } from 'react';
import { Bus, Location } from '../types';
import { isBusActive } from '../services/locationUtils';
import L from 'leaflet';
import { googleMapsService } from '../services/googleMapsService';
import collegeLogo from '../school_logo.jpg';
import { normalizeBusNo } from '../data/fleetCatalog';

interface StudentBusListProps {
    buses: Bus[];
    studentLocation: Location | null;
    onSelectBus: (bus: Bus) => void;
}

export const StudentBusCard = React.memo(({ 
    bus, 
    onClick, 
    isSelected, 
    isDriverView, 
    studentLocation 
}: { 
    bus: Bus; 
    onClick: () => void;
    isSelected?: boolean;
    isDriverView?: boolean;
    studentLocation?: Location | null;
}) => {
    // FIX 5, 12, 14: Use unified utility to reject [0,0] and check staleness
    const isLive = isBusActive(bus);

    let borderClass = 'border-slate-100';
    let scaleClass = 'active:scale-[0.97]';
    let shadowClass = 'shadow-sm';
    const isSpare = !bus.IsActive || String(bus.route || '').toLowerCase() === 'spare';
    const busLabel = normalizeBusNo(bus.busNumber || bus.BusNo) || String(bus.busNumber || bus.BusNo);
    const registrationLike = String(
        bus.registrationNumber || bus.Registration || bus.BusNo || ''
    ).trim().toUpperCase();
    const rawRouteText = String(
        bus.route || bus.Route || bus.DestinationName || ''
    ).trim();
    const routeText = rawRouteText.toUpperCase() === registrationLike
        ? String(bus.DestinationName || '').trim()
        : rawRouteText;
    
    // Driver mode styling overrides
    if (isDriverView && isSelected) {
        borderClass = 'border-indigo-600 bg-indigo-50/40 text-indigo-900';
        scaleClass = 'scale-[1.02] active:scale-[1.02] z-10'; // Keep it scaled up
    } else if (!isDriverView && isLive) {
        borderClass = 'border-green-400 bg-green-50/10 shadow-[0_0_15px_rgba(34,197,94,0.15)] ring-1 ring-green-400/50';
    } else if (isSpare) {
        borderClass = 'border-slate-200 bg-slate-50/80';
    }

    let etaText = '';
    if (!isDriverView && isLive && studentLocation && bus.location) {
        const distMeters = L.latLng(studentLocation.lat, studentLocation.lng).distanceTo(L.latLng(bus.location.lat, bus.location.lng));
        const timeMins = Math.ceil((distMeters / 1000 / 25) * 60); // 25km/h city avg
        
        const dStr = googleMapsService.formatDistance(distMeters);
        const tStr = googleMapsService.formatETA(timeMins);
        
        if (dStr !== '--' && tStr !== '--') {
            etaText = `${dStr} • ${tStr}`;
        }
    }

    return (
        <button
            onClick={onClick}
            className={`group relative flex flex-col p-4 bg-white rounded-[1.4rem] border-2 transition-all duration-300 text-left w-full overflow-hidden select-none tap-transparent min-h-[176px] ${borderClass} ${scaleClass} ${shadowClass}`}
            style={{ WebkitTapHighlightColor: 'transparent', userSelect: 'none' }}
        >
            <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Bus Route</span>
                {isLive ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Live
                    </span>
                ) : isSpare ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Spare
                    </span>
                ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Ready
                    </span>
                )}
            </div>

            <div className="mt-4 text-[22px] font-[900] text-slate-900 tracking-tight leading-tight break-words">
                {routeText || 'Route not assigned'}
            </div>
            <p className="mt-3 text-[12px] font-black uppercase tracking-[0.14em] text-slate-400">
                Bus {busLabel}
            </p>

            <div className="mt-auto pt-4">
                {etaText ? (
                    <p className="text-[11px] font-bold text-indigo-600">{etaText}</p>
                ) : (
                    <p className="text-[11px] font-semibold text-slate-400">
                        Tap to open bus tracking
                    </p>
                )}
            </div>
        </button>
    );
});

const StudentBusList: React.FC<StudentBusListProps> = React.memo(({ buses, studentLocation, onSelectBus }) => {
    // FIX 5: Sort active (LIVE) fleets to the top
    const sortedBuses = useMemo(() => {
        return [...buses].sort((a, b) => {
            const isALive = isBusActive(a);
            const isBLive = isBusActive(b);
            const aNo = parseInt(normalizeBusNo(a.busNumber || a.BusNo), 10) || 0;
            const bNo = parseInt(normalizeBusNo(b.busNumber || b.BusNo), 10) || 0;

            if (isALive && !isBLive) return -1;
            if (!isALive && isBLive) return 1;

            // Secondary sort by bus number
            return aNo - bNo;
        });
    }, [buses]);

    return (
        <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
            <div className="text-center px-4 flex flex-col items-center">
                <div className="mb-6 h-24 w-24 flex items-center justify-center">
                    <img src={collegeLogo} alt="College Logo" className="w-full h-full object-contain" />
                </div>
                <h2 className="text-4xl font-[900] text-slate-900 tracking-tighter uppercase">MZSJS BUZZ</h2>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-2">Select Your Bus</p>
            </div>

            <div className="grid grid-cols-2 gap-3 px-4">
                {sortedBuses.map((bus) => (
                    <div key={bus.id} className="w-full flex">
                       <StudentBusCard
                           bus={bus}
                           studentLocation={studentLocation}
                           onClick={() => onSelectBus(bus)}
                       />
                    </div>
                ))}
            </div>

            {sortedBuses.length === 0 && (
                <div className="bg-white p-12 rounded-[2.5rem] text-center border border-slate-100 shadow-sm mx-2">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl animate-pulse">📡</div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">No buses available right now</p>
                </div>
            )}
        </div>
    );
});

export default StudentBusList;
