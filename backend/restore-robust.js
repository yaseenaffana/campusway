import db from './db.js';

const buses = [
  { no: "2", reg: "TN63AJ8602", route: "Neivasal" },
  { no: "3", reg: "TN63AK1260", route: "SS.Kottai" },
  { no: "4", reg: "TN63AK1264", route: "Illupakudi" },
  { no: "6", reg: "TN63AJ8845", route: "Senjai" },
  { no: "7", reg: "TN63AL8220", route: "Thirupathur Pudhu Theru" },
  { no: "8", reg: "TN63AJ8903", route: "Singampunari" },
  { no: "9", reg: "TN63AL8156", route: "Spare" },
  { no: "11", reg: "TN63AL9236", route: "Spare" },
  { no: "12", reg: "TN63AJ8611", route: "Spare" },
  { no: "13", reg: "TN63AJ8570", route: "Spare" },
  { no: "14", reg: "TN63BA0058", route: "Velangudi" },
  { no: "15", reg: "TN63BA0204", route: "Karaikudi" },
  { no: "16", reg: "TN63BA3179", route: "Eriyur" },
  { no: "17", reg: "TN63BC3589", route: "Akilmanai,Thirupathur" },
  { no: "18", reg: "TN63BC3805", route: "Sembanur" },
  { no: "19", reg: "TN63BD8042", route: "Kotaiyur" },
  { no: "20", reg: "TN63BE0936", route: "Keelasevalpatti" },
  { no: "34", reg: "TN55AC5864", route: "Kallutimedu" },
  { no: "50", reg: "TN55BC5526", route: "Elanthaimangalam" }
];

async function restore() {
  try {
    console.log("Clearing Buses...");
    await db.executeQuery("DELETE FROM dbo.Buses");
    
    for (const b of buses) {
      try {
        const query = "INSERT INTO dbo.Buses (Username, BusNo, busNumber, BusName, DestinationName, IsActive, LastUpdated) " +
                      "VALUES (@u, @n, @bn, @reg, @dn, @ia, GETDATE())";
        await db.executeQuery(query, {
          u: "bus" + b.no,
          n: b.no,
          bn: b.no, // Providing same as BusNo
          reg: b.reg,
          dn: b.route,
          ia: b.route.toLowerCase().includes("spare") ? 0 : 1
        });
        console.log("OK: " + b.no);
      } catch (e) {
        console.error("FAIL " + b.no + ": " + e.message);
      }
    }
    console.log("Done");
  } catch (err) {
    console.error(err);
  } finally {
    await db.closeConnection();
    process.exit(0);
  }
}
restore();
