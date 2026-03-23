import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getConnection } from './config/database';
import busRoutes from './routes/buses';
import studentRoutes from './routes/students';
import tripRoutes from './routes/trips';
import trackingRoutes from './routes/tracking.js';
import adminRoutes from './routes/admin.js';

dotenv.config();
const app = express();

app.use(cors({
  origin: [
    'https://campusway-mzcet.web.app',
    'http://localhost:5173',
    'http://localhost:3001',
    'http://103.207.1.92:5173',
    'http://103.207.1.92:3001',
    'http://103.207.1.92:3000',
    'http://103.207.1.92'
  ]
}));
app.use(express.json());

// Initialize database connection and make it available to routes
let dbPool = null;
getConnection().then(pool => {
  dbPool = pool;
  app.set('dbPool', pool);
  console.log('✅ Database pool initialized for tracking routes');
}).catch(err => {
  console.error('❌ Failed to initialize database pool:', err);
});

app.use('/api/buses', busRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/bus', trackingRoutes);
app.use('/api/admin', adminRoutes);

app.post('/api/checkin', async (req, res) => {
  const { driverName, busNumber, location } = req.body;
  try {
    const pool = await getConnection();
    // Logging to LocationHistory if trip exists, or just a general log
    // For now, let's just log it to the console as a success confirmation
    // In a real app, we'd find the active tripId and insert into CampusWay_LocationHistory
    console.log(`📍 Check-in received for ${driverName} (Bus ${busNumber}):`, location);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', async (req, res) => {
  try {
    await getConnection();
    res.json({ 
      status: 'ok',
      database: 'connected',
      server: '103.207.1.87'
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'error',
      database: 'disconnected'
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ CampusWay API: port ${PORT}`);
  getConnection(); // test DB connection
});
