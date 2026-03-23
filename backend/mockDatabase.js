/**
 * Mock Database for Development
 * Provides sample data when real database isn't available
 */

const mockBuses = [
  {
    BusNo: '2',
    BusName: 'Sivabalan',
    Username: 'bus2',
    Password: '1234',
    CurrentLat: 10.1059,
    CurrentLng: 78.6425,
    Speed: 0,
    LastUpdated: new Date(),
    DestinationName: 'Neivasal',
    DestinationLat: 10.0735,
    DestinationLng: 78.78,
    SchoolLat: 10.1059,
    SchoolLng: 78.6425,
    IsActive: 1
  },
  {
    BusNo: '3',
    BusName: 'Driver 3',
    Username: 'bus3',
    Password: '1234',
    CurrentLat: 10.1304,
    CurrentLng: 78.7206,
    Speed: 25,
    LastUpdated: new Date(),
    DestinationName: 'SS.Kottai',
    DestinationLat: 10.1304,
    DestinationLng: 78.7206,
    SchoolLat: 10.1059,
    SchoolLng: 78.6425,
    IsActive: 1
  },
  {
    BusNo: '21',
    BusName: 'Driver 21',
    Username: 'bus21',
    Password: '1234',
    CurrentLat: 10.0735,
    CurrentLng: 78.78,
    Speed: 45,
    LastUpdated: new Date(),
    DestinationName: 'Karaikudi',
    DestinationLat: 10.0735,
    DestinationLng: 78.78,
    SchoolLat: 10.1059,
    SchoolLng: 78.6425,
    IsActive: 1
  }
];

const mockLocationHistory = [];

class MockDatabase {
  constructor() {
    this.buses = [...mockBuses];
    this.locationHistory = [...mockLocationHistory];
  }

  request() {
    return new MockRequest(this);
  }
}

class MockRequest {
  constructor(db) {
    this.db = db;
    this.inputs = {};
  }

  input(name, type, value) {
    this.inputs[name] = value;
    return this;
  }

  async query(queryText) {
    const query = queryText.toUpperCase();

    // System queries
    if (query.includes('SELECT GETDATE()')) {
      return { recordset: [{ ServerTime: new Date() }] };
    }

    if (query.includes('SELECT @@VERSION')) {
      return { recordset: [{ SqlVersion: 'Mock SQL Server 2024' }] };
    }

    // Handlers for Buses table
    if (query.includes('SELECT') && query.includes('DBO.BUSES')) {
      if (query.includes('WHERE BUSNO =')) {
        const busNo = String(this.inputs.busNo || '');
        const bus = this.db.buses.find(b => b.BusNo === busNo || b.Username === busNo);
        return { recordset: bus ? [{ ...bus, IsOnline: 1 }] : [] };
      }
      
      return { 
        recordset: this.db.buses.map(b => ({ ...b, IsOnline: 1 }))
      };
    }

    if (query.includes('UPDATE DBO.BUSES')) {
      const busNo = String(this.inputs.busNo || '');
      const bus = this.db.buses.find(b => b.BusNo === busNo);
      if (bus) {
        if (this.inputs.lat !== undefined) bus.CurrentLat = this.inputs.lat;
        if (this.inputs.lng !== undefined) bus.CurrentLng = this.inputs.lng;
        if (this.inputs.speed !== undefined) bus.Speed = this.inputs.speed;
        bus.LastUpdated = new Date();
      }
      return { rowsAffected: [1], recordset: bus ? [bus] : [] };
    }

    if (query.includes('INSERT INTO DBO.LOCATIONHISTORY')) {
      const historyEntry = {
        BusNo: this.inputs.busNo || this.inputs.username,
        Latitude: this.inputs.lat,
        Longitude: this.inputs.lng,
        Speed: this.inputs.speed,
        Timestamp: new Date()
      };
      this.db.locationHistory.push(historyEntry);
      return { rowsAffected: [1] };
    }

    return { recordset: [], rowsAffected: [0] };
  }
}

export function createMockConnection() {
  return new MockDatabase();
}

export const mockSql = {
  VarChar: 'VarChar',
  Float: 'Float',
  Int: 'Int',
  DateTime: 'DateTime',
  Decimal: 'Decimal'
};
