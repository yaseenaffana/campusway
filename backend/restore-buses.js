import db from './db.js';

const buses = [
  { no: '2', reg: 'TN63AJ8602', route: 'Neivasal' },
  { no: '3', reg: 'TN63AK1260', route: 'SS.Kottai' },
  { no: '4', reg: 'TN63AK1264', route: 'Illupakudi' },
  { no: '6', reg: 'TN63AJ8845', route: 'Senjai' },
  { no: '7', reg: 'TN63AL8220', route: 'Thirupathur Pudhu Theru' },
  { no: '8', reg: 'TN63AJ8903', route: 'Singampunari' },
  { no: '9', reg: 'TN63AL8156', route: 'Spare' },
  { no: '11', reg: 'TN63AL9236', route: 'Spare' },
  { no: '12', reg: 'TN63AJ8611', route: 'Spare' },
  { no: '13', reg: 'TN63AJ8570', route: 'Spare' },
  { no: '14', reg: 'TN63BA0058', route: 'Velangudi' },
  { no: '15', reg: 'TN63BA0204', route: 'Karaikudi' },
  { no: '16', reg: 'TN63BA3179', route: 'Eriyur' },
  { no: '17', reg: 'TN63BC3589', route: 'Akilmanai,Thirupathur' },
  { no: '18', reg: 'TN63BC3805', route: 'Sembanur' },
  { no: '19', reg: 'TN63BD8042', route: 'Kotaiyur' },
  { no: '20', reg: 'TN63BE0936', route: 'Keelasevalpatti' },
  { no: '34', reg: 'TN55AC5864', route: 'Kallutimedu' },
  { no: '50', reg: 'TN55BC5526', route: 'Elanthaimangalam' }
];

async function restoreBuses() {
  console.log('--- Restoring Buses Data ---');
  try {
    // 1. Delete all existing buses
    console.log('Deleting existing data...');
    await db.executeQuery('DELETE FROM dbo.Buses');
    
    // 2. Insert new buses
    console.log(`Inserting ${buses.length} buses...`);
    for (const bus of buses) {
      const username = `bus${bus.no}`;
      const isActive = bus.route.toLowerCase().includes('spare') ? 0 : 1;
      
      // busNumber is NOT NULL in this schema, so we must provide it.
      await db.executeQuery(`
        INSERT INTO dbo.Buses (
          BusNo, Username, busNumber, BusName, DestinationName, IsActive, LastUpdated
        ) VALUES (
          @no, @username, @no, @reg, @route, @isActive, GETDATE()
        )
      `, {
        no: bus.no,
        username: username,
        reg: bus.reg,
        route: bus.route,
        isActive: isActive
      });
      console.log(`Inserted Bus ${bus.no} (${bus.reg})`);
    }
    
    console.log('✅ Database restoration complete!');
  } catch (err) {
    console.error('❌ Restoration failed:', err.message);
  } finally {
    await db.closeConnection();
    process.exit(0);
  }
}

restoreBuses();
