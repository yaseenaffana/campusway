import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import helmet from 'helmet';
import http from 'http';
import https from 'https';
import morgan from 'morgan';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

import { closeConnection, executeQuery, initializeDatabase } from './db.js';
import { checkRole, signToken, verifyToken } from './middleware/auth.js';
import authRoutes from './routes/authRoutes.js';
import createBusRouter from './routes/busRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(repoRoot, '.env') });

const isProduction = process.env.NODE_ENV === 'production';
const app = express();
const resolveFromRoot = (value) => path.resolve(repoRoot, value);
const sslPfxPath = process.env.DEV_SSL_PFX ? resolveFromRoot(process.env.DEV_SSL_PFX) : '';
const hasTrustedDevCert = Boolean(sslPfxPath && fs.existsSync(sslPfxPath));
const useHttps = process.env.BACKEND_HTTPS === 'true';
const DEFAULT_SECONDARY_PASSWORD = String(
  process.env.SECONDARY_PASSWORD_DEFAULT || (isProduction ? '' : '234567')
).trim();
const STALE_LOCATION_SECONDS = 5;
const FALLBACK_SCHOOL_LAT = 10.105871781656774;
const FALLBACK_SCHOOL_LNG = 78.64251386094996;
const PORT = parseInt(process.env.PORT || '4010', 10);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || (isProduction ? '' : 'admin')).trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || (isProduction ? '' : 'admin123')).trim();
const ADMIN_EMP_ID = String(process.env.ADMIN_EMP_ID || 'ADMIN001').trim();
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
const ALLOWED_ORIGINS = String(process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const sslOptions = hasTrustedDevCert
  ? {
      pfx: fs.readFileSync(sslPfxPath),
      passphrase: process.env.DEV_SSL_PASSPHRASE || undefined,
    }
  : undefined;

const logAdminAudit = async ({
  username,
  empId,
  loginTime = null,
  logoutTime = null,
  updatedWhat = null
}) => {
  await executeQuery(
    `
    INSERT INTO dbo.AdminLogin (username, emp_id, login_time, logout_time, updated_what)
    VALUES (@username, @empId, @loginTime, @logoutTime, @updatedWhat)
    `,
    {
      username: String(username || '').trim(),
      empId: String(empId || '').trim(),
      loginTime,
      logoutTime,
      updatedWhat: updatedWhat == null ? null : String(updatedWhat)
    }
  );
};

const getPublicBaseUrl = () => {
  if (PUBLIC_BASE_URL) {
    return PUBLIC_BASE_URL;
  }

  const protocol = useHttps ? 'https' : 'http';
  return `${protocol}://103.207.1.92:${PORT}`;
};

const validateProductionConfig = () => {
  if (!isProduction) {
    return;
  }

  const required = [
    'JWT_SECRET',
    'DB_SERVER',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
  ];
  const missing = required.filter((key) => !String(process.env[key] || '').trim());

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }

  if (!PUBLIC_BASE_URL) {
    throw new Error('PUBLIC_BASE_URL is required in production so the APK and IIS proxy use the correct API host.');
  }
};

