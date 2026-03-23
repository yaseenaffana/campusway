import db from './db.js';

async function inspectSchema() {
  console.log('--- Inspecting Buses Schema ---');
  try {
    const result = await db.executeQuery(`
       SELECT COLUMN_NAME, IS_NULLABLE, DATA_TYPE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = 'Buses'
    `);
    console.table(result.recordset);
  } catch (err) {
    console.error('❌ Schema inspection failed:', err.message);
  } finally {
    await db.closeConnection();
    process.exit(0);
  }
}

inspectSchema();
