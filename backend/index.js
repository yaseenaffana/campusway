import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cron from 'node-cron';
import db from './db.js';

// Load environment variables
dotenv.config();

// Define env variables FIRST, before using them
const JWT_SECRET = process.env.JWT_SECRET || 'mzsjs-buzz-secret-key-2026';
const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'admin').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'admin123').trim();
const ADMIN_EMP_ID = String(process.env.ADMIN_EMP_ID || 'ADMIN001').trim();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  path: '/socket.io/',
  allowEIO3: true,
  pingInterval: 25000,
  pingTimeout: 60000,
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 1e6
});

// ==================== MIDDLEWARE ====================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(morgan('dev'));
app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Preflight requests
app.options('*', cors({
  origin: CORS_ORIGIN,
  credentials: true
}));

// ==================== AUTH HELPERS ====================

const generateToken = (user) => {
  return jwt.sign(
    { id: user.BusNo || user.Username, role: user.role, busNo: user.BusNo },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ success: false, error: 'Access denied' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, error: 'Invalid token' });
    req.user = user;
    next();
  });
};

const isDriver = (req, res, next) => {
  if (req.user.role !== 'DRIVER') {
    return res.status(403).json({ success: false, error: 'Driver access only' });
  }
  next();
};

const isAdmin = (req, res, next) => {
  if (String(req.user?.role || '').toLowerCase() !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access only' });
  }
  next();
};

