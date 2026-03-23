import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import busMarkerImage from '../Bus.jpeg';
import homeMarkerImage from '../home-marker.svg';
import { buseService } from '../services/busService';
import schoolMarkerImage from '../school_logo.jpg';
import { Bus } from '../types';

interface MapComponentProps {
  busId?: string;
  busNumber?: string;
  selectedBus?: Bus;
  viewMode?: string;
  focusRequestId?: number;
  onRouteUpdate?: (data: {
    distanceKm: number | null;
    durationMinutes: number | null;
    destinationName?: string;
  }) => void;
}

const DEFAULT_ZOOM = 15;
const DEFAULT_CENTER: [number, number] = [10.105871781656774, 78.64251386094996];
const HISTORY_REFRESH_MS = 8000;

const busIcon = L.icon({
  iconUrl: busMarkerImage,
  iconSize: [56, 56],
  iconAnchor: [28, 28],
  popupAnchor: [0, -26],
  className: 'bus-photo-marker'
});

const destinationIcon = L.icon({
  iconUrl: homeMarkerImage,
  iconSize: [42, 42],
  iconAnchor: [21, 34],
  tooltipAnchor: [0, -28],
  className: 'destination-photo-marker'
});

const schoolIcon = L.icon({
  iconUrl: schoolMarkerImage,
  iconSize: [42, 42],
  iconAnchor: [21, 34],
  tooltipAnchor: [0, -28],
  className: 'school-photo-marker'
});

