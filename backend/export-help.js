import db from './db.js';
import fs from 'fs';

async function fullHelp() {
  try {
    const result = await db.executeQuery("exec sp_help 'dbo.Buses'");
    fs.writeFileSync('sp_help_full.json', JSON.stringify(result.recordsets, null, 2));
    console.log('✅ Wrote sp_help_full.json');
  } catch (err) {
    console.error(err);
  } finally {
    await db.closeConnection();
    process.exit(0);
  }
}
fullHelp();
