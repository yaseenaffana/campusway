import { io, Socket } from 'socket.io-client';
import { fetchWithApiFallback, getSocketUrlCandidates } from './api';
import { findFleetCatalogItem, normalizeBusNo } from '../data/fleetCatalog';

let socket: Socket;
let busesCache: any[] = [];
let busesCacheAt = 0;
let busesRequest: Promise<any[]> | null = null;

const BUSES_CACHE_MS = 5000;
const FLEET_REFRESH_DEBOUNCE_MS = 800;
const FLEET_POLL_MS = 30000;
const BUS_LOCATION_POLL_MS = 30000;

const parseJson = async (response: Response) => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new Error(`Invalid JSON response (${response.status})`);
  }
};

const cleanRouteLabel = (route: unknown, registration: unknown, fallbackRoute?: string) => {
  const routeText = String(route ?? '').trim();
  const registrationText = String(registration ?? '').trim().toUpperCase();
  const normalizeKnownRouteTypos = (value: string) => value.replace(/\bSeniai\b/gi, 'Senjai');

  if (!routeText) {
    return normalizeKnownRouteTypos(fallbackRoute || '');
  }

  const upperRouteText = routeText.toUpperCase();
  if (registrationText && upperRouteText === registrationText) {
    return normalizeKnownRouteTypos(fallbackRoute || '');
  }

  if (registrationText && upperRouteText.startsWith(`${registrationText} - `)) {
    return normalizeKnownRouteTypos(routeText.slice(registrationText.length + 3).trim() || fallbackRoute || '');
  }

  return normalizeKnownRouteTypos(routeText);
};

export const getSocket = () => {
  if (!socket) {
    const socketCandidates = getSocketUrlCandidates();
    socket = io(socketCandidates[0], {
      path: '/socket.io/',
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionAttempts: Infinity
    });

    socket.on('connect', () => {
      console.log('Socket connected');
    });

    socket.on('disconnect', () => {
      console.warn('Socket disconnected');
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message);
      const nextSocketUrl = socketCandidates.find((candidate) => candidate !== socket.io.uri);
      if (nextSocketUrl && nextSocketUrl !== socketCandidates[0]) {
        socket.disconnect();
        socket.io.uri = nextSocketUrl;
        socket.connect();
      }
    });
  }
  return socket;
};