// ==================== WEBSOCKET ====================
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  socket.on('join-bus', (busNo) => {
    socket.join(`bus_${busNo}`);
    console.log(`🚌 Socket ${socket.id} joined bus_${busNo}`);
  });

  socket.on('leave-bus', (busNo) => {
    socket.leave(`bus_${busNo}`);
    console.log(`🚌 Socket ${socket.id} left bus_${busNo}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ==================== CLEANUP TASK (Every 30 Minutes) ====================
// Delete location history older than 24 hours
// This keeps the Buses table intact but removes old location data
cron.schedule('*/30 * * * *', async () => {
  try {
    console.log(`🧹 Starting location history cleanup - ${new Date().toISOString()}`);
    
    // Count records before deletion
    const countBefore = await db.executeQuery(`
      SELECT COUNT(*) as total FROM dbo.LocationHistory
    `);
    
    const countOld = await db.executeQuery(`
      SELECT COUNT(*) as total FROM dbo.LocationHistory 
      WHERE RecordedAt < DATEADD(HOUR, -24, GETDATE())
    `);

    // Delete location history older than 24 hours
    const result = await db.executeQuery(`
      DELETE FROM dbo.LocationHistory 
      WHERE RecordedAt < DATEADD(HOUR, -24, GETDATE())
    `);

    console.log(`✅ Cleanup completed:`);
    console.log(`   Total records before: ${countBefore.recordset[0].total}`);
    console.log(`   Records deleted: ${countOld.recordset[0].total}`);
    console.log(`   Time: ${new Date().toISOString()}`);
  } catch (err) {
    console.error('❌ Cleanup failed:', err.message);
  }
});

// ==================== OPTIONAL: Full Data Cleanup Task (Daily at 2 AM) ====================
// For complete cleanup of all old data (including inactive buses)
cron.schedule('0 2 * * *', async () => {
  try {
    const startTime = new Date();
    console.log(`🧹 Running daily full cleanup - ${startTime.toISOString()}`);
    
    // Count records before deletion
    const countBefore = await db.executeQuery(`
      SELECT COUNT(*) as total FROM dbo.LocationHistory
    `);
    
    // Delete location history older than 24 hours
    const result = await db.executeQuery(`
      DELETE FROM dbo.LocationHistory 
      WHERE RecordedAt < DATEADD(HOUR, -24, GETDATE())
    `);

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    console.log(`✅ Daily cleanup completed in ${duration}ms:`);
    console.log(`   Records deleted: ${countBefore.recordset[0].total}`);
    console.log(`   Time: ${endTime.toISOString()}`);
  } catch (err) {
    console.error('❌ Daily cleanup failed:', err.message);
  }
});

// ==================== API ENDPOINTS ====================

app.post('/api/admin/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, error: 'Invalid admin credentials' });
    }

    const token = jwt.sign(
      { username, empId: ADMIN_EMP_ID, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({
      success: true,
      token,
      admin: {
        username,
        empId: ADMIN_EMP_ID
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/logout', authenticateToken, isAdmin, async (_req, res) => {
  return res.json({ success: true });
});

/**
 * GET /api/buses
 * Get all buses with online status based on active GPS sharing
 */
app.get('/api/buses', async (req, res) => {
  try {
    // Check for buses with recent LocationHistory entries (GPS sharing)
    const result = await db.executeQuery(`
      SELECT 
        b.Id,
        b.BusNo, 
        b.BusName, 
        b.Username, 
        b.CurrentLat, 
        b.CurrentLng, 
        b.Speed, 
        b.LastUpdated,
        b.DestinationName, 
        b.DestinationLat, 
        b.DestinationLng, 
        b.SchoolLat, 
        b.SchoolLng,
        -- Check if bus has recent GPS entries (within last 60 seconds)
        CASE WHEN EXISTS (
          SELECT 1 FROM dbo.LocationHistory lh 
          WHERE lh.BusNo = b.BusNo 
          AND lh.RecordedAt > DATEADD(SECOND, -60, GETDATE())
        ) THEN 1 ELSE 0 END AS HasRecentGPS,
        -- Count recent GPS entries
        (SELECT COUNT(*) FROM dbo.LocationHistory lh 
         WHERE lh.BusNo = b.BusNo 
         AND lh.RecordedAt > DATEADD(SECOND, -60, GETDATE())) AS GPSCount
      FROM dbo.Buses b
      ORDER BY 
        HasRecentGPS DESC,  -- Online (has GPS) first
        b.BusNo ASC  -- Then ordered by bus number (string sort)
    `);

    const buses = result.recordset.map(b => ({
      ...b,
      isOnline: b.HasRecentGPS === 1,  // Online only if actively sharing GPS
      status: b.HasRecentGPS === 1 ? 'online' : 'offline'
    }));

    res.json({ success: true, buses, count: buses.length });
  } catch (err) {
    console.error('❌ SQL Error (GET /api/buses):', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

/**
 * GET /api/buses/live
 * Return online buses based on active GPS sharing (ordered)
 */
app.get('/api/buses/live', async (req, res) => {
  try {
    const result = await db.executeQuery(`
      SELECT 
        b.Id,
        b.BusNo, 
        b.BusName, 
        b.Username, 
        b.CurrentLat, 
        b.CurrentLng, 
        b.Speed, 
        b.LastUpdated,
        b.DestinationName, 
        b.DestinationLat, 
        b.DestinationLng, 
        b.SchoolLat, 
        b.SchoolLng,
        -- Check if bus has recent GPS entries (within last 60 seconds)
        CASE WHEN EXISTS (
          SELECT 1 FROM dbo.LocationHistory lh 
          WHERE lh.BusNo = b.BusNo 
          AND lh.RecordedAt > DATEADD(SECOND, -60, GETDATE())
        ) THEN 1 ELSE 0 END AS HasRecentGPS,
        -- Count recent GPS entries
        (SELECT COUNT(*) FROM dbo.LocationHistory lh 
         WHERE lh.BusNo = b.BusNo 
         AND lh.RecordedAt > DATEADD(SECOND, -60, GETDATE())) AS GPSCount,
        -- Get latest GPS timestamp
        (SELECT TOP 1 RecordedAt FROM dbo.LocationHistory lh 
         WHERE lh.BusNo = b.BusNo 
         ORDER BY RecordedAt DESC) AS LastGPSTime
      FROM dbo.Buses b
      WHERE EXISTS (
        SELECT 1 FROM dbo.LocationHistory lh 
        WHERE lh.BusNo = b.BusNo 
        AND lh.RecordedAt > DATEADD(SECOND, -60, GETDATE())
      )
      ORDER BY b.BusNo ASC
    `);

    const buses = result.recordset.map(b => ({
      ...b,
      isOnline: true,  // Already filtered to only online buses
      status: 'online',
      lastGPSTime: b.LastGPSTime
    }));

    res.json({ success: true, buses, onlineCount: buses.length });
  } catch (err) {
    console.error('❌ SQL Error (GET live):', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

/**
 * GET /api/buses/:busNo
 * Get specific bus (alternative route)
 */
app.get('/api/buses/:busNo', async (req, res) => {
  try {
    const { busNo } = req.params;
    const result = await db.executeQuery(`
      SELECT TOP 1 * FROM dbo.Buses WHERE BusNo = @busNo
    `, { busNo });

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Bus not found' });
    }

    res.json({ success: true, bus: result.recordset[0] });
  } catch (err) {
    console.error('❌ SQL Error (GET buses/:busNo):', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

/**
 * GET /api/admin/buses
 * Get all buses for admin panel
 */
app.get('/api/admin/buses', authenticateToken, async (req, res) => {
  try {
    const result = await db.executeQuery(`
      SELECT 
        BusNo, BusName, Username, CurrentLat, CurrentLng, Speed, LastUpdated,
        DestinationName, DestinationLat, DestinationLng, SchoolLat, SchoolLng
      FROM dbo.Buses
      ORDER BY BusNo
    `);

    const buses = result.recordset.map(b => ({
      ...b,
      isOnline: (new Date() - new Date(b.LastUpdated)) < 30000
    }));

    res.json({ success: true, buses, totalBuses: buses.length });
  } catch (err) {
    console.error('❌ SQL Error (GET admin/buses):', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

/**
 * GET /api/stats/buses
 * Get bus statistics
 */
app.get('/api/stats/buses', async (req, res) => {
  try {
    const result = await db.executeQuery(`
      SELECT 
        COUNT(*) as TotalBuses,
        SUM(CASE WHEN LastUpdated > DATEADD(SECOND, -30, GETDATE()) THEN 1 ELSE 0 END) as OnlineBuses,
        AVG(Speed) as AvgSpeed,
        MAX(Speed) as MaxSpeed
      FROM dbo.Buses
    `);

    res.json({ 
      success: true, 
      stats: result.recordset[0] 
    });
  } catch (err) {
    console.error('❌ SQL Error (GET stats/buses):', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

/**
 * GET /api/admin/cleanup-status
 * Get location history cleanup status
 */
app.get('/api/admin/cleanup-status', authenticateToken, async (req, res) => {
  try {
    // Get total records
    const totalResult = await db.executeQuery(`
      SELECT COUNT(*) as total FROM dbo.LocationHistory
    `);

    // Get records older than 24 hours
    const oldResult = await db.executeQuery(`
      SELECT COUNT(*) as total FROM dbo.LocationHistory 
      WHERE RecordedAt < DATEADD(HOUR, -24, GETDATE())
    `);

    // Get oldest record
    const oldestResult = await db.executeQuery(`
      SELECT TOP 1 RecordedAt FROM dbo.LocationHistory 
      ORDER BY RecordedAt ASC
    `);

    // Get newest record
    const newestResult = await db.executeQuery(`
      SELECT TOP 1 RecordedAt FROM dbo.LocationHistory 
      ORDER BY RecordedAt DESC
    `);

    res.json({ 
      success: true, 
      cleanup: {
        totalRecords: totalResult.recordset[0].total,
        recordsOlderThan24Hours: oldResult.recordset[0].total,
        oldestRecord: oldestResult.recordset[0]?.RecordedAt,
        newestRecord: newestResult.recordset[0]?.RecordedAt,
        nextCleanupIn: 'Every 30 minutes (configurable)',
        lastCleanup: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('❌ SQL Error (GET cleanup-status):', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

/**
 * POST /api/admin/cleanup-now
 * Manually trigger location history cleanup
 */
app.post('/api/admin/cleanup-now', authenticateToken, async (req, res) => {
  try {
    console.log('🧹 Manual cleanup triggered by admin');

    // Count records before
    const beforeResult = await db.executeQuery(`
      SELECT COUNT(*) as total FROM dbo.LocationHistory
    `);

    // Delete old records
    const deleteResult = await db.executeQuery(`
      DELETE FROM dbo.LocationHistory 
      WHERE RecordedAt < DATEADD(HOUR, -24, GETDATE())
    `);

    // Count records after
    const afterResult = await db.executeQuery(`
      SELECT COUNT(*) as total FROM dbo.LocationHistory
    `);

    const deleted = beforeResult.recordset[0].total - (afterResult.recordset[0].total || 0);

    console.log(`✅ Manual cleanup completed: ${deleted} records deleted`);

    res.json({ 
      success: true, 
      message: 'Location history cleanup completed',
      cleanup: {
        recordsBefore: beforeResult.recordset[0].total,
        recordsDeleted: deleted,
        recordsAfter: afterResult.recordset[0].total,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('❌ Manual cleanup failed:', err.message);
    res.status(500).json({ success: false, error: 'Cleanup failed', details: err.message });
  }
});

/**
 * POST /api/bus/disconnect
 * Disconnect a bus driver
 */
app.post('/api/bus/disconnect', authenticateToken, isDriver, async (req, res) => {
  try {
    const busNo = req.user.busNo;

    // Update last updated time to mark as offline
    await db.executeQuery(`
      UPDATE dbo.Buses
      SET LastUpdated = DATEADD(HOUR, -1, GETDATE())
      WHERE BusNo = @busNo
    `, { busNo: String(busNo) });

    io.to(`bus_${busNo}`).emit('busDisconnected', { busNo, timestamp: new Date() });

    res.json({ success: true, message: 'Bus disconnected' });
  } catch (err) {
    console.error('❌ SQL Error (POST disconnect):', err.message);
    res.status(500).json({ success: false, error: 'Disconnect failed' });
  }
});

/**
 * POST /api/login
 * Authenticate user
 */
app.post('/api/login', async (req, res) => {
  try {
    const {
      // Newer frontend payload
      email,
      // Backward compatible payloads
      username,
      busNo,
      license_number,
      password,
      role,
      newPassword,
      updatePassword
    } = req.body;

    const identifier = email || username || busNo || license_number;

    if (role === 'STUDENT') {
      const token = generateToken({ Username: identifier, role: 'STUDENT' });
      return res.json({ success: true, role: 'STUDENT', token });
    }

    if (role === 'DRIVER' || !role) {
      // Driver login or password update
      console.log('🔑 Driver Login payload:', {
        email: email ? '[present]' : undefined,
        username: username ? '[present]' : undefined,
        busNo: busNo ? '[present]' : undefined,
        license_number: license_number ? '[present]' : undefined,
        role,
        identifier
      });
      const result = await db.executeQuery(`
        SELECT TOP 1 * FROM dbo.Buses WHERE Username = @identifier OR BusNo = @identifier
      `, { identifier: String(identifier) });

      if (result.recordset.length === 0) {
        console.warn(`❌ Driver not found: ${identifier}`);
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

      const bus = result.recordset[0];
      console.log(`✅ Found bus record for: ${bus.BusNo}`);
      
      // Password validation:
      // 1. Check PasswordHash (primary password)
      // 2. Check SecondPassword (secondary/common password - 234567)
      // 3. Fallback to BusNo (legacy behavior)
      const primaryPassword = bus.PasswordHash ? String(bus.PasswordHash).trim() : '';
      const secondaryPassword = bus.SecondPassword ? String(bus.SecondPassword).trim() : '';
      const legacyPassword = String(bus.BusNo).trim();
      const incomingPassword = String(password ?? '').trim();

      let isPrimaryMatch = false;
      let isSecondaryMatch = false;
      let isLegacyMatch = false;

      // Check primary password
      if (primaryPassword) {
        if (primaryPassword.startsWith('$2a$') || primaryPassword.startsWith('$2b$') || primaryPassword.startsWith('$2y$')) {
          isPrimaryMatch = await bcrypt.compare(incomingPassword, primaryPassword);
        } else {
          isPrimaryMatch = incomingPassword === primaryPassword;
        }
      }

      // Check secondary password (common password for all buses)
      if (secondaryPassword && !isPrimaryMatch) {
        if (secondaryPassword.startsWith('$2a$') || secondaryPassword.startsWith('$2b$') || secondaryPassword.startsWith('$2y$')) {
          isSecondaryMatch = await bcrypt.compare(incomingPassword, secondaryPassword);
        } else {
          isSecondaryMatch = incomingPassword === secondaryPassword;
        }
      }

      // Check legacy password
      if (!isPrimaryMatch && !isSecondaryMatch) {
        isLegacyMatch = incomingPassword === legacyPassword;
      }

      const isMatch = isPrimaryMatch || isSecondaryMatch || isLegacyMatch;
      const authMode = isPrimaryMatch ? 'PRIMARY' : isSecondaryMatch ? 'SECONDARY' : 'LEGACY';

      if (!isMatch) {
        console.warn(`❌ Password mismatch for identifier: ${identifier}`);
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

      console.log(`✅ Authentication successful using ${authMode} password for bus ${bus.BusNo}`);

      // If it's a password update request
      if (updatePassword && newPassword) {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);
        await db.executeQuery(`UPDATE dbo.Buses SET Password = @hash WHERE BusNo = @busNo`, 
          { hash, busNo: bus.BusNo });
        return res.json({ success: true, message: 'Password updated' });
      }

      const token = generateToken({ ...bus, role: 'DRIVER' });
      return res.json({ 
        success: true, 
        role: 'DRIVER', 
        token,
        busDetails: {
          busNo: bus.BusNo,
          busName: bus.BusName,
          route: bus.DestinationName
        }
      });
    }

    res.status(400).json({ success: false, error: 'Invalid role' });
  } catch (err) {
    console.error('❌ SQL Error (POST login):', err.message);
    res.status(500).json({ success: false, error: 'Auth error' });
  }
});

/**
 * POST /api/bus/update-location
 * Update database and emit WebSocket event
 */
app.post('/api/bus/update-location', authenticateToken, isDriver, async (req, res) => {
  try {
    const { lat, lng, speed } = req.body;
    const busNo = req.user.busNo;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ success: false, error: 'Missing coordinates' });
    }

    const now = new Date();
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const speedVal = parseFloat(speed || 0);

    await db.executeQuery(`
      UPDATE dbo.Buses
      SET CurrentLat = @lat, 
          CurrentLng = @lng, 
          Speed = @speed, 
          LastUpdated = GETDATE()
      WHERE BusNo = @busNo;
      
      -- Insert into location history (schema in facultyschedule uses bus_id + RecordedAt)
      DECLARE @busId INT;
      SELECT TOP 1 @busId = Id FROM dbo.Buses WHERE BusNo = @busNo;
      IF (@busId IS NOT NULL)
      BEGIN
        INSERT INTO dbo.LocationHistory (bus_id, latitude, longitude, speed, RecordedAt)
        VALUES (@busId, @lat, @lng, @speed, GETDATE());
      END
    `, {
      lat: latitude,
      lng: longitude,
      speed: speedVal,
      busNo: String(busNo)
    });

    // Broadcast via Socket.IO (Low Latency)
    const updatePayload = {
      busNo,
      lat: latitude,
      lng: longitude,
      speed: speedVal,
      timestamp: now.toISOString()
    };

    io.to(`bus_${busNo}`).emit('busLocationUpdated', updatePayload);
    io.emit('fleetUpdate', updatePayload);

    res.json({ success: true, timestamp: now });
  } catch (err) {
    console.error('❌ SQL Error (POST update-location):', err.message);
    res.status(500).json({ success: false, error: 'Update failed' });
  }
});

// ==================== STUB ENDPOINTS FOR DRIVER COMPATIBILITY ====================

app.post('/api/location', async (req, res) => {
  res.json({ success: true, message: 'Stub endpoint' });
});

app.post('/api/trips/start', async (req, res) => {
  res.json({ success: true, tripId: 'trip-' + Date.now() });
});

app.post('/api/trips/end', async (req, res) => {
  res.json({ success: true });
});

// ==================== HEALTH & STATUS ENDPOINTS ====================

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.executeQuery('SELECT GETDATE() AS serverTime');
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      databaseTime: result.recordset[0].serverTime
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Database connection failed'
    });
  }
});

/**
 * GET /api/test-db
 * Test database connection
 */
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await db.executeQuery('SELECT GETDATE() AS ServerTime; SELECT @@VERSION AS SqlVersion');
    res.json({
      success: true,
      message: 'Database Connected Successfully',
      data: {
        serverTime: result.recordset[0].ServerTime,
        sqlVersion: 'Connected'
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Database connection failed',
      message: err.message
    });
  }
});

/**
 * GET /api/buses
 * Get all buses (alias for /api/buses/live)
 */
app.get('/api/buses', async (req, res) => {
  try {
    const result = await db.executeQuery(`
      SELECT 
        BusNo, BusName, Username, CurrentLat, CurrentLng, Speed, LastUpdated,
        DestinationName, DestinationLat, DestinationLng, SchoolLat, SchoolLng
      FROM dbo.Buses
    `);

    const buses = result.recordset.map(b => ({
      ...b,
      isOnline: (new Date() - new Date(b.LastUpdated)) < 30000
    }));

    res.json({ success: true, buses, count: buses.length });
  } catch (err) {
    console.error('❌ SQL Error (GET /api/buses):', err.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// ==================== ERROR HANDLERS ====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ==================== SERVER STARTUP ====================
async function startServer() {
  try {
    await db.initializeDatabase();
    
    // Ensure tables exist
    console.log('📦 Checking database tables...');
    await db.executeQuery(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Buses]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[Buses] (
          [BusNo] NVARCHAR(50) PRIMARY KEY,
          [BusName] NVARCHAR(100),
          [Username] NVARCHAR(50),
          [Password] NVARCHAR(100) DEFAULT '1234',
          [CurrentLat] DECIMAL(10, 8),
          [CurrentLng] DECIMAL(11, 8),
          [Speed] DECIMAL(5, 2) DEFAULT 0,
          [LastUpdated] DATETIME DEFAULT GETDATE(),
          [DestinationName] NVARCHAR(150),
          [DestinationLat] DECIMAL(10, 8),
          [DestinationLng] DECIMAL(11, 8),
          [SchoolLat] DECIMAL(10, 8),
          [SchoolLng] DECIMAL(11, 8)
        );
        
        -- Insert initial sample buses if table was just created
        INSERT INTO [dbo].[Buses] (BusNo, BusName, Username, Password, DestinationName)
        VALUES 
          ('2', 'Sivabalan', 'bus2', '1234', 'Neivasal'),
          ('3', 'Driver 3', 'bus3', '1234', 'SS.Kottai'),
          ('21', 'Driver 21', 'bus21', '1234', 'Karaikudi');
      END
      
      -- Create LocationHistory table for tracking location updates
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[LocationHistory]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[LocationHistory] (
          [Id] INT IDENTITY(1,1) PRIMARY KEY,
          [BusNo] NVARCHAR(50) NOT NULL,
          [Latitude] DECIMAL(10, 8) NOT NULL,
          [Longitude] DECIMAL(11, 8) NOT NULL,
          [Speed] DECIMAL(5, 2) DEFAULT 0,
          [Timestamp] DATETIME DEFAULT GETDATE(),
          CONSTRAINT [FK_LocationHistory_Buses] FOREIGN KEY ([BusNo]) REFERENCES [dbo].[Buses]([BusNo]) ON DELETE CASCADE
        );
        
        -- Create index on BusNo and Timestamp for faster queries
        CREATE INDEX [IX_LocationHistory_BusNo_Timestamp] ON [dbo].[LocationHistory]([BusNo], [Timestamp]);
        CREATE INDEX [IX_LocationHistory_Timestamp] ON [dbo].[LocationHistory]([Timestamp]);
      END
    `);
    
    console.log('✅ Database tables verified');

    server.listen(PORT, HOST, () => {
      console.log(`\n✅ MZSJS BUZZ Backend Server Started`);
      console.log(`🚀 Listening on ${HOST}:${PORT}`);
      console.log(`🌐 WebSocket: ${HOST === '0.0.0.0' ? '103.207.1.92' : HOST}:${PORT}/socket.io/`);
      console.log(`📡 API Base URL: http://${HOST === '0.0.0.0' ? '103.207.1.92' : HOST}:${PORT}/api`);
      console.log(`\n💡 For remote access, use: http://<YOUR_IP>:${PORT}\n`);
    });

    // Handle server errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', err);
      }
    });

  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
