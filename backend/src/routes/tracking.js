/**
 * Bus Tracking Routes
 * REST API for real-time bus tracking with stop detection and ETA calculation
 */

import express from 'express';
import {
    getStopsByRoute,
    getBusLocation,
    updateBusLocation as dbUpdateBusLocation,
    getRouteName,
    getAllBuses,
    getActiveBuses
} from '../utils/dbUtils.js';
import {
    haversineDistance,
    calculateETA,
    getStatus,
    isApproachingStop,
    hasPassedStop,
    formatDistance,
    formatETA
} from '../utils/distanceUtils.js';

const router = express.Router();

/**
 * POST /api/bus/location
 * Update bus location with GPS data
 * Body: { username, lat, lng, speed }
 */
router.post('/location', async (req, res) => {
    try {
        const { username, lat, lng, speed } = req.body;

        // Validation
        if (!username || lat === undefined || lng === undefined) {
            return res.status(400).json({
                error: 'Missing required fields: username, lat, lng'
            });
        }

        // Parse inputs
        const parsedSpeed = parseFloat(speed) || 0;

        // Get database connection from request
        const pool = req.app.get('dbPool');
        if (!pool) {
            return res.status(500).json({ error: 'Database connection not available' });
        }

        // Update location in database
        const updatedLocation = await dbUpdateBusLocation(
            pool,
            username,
            lat,
            lng,
            parsedSpeed
        );

        res.json({
            success: true,
            message: 'Bus location updated',
            data: {
                username: updatedLocation.Username,
                lat: updatedLocation.latitude,
                lng: updatedLocation.longitude,
                speed: updatedLocation.speed,
                updatedAt: updatedLocation.lastUpdated
            }
        });
    } catch (error) {
        console.error('Error updating bus location:', error);
        res.status(500).json({ error: 'Failed to update bus location' });
    }
});

/**
 * GET /api/bus/:username/status
 * Get bus status with location
 */
router.get('/:username/status', async (req, res) => {
    try {
        const { username } = req.params;
        const pool = req.app.get('dbPool');

        if (!pool) {
            return res.status(500).json({ error: 'Database connection not available' });
        }

        // Get current bus location
        const busLocation = await getBusLocation(pool, username);

        if (!busLocation) {
            return res.status(404).json({
                error: 'Bus not found',
                username,
                status: 'OFFLINE'
            });
        }

        // Determine bus status based on last update time
        const timeUntilUpdate = (Date.now() - new Date(busLocation.RecordedAt).getTime()) / 1000;
        const isOffline = timeUntilUpdate > 300; // 5 minutes

        let status = isOffline ? 'OFFLINE' : 'ONLINE';

        res.json({
            success: true,
            username,
            status,
            location: {
                lat: busLocation.latitude,
                lng: busLocation.longitude,
                speed: busLocation.speed,
                updatedAt: busLocation.RecordedAt
            }
        });
    } catch (error) {
        console.error('Error fetching bus status:', error);
        res.status(500).json({ error: 'Failed to fetch bus status' });
    }
});

/**
 * GET /api/buses
 * Get all active buses with their current locations
 */
router.get('/', async (req, res) => {
    try {
        const pool = req.app.get('dbPool');

        if (!pool) {
            return res.status(500).json({ error: 'Database connection not available' });
        }

        const buses = await getActiveBuses(pool);

        const busesWithStatus = buses.map(bus => ({
            username: bus.Username,
            busNumber: bus.busNumber,
            route: bus.route,
            lat: bus.latitude,
            lng: bus.longitude,
            speed: bus.speed,
            updatedAt: bus.lastUpdated,
            status: bus.latitude && bus.longitude ? 'ONLINE' : 'OFFLINE'
        }));

        res.json({
            success: true,
            count: busesWithStatus.length,
            buses: busesWithStatus
        });
    } catch (error) {
        console.error('Error fetching buses:', error);
        res.status(500).json({ error: 'Failed to fetch buses' });
    }
});

/**
 * GET /api/bus/:username/distance-to/:stopID
 * This endpoint is disabled - requires route stops which are not in the current schema
 * Consider implementing if route/stop data is added in the future
 */
// router.get('/:username/distance-to/:stopID', async (req, res) => {
//     res.status(501).json({ error: 'Stop distance calculation not available' });
// });

export default router;
