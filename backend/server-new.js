import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import cron from 'cron';
import dotenv from 'dotenv';
import db from './db.js';

dotenv.config();

// ========================================
// CONFIGURATION
// ========================================
const JWT_SECRET = process.env.JWT_SECRET || 'bustrack_secret_2024';
const PORT = parseInt(process.env.PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// ========================================
// SETUP EXPRESS & HTTP SERVER
// ========================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
});

// ========================================
// MIDDLEWARE
// ========================================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(morgan('dev'));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ========================================
// HELPERS & UTILITIES
// ========================================

/**
 * Generate JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.BusNo || user.Username, 
      role: user.role || 'DRIVER', 
      busNo: user.BusNo,
      username: user.Username 
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

/**
 * Verify JWT token middleware
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access denied - no token' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

/**
 * Check if user is driver
 */
const isDriver = (req, res, next) => {
  if (req.user.role !== 'DRIVER') {
    return res.status(403).json({ success: false, error: 'Driver access only' });
  }
  next();
};

/**
 * Check if user is student (or any role that's not DRIVER)
 */
const isStudent = (req, res, next) => {
  if (req.user.role === 'DRIVER') {
    return res.status(403).json({ success: false, error: 'Student access only' });
  }
  next();
};

/**
 * Haversine formula - calculate distance between two coordinates
 * Returns distance in kilometers
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calculate ETA in minutes
 */
const calculateETA = (distance, speedKmH) => {
  if (speedKmH === 0) return null;
  return Math.round((distance / speedKmH) * 60);
};

/**
 * Get route type based on current time (morning or evening)
 */
const getRouteType = () => {
  const hour = new Date().getHours();
  // Morning: 6 AM - 11 AM
  if (hour >= 6 && hour < 12) {
    return 'MORNING'; // Destination → School
  }
  // Evening: 3 PM - 7 PM
  if (hour >= 15 && hour < 19) {
    return 'EVENING'; // School → Destination
  }
  return 'OFFPEAK';
};

