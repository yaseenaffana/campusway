import bcrypt from 'bcryptjs';
import { sql, executeQuery } from '../db.js';
import { signToken } from '../middleware/auth.js';

const DEFAULT_SECONDARY_PASSWORD = String(
  process.env.SECONDARY_PASSWORD_DEFAULT || (process.env.NODE_ENV === 'production' ? '' : '234567')
).trim();

const safeCompare = async (plain, hashedOrPlain) => {
  if (!hashedOrPlain) return false;
  const value = String(hashedOrPlain);
  if (value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$')) {
    return bcrypt.compare(String(plain || ''), value);
  }
  return String(plain || '') === value;
};

export const login = async (req, res) => {
  try {
    const { username, email, busNo, password, role } = req.body || {};
    const identifier = String(username || email || busNo || '').trim();
    const usernameLookup = identifier && !identifier.toLowerCase().startsWith('bus') && /^\d+$/.test(identifier)
      ? `bus${identifier}`
      : identifier;

    if (!identifier) {
      return res.status(400).json({ success: false, error: 'Username/email/busNo is required' });
    }

    // Student login: view-only access (no GPS update permissions).
    if ((role || '').toLowerCase() === 'student') {
      const token = signToken({ role: 'student', username: String(identifier) });
      return res.json({ success: true, token, role: 'student' });
    }

    const result = await executeQuery(
      `
      SELECT TOP 1 *
      FROM dbo.Buses
      WHERE Username = @id OR BusNo = @id OR Username = @usernameLookup
      `,
      { id: identifier, usernameLookup }
    );

    if (!result.recordset.length) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const bus = result.recordset[0];
    const primaryPassword = bus.PasswordHash || bus.Password || null;
    const secondaryPassword = bus.SecondPassword || DEFAULT_SECONDARY_PASSWORD || null;
    const legacyPassword = String(bus.BusNo || '').trim();
    const incomingPassword = String(password || '').trim();

    const isPrimaryMatch = await safeCompare(incomingPassword, primaryPassword);
    const isSecondaryMatch = !isPrimaryMatch && await safeCompare(incomingPassword, secondaryPassword);
    const isLegacyMatch = !isPrimaryMatch && !isSecondaryMatch && incomingPassword === legacyPassword;

    if (!isPrimaryMatch && !isSecondaryMatch && !isLegacyMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = signToken({
      role: 'driver',
      username: bus.Username,
      busNo: bus.BusNo
    });

    return res.json({
      success: true,
      token,
      role: 'driver',
      isDefault: isSecondaryMatch || isLegacyMatch,
      bus: {
        busNo: bus.BusNo,
        busName: bus.BusName,
        username: bus.Username,
        destination: bus.DestinationName,
        destinationLat: bus.DestinationLat,
        destinationLng: bus.DestinationLng,
        schoolLat: bus.SchoolLat,
        schoolLng: bus.SchoolLng
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updatePassword = async (req, res) => {
  try {
    const requestedBusNo = String(req.body?.busNo || req.user?.busNo || '').trim();
    const newPassword = String(req.body?.newPassword || '').trim();

    if (!requestedBusNo || !newPassword) {
      return res.status(400).json({ success: false, error: 'busNo and newPassword are required' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const hasPasswordHashColumnResult = await executeQuery(`
      SELECT 1 AS hasColumn
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'Buses'
        AND COLUMN_NAME = 'PasswordHash'
    `);

    const passwordColumn = hasPasswordHashColumnResult.recordset.length > 0 ? 'PasswordHash' : 'Password';

    await executeQuery(
      `
      UPDATE dbo.Buses
      SET ${passwordColumn} = @passwordHash
      WHERE BusNo = @busNo
      `,
      { passwordHash, busNo: requestedBusNo }
    );

    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

