import { executeQuery } from '../db.js';

const FIXED_SCHOOL_LAT = 10.105871781656774;
const FIXED_SCHOOL_LNG = 78.64251386094996;
const LIVE_WINDOW_SECONDS = 5;
const TRACKING_TIME_ZONE = process.env.TRACKING_TIME_ZONE || 'Asia/Kolkata';

const getFleetNo = (value = '') => {
  const match = String(value).match(/\d+/);
  return match ? match[0] : String(value || '');
};

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getTrackingHour = (date = new Date()) => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: TRACKING_TIME_ZONE
    });
    return Number(formatter.format(date));
  } catch {
    return date.getHours();
  }
};

const getTrackingMode = (date = new Date()) => (getTrackingHour(date) < 12 ? 'MORNING' : 'EVENING');

const getSchoolCoordinates = (bus) => {
  const lat = Number(bus?.SchoolLat);
  const lng = Number(bus?.SchoolLng);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return { lat: FIXED_SCHOOL_LAT, lng: FIXED_SCHOOL_LNG };
};

const formatDistanceKm = (distanceKm, label) => `${distanceKm.toFixed(1)} km ${label}`;

const buildDistanceInfo = (bus, date = new Date()) => {
  if (bus?.CurrentLat == null || bus?.CurrentLng == null) {
    return { trackingMode: getTrackingMode(date), distance: null, etaMinutes: null };
  }

  const currentLat = Number(bus.CurrentLat);
  const currentLng = Number(bus.CurrentLng);

  if (!Number.isFinite(currentLat) || !Number.isFinite(currentLng)) {
    return { trackingMode: getTrackingMode(date), distance: null, etaMinutes: null };
  }

  const trackingMode = getTrackingMode(date);
  const target =
    trackingMode === 'MORNING'
      ? { ...getSchoolCoordinates(bus), suffix: 'from school' }
      : {
          lat: bus?.DestinationLat == null ? null : Number(bus.DestinationLat),
          lng: bus?.DestinationLng == null ? null : Number(bus.DestinationLng),
          suffix: 'to destination'
        };

  if (!Number.isFinite(target.lat) || !Number.isFinite(target.lng)) {
    return { trackingMode, distance: null, etaMinutes: null };
  }

  const distanceKm = haversineKm(currentLat, currentLng, target.lat, target.lng);
  const speed = Number(bus?.Speed);
  const etaMinutes =
    Number.isFinite(speed) && speed > 0
      ? Math.ceil((distanceKm / speed) * 60)
      : null;

  return {
    trackingMode,
    distance: formatDistanceKm(distanceKm, target.suffix),
    distanceText: formatDistanceKm(distanceKm, target.suffix),
    distanceKm: Number(distanceKm.toFixed(2)),
    etaMinutes
  };
};

const onlineExpr = (busAlias = 'b') => `CASE WHEN EXISTS (
  SELECT 1
  FROM dbo.LocationHistory lh
  WHERE lh.BusNo = ${busAlias}.BusNo
    AND lh.RecordedAt > DATEADD(SECOND, -${LIVE_WINDOW_SECONDS}, GETDATE())
) THEN 1 ELSE 0 END`;

const mapBusForResponse = (bus, { forceOnline = false } = {}) => {
  const distanceInfo = buildDistanceInfo(bus);
  const isOnline = forceOnline || bus.IsOnline === 1;
  const busTimestamp = bus.LastUpdated ? Date.parse(bus.LastUpdated) : Date.now();
  const fleetNo = getFleetNo(bus.Username);

  return {
    ...bus,
    id: `bus_${bus.Username || bus.BusNo}`,
    busNumber: fleetNo || String(bus.BusNo),
    registrationNumber: bus.BusNo || '',
    route: bus.DestinationName || '',
    location: {
      lat: bus.CurrentLat || 0,
      lng: bus.CurrentLng || 0,
      timestamp: busTimestamp,
      speed: bus.Speed || 0
    },
    status: isOnline ? 'online' : 'offline',
    updatedAt: busTimestamp,
    driverName: bus.Username || '',
    isOnline,
    IsOnline: isOnline,
    IsActive: Boolean(bus.IsActive),
    gpsCount: bus.GPSCount || 0,
    lastGPSTime: bus.LastGPSTime,
    trackingMode: distanceInfo.trackingMode,
    distance: distanceInfo.distance,
    distanceText: distanceInfo.distanceText ?? distanceInfo.distance,
    distanceKm: distanceInfo.distanceKm ?? null,
    etaMinutes: distanceInfo.etaMinutes
  };
};

