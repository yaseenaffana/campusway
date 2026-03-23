import db from './db.js';

async function inspectBuses() {
  console.log('--- Inspecting Buses Table ---');
  try {
    const result = await db.executeQuery('SELECT * FROM dbo.Buses');
    console.log(`Found ${result.recordset.length} buses.`);
    console.table(result.recordset.map(b => ({
      BusNo: b.BusNo,
      Username: b.Username,
      CurrentLat: b.CurrentLat,
      CurrentLng: b.CurrentLng,
      IsOnline: b.IsOnline,
      LastUpdated: b.LastUpdated
    })));
  } catch (err) {
    console.error('❌ Inspection failed:', err.message);
  } finally {
    await db.closeConnection();
    process.exit(0);
  }
}

inspectBuses();
