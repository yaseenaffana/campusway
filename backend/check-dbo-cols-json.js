import db from './db.js';

async function checkDboCols() {
  try {
    const result = await db.executeQuery("SELECT COLUMN_NAME, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Buses' AND TABLE_SCHEMA = 'dbo'");
    console.log(JSON.stringify(result.recordset));
  } catch (err) {
    console.error(err);
  } finally {
    await db.closeConnection();
    process.exit(0);
  }
}
checkDboCols();