export const getLiveBuses = async (_req, res) => {
  try {
    const result = await executeQuery(
      `
      SELECT
        b.BusNo, b.BusName, b.Username,
        b.CurrentLat, b.CurrentLng, b.Speed, b.LastUpdated,
        b.DestinationName, b.DestinationLat, b.DestinationLng, b.SchoolLat, b.SchoolLng,
        ISNULL(b.IsActive, 1) AS IsActive,
        ${onlineExpr('b')} AS IsOnline,
        (SELECT COUNT(*)
         FROM dbo.LocationHistory lh
         WHERE lh.BusNo = b.BusNo
           AND lh.RecordedAt > DATEADD(SECOND, -${LIVE_WINDOW_SECONDS}, GETDATE())) AS GPSCount,
        (SELECT TOP 1 RecordedAt
         FROM dbo.LocationHistory lh
         WHERE lh.BusNo = b.BusNo
         ORDER BY RecordedAt DESC) AS LastGPSTime
      FROM dbo.Buses b
      WHERE EXISTS (
        SELECT 1
        FROM dbo.LocationHistory lh
        WHERE lh.BusNo = b.BusNo
          AND lh.RecordedAt > DATEADD(SECOND, -${LIVE_WINDOW_SECONDS}, GETDATE())
      )
      ORDER BY b.BusNo ASC
      `
    );

    const buses = result.recordset.map((bus) => mapBusForResponse(bus, { forceOnline: true }));
    return res.json({ success: true, buses, onlineCount: buses.length });
  } catch (error) {
    console.error('[getLiveBuses] Failed:', error.message);
    return res.status(500).json({ success: false, error: error.message, buses: [] });
  }
};

export const getAllBuses = async (_req, res) => {
  try {
    const result = await executeQuery(
      `
      SELECT
        b.BusNo, b.BusName, b.Username,
        b.CurrentLat, b.CurrentLng, b.Speed, b.LastUpdated,
        b.DestinationName, b.DestinationLat, b.DestinationLng, b.SchoolLat, b.SchoolLng,
        ISNULL(b.IsActive, 1) AS IsActive,
        ${onlineExpr('b')} AS IsOnline,
        (SELECT COUNT(*)
         FROM dbo.LocationHistory lh
         WHERE lh.BusNo = b.BusNo
           AND lh.RecordedAt > DATEADD(SECOND, -${LIVE_WINDOW_SECONDS}, GETDATE())) AS GPSCount,
        (SELECT TOP 1 RecordedAt
         FROM dbo.LocationHistory lh
         WHERE lh.BusNo = b.BusNo
         ORDER BY RecordedAt DESC) AS LastGPSTime
      FROM dbo.Buses b
      ORDER BY
        CASE WHEN ${onlineExpr('b')} = 1 THEN 0 ELSE 1 END,
        TRY_CAST(NULLIF(b.Username, '') AS INT),
        b.BusNo ASC
      `
    );

    const buses = result.recordset.map((bus) => mapBusForResponse(bus));
    return res.json({ success: true, buses, count: buses.length });
  } catch (error) {
    console.error('[getAllBuses] Failed:', error.message);
    return res.status(500).json({ success: false, error: error.message, buses: [] });
  }
};

export const getOnlineBuses = async (_req, res) => {
  return getLiveBuses(_req, res);
};

