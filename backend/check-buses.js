import db from './db.js';

(async () => {
  try {
    const result = await db.executeQuery(`
      SELECT BusNo, Username, DestinationName FROM dbo.Buses 
      WHERE BusNo IN ('34', '50') OR UPPER(BusNo) IN ('TN55AC5864', 'TN55BC5526')
      ORDER BY BusNo
    `);
    
    console.log('🔍 Buses found in database:');
    if (result.recordset.length === 0) {
      console.log('   (none)');
    } else {
      result.recordset.forEach(b => {
        console.log(`   ${b.BusNo} | ${b.Username} | ${b.DestinationName}`);
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    process.exit(0);
  }
})();
