/**
 * Distance Calculation Utilities
 * Haversine formula for calculating distance between two GPS coordinates
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

/**
 * Convert degrees to radians
 * @param {number} deg - Degrees
 * @returns {number} Radians
 */
function toRad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Calculate ETA in minutes
 * @param {number} distanceKm - Distance in kilometers
 * @param {number} speedKmh - Speed in km/h
 * @returns {number} ETA in minutes
 */
export function calculateETA(distanceKm, speedKmh) {
    if (speedKmh === 0 || speedKmh < 1) {
        speedKmh = 30; // Fallback speed 30 km/h
    }
    const timeHours = distanceKm / speedKmh;
    const timeMinutes = Math.ceil(timeHours * 60);
    return Math.max(1, timeMinutes); // Minimum 1 minute
}

/**
 * Determine if bus is approaching a stop (within 500m)
 * @param {number} distance - Distance in km
 * @returns {boolean} True if approaching
 */
export function isApproachingStop(distance) {
    return distance <= 0.5; // 500 meters
}

/**
 * Determine if bus has passed a stop (with buffer)
 * @param {number} distance - Distance to stop in km
 * @returns {boolean} True if passed
 */
export function hasPassedStop(distance) {
    return distance < 0; // Negative distance means bus has passed
}

/**
 * Format distance as human-readable string
 * @param {number} distanceKm - Distance in kilometers
 * @returns {string} Formatted distance
 */
export function formatDistance(distanceKm) {
    if (distanceKm < 1) {
        return `${Math.round(distanceKm * 1000)} m`;
    }
    return `${distanceKm} km`;
}

/**
 * Format ETA as human-readable string
 * @param {number} minutes - ETA in minutes
 * @returns {string} Formatted ETA
 */
export function formatETA(minutes) {
    if (minutes < 1) return 'Now';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
}

/**
 * Get status badge based on distance
 * @param {number} distance - Distance in km
 * @returns {string} Status - 'ARRIVING', 'ON_THE_WAY', or 'OFFLINE'
 */
export function getStatus(distance) {
    if (distance === null) return 'OFFLINE';
    if (distance <= 0.5) return 'ARRIVING';
    return 'ON_THE_WAY';
}

export default {
    haversineDistance,
    calculateETA,
    isApproachingStop,
    hasPassedStop,
    formatDistance,
    formatETA,
    getStatus
};