export const getBusByNo = async (req, res) => {
  try {
    const { busNo } = req.params;
    const normalizedLookup = String(busNo || '').trim();
    const usernameLookup = normalizedLookup.startsWith('bus') ? normalizedLookup : `bus${normalizedLookup}`;
    const result = await executeQuery(
      `
      SELECT TOP 1
        BusNo, BusName, Username,
        CurrentLat, CurrentLng, Speed, LastUpdated,
        DestinationName, DestinationLat, DestinationLng, SchoolLat, SchoolLng,
        ISNULL(IsActive, 1) AS IsActive,
        ${onlineExpr('dbo.Buses')} AS IsOnline,
        (SELECT COUNT(*)
         FROM dbo.LocationHistory lh
         WHERE lh.BusNo = dbo.Buses.BusNo
           AND lh.RecordedAt > DATEADD(SECOND, -${LIVE_WINDOW_SECONDS}, GETDATE())) AS GPSCount,
        (SELECT TOP 1 RecordedAt
         FROM dbo.LocationHistory lh
         WHERE lh.BusNo = dbo.Buses.BusNo
         ORDER BY RecordedAt DESC) AS LastGPSTime
      FROM dbo.Buses
      WHERE BusNo = @busNo OR Username = @busNo OR Username = @usernameLookup
      `,
      { busNo: normalizedLookup, usernameLookup }
    );

    if (!result.recordset.length) {
      return res.status(404).json({ success: false, error: 'Bus not found' });
    }

    const bus = result.recordset[0];
    if (bus.IsOnline !== 1) {
      return res.status(404).json({ success: false, error: 'Bus is offline' });
    }

    const school = getSchoolCoordinates(bus);
    const trackingMode = getTrackingMode();
    const target =
      trackingMode === 'MORNING'
        ? { ...school, name: 'School' }
        : {
            lat: bus.DestinationLat,
            lng: bus.DestinationLng,
            name: bus.DestinationName || 'Destination'
          };
    const distanceInfo = buildDistanceInfo(bus);
    const busResponse = mapBusForResponse(bus, { forceOnline: true });

    return res.json({
      success: true,
      bus: busResponse,
      online: true,
      trackingMode,
      target,
      distance: distanceInfo.distance,
      distanceText: distanceInfo.distanceText ?? distanceInfo.distance,
      distanceKm: distanceInfo.distanceKm ?? null,
      etaMinutes: distanceInfo.etaMinutes
    });
  } catch (error) {
    console.error('[getBusByNo] Failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getBusSnapshot = async (req, res) => {
  try {
    const { busNo } = req.params;
    const normalizedLookup = String(busNo || '').trim();
    const usernameLookup = normalizedLookup.startsWith('bus') ? normalizedLookup : `bus${normalizedLookup}`;
    const result = await executeQuery(
      `
      SELECT TOP 1
        BusNo, BusName, Username,
        CurrentLat, CurrentLng, Speed, LastUpdated,
        DestinationName, DestinationLat, DestinationLng, SchoolLat, SchoolLng,
        ISNULL(IsActive, 1) AS IsActive,
        ${onlineExpr('dbo.Buses')} AS IsOnline,
        (SELECT COUNT(*)
         FROM dbo.LocationHistory lh
         WHERE lh.BusNo = dbo.Buses.BusNo
           AND lh.RecordedAt > DATEADD(SECOND, -${LIVE_WINDOW_SECONDS}, GETDATE())) AS GPSCount,
        (SELECT TOP 1 RecordedAt
         FROM dbo.LocationHistory lh
         WHERE lh.BusNo = dbo.Buses.BusNo
         ORDER BY RecordedAt DESC) AS LastGPSTime
      FROM dbo.Buses
      WHERE BusNo = @busNo OR Username = @busNo OR Username = @usernameLookup
      `,
      { busNo: normalizedLookup, usernameLookup }
    );

    if (!result.recordset.length) {
      return res.status(404).json({ success: false, error: 'Bus not found' });
    }

    const bus = result.recordset[0];
    const trackingMode = getTrackingMode();
    const target =
      trackingMode === 'MORNING'
        ? { ...getSchoolCoordinates(bus), name: 'School' }
        : {
            lat: bus.DestinationLat,
            lng: bus.DestinationLng,
            name: bus.DestinationName || 'Destination'
          };
    const distanceInfo = buildDistanceInfo(bus);
    const busResponse = mapBusForResponse(bus);

    return res.json({
      success: true,
      bus: busResponse,
      online: bus.IsOnline === 1,
      trackingMode,
      target,
      distance: distanceInfo.distance,
      distanceText: distanceInfo.distanceText ?? distanceInfo.distance,
      distanceKm: distanceInfo.distanceKm ?? null,
      etaMinutes: distanceInfo.etaMinutes
    });
  } catch (error) {
    console.error('[getBusSnapshot] Failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateBusLocation = (io) => async (req, res) => {
  try {
    const { busNo, lat, lng, latitude, longitude, speed } = req.body || {};
    const tokenBusNo = req.user?.busNo;
    const effectiveBusNo = String(tokenBusNo || busNo || '').trim();
    const latitudeValue = lat ?? latitude;
    const longitudeValue = lng ?? longitude;

    if (!effectiveBusNo || latitudeValue == null || longitudeValue == null) {
      return res.status(400).json({ success: false, error: 'busNo, lat, lng are required' });
    }

    const latNum = Number(latitudeValue);
    const lngNum = Number(longitudeValue);
    const speedNum = Number(speed || 0) || 0;

    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({ success: false, error: 'Invalid coordinates' });
    }

    const updateResult = await executeQuery(
      `
      BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.Buses
        SET CurrentLat = @lat,
            CurrentLng = @lng,
            Speed = @speed,
            LastUpdated = GETDATE()
        WHERE BusNo = @busNo;

        IF @@ROWCOUNT = 0
        BEGIN
          THROW 50001, 'Bus not found', 1;
        END;

        DECLARE @username NVARCHAR(50);
        DECLARE @busName NVARCHAR(100);
        DECLARE @destinationName NVARCHAR(150);
        DECLARE @destinationLat DECIMAL(10, 8);
        DECLARE @destinationLng DECIMAL(11, 8);
        DECLARE @schoolLat DECIMAL(10, 8);
        DECLARE @schoolLng DECIMAL(11, 8);

        SELECT TOP 1
          @username = Username,
          @busName = BusName,
          @destinationName = DestinationName,
          @destinationLat = DestinationLat,
          @destinationLng = DestinationLng,
          @schoolLat = SchoolLat,
          @schoolLng = SchoolLng
        FROM dbo.Buses
        WHERE BusNo = @busNo;

        INSERT INTO dbo.LocationHistory (Username, BusNo, Latitude, Longitude, Speed, RecordedAt)
        VALUES (@username, @busNo, @lat, @lng, @speed, GETDATE());

        SELECT TOP 1
          Id,
          @username AS Username,
          @busNo AS BusNo,
          @busName AS BusName,
          @destinationName AS DestinationName,
          @destinationLat AS DestinationLat,
          @destinationLng AS DestinationLng,
          @schoolLat AS SchoolLat,
          @schoolLng AS SchoolLng
        FROM dbo.Buses
        WHERE BusNo = @busNo;

        COMMIT TRANSACTION;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0
          ROLLBACK TRANSACTION;
        THROW;
      END CATCH
      `,
      {
        busNo: effectiveBusNo,
        lat: latNum,
        lng: lngNum,
        speed: speedNum
      }
    );

    const bus = updateResult.recordset?.[0];
    if (!bus) {
      return res.status(404).json({ success: false, error: 'Bus not found' });
    }

    console.log('[updateBusLocation] LocationHistory GPS stored', {
      username: bus.Username,
      busNo: bus.BusNo,
      lat: latNum,
      lng: lngNum,
      speed: speedNum
    });

    const distanceInfo = buildDistanceInfo({
      ...bus,
      CurrentLat: latNum,
      CurrentLng: lngNum,
      Speed: speedNum
    });

    const payload = {
      busNo: bus.BusNo,
      fleetNo: getFleetNo(bus.Username),
      username: bus.Username,
      registration: bus.BusNo,
      busName: bus.BusName,
      lat: latNum,
      lng: lngNum,
      speed: speedNum,
      destination: bus.DestinationName,
      destinationLat: bus.DestinationLat,
      destinationLng: bus.DestinationLng,
      schoolLat: bus.SchoolLat,
      schoolLng: bus.SchoolLng,
      trackingMode: distanceInfo.trackingMode,
      distance: distanceInfo.distance,
      distanceText: distanceInfo.distanceText ?? distanceInfo.distance,
      distanceKm: distanceInfo.distanceKm ?? null,
      etaMinutes: distanceInfo.etaMinutes,
      timestamp: new Date().toISOString()
    };

    io.to(`bus_${bus.BusNo}`).emit('busLocationUpdated', payload);
    io.emit('busLocationUpdated', payload);
    io.emit('fleetUpdate', payload);

    return res.json({ success: true, payload });
  } catch (error) {
    console.error('[updateBusLocation] Failed:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getBusHistory = async (req, res) => {
  try {
    const busNo = String(req.params?.username || req.params?.busNo || '').trim();
    if (!busNo) {
      return res.status(400).json({ success: false, error: 'busNo is required' });
    }

    const historyResult = await executeQuery(
      `
      SELECT TOP 25
        Latitude,
        Longitude,
        Speed,
        RecordedAt
      FROM dbo.LocationHistory
      WHERE BusNo = @busNo OR Username = @username
      ORDER BY RecordedAt DESC
      `,
      {
        busNo,
        username: busNo.startsWith('bus') ? busNo : `bus${busNo}`
      }
    );

    const history = (historyResult.recordset || [])
      .map((row) => ({
        lat: Number(row.Latitude),
        lng: Number(row.Longitude),
        speed: Number(row.Speed || 0),
        timestamp: row.RecordedAt ? Date.parse(row.RecordedAt) : Date.now()
      }))
      .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng))
      .reverse();

    return res.json({ success: true, history });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message, history: [] });
  }
};

export const disconnectBus = async (req, res) => {
  try {
    const busNo = String(req.user?.busNo || '').trim();
    if (!busNo) {
      return res.status(400).json({ success: false, error: 'busNo missing in token' });
    }

    await executeQuery(
      `
      UPDATE dbo.Buses
      SET LastUpdated = DATEADD(HOUR, -2, GETDATE()),
          CurrentLat = COALESCE(SchoolLat, @fallbackSchoolLat),
          CurrentLng = COALESCE(SchoolLng, @fallbackSchoolLng),
          Speed = 0
      WHERE BusNo = @busNo
      `,
      {
        busNo,
        fallbackSchoolLat: FIXED_SCHOOL_LAT,
        fallbackSchoolLng: FIXED_SCHOOL_LNG
      }
    );

    return res.json({ success: true, message: 'Bus disconnected and hidden from live tracking' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