export const buseService = {
  async getBuses(options: { force?: boolean } = {}) {
    const { force = false } = options;

    if (!force && busesCache.length > 0 && Date.now() - busesCacheAt < BUSES_CACHE_MS) {
      return busesCache;
    }

    if (!force && busesRequest) {
      return busesRequest;
    }

    const request = (async () => {
    try {
      const response = await fetchWithApiFallback('/api/buses');
      if (!response.ok) {
        console.warn(`Failed to fetch buses: ${response.statusText}`);
        return busesCache;
      }
      const data = await parseJson(response);
      const buses = Array.isArray(data) ? data : (data.buses || []);

      if (!buses.length) {
        busesCache = [];
        busesCacheAt = Date.now();
        return [];
      }
      
      // Map backend response to frontend Bus interface
      const mappedBuses = buses.map((bus: any) => {
        const constRegistration = bus.registrationNumber || bus.Registration || bus.BusNo || '';
        const constBusNo = normalizeBusNo(bus.BusNo || bus.busNumber || bus.Username || bus.registrationNumber);
        const constCatalogItem = findFleetCatalogItem({
          busNo: bus.BusNo || bus.busNumber || bus.Username,
          registration: bus.registrationNumber || bus.Registration || bus.BusNo,
          route: bus.route || bus.DestinationName
        });

        const cleanedRoute =
          cleanRouteLabel(
            bus.route || bus.DestinationName || bus.Route,
            bus.registrationNumber || bus.Registration || bus.BusNo,
            constCatalogItem?.route || ''
          ) || constCatalogItem?.route || '';

        return {
        // Use backend provided fields if available
        ...bus, // Keep original payload fields available, but override sanitized UI fields below.
        id: bus.id || `bus_${bus.BusNo}`,
        busNumber: bus.busNumber || constCatalogItem?.busNo || constBusNo || String(bus.BusNo),
        BusNo: bus.BusNo,
        registrationNumber: bus.registrationNumber || bus.Registration || constCatalogItem?.registration || constRegistration,
        Registration: bus.Registration || bus.registrationNumber || constCatalogItem?.registration || constRegistration,
        route: cleanedRoute,
        Route: cleanedRoute,
        location: bus.location || {
          lat: bus.CurrentLat || 0,
          lng: bus.CurrentLng || 0,
          timestamp: bus.updatedAt || Date.now(),
          speed: bus.Speed || 0
        },
        status: bus.status || (bus.IsOnline ? 'online' : 'offline'),
        updatedAt: bus.updatedAt || (bus.LastUpdated ? Date.parse(bus.LastUpdated) : Date.now()),
        IsActive: bus.IsActive !== undefined ? bus.IsActive : !(constCatalogItem?.isSpare),
        IsOnline: bus.IsOnline !== undefined ? bus.IsOnline : false,
        driverName: bus.driverName || bus.Username || '',
        distance: bus.distance || null,
        distanceText: bus.distanceText || bus.distance || null,
        distanceKm: typeof bus.distanceKm === 'number' ? bus.distanceKm : null,
        etaMinutes: typeof bus.etaMinutes === 'number' ? bus.etaMinutes : null,
        trackingMode: bus.trackingMode,
        BusName: bus.BusName || '',
        Username: bus.Username || '',
        CurrentLat: bus.CurrentLat,
        CurrentLng: bus.CurrentLng,
        Speed: bus.Speed,
        LastUpdated: bus.LastUpdated,
        DestinationName: cleanRouteLabel(bus.DestinationName, bus.BusNo, constCatalogItem?.route || '') || constCatalogItem?.route || '',
        DestinationLat: bus.DestinationLat,
        DestinationLng: bus.DestinationLng,
        SchoolLat: bus.SchoolLat,
        SchoolLng: bus.SchoolLng
        };
      });
      busesCache = mappedBuses;
      busesCacheAt = Date.now();
      return mappedBuses;
    } catch (error) {
      console.warn('Error in getBuses:', error);
      return busesCache;
    }
    })();

    busesRequest = request;

    try {
      return await request;
    } finally {
      if (busesRequest === request) {
        busesRequest = null;
      }
    }
  },

  async login(username, password) {
    try {
      const response = await fetchWithApiFallback('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!response.ok) {
        return null;
      }
      return await parseJson(response);
    } catch (error) {
      console.warn('Error in login:', error);
      return null;
    }
  },

  async updateLocation(token, latitude, longitude, speed) {
    try {
      await fetchWithApiFallback('/api/location/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ latitude, longitude, speed })
      });
    } catch (error) {
      console.warn('Error in updateLocation:', error);
    }
  },

  async getLiveLocation(username) {
    try {
      const response = await fetchWithApiFallback(`/api/location/live/${username}`);
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        return null;
      }
      return await parseJson(response);
    } catch (_error) {
      return null;
    }
  },

  async disconnectDriver(token) {
    try {
      await fetchWithApiFallback('/api/bus/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (error) {
      console.warn('Error in disconnectDriver:', error);
    }
  },

  async getHistory(username) {
    try {
      const response = await fetchWithApiFallback(`/api/location/history/${username}`);
      if (!response.ok) {
        return [];
      }
      return await parseJson(response);
    } catch (error) {
      console.warn('Error in getHistory:', error);
      return [];
    }
  },

  subscribeToFleetUpdates(callback) {
    const s = getSocket();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshFleet = async (force = false) => {
      const buses = await this.getBuses({ force });
      callback(buses);
    };

    const onFleetUpdate = async () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refreshFleet(true);
      }, FLEET_REFRESH_DEBOUNCE_MS);
    };

    s.on('fleetUpdate', onFleetUpdate);

    // Initial fetch as fallback
    const interval = setInterval(async () => {
      await refreshFleet(true);
    }, FLEET_POLL_MS);

    // Initial fetch
    void refreshFleet(true);

    return () => {
      clearInterval(interval);
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      s.off('fleetUpdate', onFleetUpdate);
    };
  },

  async setDriverOnline(busNo, online) {
    if (online) return { success: true };
    const token = localStorage.getItem('driver_token') || localStorage.getItem('authToken');
    if (!token) return { success: false };
    return this.disconnectDriver(token);
  },

  async updateBusLocation(busNo, location) {
    try {
      const token = localStorage.getItem('driver_token') || localStorage.getItem('authToken');
      if (!token) return { success: false };
      const response = await fetchWithApiFallback('/api/bus/update-location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          busNo,
          lat: location?.lat,
          lng: location?.lng,
          speed: location?.speed || 0
        })
      });
      return await parseJson(response);
    } catch (error) {
      console.warn('Error in updateBusLocation:', error);
      return { success: false };
    }
  },

  async validateDriverLogin(busNo, password) {
    try {
      const response = await fetchWithApiFallback('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: String(busNo), password, role: 'driver' })
      });
      const data = await parseJson(response);
      if (data?.token) {
        localStorage.setItem('driver_token', data.token);
      }
      if (!response.ok || !data?.success) {
        return {
          ok: false,
          success: false,
          reason: response.status === 401 ? 'WRONG_PASSWORD' : 'NETWORK',
          error: data?.error || 'Authentication failed'
        };
      }

      return {
        ...data,
        ok: true
      };
    } catch (error) {
      console.warn('Error validating driver login:', error);
      return { ok: false, success: false, reason: 'NETWORK' };
    }
  },

  async updateDriverPassword(_busNo, newPassword) {
    const token = localStorage.getItem('driver_token') || localStorage.getItem('authToken');
    if (!token) {
      throw new Error('Missing authentication token');
    }

    const response = await fetchWithApiFallback('/api/bus/password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ newPassword })
    });

    const data = await parseJson(response);
    if (!response.ok || !data?.success) {
      throw new Error(data?.error || 'Failed to update password');
    }

    return data;
  },

  subscribeToBus(busNumber, callback) {
    const s = getSocket();
    s.emit('join-bus', busNumber);

    const onBusUpdate = (payload) => {
      const currentBus = String(payload?.busNo ?? payload?.username ?? '');
      if (currentBus === String(busNumber) || currentBus === String(busNumber).replace('bus_', '')) {
        callback(payload);
      }
    };
    s.on('busLocationUpdated', onBusUpdate);

    const interval = setInterval(async () => {
      const location = await this.getLiveLocation(busNumber);
      if (location) callback(location);
    }, BUS_LOCATION_POLL_MS);

    // Initial fetch
    this.getLiveLocation(busNumber).then(location => {
      if (location) callback(location);
    });

    return () => {
      clearInterval(interval);
      s.off('busLocationUpdated', onBusUpdate);
      s.emit('leave-bus', busNumber);
    };
  }
};
