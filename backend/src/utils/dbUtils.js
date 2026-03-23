/**
 * Database Query Utilities
 * SQL Server queries for bus tracking
 */

import sql from 'mssql';

/**
 * Get all stops for a specific route
 * @param {sql.ConnectionPool} pool - SQL Server connection pool
 * @param {number} routeID - Route ID
 * @returns {Promise<Array>} Array of stops
 */
export async function getStopsByRoute(pool, routeID) {
    try {
        const result = await pool
            .request()
            .input('routeID', sql.Int, routeID)
            .query(`
                SELECT 
                    StopID,
                    RouteID,
                    StopName,
                    Latitude,
                    Longitude,
                    StopOrder
                FROM dbo.CW_Stops
                WHERE RouteID = @routeID
                ORDER BY StopOrder ASC
            `);
        return result.recordset;
    } catch (error) {
        console.error('Error fetching stops:', error);
        throw error;
    }
}

/**
 * Get current bus location
 * @param {sql.ConnectionPool} pool - SQL Server connection pool
 * @param {string} username - Bus username
 * @returns {Promise<Object>} Bus location data
 */
export async function getBusLocation(pool, username) {
    try {
        const result = await pool
            .request()
            .input('username', sql.NVarChar(50), username)
            .query(`
                SELECT TOP 1
                    Username,
                    latitude,
                    longitude,
                    speed,
                    RecordedAt
                FROM dbo.LocationHistory
                WHERE Username = @username
                ORDER BY RecordedAt DESC
            `);
        return result.recordset[0] || null;
    } catch (error) {
        console.error('Error fetching bus location:', error);
        throw error;
    }
}

/**
 * Update bus location in LocationHistory
 * @param {sql.ConnectionPool} pool - SQL Server connection pool
 * @param {string} username - Bus username
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} speed - Speed in km/h
 * @returns {Promise<Object>} Updated location record
 */
export async function updateBusLocation(pool, username, lat, lng, speed) {
    try {
        await pool
            .request()
            .input('username', sql.NVarChar(50), username)
            .input('lat', sql.Float, lat)
            .input('lng', sql.Float, lng)
            .input('speed', sql.Float, speed)
            .query(`
                INSERT INTO dbo.LocationHistory (Username, latitude, longitude, speed, RecordedAt)
                VALUES (@username, @lat, @lng, @speed, GETUTCDATE());
            `);
        
        // Also update Buses table with latest location
        const result = await pool
            .request()
            .input('username', sql.NVarChar(50), username)
            .input('lat', sql.Float, lat)
            .input('lng', sql.Float, lng)
            .input('speed', sql.Float, speed)
            .query(`
                UPDATE dbo.Buses
                SET latitude = @lat, longitude = @lng, speed = @speed, lastUpdated = GETUTCDATE()
                WHERE Username = @username;

                SELECT 
                    Username,
                    latitude,
                    longitude,
                    speed,
                    lastUpdated
                FROM dbo.Buses
                WHERE Username = @username
            `);
        return result.recordset[0];
    } catch (error) {
        console.error('Error updating bus location:', error);
        throw error;
    }
}

/**
 * Get route name (placeholder for future use)
 * @param {sql.ConnectionPool} pool - SQL Server connection pool
 * @param {string} username - Bus username
 * @returns {Promise<string>} Route name
 */
export async function getRouteName(pool, username) {
    try {
        const result = await pool
            .request()
            .input('username', sql.NVarChar(50), username)
            .query(`
                SELECT route
                FROM dbo.Buses
                WHERE Username = @username
            `);
        return result.recordset[0]?.route || 'Unknown Route';
    } catch (error) {
        console.error('Error fetching route name:', error);
        return 'Unknown Route';
    }
}

/**
 * Get all buses with their latest locations
 * @param {sql.ConnectionPool} pool - SQL Server connection pool
 * @returns {Promise<Array>} Array of buses with locations
 */
export async function getAllBuses(pool) {
    try {
        const result = await pool.request().query(`
            SELECT 
                d.Id,
                d.BusNo,
                d.BusName,
                d.Username,
                d.DestinationName,
                d.DestinationLat,
                d.DestinationLng,
                d.LastUpdated
            FROM dbo.Buses d
            ORDER BY d.BusNo ASC
        `);
        return result.recordset;
    } catch (error) {
        console.error('Error fetching all buses:', error);
        throw error;
    }
}

/**
 * Get active buses (updated in last 5 minutes)
 * @param {sql.ConnectionPool} pool - SQL Server connection pool
 * @returns {Promise<Array>} Array of active buses
 */
export async function getActiveBuses(pool) {
    try {
        const result = await pool.request().query(`
            SELECT 
                d.Id,
                d.BusNo,
                d.BusName,
                d.Username,
                d.DestinationName,
                d.DestinationLat,
                d.DestinationLng,
                d.LastUpdated
            FROM dbo.Buses d
            WHERE DATEDIFF(MINUTE, d.LastUpdated, GETUTCDATE()) <= 5
            ORDER BY d.LastUpdated DESC
        `);
        return result.recordset;
    } catch (error) {
        console.error('Error fetching active buses:', error);
        throw error;
    }
}

export default {
    getStopsByRoute,
    getBusLocation,
    updateBusLocation,
    getRouteName,
    getAllBuses,
    getActiveBuses
};
