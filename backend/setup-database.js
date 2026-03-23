import bcrypt from 'bcryptjs';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(repoRoot, '.env'), override: false });

const DEFAULT_SECONDARY_PASSWORD = process.env.SECONDARY_PASSWORD_DEFAULT || '234567';
const SCHOOL_LAT = 10.1062;
const SCHOOL_LNG = 78.6431;

const FLEET = [
  { fleetNo: 2, registration: 'TN63AJ8602', route: 'Neivasal', isActive: true, destinationLat: 10.1540, destinationLng: 78.6765 },
  { fleetNo: 3, registration: 'TN63AK1260', route: 'SS.Kottai', isActive: true, destinationLat: 10.1245, destinationLng: 78.6882 },
  { fleetNo: 4, registration: 'TN63AK1264', route: 'Illupakudi', isActive: true, destinationLat: 10.0732, destinationLng: 78.7891 },
  { fleetNo: 6, registration: 'TN63AJ8845', route: 'Senjai', isActive: true, destinationLat: 10.1158, destinationLng: 78.6543 },
  { fleetNo: 7, registration: 'TN63AL8220', route: 'Thirupathur Pudhu Theru', isActive: true, destinationLat: 10.1110, destinationLng: 78.6135 },
  { fleetNo: 8, registration: 'TN63AJ8903', route: 'Singampunari', isActive: true, destinationLat: 10.2023, destinationLng: 78.4327 },
  { fleetNo: 9, registration: 'TN63AL8156', route: 'Spare', isActive: false, destinationLat: null, destinationLng: null },
  { fleetNo: 11, registration: 'TN63AL9236', route: 'Spare', isActive: false, destinationLat: null, destinationLng: null },
  { fleetNo: 12, registration: 'TN63AJ8611', route: 'Spare', isActive: false, destinationLat: null, destinationLng: null },
  { fleetNo: 13, registration: 'TN63AJ8570', route: 'Spare', isActive: false, destinationLat: null, destinationLng: null },
  { fleetNo: 14, registration: 'TN63BA0058', route: 'Velangudi', isActive: true, destinationLat: 10.0668, destinationLng: 78.7562 },
  { fleetNo: 15, registration: 'TN63BA0204', route: 'Karaikudi', isActive: true, destinationLat: 10.0735, destinationLng: 78.7732 },
  { fleetNo: 16, registration: 'TN63BA3179', route: 'Eriyur', isActive: true, destinationLat: 10.0612, destinationLng: 78.6321 },
  { fleetNo: 17, registration: 'TN63BC3589', route: 'Akilmanai, Thirupathur', isActive: true, destinationLat: 10.1089, destinationLng: 78.6112 },
  { fleetNo: 18, registration: 'TN63BC3805', route: 'Sembanur', isActive: true, destinationLat: 10.0824, destinationLng: 78.7645 },
  { fleetNo: 19, registration: 'TN63BD8042', route: 'Kottaiyur', isActive: true, destinationLat: 10.1082, destinationLng: 78.7898 },
  { fleetNo: 20, registration: 'TN63BE0936', route: 'Keelasevalpatti', isActive: true, destinationLat: 10.1346, destinationLng: 78.7063 },
  { fleetNo: 34, registration: 'TN55AC5864', route: 'Kallutimedu', isActive: true, destinationLat: 10.2475, destinationLng: 78.5126 },
  { fleetNo: 50, registration: 'TN55BC5526', route: 'Elanthaimangalam', isActive: true, destinationLat: 10.2214, destinationLng: 78.5489 }
];

