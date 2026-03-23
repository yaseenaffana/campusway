import db from './db.js';

async function testConnection() {
  console.log('--- Database Connection Test ---');
  try {
    const pool = await db.getPool();
    console.log('✅ getPool() returned a pool');
    
    const result = await db.executeQuery('SELECT GETDATE() as ServerTime');
    console.log('✅ Query result:', result.recordset[0]);
    
    if (result.recordset[0].ServerTime) {
      console.log('🎉 Successfully connected to REAL database!');
    } else {
      console.log('📝 Working with MOCK database.');
    }
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    await db.closeConnection();
    process.exit(0);
  }
}

testConnection();
