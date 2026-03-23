import db from './db.js';

async function inspectDboSchema() {
  console.log('--- Inspecting dbo.Buses Schema ---');
  try {
    const result = await db.executeQuery(`
       SELECT COLUMN_NAME, IS_NULLABLE, DATA_TYPE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = 'Buses' AND TABLE_SCHEMA = 'dbo'
    `);
    console.table(result.recordset);
  } catch (err) {
    console.error('❌ Schema inspection failed:', err.message);
  } finally {
    await db.closeConnection();
    process.exit(0);
  }
}

inspectDboSchema();
