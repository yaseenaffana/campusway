import db from './db.js';

async function inspectColumns() {
  console.log('--- Inspecting All Columns in Buses ---');
  try {
    const result = await db.executeQuery('SELECT TOP 1 * FROM dbo.Buses');
    if (result.recordset.length > 0) {
      console.log('Columns found:', Object.keys(result.recordset[0]));
    } else {
      console.log('Table is empty, checking schema instead...');
       const schema = await db.executeQuery(\`
         SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_NAME = 'Buses'
      \`);
      console.log('Columns from schema:', schema.recordset.map(r => r.COLUMN_NAME));
    }
  } catch (err) {
    console.error('❌ Inspection failed:', err.message);
  } finally {
    await db.closeConnection();
    process.exit(0);
  }
}

inspectColumns();
