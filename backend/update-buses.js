#!/usr/bin/env node

/**
 * Batch Update Bus Database
 * Updates or inserts bus route data and optionally removes old buses
 */

import dotenv from 'dotenv';
import sql from 'mssql';

dotenv.config();

const busData = [
  { busNo: 2, registration: 'TN63AJ8602', username: 'bus2', destination: 'Neivasal', lat: 10.1540, lng: 78.6765 },
  { busNo: 3, registration: 'TN63AK1260', username: 'bus3', destination: 'SS.Kottai', lat: 11.6330330904997, lng: 78.48770141038065 },
  { busNo: 4, registration: 'TN63AK1264', username: 'bus4', destination: 'Illupakudi', lat: 9.901261110548136, lng: 78.36428290514549 },
  { busNo: 6, registration: 'TN63AJ8845', username: 'bus6', destination: 'Senjai', lat: 10.077059084157747, lng: 78.7670168394995 },
  { busNo: 7, registration: 'TN63AL8220', username: 'bus7', destination: 'Thirupathur Pudhu Theru', lat: 10.120643907067713, lng: 78.59731240116623 },
  { busNo: 8, registration: 'TN63AJ8903', username: 'bus8', destination: 'Singampunari', lat: 10.201074215868076, lng: 78.42708647638042 },
  { busNo: 9, registration: 'TN63AL8156', username: 'bus9', destination: 'Spare', lat: null, lng: null },
  { busNo: 11, registration: 'TN63AL9236', username: 'bus11', destination: 'Spare', lat: null, lng: null },
  { busNo: 12, registration: 'TN63AJ8611', username: 'bus12', destination: 'Spare', lat: null, lng: null },
  { busNo: 13, registration: 'TN63AJ8570', username: 'bus13', destination: 'Spare', lat: null, lng: null },
  { busNo: 14, registration: 'TN63BA0058', username: 'bus14', destination: 'Velangudi', lat: 10.119968970900416, lng: 78.79444180919943 },
  { busNo: 15, registration: 'TN63BA0204', username: 'bus15', destination: 'Karaikudi ', lat: 10.084980677767863, lng: 78.77523421083131 },
  { busNo: 16, registration: 'TN63BA3179', username: 'bus16', destination: 'Eriyur', lat: 10.04993905280257, lng: 78.52289198691743 },
  { busNo: 17, registration: 'TN63BC3589', username: 'bus17', destination: 'Akilmanai, Thirupathur', lat: 10.120977591704518, lng: 78.6203956453479 },
  { busNo: 18, registration: 'TN63BC3805', username: 'bus18', destination: 'Sembanur', lat: 10.001986571604215, lng: 78.63790510513645 },
  { busNo: 19, registration: 'TN63BD8042', username: 'bus19', destination: 'Kottaiyur', lat: 10.120660461933504, lng: 78.79339249403861 },
  { busNo: 20, registration: 'TN63BE0936', username: 'bus20', destination: 'Keelasevalpatti', lat: 10.18681814454676, lng: 78.6633790969952 },
  { busNo: 34, registration: 'TN55AC5864', username: 'bus34', destination: 'Kallutimedu', lat: 10.2475, lng: 78.5126 },
  { busNo: 50, registration: 'TN55BC5526', username: 'bus50', destination: 'Elanthaimangalam', lat: 10.2214, lng: 78.5489 }
];

const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'facultyschedule',
  authentication: {
    type: 'default',
    options: {
      userName: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    }
  },
  options: {
    encrypt: true,
    trustServerCertificate: true,
    connectionTimeout: 30000,
    requestTimeout: 30000,
    enableKeepAlive: true,
    keepAliveInitialDelayInMillis: 30000
  }
};

async function updateBuses() {
  const pool = new sql.ConnectionPool(dbConfig);

  try {
    await pool.connect();
    console.log('✓ Connected to database');

    // Track updates
    let insertCount = 0;
    let updateCount = 0;

    for (const bus of busData) {
      try {
        // Try to update first (if exists)
        const checkReq = pool.request();
        const exists = await checkReq
          .input('busNo', sql.NVarChar(20), String(bus.busNo))
          .input('username', sql.NVarChar(50), bus.username)
          .query('SELECT Id FROM dbo.Buses WHERE BusNo = @busNo OR Username = @username');

        if (exists.recordset.length > 0) {
          // Update existing
          const updateReq = pool.request();
          await updateReq
            .input('busNo', sql.NVarChar(20), String(bus.busNo))
            .input('username', sql.NVarChar(50), bus.username)
            .input('destination', sql.NVarChar(150), bus.destination)
            .input('lat', sql.Decimal(10, 8), bus.lat)
            .input('lng', sql.Decimal(11, 8), bus.lng)
            .query(`
              UPDATE dbo.Buses
              SET BusNo = @busNo,
                  BusName = @destination,
                  DestinationName = @destination,
                  DestinationLat = @lat,
                  DestinationLng = @lng,
                  LastUpdated = GETDATE()
              WHERE BusNo = @busNo OR Username = @username
            `);
          updateCount++;
          console.log(`  ✓ Updated BUS-${bus.busNo}: ${bus.destination}`);
        } else {
          // Insert new
          const insertReq = pool.request();
          await insertReq
            .input('busNo', sql.NVarChar(20), String(bus.busNo))
            .input('busName', sql.NVarChar(100), bus.destination)
            .input('username', sql.NVarChar(50), bus.username)
            .input('password', sql.NVarChar(255), bus.registration)
            .input('destination', sql.NVarChar(150), bus.destination)
            .input('lat', sql.Decimal(10, 8), bus.lat)
            .input('lng', sql.Decimal(11, 8), bus.lng)
            .query(`
              INSERT INTO dbo.Buses (BusNo, BusName, Username, Password, DestinationName, DestinationLat, DestinationLng, SchoolLat, SchoolLng, IsActive)
              VALUES (@busNo, @busName, @username, @password, @destination, @lat, @lng, 10.1062, 78.6431, 1)
            `);
          insertCount++;
          console.log(`  ✓ Inserted BUS-${bus.busNo}: ${bus.destination}`);
        }
      } catch (err) {
        console.error(`  ❌ Error processing BUS-${bus.busNo}: ${err.message}`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Inserted: ${insertCount} buses`);
    console.log(`   Updated: ${updateCount} buses`);
    console.log(`   Total: ${insertCount + updateCount} buses`);

    // Show final data
    const finalResult = await pool.request().query(`
      SELECT BusNo, BusName, DestinationName, DestinationLat, DestinationLng
      FROM dbo.Buses
      WHERE BusNo IN ('2', '3', '4', '6', '7', '8', '9', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20')
      ORDER BY CAST(BusNo AS INT)
    `);

    console.log('\n✓ Updated Database:');
    console.table(finalResult.recordset.map(r => ({
      BusNo: r.BusNo,
      Destination: r.DestinationName,
      Lat: r.DestinationLat,
      Lng: r.DestinationLng
    })));

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

try {
  await updateBuses();
} catch (err) {
  console.error('❌ Fatal error:', err);
  process.exit(1);
}
