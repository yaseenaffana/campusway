const express = require('express');
const mssql = require('mssql');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'admin').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'admin123').trim();
const ADMIN_EMP_ID = String(process.env.ADMIN_EMP_ID || 'ADMIN001').trim();

// Middleware - MUST be before any routes
app.use(cors());
app.use(express.json());

// MSSQL Configuration
const dbConfig = {
    server: process.env.DB_HOST || '103.207.1.87',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'master',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableKeepAlive: true,
        requestTimeout: 15000
    },
    pool: {
        max: 10,
        min: 1,
        idleTimeoutMillis: 30000
    }
};

let pool;

async function getPool() {
    if (!pool) {
        pool = await new mssql.ConnectionPool(dbConfig).connect();
    }
    return pool;
}

/**
 * Initialize Tables and Seed Data
 */
async function initDB() {
    try {
        const db = await getPool();
        const transaction = new mssql.Transaction(db);
        await transaction.begin();
        const request = new mssql.Request(transaction);

        // CW_Drivers
        await request.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CW_Drivers')
            BEGIN
                CREATE TABLE CW_Drivers (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    BusNo INT UNIQUE NOT NULL,
                    Registration NVARCHAR(20) NOT NULL,
                    Route NVARCHAR(100) NOT NULL,
                    IsActive BIT DEFAULT 1,
                    CreatedAt DATETIME DEFAULT GETDATE()
                );
            END
        `);

        // CW_BusLocation
        await request.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CW_BusLocation')
            BEGIN
                CREATE TABLE CW_BusLocation (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    BusNo INT UNIQUE NOT NULL,
                    Latitude FLOAT NOT NULL,
                    Longitude FLOAT NOT NULL,
                    Speed FLOAT DEFAULT 0,
                    IsOnline BIT DEFAULT 1,
                    UpdatedAt DATETIME DEFAULT GETDATE(),
                    CONSTRAINT FK_BusLocation_Drivers FOREIGN KEY (BusNo) REFERENCES CW_Drivers(BusNo) ON DELETE CASCADE
                );
            END
        `);

        // CW_LocationHistory
        await request.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CW_LocationHistory')
            BEGIN
                CREATE TABLE CW_LocationHistory (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    BusNo INT NOT NULL,
                    Latitude FLOAT NOT NULL,
                    Longitude FLOAT NOT NULL,
                    Speed FLOAT NOT NULL,
                    RecordedAt DATETIME DEFAULT GETDATE()
                );
            END
        `);

        const driverCheck = await request.query("SELECT COUNT(*) as count FROM CW_Drivers");
        if (driverCheck.recordset[0].count === 0) {
            console.log("Seeding CW_Drivers table...");
            await request.query(`
                INSERT INTO CW_Drivers (BusNo, Registration, Route, IsActive) VALUES
                (2, 'TN63AJ8602', 'Neivasal', 1),
                (3, 'TN63AK1260', 'SS.Kottai', 1),
                (4, 'TN63AK1264', 'Illupakudi', 1),
                (6, 'TN63AJ8845', 'Senjai', 1),
                (7, 'TN63AL8220', 'Thirupathur Pudhu Theru', 1),
                (8, 'TN63AJ8903', 'Singampunari', 1),
                (9, 'TN63AL8156', 'Spare', 0),
                (11, 'TN63AL9236', 'Spare', 0),
                (12, 'TN63AJ8611', 'Spare', 0),
                (13, 'TN63AJ8570', 'Spare', 0),
                (14, 'TN63BA0058', 'Velangudi', 1),
                (15, 'TN63BA0204', 'Karaikudi', 1),
                (16, 'TN63BA3179', 'Eriyur', 1),
                (17, 'TN63BC3589', 'Akilmanai Thirupathur', 1),
                (18, 'TN63BC3805', 'Sembanur', 1),
                (19, 'TN63BD8042', 'Kotaiyur', 1),
                (20, 'TN63BE0936', 'Keelasevalpatti', 1),
                (34, 'TN55AC5864', 'Kallutimedu', 1),
                (50, 'TN55BC5526', 'Elanthaimangalam', 1)
            `);
        }

        // Seed bus locations with test data
        const locationCheck = await request.query("SELECT COUNT(*) as count FROM CW_BusLocation");
        if (locationCheck.recordset[0].count === 0) {
            console.log("Seeding CW_BusLocation table with test data...");
            await request.query(`
                INSERT INTO CW_BusLocation (BusNo, Latitude, Longitude, Speed, IsOnline, UpdatedAt) VALUES
                (2, 13.1939, 80.1047, 45.5, 1, GETDATE()),
                (3, 13.1850, 80.1120, 38.2, 1, GETDATE()),
                (4, 13.1780, 80.0950, 52.1, 1, GETDATE()),
                (6, 13.2000, 80.1200, 35.0, 1, GETDATE()),
                (7, 13.1650, 80.0850, 48.3, 1, GETDATE()),
                (8, 13.1920, 80.1080, 41.7, 1, GETDATE()),
                (14, 13.1700, 80.1300, 39.5, 1, GETDATE()),
                (15, 13.2100, 80.0900, 44.2, 1, GETDATE()),
                (16, 13.1800, 80.1150, 37.8, 1, GETDATE()),
                (17, 13.1950, 80.0950, 50.0, 1, GETDATE()),
                (18, 13.1600, 80.1250, 42.1, 1, GETDATE()),
                (19, 13.2050, 80.1050, 45.9, 1, GETDATE()),
                (20, 13.1750, 80.1180, 36.4, 1, GETDATE()),
                (34, 13.1850, 80.0980, 46.8, 1, GETDATE()),
                (50, 13.2000, 80.1280, 40.3, 1, GETDATE())
            `);
        }

        await transaction.commit();
        console.log("✅ Database initialized and seeded.");
    } catch (err) {
        console.error("❌ Database initialization failed:", err);
    }
}

// --- API ENDPOINTS (EXACT ORDER) ---

// 1. Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

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

        return res.json({
            success: true,
            token: `legacy-admin-${Date.now()}`,
            admin: {
                username,
                empId: ADMIN_EMP_ID
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/logout', async (_req, res) => {
    res.json({ success: true });
});

// 2. Driver login
app.post('/api/driver/login', async (req, res) => {
    const { busNo, password } = req.body;
    try {
        const db = await getPool();
        const result = await db.request()
            .input('busNo', mssql.Int, busNo)
            .input('reg', mssql.NVarChar, password.toUpperCase().trim())
            .query(`
                SELECT BusNo, Registration, Route 
                FROM CW_Drivers 
                WHERE BusNo = @busNo 
                  AND Registration = @reg 
                  AND IsActive = 1
            `);

        if (result.recordset.length > 0) {
            res.json({ success: true, bus: result.recordset[0] });
        } else {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// 3. Update bus location
app.post('/api/bus/location', async (req, res) => {
    const { busNo, lat, lng, speed } = req.body;
    try {
        const db = await getPool();
        const transaction = new mssql.Transaction(db);
        await transaction.begin();
        const request = new mssql.Request(transaction);

        await request
            .input('busNo', mssql.Int, busNo)
            .input('lat', mssql.Float, lat)
            .input('lng', mssql.Float, lng)
            .input('speed', mssql.Float, speed)
            .query(`
                IF EXISTS (SELECT 1 FROM CW_BusLocation WHERE BusNo = @busNo)
                BEGIN
                    UPDATE CW_BusLocation 
                    SET Latitude = @lat, Longitude = @lng, Speed = @speed, UpdatedAt = GETDATE(), IsOnline = 1
                    WHERE BusNo = @busNo
                END
                ELSE
                BEGIN
                    INSERT INTO CW_BusLocation (BusNo, Latitude, Longitude, Speed, IsOnline)
                    VALUES (@busNo, @lat, @lng, @speed, 1)
                END
            `);

        await request.query(`
            INSERT INTO CW_LocationHistory (BusNo, Latitude, Longitude, Speed)
            VALUES (@busNo, @lat, @lng, @speed)
        `);

        await transaction.commit();
        res.json({ success: true });
    } catch (err) {
        console.error('Location update error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Driver disconnect
app.post('/api/bus/disconnect', async (req, res) => {
    const { busNo } = req.body;
    try {
        const db = await getPool();
        await db.request()
            .input('busNo', mssql.Int, busNo)
            .query("DELETE FROM CW_BusLocation WHERE BusNo = @busNo");
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. All live buses with FALLBACK MOCK DATA
app.get('/api/buses/live', async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.request().query(`
            SELECT L.*, D.Registration, D.Route 
            FROM CW_BusLocation L
            INNER JOIN CW_Drivers D ON L.BusNo = D.BusNo
            WHERE D.IsActive = 1
        `);
        res.json({ buses: result.recordset });
    } catch (err) {
        console.warn('⚠️ Database query failed, returning mock data:', err.message);
        // Return mock data for demonstration
        const mockBuses = [
            { BusNo: 2, Latitude: 13.1939, Longitude: 80.1047, Speed: 45.5, UpdatedAt: new Date(), Registration: 'TN63AJ8602', Route: 'Neivasal', IsOnline: 1 },
            { BusNo: 3, Latitude: 13.1850, Longitude: 80.1120, Speed: 38.2, UpdatedAt: new Date(), Registration: 'TN63AK1260', Route: 'SS.Kottai', IsOnline: 1 },
            { BusNo: 4, Latitude: 13.1780, Longitude: 80.0950, Speed: 52.1, UpdatedAt: new Date(), Registration: 'TN63AK1264', Route: 'Illupakudi', IsOnline: 1 },
            { BusNo: 6, Latitude: 13.2000, Longitude: 80.1200, Speed: 35.0, UpdatedAt: new Date(), Registration: 'TN63AJ8845', Route: 'Senjai', IsOnline: 1 },
            { BusNo: 7, Latitude: 13.1650, Longitude: 80.0850, Speed: 48.3, UpdatedAt: new Date(), Registration: 'TN63AL8220', Route: 'Thirupathur', IsOnline: 1 },
            { BusNo: 8, Latitude: 13.1920, Longitude: 80.1080, Speed: 41.7, UpdatedAt: new Date(), Registration: 'TN63AJ8903', Route: 'Singampunari', IsOnline: 1 },
            { BusNo: 14, Latitude: 13.1700, Longitude: 80.1300, Speed: 39.5, UpdatedAt: new Date(), Registration: 'TN63BA0058', Route: 'Velangudi', IsOnline: 1 },
            { BusNo: 15, Latitude: 13.2100, Longitude: 80.0900, Speed: 44.2, UpdatedAt: new Date(), Registration: 'TN63BA0204', Route: 'Karaikudi', IsOnline: 1 },
            { BusNo: 16, Latitude: 13.1800, Longitude: 80.1150, Speed: 37.8, UpdatedAt: new Date(), Registration: 'TN63BA3179', Route: 'Eriyur', IsOnline: 1 },
            { BusNo: 17, Latitude: 13.1950, Longitude: 80.0950, Speed: 50.0, UpdatedAt: new Date(), Registration: 'TN63BC3589', Route: 'Akilmanai', IsOnline: 1 },
            { BusNo: 18, Latitude: 13.1600, Longitude: 80.1250, Speed: 42.1, UpdatedAt: new Date(), Registration: 'TN63BC3805', Route: 'Sembanur', IsOnline: 1 },
            { BusNo: 19, Latitude: 13.2050, Longitude: 80.1050, Speed: 45.9, UpdatedAt: new Date(), Registration: 'TN63BD8042', Route: 'Kotaiyur', IsOnline: 1 },
            { BusNo: 20, Latitude: 13.1750, Longitude: 80.1180, Speed: 36.4, UpdatedAt: new Date(), Registration: 'TN63BE0936', Route: 'Keelasevalpatti', IsOnline: 1 },
            { BusNo: 34, Latitude: 13.1850, Longitude: 80.0980, Speed: 46.8, UpdatedAt: new Date(), Registration: 'TN55AC5864', Route: 'Kallutimedu', IsOnline: 1 },
            { BusNo: 50, Latitude: 13.2000, Longitude: 80.1280, Speed: 40.3, UpdatedAt: new Date(), Registration: 'TN55BC5526', Route: 'Elanthaimangalam', IsOnline: 1 }
        ];
        res.json({ buses: mockBuses });
    }
});

// 6. Single bus location
app.get('/api/bus/:busNo/location', async (req, res) => {
    const { busNo } = req.params;
    try {
        const db = await getPool();
        const result = await db.request()
            .input('busNo', mssql.Int, busNo)
            .query(`
                SELECT L.*, D.Registration, D.Route 
                FROM CW_BusLocation L
                INNER JOIN CW_Drivers D ON L.BusNo = D.BusNo
                WHERE L.BusNo = @busNo
            `);

        if (result.recordset.length > 0) {
            res.json({ online: true, bus: result.recordset[0] });
        } else {
            res.json({ online: false });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. Get All Buses (Admin) with FALLBACK MOCK DATA
app.get('/api/admin/buses', async (req, res) => {
    try {
        const db = await getPool();
        const result = await db.request().query(`
            SELECT 
                d.Id, d.BusNo, d.Registration, d.Route, d.IsActive,
                CASE WHEN b.BusNo IS NOT NULL THEN 1 ELSE 0 END AS IsOnline
            FROM CW_Drivers d
            LEFT JOIN CW_BusLocation b ON b.BusNo = d.BusNo
            ORDER BY d.BusNo
        `);
        res.json({ buses: result.recordset });
    } catch (err) {
        console.warn('⚠️ Database query failed, returning mock admin buses:', err.message);
        // Return mock data
        const mockAdminBuses = [
            { Id: 1, BusNo: 2, Registration: 'TN63AJ8602', Route: 'Neivasal', IsActive: 1, IsOnline: 1 },
            { Id: 2, BusNo: 3, Registration: 'TN63AK1260', Route: 'SS.Kottai', IsActive: 1, IsOnline: 1 },
            { Id: 3, BusNo: 4, Registration: 'TN63AK1264', Route: 'Illupakudi', IsActive: 1, IsOnline: 1 },
            { Id: 4, BusNo: 6, Registration: 'TN63AJ8845', Route: 'Senjai', IsActive: 1, IsOnline: 1 },
            { Id: 5, BusNo: 7, Registration: 'TN63AL8220', Route: 'Thirupathur', IsActive: 1, IsOnline: 1 },
            { Id: 6, BusNo: 8, Registration: 'TN63AJ8903', Route: 'Singampunari', IsActive: 1, IsOnline: 1 },
            { Id: 7, BusNo: 14, Registration: 'TN63BA0058', Route: 'Velangudi', IsActive: 1, IsOnline: 1 },
            { Id: 8, BusNo: 15, Registration: 'TN63BA0204', Route: 'Karaikudi', IsActive: 1, IsOnline: 1 },
            { Id: 9, BusNo: 16, Registration: 'TN63BA3179', Route: 'Eriyur', IsActive: 1, IsOnline: 1 },
            { Id: 10, BusNo: 17, Registration: 'TN63BC3589', Route: 'Akilmanai', IsActive: 1, IsOnline: 1 },
            { Id: 11, BusNo: 18, Registration: 'TN63BC3805', Route: 'Sembanur', IsActive: 1, IsOnline: 1 },
            { Id: 12, BusNo: 19, Registration: 'TN63BD8042', Route: 'Kotaiyur', IsActive: 1, IsOnline: 1 },
            { Id: 13, BusNo: 20, Registration: 'TN63BE0936', Route: 'Keelasevalpatti', IsActive: 1, IsOnline: 1 },
            { Id: 14, BusNo: 34, Registration: 'TN55AC5864', Route: 'Kallutimedu', IsActive: 1, IsOnline: 1 },
            { Id: 15, BusNo: 50, Registration: 'TN55BC5526', Route: 'Elanthaimangalam', IsActive: 1, IsOnline: 1 }
        ];
        res.json({ buses: mockAdminBuses });
    }
});

// 8. Update bus (admin)
app.put('/api/admin/bus/:busNo', async (req, res) => {
    const { busNo } = req.params;
    const { registration, route, isActive } = req.body;
    try {
        const db = await getPool();
        const request = db.request();
        let query = "UPDATE CW_Drivers SET ";
        let updates = [];

        if (registration !== undefined) {
            request.input('reg', mssql.NVarChar, registration);
            updates.push("Registration = @reg");
        }
        if (route !== undefined) {
            request.input('route', mssql.NVarChar, route);
            updates.push("Route = @route");
        }
        if (isActive !== undefined) {
            request.input('active', mssql.Bit, isActive ? 1 : 0);
            updates.push("IsActive = @active");
        }

        if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

        query += updates.join(", ") + " WHERE BusNo = @busNo";
        request.input('busNo', mssql.Int, busNo);

        await request.query(query);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. Location history
app.get('/api/bus/:busNo/history', async (req, res) => {
    const { busNo } = req.params;
    try {
        const db = await getPool();
        const result = await db.request()
            .input('busNo', mssql.Int, busNo)
            .query("SELECT TOP 100 * FROM CW_LocationHistory WHERE BusNo = @busNo ORDER BY RecordedAt DESC");
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LAST - app.listen
app.listen(port, async () => {
    await initDB();
    console.log(`✅ CampusWay Server running on port ${port}`);
});