// ========================================
// WEBSOCKET EVENTS
// ========================================
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join-bus', (busNo, token) => {
    try {
      if (token) {
        jwt.verify(token, JWT_SECRET);
      }
      socket.join(`bus_${busNo}`);
      console.log(`🚌 Socket ${socket.id} joined bus_${busNo}`);
    } catch (err) {
      socket.emit('error', 'Invalid token');
    }
  });

  socket.on('leave-bus', (busNo) => {
    socket.leave(`bus_${busNo}`);
    console.log(`👋 Socket ${socket.id} left bus_${busNo}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ========================================
// API ENDPOINTS
// ========================================

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.executeQuery('SELECT GETDATE() as ServerTime');
    res.json({
      success: true,
      status: 'OK',
      serverTime: result.recordset[0].ServerTime,
      environment: NODE_ENV
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
 * POST /api/login
 * Authenticate driver or student
 */
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, busNo, email, role } = req.body;

    // Student login (simple)
    if (role === 'STUDENT' || req.body.isStudent) {
      const token = generateToken({
        Username: username || email || 'student',
        role: 'STUDENT'
      });
      return res.json({
        success: true,
        role: 'STUDENT',
        token,
        message: 'Student login successful'
      });
    }

    // Driver login
    const identifier = busNo || username;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'BusNo/Username and password required'
      });
    }

    const result = await db.executeQuery(
      `SELECT TOP 1 * FROM dbo.Buses WHERE BusNo = @id OR Username = @id`,
      { id: String(identifier) }
    );

    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const bus = result.recordset[0];

    // Check password (bcrypt or plain text)
    const storedPassword = bus.Password ? String(bus.Password).trim() : String(bus.BusNo).trim();
    let passwordMatch = false;

    if (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$')) {
      passwordMatch = await bcryptjs.compare(String(password), storedPassword);
    } else {
      passwordMatch = String(password) === storedPassword || String(password) === String(bus.BusNo);
    }

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const token = generateToken({ ...bus, role: 'DRIVER' });

    res.json({
      success: true,
      role: 'DRIVER',
      token,
      busDetails: {
        busNo: bus.BusNo,
        busName: bus.BusName,
        username: bus.Username,
        route: bus.DestinationName
      }
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      message: err.message
    });
  }
});

/**
 * POST /api/bus/update-location
 * Update bus location (Driver only)
 */
app.post('/api/bus/update-location', verifyToken, isDriver, async (req, res) => {
  try {
    const { lat, lng, speed } = req.body;
    const busNo = req.user.busNo || req.body.busNo;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude required'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const speedValue = parseFloat(speed || 0);

    // Update database
    await db.executeQuery(`
      UPDATE dbo.Buses
      SET CurrentLat = @lat,
          CurrentLng = @lng,
          Speed = @speed,
          LastUpdated = GETDATE()
      WHERE BusNo = @busNo
    `, {
      lat: latitude,
      lng: longitude,
      speed: speedValue,
      busNo: String(busNo)
    });

    // Insert into history
    try {
      await db.executeQuery(`
        INSERT INTO dbo.LocationHistory (BusNo, Latitude, Longitude, Speed, Timestamp)
        VALUES (@busNo, @lat, @lng, @speed, GETDATE())
      `, {
        busNo: String(busNo),
        lat: latitude,
        lng: longitude,
        speed: speedValue
      });
    } catch (histErr) {
      console.warn('⚠️  Location history insert failed (non-critical):', histErr.message);
    }

    // Broadcast to all connected clients
    const payload = {
      busNo,
      lat: latitude,
      lng: longitude,
      speed: speedValue,
      timestamp: new Date().toISOString(),
      routeType: getRouteType()
    };

    io.to(`bus_${busNo}`).emit('busLocationUpdated', payload);
    io.emit('fleetUpdate', payload);

    res.json({
      success: true,
      message: 'Location updated',
      timestamp: new Date()
    });
  } catch (err) {
    console.error('❌ Location update error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Location update failed',
      message: err.message
    });
  }
});

/**
 * GET /api/buses/live
 * Get all live bus locations
 */
app.get('/api/buses/live', async (req, res) => {
  try {
    const result = await db.executeQuery(`
      SELECT 
        BusNo,
        BusName,
        Username,
        CurrentLat,
        CurrentLng,
        Speed,
        LastUpdated,
        DestinationName,
        DestinationLat,
        DestinationLng,
        SchoolLat,
        SchoolLng
      FROM dbo.Buses
      WHERE CurrentLat IS NOT NULL AND CurrentLng IS NOT NULL
    `);

    const buses = result.recordset.map(bus => {
      const isOnline = bus.LastUpdated && 
        (new Date() - new Date(bus.LastUpdated)) < 30000;

      // Calculate ETA if destination available
      let eta = null;
      const routeType = getRouteType();
      let destination = null;

      if (routeType === 'MORNING' && bus.SchoolLat && bus.SchoolLng) {
        // Morning: Calculate ETA to school
        const distance = calculateDistance(
          bus.CurrentLat, bus.CurrentLng,
          bus.SchoolLat, bus.SchoolLng
        );
        eta = calculateETA(distance, bus.Speed || 0);
        destination = { lat: bus.SchoolLat, lng: bus.SchoolLng, name: 'School' };
      } else if (routeType === 'EVENING' && bus.DestinationLat && bus.DestinationLng) {
        // Evening: Calculate ETA to destination
        const distance = calculateDistance(
          bus.CurrentLat, bus.CurrentLng,
          bus.DestinationLat, bus.DestinationLng
        );
        eta = calculateETA(distance, bus.Speed || 0);
        destination = { lat: bus.DestinationLat, lng: bus.DestinationLng, name: bus.DestinationName };
      }

      return {
        busNo: bus.BusNo,
        busName: bus.BusName,
        route: bus.DestinationName,
        currentLocation: {
          lat: bus.CurrentLat,
          lng: bus.CurrentLng
        },
        speed: bus.Speed,
        lastUpdated: bus.LastUpdated,
        isOnline,
        eta,
        destination,
        routeType
      };
    });

    res.json({
      success: true,
      buses,
      count: buses.length,
      timestamp: new Date()
    });
  } catch (err) {
    console.error('❌ Get buses error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch buses',
      message: err.message
    });
  }
});

/**
 * GET /api/buses/:busNo
 * Get single bus details
 */
app.get('/api/buses/:busNo', async (req, res) => {
  try {
    const { busNo } = req.params;

    const result = await db.executeQuery(
      `SELECT TOP 1 * FROM dbo.Buses WHERE BusNo = @busNo`,
      { busNo: String(busNo) }
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bus not found'
      });
    }

    const bus = result.recordset[0];
    const isOnline = bus.LastUpdated && 
      (new Date() - new Date(bus.LastUpdated)) < 30000;

    res.json({
      success: true,
      bus: {
        busNo: bus.BusNo,
        busName: bus.BusName,
        route: bus.DestinationName,
        currentLocation: {
          lat: bus.CurrentLat,
          lng: bus.CurrentLng
        },
        speed: bus.Speed,
        lastUpdated: bus.LastUpdated,
        isOnline,
        school: { lat: bus.SchoolLat, lng: bus.SchoolLng },
        destination: { 
          lat: bus.DestinationLat, 
          lng: bus.DestinationLng,
          name: bus.DestinationName
        }
      }
    });
  } catch (err) {
    console.error('❌ Get bus error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bus',
      message: err.message
    });
  }
});

/**
 * GET /api/stats
 * Get system statistics
 */
app.get('/api/stats', async (req, res) => {
  try {
    const result = await db.executeQuery(`
      SELECT 
        COUNT(*) as TotalBuses,
        SUM(CASE WHEN LastUpdated > DATEADD(SECOND, -30, GETDATE()) THEN 1 ELSE 0 END) as OnlineBuses,
        AVG(Speed) as AvgSpeed,
        MAX(Speed) as MaxSpeed
      FROM dbo.Buses
      WHERE CurrentLat IS NOT NULL
    `);

    res.json({
      success: true,
      stats: result.recordset[0]
    });
  } catch (err) {
    console.error('❌ Stats error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats'
    });
  }
});

/**
 * POST /api/bus/checkin
 * Driver check-in (optional)
 */
app.post('/api/bus/checkin', verifyToken, isDriver, async (req, res) => {
  try {
    const busNo = req.user.busNo || req.body.busNo;

    await db.executeQuery(`
      UPDATE dbo.Buses
      SET LastUpdated = GETDATE()
      WHERE BusNo = @busNo
    `, { busNo: String(busNo) });

    io.emit('busCheckedIn', { busNo, timestamp: new Date() });

    res.json({
      success: true,
      message: 'Check-in successful'
    });
  } catch (err) {
    console.error('❌ Check-in error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Check-in failed'
    });
  }
});

/**
 * POST /api/bus/checkout
 * Driver check-out (optional)
 */
app.post('/api/bus/checkout', verifyToken, isDriver, async (req, res) => {
  try {
    const busNo = req.user.busNo || req.body.busNo;

    await db.executeQuery(`
      UPDATE dbo.Buses
      SET LastUpdated = DATEADD(HOUR, -24, GETDATE()),
          CurrentLat = NULL,
          CurrentLng = NULL,
          Speed = 0
      WHERE BusNo = @busNo
    `, { busNo: String(busNo) });

    io.to(`bus_${busNo}`).emit('busCheckedOut', { busNo, timestamp: new Date() });

    res.json({
      success: true,
      message: 'Check-out successful'
    });
  } catch (err) {
    console.error('❌ Check-out error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Check-out failed'
    });
  }
});

// ========================================
// SCHEDULED JOBS (CRON)
// ========================================

/**
 * Delete location history older than 24 hours
 * Runs every hour
 */
cron.schedule('0 * * * *', async () => {
  try {
    await db.executeQuery(`
      DELETE FROM dbo.LocationHistory
      WHERE Timestamp < DATEADD(HOUR, -24, GETDATE())
    `);
    console.log('🧹 [CRON] Location history cleanup completed');
  } catch (err) {
    console.error('❌ [CRON] Cleanup failed:', err.message);
  }
});

/**
 * Mark buses as offline if no update for 10 minutes
 * Runs every 5 minutes
 */
cron.schedule('*/5 * * * *', async () => {
  try {
    const result = await db.executeQuery(`
      UPDATE dbo.Buses
      SET Speed = 0
      WHERE LastUpdated < DATEADD(MINUTE, -10, GETDATE())
      AND Speed > 0
    `);
    console.log('📡 [CRON] Bus status check completed');
  } catch (err) {
    console.error('❌ [CRON] Bus status check failed:', err.message);
  }
});

// ========================================
// ERROR HANDLERS
// ========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : undefined
  });
});

// ========================================
// SERVER STARTUP
// ========================================

async function startServer() {
  try {
    console.log('\n📦 MZSJS BUZZ - Backend Server Initialization\n');

    // Initialize database connection
    await db.getPool();
    console.log('✅ Database connection established\n');

    // Start server
    server.listen(PORT, '0.0.0.0', () => {
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║          ✅ SERVER STARTED SUCCESSFULLY               ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║ 🚀 Port: ${PORT.toString().padEnd(49)} ║`);
      console.log(`║ 🌐 API: http://103.207.1.92:${PORT}/api              ║`);
      console.log(`║ 📡 WebSocket: http://103.207.1.92:${PORT}/socket.io/ ║`);
      console.log(`║ 🏛️  Environment: ${NODE_ENV.toUpperCase().padEnd(38)} ║`);
      console.log('╚════════════════════════════════════════════════════════╝\n');
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} is already in use!`);
        console.error('   Kill the process or use a different port.\n');
        process.exit(1);
      } else {
        console.error('\n❌ Server error:', err, '\n');
        process.exit(1);
      }
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.log('\n🛑 SIGTERM received - shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });

  } catch (err) {
    console.error('\n❌ Failed to start server:', err.message, '\n');
    process.exit(1);
  }
}

startServer();

export default app;
