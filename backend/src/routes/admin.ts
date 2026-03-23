import { Router } from 'express';
import sql from 'mssql';
import { getConnection } from '../config/database';

const router = Router();

/**
 * GET /api/admin/buses
 * Get all buses for the driver login interface
 */
router.get('/buses', async (req, res) => {
  try {
    const pool = await getConnection();
    
    // Query to get all buses
    const result = await pool
      .request()
      .query(`
        SELECT 
          BusNo,
          Registration,
          Route,
          IsActive,
          IsOnline,
          LastLocationUpdate
        FROM CW_Buses
        ORDER BY BusNo
      `);

    const buses = result.recordset && result.recordset.length > 0 
      ? result.recordset 
      : [];

    res.json({
      success: true,
      buses: buses.map((b: any) => ({
        BusNo: b.BusNo,
        Registration: b.Registration,
        Route: b.Route,
        IsActive: b.IsActive || 0,
        IsOnline: b.IsOnline || 0
      }))
    });
  } catch (err: any) {
    console.error('Error fetching buses:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch buses'
    });
  }
});

/**
 * POST /api/driver/login
 * Authenticate driver with bus number and password
 */
router.post('/driver/login', async (req, res) => {
  try {
    const { busNo, password } = req.body;

    if (!busNo || !password) {
      return res.status(400).json({
        success: false,
        error: 'Bus number and password required'
      });
    }

    const pool = await getConnection();

    // Query to get bus and verify password
    const result = await pool
      .request()
      .input('BusNo', sql.Int, parseInt(busNo))
      .input('password', sql.NVarChar(100), password)
      .query(`
        SELECT 
          BusNo,
          Registration,
          Route,
          Password
        FROM CW_Buses
        WHERE BusNo = @BusNo
      `);

    const bus = result.recordset && result.recordset[0];

    if (!bus) {
      return res.status(404).json({
        success: false,
        error: 'Bus not found'
      });
    }

    // Simple password verification (in production, use bcrypt)
    if (bus.Password !== password) {
      return res.status(401).json({
        success: false,
        error: 'Invalid password'
      });
    }

    // Update last login timestamp
    await pool
      .request()
      .input('BusNo', sql.Int, bus.BusNo)
      .query(`
        UPDATE CW_Buses
        SET LastLocationUpdate = GETUTCDATE()
        WHERE BusNo = @BusNo
      `);

    res.json({
      success: true,
      message: 'Login successful',
      bus: {
        BusNo: bus.BusNo,
        Registration: bus.Registration,
        Route: bus.Route
      }
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

/**
 * PUT /api/admin/bus/:busNo/status
 * Update bus online status
 */
router.put('/bus/:busNo/status', async (req, res) => {
  try {
    const { isOnline } = req.body;
    const busNo = parseInt(req.params.busNo);

    if (isOnline === undefined) {
      return res.status(400).json({
        success: false,
        error: 'isOnline status required'
      });
    }

    const pool = await getConnection();

    await pool
      .request()
      .input('BusNo', sql.Int, busNo)
      .input('IsOnline', sql.Int, isOnline ? 1 : 0)
      .query(`
        UPDATE CW_Buses
        SET IsOnline = @IsOnline, LastLocationUpdate = GETUTCDATE()
        WHERE BusNo = @BusNo
      `);

    res.json({
      success: true,
      message: 'Bus status updated'
    });
  } catch (err: any) {
    console.error('Error updating bus status:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update status'
    });
  }
});

export default router;
