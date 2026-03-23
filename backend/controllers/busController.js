import { executeQuery } from '../db.js';

const FIXED_SCHOOL_LAT = 10.105871781656774;
const FIXED_SCHOOL_LNG = 78.64251386094996;
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

const getTrackingMode = (date = new Date()) => (date.getHours() < 12 ? 'MORNING' : 'EVENING');

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

const onlineExpr = `CASE WHEN LastUpdated > DATEADD(SECOND, -10, GETDATE()) THEN 1 ELSE 0 END`;

export const getLiveBuses = async (_req, res) => {
  try {
    const result = await executeQuery(
      `
      SELECT
        BusNo, BusName, Username,
        CurrentLat, CurrentLng, Speed, LastUpdated,
        DestinationName, DestinationLat, DestinationLng, SchoolLat, SchoolLng,
        ISNULL(IsActive, 1) AS IsActive,
        ${onlineExpr} AS IsOnline
      FROM dbo.Buses
      ORDER BY BusNo ASC
      `
    );

    const buses = result.recordset.map((b) => {
      const distanceInfo = buildDistanceInfo(b);
      const isOnline = b.IsOnline === 1;  // Convert to boolean
      const busTimestamp = b.LastUpdated ? Date.parse(b.LastUpdated) : Date.now();
      const fleetNo = getFleetNo(b.Username);
      
      return {
        // Original database fields
        ...b,
        // Fields for App.tsx compatibility
        id: `bus_${b.Username || b.BusNo}`,
        busNumber: fleetNo || String(b.BusNo),
        registrationNumber: b.BusNo || '',
        route: b.DestinationName || '',
        location: {
          lat: b.CurrentLat || 0,
          lng: b.CurrentLng || 0,
          timestamp: busTimestamp,
          speed: b.Speed || 0
        },
        status: isOnline ? 'online' : 'offline',
        updatedAt: busTimestamp,
        driverName: b.Username || '',
        isOnline: isOnline,
        IsOnline: isOnline,
        IsActive: Boolean(b.IsActive),
        // Distance info
        trackingMode: distanceInfo.trackingMode,
        distance: distanceInfo.distance,
        distanceText: distanceInfo.distanceText ?? distanceInfo.distance,
        distanceKm: distanceInfo.distanceKm ?? null,
        etaMinutes: distanceInfo.etaMinutes
      };
    });

    return res.json({ success: true, buses });
  } catch (error) {
    console.error('❌ Error fetching live buses:', error.message);
    return res.status(500).json({ success: false, error: error.message, buses: [] });
  }
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
        ${onlineExpr} AS IsOnline
      FROM dbo.Buses
      WHERE BusNo = @busNo OR Username = @busNo OR Username = @usernameLookup
      `,
      { busNo: normalizedLookup, usernameLookup }
    );

    if (!result.recordset.length) {
      return res.status(404).json({ success: false, error: 'Bus not found' });
    }

    const b = result.recordset[0];
    const school = getSchoolCoordinates(b);
    const trackingMode = getTrackingMode();
    const target =
      trackingMode === 'MORNING'
        ? { ...school, name: 'School' }
        : {
            lat: b.DestinationLat,
            lng: b.DestinationLng,
            name: b.DestinationName || 'Destination'
          };
    const distanceInfo = buildDistanceInfo(b);
    const isOnline = b.IsOnline === 1;
    const busTimestamp = b.LastUpdated ? Date.parse(b.LastUpdated) : Date.now();
    const fleetNo = getFleetNo(b.Username);

    const busResponse = {
      // Original database fields
      ...b,
      // Fields for App.tsx compatibility
      id: `bus_${b.Username || b.BusNo}`,
      busNumber: fleetNo || String(b.BusNo),
      registrationNumber: b.BusNo || '',
      route: b.DestinationName || '',
      location: {
        lat: b.CurrentLat || 0,
        lng: b.CurrentLng || 0,
        timestamp: busTimestamp,
        speed: b.Speed || 0
      },
      status: isOnline ? 'online' : 'offline',
      updatedAt: busTimestamp,
      driverName: b.Username || '',
      isOnline: isOnline,
      IsOnline: isOnline,
      IsActive: Boolean(b.IsActive),
      // Distance info
      trackingMode: distanceInfo.trackingMode,
      distance: distanceInfo.distance,
      distanceText: distanceInfo.distanceText ?? distanceInfo.distance,
      distanceKm: distanceInfo.distanceKm ?? null,
      etaMinutes: distanceInfo.etaMinutes
    };

    return res.json({
      success: true,
      bus: busResponse,
      online: isOnline,
      trackingMode,
      target,
      distance: distanceInfo.distance,
      distanceText: distanceInfo.distanceText ?? distanceInfo.distance,
      distanceKm: distanceInfo.distanceKm ?? null,
      etaMinutes: distanceInfo.etaMinutes
    });
  } catch (error) {
    console.error('❌ Error fetching bus:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateBusLocation = (io) => async (req, res) => {
  try {
    const { busNo, lat, lng, speed } = req.body || {};
    const tokenBusNo = req.user?.busNo;
    const effectiveBusNo = String(tokenBusNo || busNo || '');
    console.log('[updateBusLocation] called', {
      busNo: effectiveBusNo,
      hasLat: lat != null,
      hasLng: lng != null,
      hasSpeed: speed != null
    });
    if (!effectiveBusNo || lat == null || lng == null) {
      return res.status(400).json({ success: false, error: 'busNo, lat, lng are required' });
    }

    const updateResult = await executeQuery(
      `
      UPDATE dbo.Buses
      SET CurrentLat = @lat,
          CurrentLng = @lng,
          Speed = @speed,
          LastUpdated = GETDATE()
      WHERE BusNo = @busNo;

      SELECT TOP 1 Id, Username, BusNo, BusName, DestinationName, DestinationLat, DestinationLng, SchoolLat, SchoolLng
      FROM dbo.Buses WHERE BusNo = @busNo;
      `,
      {
        busNo: effectiveBusNo,
        lat: Number(lat),
        lng: Number(lng),
        speed: Number(speed || 0)
      }
    );

    const bus = updateResult.recordset?.[0];
    if (!bus) {
      return res.status(404).json({ success: false, error: 'Bus not found' });
    }

    // Best-effort: also store a location history row.
    // This should not break live tracking if the history insert fails.
    try {
      const speedNum = Number(speed || 0) || 0;
      // LocationHistory schema in this project uses Username + RecordedAt (see backend/create_table.sql).
      // Keep fallbacks for older schema variants so live tracking never breaks.
      try {
        await executeQuery(
          `
          INSERT INTO dbo.LocationHistory (Username, latitude, longitude, speed, RecordedAt)
          VALUES (@username, @lat, @lng, @speed, GETUTCDATE());
          `,
          {
            username: bus.Username,
            lat: Number(lat),
            lng: Number(lng),
            speed: speedNum
          }
        );
        console.log('[updateBusLocation] LocationHistory inserted', { username: bus.Username });
      } catch (historyError2) {
        // Fallback variant: BusNo + Timestamp (older schema)
        await executeQuery(
          `
          INSERT INTO dbo.LocationHistory (BusNo, Latitude, Longitude, Speed, Timestamp)
          VALUES (@busNo, @lat, @lng, @speed, GETUTCDATE());
          `,
          {
            busNo: bus.BusNo,
            lat: Number(lat),
            lng: Number(lng),
            speed: speedNum
          }
        );
        console.log('[updateBusLocation] LocationHistory inserted (fallback BusNo)', { busNo: bus.BusNo });
      }
    } catch (historyError) {
      console.error('[updateBusLocation] LocationHistory insert failed:', historyError?.message || historyError);
    }

    const distanceInfo = buildDistanceInfo({
      ...bus,
      CurrentLat: Number(lat),
      CurrentLng: Number(lng),
      Speed: Number(speed || 0)
    });

    const payload = {
      busNo: bus.BusNo,
      fleetNo: getFleetNo(bus.Username),
      username: bus.Username,
      registration: bus.BusNo,
      busName: bus.BusName,
      lat: Number(lat),
      lng: Number(lng),
      speed: Number(speed || 0),
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
      BEGIN TRY
        SELECT TOP 25 Latitude, Longitude, Speed, Timestamp AS RecordedAt
        FROM dbo.LocationHistory
        WHERE BusNo = @busNo
        ORDER BY Timestamp DESC;
      END TRY
      BEGIN CATCH
        SELECT TOP 25 latitude AS Latitude, longitude AS Longitude, speed AS Speed, RecordedAt
        FROM dbo.LocationHistory
        WHERE Username = @username
        ORDER BY RecordedAt DESC;
      END CATCH
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
    const busNo = String(req.user?.busNo || '');
    if (!busNo) return res.status(400).json({ success: false, error: 'busNo missing in token' });

    await executeQuery(
      `
      UPDATE dbo.Buses
      SET LastUpdated = DATEADD(HOUR, -2, GETDATE())
      WHERE BusNo = @busNo
      `,
      { busNo }
    );
    return res.json({ success: true, message: 'Bus disconnected' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

