import db from './db.js';

async function seedLiveData() {
  console.log('--- Seeding Live Data for Bus 16 ---');
  try {
    const query = `
      UPDATE dbo.Buses 
      SET CurrentLat = 10.7725, 
          CurrentLng = 78.6925, 
          Speed = 25, 
          LastUpdated = GETDATE() 
      WHERE BusNo = '16' OR Username = 'bus16'
    `;
    const result = await db.executeQuery(query);
    console.log('✅ Successfully updated Bus 16 with live coordinates.');
    console.log(`Rows affected: ${result.rowsAffected[0]}`);
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
  } finally {
    await db.closeConnection();
    process.exit(0);
  }
}

seedLiveData();
