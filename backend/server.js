import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http from 'http';
import https from 'https';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

import { executeQuery, initializeDatabase } from './db.js';
import authRoutes from './routes/authRoutes.js';
import createBusRouter from './routes/busRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(repoRoot, '.env'), override: true });

const app = express();
const resolveFromRoot = (value) => path.resolve(repoRoot, value);
const sslPfxPath = process.env.DEV_SSL_PFX ? resolveFromRoot(process.env.DEV_SSL_PFX) : '';
const hasTrustedDevCert = Boolean(sslPfxPath && fs.existsSync(sslPfxPath));
const useHttps = process.env.BACKEND_HTTPS === 'true' || hasTrustedDevCert;
const DEFAULT_SECONDARY_PASSWORD = process.env.SECONDARY_PASSWORD_DEFAULT || '234567';
const sslOptions = hasTrustedDevCert
  ? {
      pfx: fs.readFileSync(sslPfxPath),
      passphrase: process.env.DEV_SSL_PASSPHRASE || undefined,
    }
  : undefined;

const server = useHttps && sslOptions ? https.createServer(sslOptions, app) : http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  path: '/socket.io/'
});

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', async (_req, res) => {
  try {
    const dbTime = await executeQuery('SELECT GETDATE() as serverTime');
    res.json({
      success: true,
      status: 'healthy',
      serverTime: dbTime.recordset[0].serverTime,
      socketClients: io.engine.clientsCount
    });
  } catch (error) {
    res.status(503).json({ success: false, status: 'unhealthy', error: error.message });
  }
});

app.use('/api', authRoutes);
app.use('/api', createBusRouter(io));

app.use('/api/admin/buses', (_req, res) => {
  res.status(410).json({ success: false, error: 'Deprecated endpoint removed' });
});

io.on('connection', (socket) => {
  socket.on('join-bus', (busNo) => socket.join(`bus_${busNo}`));
  socket.on('leave-bus', (busNo) => socket.leave(`bus_${busNo}`));
});

const ensureDatabaseCompatibility = async () => {
  const secondPasswordColumnResult = await executeQuery(`
    SELECT 1 AS hasColumn
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'Buses'
      AND COLUMN_NAME = 'SecondPassword'
  `);

  if (secondPasswordColumnResult.recordset.length === 0) {
    await executeQuery(`
      ALTER TABLE dbo.Buses
      ADD SecondPassword NVARCHAR(255) NULL
    `);
    console.log('Added dbo.Buses.SecondPassword column');
  }

  const secondaryPasswordHash = await bcrypt.hash(DEFAULT_SECONDARY_PASSWORD, 10);
  await executeQuery(
    `
    UPDATE dbo.Buses
    SET SecondPassword = @secondaryPasswordHash
    WHERE SecondPassword IS NULL OR LTRIM(RTRIM(SecondPassword)) = ''
    `,
    { secondaryPasswordHash }
  );
};

const cleanOldLocationHistory = async () => {
  const recordedAtResult = await executeQuery(`
    SELECT 1 AS hasColumn
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'LocationHistory'
      AND COLUMN_NAME = 'RecordedAt'
  `);

  const timestampColumn = recordedAtResult.recordset.length > 0 ? 'RecordedAt' : 'Timestamp';
  const deleteResult = await executeQuery(`
    DELETE FROM dbo.LocationHistory
    WHERE ${timestampColumn} < DATEADD(HOUR, -24, GETDATE())
  `);

  return deleteResult.rowsAffected?.[0] || 0;
};

cron.schedule('0 * * * *', async () => {
  try {
    const deletedCount = await cleanOldLocationHistory();
    console.log(`LocationHistory cleanup completed. Deleted ${deletedCount} old rows.`);
  } catch (error) {
    console.error('Cleanup failed:', error.message);
  }
});

const PORT = parseInt(process.env.PORT || '4010', 10);
const HOST = process.env.HOST || '0.0.0.0';
const displayHost = HOST === '0.0.0.0' ? '103.207.1.92' : HOST;
const protocol = useHttps ? 'https' : 'http';

initializeDatabase()
  .then(async () => {
    await ensureDatabaseCompatibility();

    server.listen(PORT, HOST, () => {
      console.log(`Backend running on ${protocol}://${displayHost}:${PORT}`);
      console.log(`Socket.IO running on ${protocol}://${displayHost}:${PORT}/socket.io/`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  });