const haversineKm = (from: [number, number], to: [number, number]) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(to[0] - from[0]);
  const dLng = toRad(to[1] - from[1]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from[0])) * Math.cos(toRad(to[0])) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const MapComponent: React.FC<MapComponentProps> = ({
  busId,
  busNumber,
  selectedBus,
  viewMode,
  focusRequestId,
  onRouteUpdate
}) => {
  void busId;

  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const busMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const schoolMarkerRef = useRef<L.Marker | null>(null);
  const trailLineRef = useRef<L.Polyline | null>(null);
  const mapInitializedRef = useRef(false);
  const markersBoundsInitializedRef = useRef(false);
  const lastHistoryFetchAtRef = useRef(0);
  const [map, setMap] = useState<L.Map | null>(null);

  const initMap = useCallback(() => {
    if (mapRef.current || !containerRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      tap: false
    });

    mapRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      keepBuffer: 4
    }).addTo(mapRef.current);

    setMap(mapRef.current);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(initMap, 250);

    return () => {
      window.clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [initMap]);

  useEffect(() => {
    if (!map || !busNumber) return;

    const updateHistoryTrail = async () => {
      if (Date.now() - lastHistoryFetchAtRef.current < HISTORY_REFRESH_MS) {
        return;
      }

      lastHistoryFetchAtRef.current = Date.now();
      const history = await buseService.getHistory(selectedBus?.Username || busNumber);
      if (!Array.isArray(history) || history.length === 0) {
        return;
      }

      const points = history
        .map((item: any) => [Number(item.lat), Number(item.lng)] as [number, number])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

      if (points.length < 2) {
        return;
      }

      if (!trailLineRef.current) {
        trailLineRef.current = L.polyline(points, {
          color: '#2563eb',
          weight: 5,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);
      } else {
        trailLineRef.current.setLatLngs(points);
      }
    };

    const applyLocation = (payload: any) => {
      const busLat = Number(payload?.lat ?? payload?.latitude);
      const busLng = Number(payload?.lng ?? payload?.longitude);
      const destinationLat = Number(payload?.destinationLat ?? selectedBus?.DestinationLat);
      const destinationLng = Number(payload?.destinationLng ?? selectedBus?.DestinationLng);
      const destinationName = payload?.destination || selectedBus?.DestinationName || selectedBus?.route || 'Destination';

      if (!Number.isFinite(busLat) || !Number.isFinite(busLng)) return;

      if (!busMarkerRef.current) {
        busMarkerRef.current = L.marker([busLat, busLng], {
          icon: busIcon,
          zIndexOffset: 1000
        })
          .bindPopup(`<div style="font-weight:900;text-align:center;color:#1f2937;">Bus ${busNumber}</div>`, {
            closeButton: false,
            offset: [0, -15]
          })
          .openPopup()
          .addTo(map);
      } else {
        busMarkerRef.current.setLatLng([busLat, busLng]);
        busMarkerRef.current.setIcon(busIcon);
      }

      if (!mapInitializedRef.current) {
        map.setView([busLat, busLng], DEFAULT_ZOOM);
        mapInitializedRef.current = true;
      }

      const schoolLat = Number(payload?.schoolLat ?? selectedBus?.SchoolLat);
      const schoolLng = Number(payload?.schoolLng ?? selectedBus?.SchoolLng);
      if (Number.isFinite(schoolLat) && Number.isFinite(schoolLng)) {
        if (!schoolMarkerRef.current) {
          schoolMarkerRef.current = L.marker([schoolLat, schoolLng], {
            icon: schoolIcon,
            zIndexOffset: 400
          })
            .bindTooltip('School', {
              permanent: false,
              direction: 'top',
              offset: [0, -8]
            })
            .addTo(map);
        } else {
          schoolMarkerRef.current.setLatLng([schoolLat, schoolLng]);
        }
      }

      if (Number.isFinite(destinationLat) && Number.isFinite(destinationLng)) {
        if (!destinationMarkerRef.current) {
          destinationMarkerRef.current = L.marker([destinationLat, destinationLng], {
            icon: destinationIcon,
            zIndexOffset: 500
          })
            .bindTooltip(destinationName, {
              permanent: false,
              direction: 'top',
              offset: [0, -8]
            })
            .addTo(map);
        } else {
          destinationMarkerRef.current.setLatLng([destinationLat, destinationLng]);
          destinationMarkerRef.current.setTooltipContent(destinationName);
        }
      }

      void updateHistoryTrail();

      if (!markersBoundsInitializedRef.current) {
        const boundsPoints: [number, number][] = [[busLat, busLng]];
        if (Number.isFinite(destinationLat) && Number.isFinite(destinationLng)) {
          boundsPoints.push([destinationLat, destinationLng]);
        }
        if (Number.isFinite(schoolLat) && Number.isFinite(schoolLng)) {
          boundsPoints.push([schoolLat, schoolLng]);
        }

        if (boundsPoints.length > 1) {
          map.fitBounds(L.latLngBounds(boundsPoints).pad(0.22), { animate: true });
          markersBoundsInitializedRef.current = true;
        }
      }

      const fallbackDistanceKm =
        Number.isFinite(destinationLat) && Number.isFinite(destinationLng)
          ? Number(haversineKm([busLat, busLng], [destinationLat, destinationLng]).toFixed(2))
          : null;
      const fallbackEtaMinutes =
        fallbackDistanceKm != null && Number(payload?.speed) > 0
          ? Math.max(1, Math.round((fallbackDistanceKm / Number(payload.speed)) * 60))
          : null;

      onRouteUpdate?.({
        distanceKm: typeof payload?.distanceKm === 'number' ? payload.distanceKm : fallbackDistanceKm,
        durationMinutes: typeof payload?.etaMinutes === 'number' ? payload.etaMinutes : fallbackEtaMinutes,
        destinationName
      });
    };

    if (selectedBus?.location) {
      applyLocation({
        lat: selectedBus.location.lat,
        lng: selectedBus.location.lng,
        distanceKm: selectedBus.distanceKm,
        etaMinutes: selectedBus.etaMinutes,
        destination: selectedBus.DestinationName,
        destinationLat: selectedBus.DestinationLat,
        destinationLng: selectedBus.DestinationLng
      });
    }

    const unsubscribe = buseService.subscribeToBus(busNumber, applyLocation);
    return () => unsubscribe();
  }, [busNumber, map, onRouteUpdate, selectedBus]);

  useEffect(() => {
    if (!map || focusRequestId == null) return;

    const timer = window.setTimeout(() => {
      const routeBounds = trailLineRef.current?.getBounds();

      if (routeBounds?.isValid()) {
        map.fitBounds(routeBounds.pad(0.22), { animate: true });
        return;
      }

      if (busMarkerRef.current) {
        map.flyTo(busMarkerRef.current.getLatLng(), DEFAULT_ZOOM + 1, { animate: true, duration: 0.8 });
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [focusRequestId, map]);

  useEffect(() => {
    if (!map) return;
    const timer = window.setTimeout(() => map.invalidateSize(), 300);
    return () => window.clearTimeout(timer);
  }, [map, viewMode]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 bg-slate-100"
      style={{ zIndex: 0 }}
    />
  );
};

export default MapComponent;
