import db from './db.js';

async function checkCols() {
  try {
    const result = await db.executeQuery("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Buses'");
    console.log(JSON.stringify(result.recordset.map(r => r.COLUMN_NAME)));
  } catch (err) {
    console.error(err);
  } finally {
    await db.closeConnection();
    process.exit(0);
  }
}
checkCols();
