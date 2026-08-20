import mssql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { createMockConnection } from './mockDatabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(repoRoot, '.env') });

const isProduction = process.env.NODE_ENV === 'production';
const useMockDb = process.env.DB_USE_MOCK === 'true' && !isProduction;

const dbConfig = {
  user: process.env.DB_USER || process.env.MSSQL_USER || '',
  password: process.env.DB_PASSWORD || process.env.MSSQL_PASSWORD || '',
  server: process.env.DB_SERVER || process.env.MSSQL_SERVER || '',
  database: process.env.DB_NAME || process.env.MSSQL_DATABASE || '',
  port: parseInt(process.env.DB_PORT || process.env.MSSQL_PORT || '1433', 10),
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    enableKeepAlive: true,
    connectTimeout: 15000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  requestTimeout: 30000,
};

let pool = null;
let isMocked = false;

const validateDbConfig = () => {
  const requiredKeys = ['user', 'password', 'server', 'database'];
  const missing = requiredKeys.filter((key) => !String(dbConfig[key] || '').trim());

  if (missing.length > 0) {
    throw new Error(`Missing database configuration: ${missing.join(', ')}`);
  }
};

export const getPool = async (retries = 2) => {
  if (pool && (pool.connected || isMocked)) {
    return pool;
  }

  validateDbConfig();

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      console.log(`[db] Connecting to SQL Server ${dbConfig.server}:${dbConfig.port} (${attempt}/${retries})`);
      pool = new mssql.ConnectionPool(dbConfig);

      pool.on('error', (err) => {
        console.error('[db] Connection pool error:', err.message);
        pool = null;
      });

      await pool.connect();
      isMocked = false;
      console.log('[db] SQL Server connected');
      return pool;
    } catch (err) {
      console.error(`[db] Connection attempt ${attempt}/${retries} failed:`, err.message);
      pool = null;

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  if (!useMockDb) {
    throw new Error('Unable to connect to SQL Server. Set DB_USE_MOCK=true only for non-production troubleshooting.');
  }

  console.warn('[db] Falling back to mock database because DB_USE_MOCK=true');
  isMocked = true;
  pool = createMockConnection();
  return pool;
};

export const executeQuery = async (query, parameters = {}) => {
  try {
    const currentPool = await getPool();
    const request = currentPool.request();

    Object.entries(parameters).forEach(([key, value]) => {
      if (isMocked) {
        request.input(key, null, value);
        return;
      }

      request.input(key, value);
    });

    return await request.query(query);
  } catch (err) {
    console.error('[db] Query execution error:', err.message);
    if (!isMocked) {
      throw err;
    }
    return { recordset: [] };
  }
};

export const initializeDatabase = async () => {
  const result = await executeQuery('SELECT GETDATE() as ServerTime');
  console.log(`[db] Database initialized. Server Time: ${result.recordset[0]?.ServerTime || 'Mock Time'}`);
  return true;
};

export const closeConnection = async () => {
  if (pool && !isMocked) {
    try {
      await pool.close();
      pool = null;
      console.log('[db] Database connection closed');
    } catch (err) {
      console.error('[db] Error closing connection:', err.message);
    }
  }
};

export default {
  getPool,
  executeQuery,
  initializeDatabase,
  closeConnection,
  sql: mssql,
};

export { mssql as sql };