const corsOriginHandler = (origin, callback) => {
  if (!origin) {
    callback(null, true);
    return;
  }

  const normalizedOrigin = String(origin).replace(/\/$/, '');
  if (!ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(normalizedOrigin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origin ${normalizedOrigin} is not allowed by CORS`));
};

validateProductionConfig();

const server = useHttps && sslOptions ? https.createServer(sslOptions, app) : http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOriginHandler,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  path: '/socket.io/'
});

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(morgan(isProduction ? 'combined' : 'dev'));
app.use(cors({
  origin: corsOriginHandler,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.options('*', cors({
  origin: corsOriginHandler,
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

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
il    }
});

app.use('/api', authRoutes);
app.use('/api', createBusRouter(io));

app.post('/api/admin/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
      return res.status(500).json({ success: false, error: 'Admin login is not configured on the server' });
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, error: 'Invalid admin credentials' });
    }

    await logAdminAudit({
      username,
      empId: ADMIN_EMP_ID,
      loginTime: new Date()
    });

    const token = signToken({
      role: 'admin',
      username,
      empId: ADMIN_EMP_ID
    });

    return res.json({
      success: true,
      token,
      admin: {
        username,
        empId: ADMIN_EMP_ID
      }
    });
  } catch (error) {
    console.error('[admin][POST /api/admin/login] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to log in admin' });
  }
});

app.post('/api/admin/logout', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    await logAdminAudit({
      username: String(req.user?.username || '').trim(),
      empId: String(req.user?.empId || ADMIN_EMP_ID || '').trim(),
      logoutTime: new Date()
    });

    return res.json({ success: true, message: 'Admin logout logged successfully' });
  } catch (error) {
    console.error('[admin][POST /api/admin/logout] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to log admin logout' });
  }
});

app.get('/api/admin/buses', verifyToken, checkRole('admin'), async (_req, res) => {
  try {
    const result = await executeQuery(
      `
      SELECT
        b.BusNo,
        b.BusName,
        b.Username,
        COALESCE(NULLIF(LTRIM(RTRIM(b.Registration)), ''), b.BusNo) AS Registration,
        ISNULL(NULLIF(LTRIM(RTRIM(b.DestinationName)), ''), 'Spare') AS DestinationName,
        b.DestinationLat,
        b.DestinationLng,
        b.SchoolLat,
        b.SchoolLng,
        ISNULL(b.IsActive, 1) AS IsActive,
        CASE WHEN EXISTS (
          SELECT 1
          FROM dbo.LocationHistory lh
          WHERE lh.BusNo = b.BusNo
            AND lh.RecordedAt > DATEADD(SECOND, -5, GETDATE())
        ) THEN 1 ELSE 0 END AS IsOnline,
        b.LastUpdated
      FROM dbo.Buses b
      ORDER BY
        CASE WHEN ISNULL(b.IsActive, 1) = 0 THEN 0 ELSE 1 END,
        TRY_CAST(NULLIF(b.BusNo, '') AS INT),
        b.BusNo ASC
      `
    );

    const buses = (result.recordset || []).map((bus) => ({
      Id: bus.BusNo,
      BusNo: bus.BusNo,
      BusName: bus.BusName || '',
      Username: bus.Username || '',
      Registration: bus.Registration || '',
      Route: bus.DestinationName || 'Spare',
      DestinationName: bus.DestinationName || 'Spare',
      DestinationLat: bus.DestinationLat ?? null,
      DestinationLng: bus.DestinationLng ?? null,
      SchoolLat: bus.SchoolLat ?? null,
      SchoolLng: bus.SchoolLng ?? null,
      IsActive: Boolean(bus.IsActive),
      IsOnline: Boolean(bus.IsOnline),
      LastUpdated: bus.LastUpdated || null
    }));

    res.json({ success: true, buses, count: buses.length });
  } catch (error) {
    console.error('[admin][GET /api/admin/buses] Failed:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch admin buses' });
  }
});

app.put('/api/admin/bus/:busNo', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const busNo = String(req.params.busNo || '').trim();
    const {
      registration,
      route,
      destinationName,
      destinationLat,
      destinationLng,
      isActive
    } = req.body || {};

    if (!busNo) {
      return res.status(400).json({ success: false, error: 'busNo is required' });
    }

    const normalizedDestinationName = String(destinationName ?? route ?? '').trim();
    const parsedDestinationLat =
      destinationLat === '' || destinationLat == null ? null : Number(destinationLat);
    const parsedDestinationLng =
      destinationLng === '' || destinationLng == null ? null : Number(destinationLng);

    if (parsedDestinationLat != null && !Number.isFinite(parsedDestinationLat)) {
      return res.status(400).json({ success: false, error: 'destinationLat must be numeric' });
    }

    if (parsedDestinationLng != null && !Number.isFinite(parsedDestinationLng)) {
      return res.status(400).json({ success: false, error: 'destinationLng must be numeric' });
    }

    const updateResult = await executeQuery(
      `
      UPDATE dbo.Buses
      SET Registration = COALESCE(NULLIF(@registration, ''), Registration, BusNo),
          DestinationName = CASE
            WHEN @destinationName IS NULL THEN DestinationName
            WHEN LTRIM(RTRIM(@destinationName)) = '' AND @isActive = 0 THEN 'Spare'
            WHEN LTRIM(RTRIM(@destinationName)) = '' THEN DestinationName
            ELSE @destinationName
          END,
          DestinationLat = CASE WHEN @destinationLatProvided = 1 THEN @destinationLat ELSE DestinationLat END,
          DestinationLng = CASE WHEN @destinationLngProvided = 1 THEN @destinationLng ELSE DestinationLng END,
          IsActive = COALESCE(@isActive, IsActive)
      WHERE BusNo = @busNo;

      SELECT TOP 1
        BusNo,
        BusName,
        Username,
        Registration,
        DestinationName,
        DestinationLat,
        DestinationLng,
        SchoolLat,
        SchoolLng,
        ISNULL(IsActive, 1) AS IsActive,
        LastUpdated
      FROM dbo.Buses
      WHERE BusNo = @busNo;
      `,
      {
        busNo,
        registration: registration == null ? null : String(registration).trim(),
        destinationName: normalizedDestinationName || null,
        destinationLat: parsedDestinationLat,
        destinationLng: parsedDestinationLng,
        destinationLatProvided: destinationLat !== undefined ? 1 : 0,
        destinationLngProvided: destinationLng !== undefined ? 1 : 0,
        isActive: typeof isActive === 'boolean' ? (isActive ? 1 : 0) : null
      }
    );

    const updatedBus = updateResult.recordset?.[0];
    if (!updatedBus) {
      return res.status(404).json({ success: false, error: 'Bus not found' });
    }

    const payload = {
      busNo: updatedBus.BusNo,
      username: updatedBus.Username,
      registration: updatedBus.Registration,
      busName: updatedBus.BusName,
      destination: updatedBus.DestinationName,
      destinationLat: updatedBus.DestinationLat,
      destinationLng: updatedBus.DestinationLng,
      schoolLat: updatedBus.SchoolLat,
      schoolLng: updatedBus.SchoolLng,
      isActive: Boolean(updatedBus.IsActive),
      timestamp: new Date().toISOString()
    };

    io.to(`bus_${updatedBus.BusNo}`).emit('fleetUpdate', payload);
    io.emit('fleetUpdate', payload);

    await logAdminAudit({
      username: String(req.user?.username || '').trim(),
      empId: String(req.user?.empId || ADMIN_EMP_ID || '').trim(),
      updatedWhat: JSON.stringify({
        action: 'update_bus_assignment',
        busNo: updatedBus.BusNo,
        registration: updatedBus.Registration || '',
        destinationName: updatedBus.DestinationName || '',
        destinationLat: updatedBus.DestinationLat ?? null,
        destinationLng: updatedBus.DestinationLng ?? null,
        isActive: Boolean(updatedBus.IsActive)
      })
    });

    return res.json({
      success: true,
      message: 'Bus assignment updated successfully',
      bus: {
        BusNo: updatedBus.BusNo,
        BusName: updatedBus.BusName || '',
        Username: updatedBus.Username || '',
        Registration: updatedBus.Registration || '',
        Route: updatedBus.DestinationName || '',
        DestinationName: updatedBus.DestinationName || '',
        DestinationLat: updatedBus.DestinationLat ?? null,
        DestinationLng: updatedBus.DestinationLng ?? null,
        SchoolLat: updatedBus.SchoolLat ?? null,
        SchoolLng: updatedBus.SchoolLng ?? null,
        IsActive: Boolean(updatedBus.IsActive)
      }
    });
  } catch (error) {
    console.error('[admin][PUT /api/admin/bus/:busNo] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update bus assignment' });
  }
});

app.use((error, _req, res, next) => {
  if (!error) {
    next();
    return;
  }

  console.error('[server] Request pipeline error:', error.message);
  if (error.message.includes('not allowed by CORS')) {
    res.status(403).json({ success: false, error: 'CORS blocked for this origin' });
    return;
  }

  res.status(500).json({ success: false, error: 'Internal server error' });
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

  const registrationColumnResult = await executeQuery(`
    SELECT 1 AS hasColumn
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'Buses'
      AND COLUMN_NAME = 'Registration'
  `);

  if (registrationColumnResult.recordset.length === 0) {
    await executeQuery(`
      ALTER TABLE dbo.Buses
      ADD Registration NVARCHAR(50) NULL
    `);
    console.log('Added dbo.Buses.Registration column');
  }

  await executeQuery(`
    UPDATE dbo.Buses
    SET Registration = COALESCE(NULLIF(LTRIM(RTRIM(Registration)), ''), BusNo)
    WHERE Registration IS NULL OR LTRIM(RTRIM(Registration)) = ''
  `).catch(() => null);

  if (DEFAULT_SECONDARY_PASSWORD) {
    const secondaryPasswordHash = await bcrypt.hash(DEFAULT_SECONDARY_PASSWORD, 10);
    await executeQuery(
      `
      UPDATE dbo.Buses
      SET SecondPassword = @secondaryPasswordHash
      WHERE SecondPassword IS NULL OR LTRIM(RTRIM(SecondPassword)) = ''
      `,
      { secondaryPasswordHash }
    );
  }

  const locationHistoryExistsResult = await executeQuery(`
    SELECT 1 AS hasTable
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'LocationHistory'
  `);

  if (locationHistoryExistsResult.recordset.length === 0) {
    await executeQuery(`
      CREATE TABLE dbo.LocationHistory (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Username NVARCHAR(50) NULL,
        BusNo NVARCHAR(20) NULL,
        Latitude DECIMAL(10, 8) NOT NULL,
        Longitude DECIMAL(11, 8) NOT NULL,
        Speed DECIMAL(6, 2) NULL CONSTRAINT DF_LocationHistory_Speed_Server DEFAULT 0,
        RecordedAt DATETIME NOT NULL CONSTRAINT DF_LocationHistory_RecordedAt_Server DEFAULT GETDATE()
      )
    `);
    console.log('Created dbo.LocationHistory table');
  }

  const adminLoginExistsResult = await executeQuery(`
    SELECT 1 AS hasTable
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'AdminLogin'
  `);

  if (adminLoginExistsResult.recordset.length === 0) {
    await executeQuery(`
      CREATE TABLE dbo.AdminLogin (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        username NVARCHAR(100) NOT NULL,
        emp_id NVARCHAR(50) NOT NULL,
        login_time DATETIME NULL,
        logout_time DATETIME NULL,
        updated_what NVARCHAR(MAX) NULL,
        created_at DATETIME NOT NULL CONSTRAINT DF_AdminLogin_created_at DEFAULT GETDATE()
      )
    `);
    console.log('Created dbo.AdminLogin table');
  }

  const adminLoginColumns = [
    {
      name: 'username',
      definition: `ALTER TABLE dbo.AdminLogin ADD username NVARCHAR(100) NULL`
    },
    {
      name: 'emp_id',
      definition: `ALTER TABLE dbo.AdminLogin ADD emp_id NVARCHAR(50) NULL`
    },
    {
      name: 'login_time',
      definition: `ALTER TABLE dbo.AdminLogin ADD login_time DATETIME NULL`
    },
    {
      name: 'logout_time',
      definition: `ALTER TABLE dbo.AdminLogin ADD logout_time DATETIME NULL`
    },
    {
      name: 'updated_what',
      definition: `ALTER TABLE dbo.AdminLogin ADD updated_what NVARCHAR(MAX) NULL`
    },
    {
      name: 'created_at',
      definition: `
        ALTER TABLE dbo.AdminLogin
        ADD created_at DATETIME NOT NULL
        CONSTRAINT DF_AdminLogin_created_at_late DEFAULT GETDATE()
      `
    }
  ];

  for (const column of adminLoginColumns) {
    const columnResult = await executeQuery(`
      SELECT 1 AS hasColumn
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'AdminLogin'
        AND COLUMN_NAME = '${column.name}'
    `);

    if (columnResult.recordset.length === 0) {
      await executeQuery(column.definition).catch(() => null);
      console.log(`Ensured dbo.AdminLogin.${column.name} column`);
    }
  }

  const locationHistoryColumns = [
    {
      name: 'Username',
      definition: 'ALTER TABLE dbo.LocationHistory ADD Username NVARCHAR(50) NULL'
    },
    {
      name: 'BusNo',
      definition: 'ALTER TABLE dbo.LocationHistory ADD BusNo NVARCHAR(20) NULL'
    },
    {
      name: 'latitude',
      definition: 'ALTER TABLE dbo.LocationHistory ADD latitude DECIMAL(10, 8) NULL'
    },
    {
      name: 'longitude',
      definition: 'ALTER TABLE dbo.LocationHistory ADD longitude DECIMAL(11, 8) NULL'
    },
    {
      name: 'speed',
      definition: 'ALTER TABLE dbo.LocationHistory ADD speed DECIMAL(6, 2) NULL'
    },
    {
      name: 'RecordedAt',
      definition: `
        ALTER TABLE dbo.LocationHistory
        ADD RecordedAt DATETIME NOT NULL
        CONSTRAINT DF_LocationHistory_RecordedAt_Server_Late DEFAULT GETDATE()
      `
    }
  ];

  for (const column of locationHistoryColumns) {
    const columnResult = await executeQuery(`
      SELECT 1 AS hasColumn
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'LocationHistory'
        AND UPPER(COLUMN_NAME) = '${column.name.toUpperCase()}'
    `);

    if (columnResult.recordset.length === 0) {
      await executeQuery(column.definition).catch(() => null);
      console.log(`Ensured dbo.LocationHistory.${column.name} column`);
    }
  }

  // Skip Timestamp migration - column doesn't exist in new schema
  // LocationHistory uses lowercase columns: latitude, longitude, speed, RecordedAt

  await executeQuery(`
    BEGIN TRY
      UPDATE lh
      SET lh.BusNo = b.BusNo
      FROM dbo.LocationHistory lh
      INNER JOIN dbo.Buses b ON b.Username = lh.Username
      WHERE (lh.BusNo IS NULL OR LTRIM(RTRIM(lh.BusNo)) = '')
        AND lh.Username IS NOT NULL
    END TRY
    BEGIN CATCH
    END CATCH
  `).catch(() => null);

  await executeQuery(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'IX_LocationHistory_BusNo_RecordedAt'
        AND object_id = OBJECT_ID('dbo.LocationHistory')
    )
    CREATE INDEX IX_LocationHistory_BusNo_RecordedAt
      ON dbo.LocationHistory(BusNo, RecordedAt DESC)
  `).catch(() => null);

  // Ensure FK constraint for data integrity
  const fkCheck = await executeQuery(`
    SELECT 1 AS hasFK
    FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_NAME LIKE '%LocationHistory%Username%'
  `).catch(() => ({ recordset: [] }));

  if (fkCheck.recordset.length === 0) {
    await executeQuery(`
      BEGIN TRY
        ALTER TABLE dbo.LocationHistory
        ADD CONSTRAINT FK_LocationHistory_Username
        FOREIGN KEY (Username) REFERENCES dbo.Buses(Username)
      END TRY
      BEGIN CATCH
      END CATCH
    `).catch(() => null);
    console.log('Ensured FK constraint on LocationHistory.Username');
  }
};

const cleanOldLocationHistory = async () => {
  try {
    const tableResult = await executeQuery(`
      SELECT 1 AS hasTable
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'LocationHistory'
    `);

    if (tableResult.recordset.length === 0) {
      return 0;
    }

    const deleteResult = await executeQuery(`
      DELETE FROM dbo.LocationHistory
      WHERE RecordedAt < DATEADD(HOUR, -24, GETDATE())
    `).catch(() => ({ rowsAffected: [0] }));

    const deletedCount = deleteResult.rowsAffected?.[0] || 0;
    if (deletedCount === 0) {
      return 0;
    }

    return deletedCount;
  } catch (error) {
    console.warn('[cleanOldLocationHistory] Cleanup skipped:', error.message);
    return 0;
  }
};

const cleanOldAdminLogin = async () => {
  try {
    const tableResult = await executeQuery(`
      SELECT 1 AS hasTable
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'AdminLogin'
    `);

    if (tableResult.recordset.length === 0) {
      return 0;
    }

    const deleteResult = await executeQuery(`
      DELETE FROM dbo.AdminLogin
      WHERE COALESCE(created_at, logout_time, login_time) < DATEADD(HOUR, -24, GETDATE())
    `).catch(() => ({ rowsAffected: [0] }));

    return deleteResult.rowsAffected?.[0] || 0;
  } catch (error) {
    console.warn('[cleanOldAdminLogin] Cleanup skipped:', error.message);
    return 0;
  }
};

const resetStaleBusLocations = async () => {
  try {
    const staleResult = await executeQuery(
      `
      UPDATE dbo.Buses
      SET CurrentLat = COALESCE(SchoolLat, @fallbackSchoolLat),
          CurrentLng = COALESCE(SchoolLng, @fallbackSchoolLng),
          Speed = 0
      WHERE LastUpdated < DATEADD(SECOND, -@staleSeconds, GETDATE())
        AND (
          CurrentLat IS NULL OR CurrentLng IS NULL
          OR ABS(ISNULL(CurrentLat, 0) - COALESCE(SchoolLat, @fallbackSchoolLat)) > 0.000001
          OR ABS(ISNULL(CurrentLng, 0) - COALESCE(SchoolLng, @fallbackSchoolLng)) > 0.000001
          OR ISNULL(Speed, 0) <> 0
        )
      `,
      {
        staleSeconds: STALE_LOCATION_SECONDS,
        fallbackSchoolLat: FALLBACK_SCHOOL_LAT,
        fallbackSchoolLng: FALLBACK_SCHOOL_LNG
      }
    );

    return staleResult.rowsAffected?.[0] || 0;
  } catch (error) {
    console.warn('[resetStaleBusLocations] Failed:', error.message);
    return 0;
  }
};

cron.schedule('0 * * * *', async () => {
  try {
    const deletedCount = await cleanOldLocationHistory();
    const deletedAdminCount = await cleanOldAdminLogin();
    console.log(`LocationHistory cleanup completed. Deleted ${deletedCount} old rows.`);
    console.log(`AdminLogin cleanup completed. Deleted ${deletedAdminCount} old rows.`);
  } catch (error) {
    console.error('Cleanup failed:', error.message);
  }
});

const staleLocationInterval = setInterval(async () => {
  const resetCount = await resetStaleBusLocations();
  if (resetCount > 0) {
    console.log(`Reset ${resetCount} stale bus location(s) to school coordinates after ${STALE_LOCATION_SECONDS}s inactivity.`);
  }
}, 5000);

initializeDatabase()
  .then(async () => {
    await ensureDatabaseCompatibility();
    const deletedOnStartup = await cleanOldLocationHistory();
    const deletedAdminOnStartup = await cleanOldAdminLogin();
    console.log(`LocationHistory startup cleanup removed ${deletedOnStartup} old rows.`);
    console.log(`AdminLogin startup cleanup removed ${deletedAdminOnStartup} old rows.`);
    const resetOnStartup = await resetStaleBusLocations();
    console.log(`Stale bus startup reset moved ${resetOnStartup} bus location(s) to school coordinates.`);

    server.listen(PORT, HOST, () => {
      console.log(`[server] Backend listening on ${HOST}:${PORT}`);
      console.log(`[server] Public API base URL: ${getPublicBaseUrl()}/api`);
      console.log(`[server] Socket.IO endpoint: ${getPublicBaseUrl()}/socket.io/`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  });

const shutdown = (signal) => {
  console.log(`[server] ${signal} received, shutting down gracefully...`);
  clearInterval(staleLocationInterval);
  server.close(async (error) => {
    if (error) {
      console.error('[server] Error during shutdown:', error.message);
      process.exit(1);
      return;
    }

    await closeConnection().catch(() => null);
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
