/**
 * Bus Tracking Service
 * Legacy compatibility wrapper around the active bus service.
 */

import { buseService } from './busService';
import { fetchWithApiFallback, readJsonResponse } from './api';

const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000;
const MAX_DELAY = 10000;

async function retryWithBackoff(fn, retries = MAX_RETRIES) {
  let lastError;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < retries - 1) {
        const delay = Math.min(INITIAL_DELAY * Math.pow(2, i), MAX_DELAY);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export async function fetchBusStatus(busNo) {
  return retryWithBackoff(async () => {
    const response = await fetchWithApiFallback(`/api/bus/${busNo}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Bus not found');
      }
      throw new Error(`API error: ${response.status}`);
    }

    return readJsonResponse(response);
  });
}

export async function updateBusLocation(busNo, routeID, lat, lng, speed = 0, accuracy = 0) {
  return retryWithBackoff(async () => {
    void routeID;
    return buseService.updateBusLocation(busNo, {
      lat,
      lng,
      speed,
      accuracy,
      timestamp: Date.now()
    });
  });
}

export async function fetchActiveBuses() {
  return retryWithBackoff(async () => buseService.getBuses());
}

export async function calculateDistanceToStop(busNo, stopID) {
  void stopID;
  return fetchBusStatus(busNo);
}

export function createBusPoller(busNo, interval = 3000) {
  let pollTimer = null;
  let isPolling = false;
  const subscribers = [];

  const start = (onUpdate, onError) => {
    if (isPolling) return;
    isPolling = true;

    const poll = async () => {
      try {
        const status = await fetchBusStatus(busNo);
        subscribers.forEach((cb) => cb(status));
        if (onUpdate) onUpdate(status);
      } catch (error) {
        console.error('Polling error:', error);
        if (onError) onError(error);
      }
    };

    poll();
    pollTimer = setInterval(poll, interval);
  };

  const stop = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    isPolling = false;
  };

  const subscribe = (callback) => {
    subscribers.push(callback);
    return () => {
      const idx = subscribers.indexOf(callback);
      if (idx > -1) subscribers.splice(idx, 1);
    };
  };

  return { start, stop, subscribe };
}

export function validateBusStatus(busStatus) {
  return (
    busStatus &&
    (busStatus.busNo || busStatus.bus?.busNo || busStatus.BusNo) &&
    (busStatus.location || busStatus.bus) &&
    (busStatus.status || busStatus.online !== undefined)
  );
}

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

export function formatDistance(km) {
  if (km < 1) {
    return `${(km * 1000).toFixed(0)}m`;
  }
  return `${km.toFixed(1)}km`;
}

export function formatETA(minutes) {
  if (minutes < 1) {
    return '< 1 min';
  }
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

export class TrackingError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export class BusOfflineError extends TrackingError {
  constructor(busNo) {
    super(`Bus ${busNo} is offline`, 'BUS_OFFLINE');
  }
}

export class InvalidLocationError extends TrackingError {
  constructor(message) {
    super(message, 'INVALID_LOCATION');
  }
}

export default {
  fetchBusStatus,
  updateBusLocation,
  fetchActiveBuses,
  calculateDistanceToStop,
  createBusPoller,
  validateBusStatus,
  haversineDistance,
  formatDistance,
  formatETA,
  TrackingError,
  BusOfflineError,
  InvalidLocationError
};
