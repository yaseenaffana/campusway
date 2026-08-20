import db from './db.js';

const buses = [
  { busNo: '2', busName: 'Neivasal', destinationName: 'Neivasal', destinationLat: 10.1540, destinationLng: 78.6765 },
  { busNo: '3', busName: 'SS.Kottai', destinationName: 'SS.Kottai', destinationLat: 11.6330330904997, destinationLng: 78.48770141038065 },
  { busNo: '4', busName: 'Illupakudi', destinationName: 'Illupakudi', destinationLat: 9.901261110548136, destinationLng: 78.36428290514549 },
  { busNo: '6', busName: 'Senjai', destinationName: 'Senjai', destinationLat: 10.077059084157747, destinationLng: 78.7670168394995 },
  { busNo: '7', busName: 'Thirupathur Pudhu Theru', destinationName: 'Thirupathur Pudhu Theru', destinationLat: 10.120643907067713, destinationLng: 78.59731240116623 },
  { busNo: '8', busName: 'Singampunari', destinationName: 'Singampunari', destinationLat: 10.201074215868076, destinationLng: 78.42708647638042 },
  { busNo: '9', busName: 'Spare', destinationName: 'Spare', destinationLat: null, destinationLng: null },
  { busNo: '11', busName: 'Spare', destinationName: 'Spare', destinationLat: null, destinationLng: null },
  { busNo: '12', busName: 'Spare', destinationName: 'Spare', destinationLat: null, destinationLng: null },
  { busNo: '13', busName: 'Spare', destinationName: 'Spare', destinationLat: null, destinationLng: null },
  { busNo: '14', busName: 'Velangudi', destinationName: 'Velangudi', destinationLat: 10.119968970900416, destinationLng: 78.79444180919943 },
  { busNo: '15', busName: 'Karaikudi', destinationName: 'Karaikudi', destinationLat: 10.084980677767863, destinationLng: 78.77523421083131 },
  { busNo: '16', busName: 'Eriyur', destinationName: 'Eriyur', destinationLat: 10.04993905280257, destinationLng: 78.52289198691743 },
  { busNo: '17', busName: 'Akilmanai, Thirupathur', destinationName: 'Akilmanai, Thirupathur', destinationLat: 10.120977591704518, destinationLng: 78.6203956453479 },
  { busNo: '18', busName: 'Sembanur', destinationName: 'Sembanur', destinationLat: 10.001986571604215, destinationLng: 78.63790510513645 },
  { busNo: '19', busName: 'Kottaiyur', destinationName: 'Kottaiyur', destinationLat: 10.120660461933504, destinationLng: 78.79339249403861 },
  { busNo: '20', busName: 'Keelasevalpatti', destinationName: 'Keelasevalpatti', destinationLat: 10.18681814454676, destinationLng: 78.6633790969952 },
  { busNo: '34', busName: 'Kallutimedu', destinationName: 'Kallutimedu', destinationLat: 10.2475, destinationLng: 78.5126 },
  { busNo: '50', busName: 'Elanthaimangalam', destinationName: 'Elanthaimangalam', destinationLat: 10.2214, destinationLng: 78.5489 }
];

(async () => {
  try {
    let updated = 0;
    let inserted = 0;
    let failed = 0;

    for (const bus of buses) {
      try {
        // Check if bus exists (case-insensitive)
        const result = await db.executeQuery(
          'SELECT BusNo FROM dbo.Buses WHERE UPPER(BusNo) = UPPER(@busNo)',
          { busNo: bus.busNo }
        );

        if (result.recordset.length > 0) {
          // Update existing bus (use case-insensitive match)
          await db.executeQuery(
            `UPDATE dbo.Buses 
             SET BusName = @busName, 
                 DestinationName = @destinationName, 
                 DestinationLat = @destinationLat, 
                 DestinationLng = @destinationLng,
                 LastUpdated = GETDATE()
             WHERE UPPER(BusNo) = UPPER(@busNo)`,
            {
              busNo: bus.busNo,
              busName: bus.busName,
              destinationName: bus.destinationName,
              destinationLat: bus.destinationLat,
              destinationLng: bus.destinationLng
            }
          );
          updated++;
          console.log(`✅ Updated: Bus ${bus.busNo} - ${bus.busName}`);
        } else {
          // Insert new bus
          await db.executeQuery(
            `INSERT INTO dbo.Buses (BusNo, BusName, Username, Password, DestinationName, DestinationLat, DestinationLng, CurrentLat, CurrentLng, SchoolLat, SchoolLng, IsActive, LastUpdated)
             VALUES (@busNo, @busName, @username, @password, @destinationName, @destinationLat, @destinationLng, @currentLat, @currentLng, @schoolLat, @schoolLng, 1, GETDATE())`,
            {
              busNo: bus.busNo,
              busName: bus.busName,
              username: `bus${bus.busNo}`,
              password: '1234',
              destinationName: bus.destinationName,
              destinationLat: bus.destinationLat,
              destinationLng: bus.destinationLng,
              currentLat: bus.destinationLat,
              currentLng: bus.destinationLng,
              schoolLat: 10.1062,
              schoolLng: 78.6431
            }
          );
          inserted++;
          console.log(`✨ Inserted: Bus ${bus.busNo} - ${bus.busName}`);
        }
      } catch (error) {
        failed++;
        console.error(`❌ Failed to update/insert Bus ${bus.busNo}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary');
    console.log('='.repeat(60));
    console.log(`✅ Updated: ${updated} buses`);
    console.log(`✨ Inserted: ${inserted} buses`);
    console.log(`❌ Failed: ${failed} buses`);
    console.log(`📈 Total processed: ${updated + inserted + failed}/${buses.length}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    process.exit(0);
  }
})();
