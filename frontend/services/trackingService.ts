/**
 * Bus Tracking Service
 * API client for bus tracking features
 */

import { getApiUrl } from './api';

const API_BASE = `${getApiUrl()}/api`;

// Exponential backoff configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000; // 1 second
const MAX_DELAY = 10000; // 10 seconds

/**
 * Retry logic with exponential backoff
 */
async function retryWithBackoff(fn, retries = MAX_RETRIES) {
  let lastError;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < retries - 1) {
        const delay = Math.min(INITIAL_DELAY * Math.pow(2, i), MAX_DELAY);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Fetch current bus status with enriched data
 * @param {string} busNo - Bus number (e.g., 'BUS-001')
 * @returns {Promise<Object>} Bus status with location, stops, ETA, etc.
 */
export async function fetchBusStatus(busNo) {
  return retryWithBackoff(async () => {
    const response = await fetch(`${API_BASE}/bus/${busNo}/status`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Bus not found');
      }
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  });
}

/**
 * Update bus location
 * @param {string} busNo - Bus number
 * @param {number} routeID - Route ID
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} speed - Speed in km/h
 * @param {number} accuracy - GPS accuracy in meters
 * @returns {Promise<Object>} Updated location response
 */
export async function updateBusLocation(busNo, routeID, lat, lng, speed = 0, accuracy = 0) {
  return retryWithBackoff(async () => {
    const response = await fetch(`${API_BASE}/bus/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        busNo,
        routeID,
        lat,
        lng,
        speed,
        accuracy
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update location: ${response.status}`);
    }
    
    return response.json();
  });
}

/**
 * Get all active buses
 * @returns {Promise<Object>} Array of buses with locations
 */
export async function fetchActiveBuses() {
  return retryWithBackoff(async () => {
    const response = await fetch(`${API_BASE}/buses`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  });
}

/**
 * Calculate distance to specific stop
 * @param {string} busNo - Bus number
 * @param {number} stopID - Stop ID
 * @returns {Promise<Object>} Distance, ETA, and status info
 */
export async function calculateDistanceToStop(busNo, stopID) {
  return retryWithBackoff(async () => {
    const response = await fetch(`${API_BASE}/bus/${busNo}/distance-to/${stopID}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  });
}

/**
 * Create a polling hook for real-time updates
 * @param {string} busNo - Bus number
 * @param {number} interval - Poll interval in milliseconds (default 3000)
 * @returns {Object} Context manager with methods
 */
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
        subscribers.forEach(cb => cb(status));
        if (onUpdate) onUpdate(status);
      } catch (error) {
        console.error('Polling error:', error);
        if (onError) onError(error);
      }
    };

    // Initial fetch immediately
    poll();

    // Then set up interval
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

/**
 * Validate bus response data
 * @param {Object} busStatus - Bus status object
 * @returns {boolean} True if valid
 */
export function validateBusStatus(busStatus) {
  return (
    busStatus &&
    busStatus.busNo &&
    busStatus.location &&
    busStatus.status &&
    typeof busStatus.location.lat === 'number' &&
    typeof busStatus.location.lng === 'number'
  );
}

/**
 * Calculate distance between two points (Haversine)
 * Note: This is a client-side utility; server already calculates
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in kilometers
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(2);
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Format distance for display
 * @param {number} km - Distance in kilometers
 * @returns {string} Formatted distance
 */
export function formatDistance(km) {
  if (km < 1) {
    return `${(km * 1000).toFixed(0)}m`;
  }
  return `${km.toFixed(1)}km`;
}

/**
 * Format ETA for display
 * @param {number} minutes - ETA in minutes
 * @returns {string} Formatted ETA
 */
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

// Export error types for handling
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