const config = {
  user: process.env.DB_USER || process.env.MSSQL_USER || 'facultyschedule',
  password: process.env.DB_PASSWORD || process.env.MSSQL_PASSWORD || '',
  server: process.env.DB_SERVER || process.env.MSSQL_SERVER || '103.207.1.87',
  database: process.env.DB_NAME || process.env.MSSQL_DATABASE || 'facultyschedule',
  port: parseInt(process.env.DB_PORT || process.env.MSSQL_PORT || '1433', 10),
  options: {
    encrypt: false,
    trustServerCertificate: true,
    connectTimeout: 15000,
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  requestTimeout: 30000,
};

async function ensureSchema(pool) {
  const schemaSql = `
    IF OBJECT_ID('dbo.Buses', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Buses (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        BusNo VARCHAR(20) NOT NULL UNIQUE,
        BusName VARCHAR(100) NOT NULL,
        Username VARCHAR(50) NOT NULL UNIQUE,
        Password VARCHAR(255) NOT NULL,
        SecondPassword NVARCHAR(255) NULL,
        CurrentLat FLOAT NULL,
        CurrentLng FLOAT NULL,
        Speed FLOAT NOT NULL CONSTRAINT DF_Buses_Speed DEFAULT 0,
        LastUpdated DATETIME NOT NULL CONSTRAINT DF_Buses_LastUpdated DEFAULT GETUTCDATE(),
        DestinationName VARCHAR(150) NULL,
        DestinationLat FLOAT NULL,
        DestinationLng FLOAT NULL,
        SchoolLat FLOAT NULL CONSTRAINT DF_Buses_SchoolLat DEFAULT 10.1062,
        SchoolLng FLOAT NULL CONSTRAINT DF_Buses_SchoolLng DEFAULT 78.6431,
        IsActive BIT NOT NULL CONSTRAINT DF_Buses_IsActive DEFAULT 1
      );
    END;

    IF COL_LENGTH('dbo.Buses', 'Password') IS NULL
      ALTER TABLE dbo.Buses ADD Password VARCHAR(255) NULL;

    IF COL_LENGTH('dbo.Buses', 'PasswordHash') IS NULL
      ALTER TABLE dbo.Buses ADD PasswordHash VARCHAR(255) NULL;

    IF COL_LENGTH('dbo.Buses', 'SecondPassword') IS NULL
      ALTER TABLE dbo.Buses ADD SecondPassword NVARCHAR(255) NULL;

    IF COL_LENGTH('dbo.Buses', 'DestinationName') IS NULL
      ALTER TABLE dbo.Buses ADD DestinationName NVARCHAR(150) NULL;

    IF COL_LENGTH('dbo.Buses', 'DestinationLat') IS NULL
      ALTER TABLE dbo.Buses ADD DestinationLat DECIMAL(10, 8) NULL;

    IF COL_LENGTH('dbo.Buses', 'DestinationLng') IS NULL
      ALTER TABLE dbo.Buses ADD DestinationLng DECIMAL(11, 8) NULL;

    IF COL_LENGTH('dbo.Buses', 'SchoolLat') IS NULL
      ALTER TABLE dbo.Buses ADD SchoolLat DECIMAL(10, 8) NULL;

    IF COL_LENGTH('dbo.Buses', 'SchoolLng') IS NULL
      ALTER TABLE dbo.Buses ADD SchoolLng DECIMAL(11, 8) NULL;

    IF COL_LENGTH('dbo.Buses', 'IsActive') IS NULL
      ALTER TABLE dbo.Buses ADD IsActive BIT NOT NULL CONSTRAINT DF_Buses_IsActive_Late DEFAULT 1;
  `;

  await pool.request().batch(schemaSql);
}

async function upsertFleet(pool) {
  const secondaryPasswordHash = await bcrypt.hash(DEFAULT_SECONDARY_PASSWORD, 10);
  const columnsResult = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'Buses'
  `);
  const columns = new Set(columnsResult.recordset.map((row) => row.COLUMN_NAME));
  const hasPasswordHash = columns.has('PasswordHash');

  for (const bus of FLEET) {
    const busName = `${bus.registration} - ${bus.route}`;
    const username = `bus${bus.fleetNo}`;
    const primaryPasswordHash = await bcrypt.hash(bus.registration, 10);

    await pool.request()
      .input('BusNo', sql.VarChar(20), bus.registration)
      .input('BusName', sql.VarChar(100), busName)
      .input('Username', sql.VarChar(50), username)
      .input('PasswordValue', sql.VarChar(255), bus.registration)
      .input('PasswordHashValue', sql.VarChar(255), primaryPasswordHash)
      .input('SecondPassword', sql.NVarChar(255), secondaryPasswordHash)
      .input('DestinationName', sql.VarChar(150), bus.route)
      .input('DestinationLat', sql.Float, bus.destinationLat)
      .input('DestinationLng', sql.Float, bus.destinationLng)
      .input('SchoolLat', sql.Float, SCHOOL_LAT)
      .input('SchoolLng', sql.Float, SCHOOL_LNG)
      .input('IsActive', sql.Bit, bus.isActive ? 1 : 0)
      .query(`
        MERGE dbo.Buses AS target
        USING (
          SELECT
            @BusNo AS BusNo,
            @BusName AS BusName,
            @Username AS Username,
            @PasswordValue AS PasswordValue,
            @PasswordHashValue AS PasswordHashValue,
            @SecondPassword AS SecondPassword,
            @DestinationName AS DestinationName,
            @DestinationLat AS DestinationLat,
            @DestinationLng AS DestinationLng,
            @SchoolLat AS SchoolLat,
            @SchoolLng AS SchoolLng,
            @IsActive AS IsActive
        ) AS source
        ON target.Username = source.Username OR target.BusNo = source.BusNo
        WHEN MATCHED THEN
          UPDATE SET
            BusNo = source.BusNo,
            BusName = source.BusName,
            Username = source.Username,
            Password = source.PasswordValue,
            ${hasPasswordHash ? 'PasswordHash = source.PasswordHashValue,' : ''}
            DestinationName = source.DestinationName,
            DestinationLat = source.DestinationLat,
            DestinationLng = source.DestinationLng,
            SchoolLat = source.SchoolLat,
            SchoolLng = source.SchoolLng,
            IsActive = source.IsActive,
            SecondPassword = source.SecondPassword
        WHEN NOT MATCHED THEN
          INSERT (
            BusNo, BusName, Username, Password${hasPasswordHash ? ', PasswordHash' : ''}, SecondPassword,
            DestinationName, DestinationLat, DestinationLng, SchoolLat, SchoolLng, IsActive
          )
          VALUES (
            source.BusNo, source.BusName, source.Username, source.PasswordValue${hasPasswordHash ? ', source.PasswordHashValue' : ''}, source.SecondPassword,
            source.DestinationName, source.DestinationLat, source.DestinationLng, source.SchoolLat, source.SchoolLng, source.IsActive
          );
      `);
  }
}

async function cleanupFleet(pool) {
  await pool.request().query(`
    WITH duplicateRows AS (
      SELECT
        Id,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(NULLIF(Username, ''), BusNo)
          ORDER BY Id ASC
        ) AS rowNum
      FROM dbo.Buses
    )
    DELETE FROM dbo.Buses
    WHERE Id IN (SELECT Id FROM duplicateRows WHERE rowNum > 1);
  `);

}

async function main() {
  let pool;

  try {
    console.log('[SETUP] Connecting to SQL Server...');
    pool = await sql.connect(config);
    console.log('[SETUP] Connected');

    await ensureSchema(pool);
    console.log('[SETUP] Schema verified');

    await upsertFleet(pool);
    await cleanupFleet(pool);
    console.log(`[SETUP] Synced ${FLEET.length} buses into dbo.Buses`);
    console.log(`[SETUP] Secondary password set to ${DEFAULT_SECONDARY_PASSWORD} for the fleet`);
  } catch (error) {
    console.error('[SETUP] Failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

main();
