import mssql from 'mssql';
import dotenv from 'dotenv';
import { createMockConnection, mockSql } from './mockDatabase.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const dbConfig = {
  user: process.env.DB_USER || process.env.MSSQL_USER || 'facultyschedule',
  password: process.env.DB_PASSWORD || process.env.MSSQL_PASSWORD || '',
  server: process.env.DB_SERVER || process.env.MSSQL_SERVER || '103.207.1.87',
  database: process.env.DB_NAME || process.env.MSSQL_DATABASE || 'facultyschedule',
  port: parseInt(process.env.DB_PORT || process.env.MSSQL_PORT || '1433', 10),
  options: {
    encrypt: false, // Changed from true to false for better compatibility
    trustServerCertificate: true,
    enableKeepAlive: true,
    connectTimeout: 15000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  requestTimeout: 30000,
};

let pool = null;
let isMocked = false;

/**
 * Get or create database connection pool
 */
export const getPool = async (retries = 2) => {
  if (pool && (pool.connected || isMocked)) {
    return pool;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔌 Attempting DB connection (${attempt}/${retries})...`);
      pool = new mssql.ConnectionPool(dbConfig);
      
      pool.on('error', err => {
        console.error('❌ Pool error:', err.message);
        pool = null;
      });

      await pool.connect();
      console.log(`✅ SQL Server connected!`);
      isMocked = false;
      return pool;
    } catch (err) {
      console.error(`⚠️  Connection attempt ${attempt}/${retries} failed:`, err.message);
      pool = null;

      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  console.warn('📝 Using Mock Database fallback');
  isMocked = true;
  pool = createMockConnection();
  return pool;
};

/**
 * Execute SQL query with parameters
 */
export const executeQuery = async (query, parameters = {}) => {
  try {
    const currentPool = await getPool();
    const request = currentPool.request();

    // Add parameters
    Object.entries(parameters).forEach(([key, value]) => {
      // If mocked, it doesn't need type
      if (isMocked) {
        request.input(key, null, value);
      } else {
        request.input(key, value);
      }
    });

    const result = await request.query(query);
    return result;
  } catch (err) {
    console.error('❌ Query execution error:', err.message);
    if (!isMocked) throw err;
    return { recordset: [] };
  }
};

/**
 * Initialize database - verify connection
 */
export const initializeDatabase = async () => {
  try {
    const result = await executeQuery('SELECT GETDATE() as ServerTime');
    console.log(`✅ Database initialized. Server Time: ${result.recordset[0]?.ServerTime || 'Mock Time'}`);
    return true;
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    return false; // Don't crash, let it use mock
  }
};

/**
 * Close database connection
 */
export const closeConnection = async () => {
  if (pool && !isMocked) {
    try {
      await pool.close();
      pool = null;
      console.log('✅ Database connection closed');
    } catch (err) {
      console.error('❌ Error closing connection:', err.message);
    }
  }
};

export default {
  getPool,
  executeQuery,
  initializeDatabase,
  closeConnection,
  sql: mssql
};

export { mssql as sql };
