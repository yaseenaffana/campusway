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

const hasUsableCoordinates = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  (Math.abs(lat) > 0.000001 || Math.abs(lng) > 0.000001);

const ROUTE_REFRESH_MS = 15000;
const ROUTE_REFRESH_DISTANCE_KM = 0.15;

const isPayloadLive = (payload: any, selectedBus?: Bus) => {
  if (typeof payload?.online === 'boolean') return payload.online;
  if (typeof payload?.isOnline === 'boolean') return payload.isOnline;
  if (typeof payload?.IsOnline === 'boolean') return payload.IsOnline;
  if (payload?.status) return String(payload.status).toLowerCase() === 'online';
  if (payload?.bus?.status) return String(payload.bus.status).toLowerCase() === 'online';
  if (selectedBus?.status) return String(selectedBus.status).toLowerCase() === 'online';
  if (typeof selectedBus?.IsOnline === 'boolean') return selectedBus.IsOnline;
  return false;
};

const safeStopMap = (map: L.Map | null) => {
  if (!map) return;

  try {
    map.stop();
  } catch {
    // Ignore animation stop errors during teardown.
  }
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
  const routeLineRef = useRef<L.Polyline | null>(null);
  const busAnimationFrameRef = useRef<number | null>(null);
  const lastRouteRequestRef = useRef<{
    busLat: number;
    busLng: number;
    destLat: number;
    destLng: number;
    at: number;
  } | null>(null);
  const mapInitializedRef = useRef(false);
  const markersBoundsInitializedRef = useRef(false);
  const isMountedRef = useRef(true);
  const [map, setMap] = useState<L.Map | null>(null);

  const animateBusMarker = useCallback((marker: L.Marker, nextLat: number, nextLng: number) => {
    const nextLatLng = L.latLng(nextLat, nextLng);
    const currentLatLng = marker.getLatLng();

    if (
      !Number.isFinite(currentLatLng.lat) ||
      !Number.isFinite(currentLatLng.lng) ||
      (Math.abs(currentLatLng.lat - nextLat) < 0.000001 && Math.abs(currentLatLng.lng - nextLng) < 0.000001)
    ) {
      marker.setLatLng(nextLatLng);
      return;
    }

    if (busAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(busAnimationFrameRef.current);
      busAnimationFrameRef.current = null;
    }

    const distanceKm = haversineKm([currentLatLng.lat, currentLatLng.lng], [nextLat, nextLng]);
    const duration =
      distanceKm < 0.05 ? 700 :
      distanceKm < 0.2 ? 1100 :
      distanceKm < 0.75 ? 1500 :
      1900;

    const startTime = performance.now();
    const fromLat = currentLatLng.lat;
    const fromLng = currentLatLng.lng;

    const step = (now: number) => {
      if (!isMountedRef.current || !busMarkerRef.current) {
        busAnimationFrameRef.current = null;
        return;
      }

      const progress = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const lat = fromLat + (nextLat - fromLat) * ease;
      const lng = fromLng + (nextLng - fromLng) * ease;

      marker.setLatLng([lat, lng]);

      if (progress < 1) {
        busAnimationFrameRef.current = window.requestAnimationFrame(step);
      } else {
        marker.setLatLng(nextLatLng);
        busAnimationFrameRef.current = null;
      }
    };

    busAnimationFrameRef.current = window.requestAnimationFrame(step);
  }, []);

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
    isMountedRef.current = true;
    const timer = window.setTimeout(initMap, 250);

    return () => {
      isMountedRef.current = false;
      window.clearTimeout(timer);
      if (mapRef.current) {
        safeStopMap(mapRef.current);
        if (busAnimationFrameRef.current !== null) {
          window.cancelAnimationFrame(busAnimationFrameRef.current);
          busAnimationFrameRef.current = null;
        }
        busMarkerRef.current?.remove();
        destinationMarkerRef.current?.remove();
        schoolMarkerRef.current?.remove();
        routeLineRef.current?.remove();
        busMarkerRef.current = null;
        destinationMarkerRef.current = null;
        schoolMarkerRef.current = null;
        routeLineRef.current = null;
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [initMap]);

  useEffect(() => {
    if (!map || !busNumber) return;

    const fetchAndDrawRoute = async (busLat: number, busLng: number, destLat: number, destLng: number, destName: string) => {
      const routeProviders = [
        `https://router.project-osrm.org/route/v1/driving/${busLng},${busLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`,
        `https://routing.openstreetmap.de/routed-car/route/v1/driving/${busLng},${busLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`
      ];

      for (const routeUrl of routeProviders) {
        try {
          const response = await fetch(routeUrl);
          if (!response.ok) {
            continue;
          }

          const data = await response.json();

          if (!isMountedRef.current || !mapRef.current) {
            return;
          }

          if (data.routes && data.routes[0]) {
            const coords = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);

            if (!routeLineRef.current) {
              routeLineRef.current = L.polyline(coords, {
                color: '#2563eb',
                weight: 6,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
              }).addTo(map);
            } else {
              routeLineRef.current.setLatLngs(coords);
            }

            const routeDistanceKm = Number((data.routes[0].distance / 1000).toFixed(2));
            const routeDurationMinutes = Math.max(1, Math.round(data.routes[0].duration / 60));

            onRouteUpdate?.({
              distanceKm: routeDistanceKm,
              durationMinutes: routeDurationMinutes,
              destinationName: destName
            });
            return;
          }
        } catch (error) {
          console.error('[ROUTE] Failed to fetch route:', error);
        }
      }

      const fallbackDistanceKm = Number(haversineKm([busLat, busLng], [destLat, destLng]).toFixed(2));
      onRouteUpdate?.({
        distanceKm: fallbackDistanceKm,
        durationMinutes: null,
        destinationName: destName
      });

      if (routeLineRef.current) {
        routeLineRef.current.removeFrom(map);
        routeLineRef.current = null;
      }
    };

    const applyLocation = (payload: any) => {
      const sourceBus = payload?.bus ?? payload;
      const liveBus = isPayloadLive(payload, selectedBus);
      const busLat = Number(sourceBus?.lat ?? sourceBus?.latitude ?? sourceBus?.location?.lat ?? sourceBus?.CurrentLat);
      const busLng = Number(sourceBus?.lng ?? sourceBus?.longitude ?? sourceBus?.location?.lng ?? sourceBus?.CurrentLng);
      const destinationLat = Number(sourceBus?.destinationLat ?? selectedBus?.DestinationLat);
      const destinationLng = Number(sourceBus?.destinationLng ?? selectedBus?.DestinationLng);
      const destinationName = sourceBus?.destination || selectedBus?.DestinationName || selectedBus?.route || 'Destination';

      const schoolLat = Number(sourceBus?.schoolLat ?? selectedBus?.SchoolLat);
      const schoolLng = Number(sourceBus?.schoolLng ?? selectedBus?.SchoolLng);
      const hasLiveBusLocation = hasUsableCoordinates(busLat, busLng);
      const hasDestinationLocation = hasUsableCoordinates(destinationLat, destinationLng);
      const hasSchoolLocation = hasUsableCoordinates(schoolLat, schoolLng);

      if (hasSchoolLocation) {
        if (!schoolMarkerRef.current) {
          schoolMarkerRef.current = L.marker([schoolLat, schoolLng], {
            icon: schoolIcon,
            zIndexOffset: 400
          })
            .bindTooltip('School', {
              permanent: true,
              direction: 'top',
              offset: [0, -8]
            })
            .addTo(map);
        } else {
          schoolMarkerRef.current.setLatLng([schoolLat, schoolLng]);
        }
      }

      if (hasLiveBusLocation) {
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
          animateBusMarker(busMarkerRef.current, busLat, busLng);
          busMarkerRef.current.setIcon(busIcon);
        }
        busMarkerRef.current.setOpacity(liveBus ? 1 : 0.7);
      } else if (busMarkerRef.current) {
        safeStopMap(map);
        busMarkerRef.current.removeFrom(map);
        busMarkerRef.current = null;
        if (busAnimationFrameRef.current !== null) {
          window.cancelAnimationFrame(busAnimationFrameRef.current);
          busAnimationFrameRef.current = null;
        }
      }

      if (!liveBus && routeLineRef.current) {
        safeStopMap(map);
        routeLineRef.current.removeFrom(map);
        routeLineRef.current = null;
      }

      if (!mapInitializedRef.current) {
        if (hasLiveBusLocation) {
          safeStopMap(map);
          map.setView([busLat, busLng], DEFAULT_ZOOM, { animate: false });
        } else if (hasSchoolLocation) {
          safeStopMap(map);
          map.setView([schoolLat, schoolLng], DEFAULT_ZOOM, { animate: false });
        }
        mapInitializedRef.current = true;
      }

      if (hasDestinationLocation) {
        if (!destinationMarkerRef.current) {
          destinationMarkerRef.current = L.marker([destinationLat, destinationLng], {
            icon: destinationIcon,
            zIndexOffset: 500
          })
            .bindTooltip(destinationName, {
              permanent: true,
              direction: 'top',
              offset: [0, -8]
            })
            .addTo(map);
        } else {
          destinationMarkerRef.current.setLatLng([destinationLat, destinationLng]);
          destinationMarkerRef.current.setTooltipContent(destinationName);
        }

        if (liveBus && hasLiveBusLocation) {
          const now = Date.now();
          const lastRouteRequest = lastRouteRequestRef.current;
          const movedEnough = !lastRouteRequest || haversineKm(
            [lastRouteRequest.busLat, lastRouteRequest.busLng],
            [busLat, busLng]
          ) >= ROUTE_REFRESH_DISTANCE_KM;
          const destinationChanged = !lastRouteRequest ||
            Math.abs(lastRouteRequest.destLat - destinationLat) > 0.000001 ||
            Math.abs(lastRouteRequest.destLng - destinationLng) > 0.000001;
          const refreshExpired = !lastRouteRequest || (now - lastRouteRequest.at) >= ROUTE_REFRESH_MS;

          if (movedEnough || destinationChanged || refreshExpired) {
            lastRouteRequestRef.current = {
              busLat,
              busLng,
              destLat: destinationLat,
              destLng: destinationLng,
              at: now
            };
            void fetchAndDrawRoute(busLat, busLng, destinationLat, destinationLng, destinationName);
          }
        }
      }

      if (!markersBoundsInitializedRef.current) {
        const boundsPoints: [number, number][] = [];
        if (hasLiveBusLocation) {
          boundsPoints.push([busLat, busLng]);
        }
        if (hasDestinationLocation) {
          boundsPoints.push([destinationLat, destinationLng]);
        }
        if (hasSchoolLocation) {
          boundsPoints.push([schoolLat, schoolLng]);
        }

        if (boundsPoints.length > 1) {
          safeStopMap(map);
          map.fitBounds(L.latLngBounds(boundsPoints).pad(0.22), { animate: false });
          markersBoundsInitializedRef.current = true;
        }
      }
    };

    if (selectedBus?.location) {
      applyLocation({
        lat: selectedBus.location.lat,
        lng: selectedBus.location.lng,
        distanceKm: selectedBus.distanceKm,
        etaMinutes: selectedBus.etaMinutes,
        destination: selectedBus.DestinationName,
        destinationLat: selectedBus.DestinationLat,
        destinationLng: selectedBus.DestinationLng,
        schoolLat: selectedBus.SchoolLat,
        schoolLng: selectedBus.SchoolLng,
        status: selectedBus.status,
        isOnline: selectedBus.IsOnline
      });
    } else if (selectedBus) {
      applyLocation({
        destination: selectedBus.DestinationName,
        destinationLat: selectedBus.DestinationLat,
        destinationLng: selectedBus.DestinationLng,
        schoolLat: selectedBus.SchoolLat,
        schoolLng: selectedBus.SchoolLng,
        status: selectedBus.status,
        isOnline: selectedBus.IsOnline
      });
    }

    const unsubscribe = buseService.subscribeToBus(busNumber, applyLocation);
    return () => unsubscribe();
  }, [busNumber, focusRequestId, map, onRouteUpdate, selectedBus]);

  useEffect(() => {
    if (!map || focusRequestId == null) return;

    const timer = window.setTimeout(() => {
      if (!isMountedRef.current || !containerRef.current?.isConnected || !mapRef.current) {
        return;
      }

      const routeBounds = routeLineRef.current?.getBounds();

      if (routeBounds?.isValid()) {
        safeStopMap(map);
        map.fitBounds(routeBounds.pad(0.22), { animate: false });
        return;
      }

      if (busMarkerRef.current) {
        safeStopMap(map);
        map.setView(busMarkerRef.current.getLatLng(), DEFAULT_ZOOM + 1, { animate: false });
        return;
      }

      if (schoolMarkerRef.current) {
        safeStopMap(map);
        map.setView(schoolMarkerRef.current.getLatLng(), DEFAULT_ZOOM, { animate: false });
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [focusRequestId, map]);

  useEffect(() => {
    if (!map) return;

    const timer = window.setTimeout(() => {
      if (!isMountedRef.current || !containerRef.current?.isConnected || !mapRef.current) {
        return;
      }

      safeStopMap(map);
      map.invalidateSize({ animate: false });
    }, 300);

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
