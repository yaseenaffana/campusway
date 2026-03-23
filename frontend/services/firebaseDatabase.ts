import { get, goOffline, goOnline, off, onDisconnect, onValue, push, ref, set, update } from 'firebase/database';
import { AttendanceRecord, Bus, Location } from '../types';
import { database } from './firebaseConfig';

const MASTER_PASSWORD = 'admin123'; // Personal password for all buses

// Helper to extract registration number from route
const getRegistrationFromRoute = (route: string): string => {
  return route.split(' - ')[0].trim();
};

const BUS_DATA = [
  { id: '2', busNumber: '2', route: 'TN63AJ8602 - Neivasal' },
  { id: '3', busNumber: '3', route: 'TN63AK1260 - SS.Kottai' },
  { id: '4', busNumber: '4', route: 'TN63AK1264 - Illupakudi' },
  { id: '6', busNumber: '6', route: 'TN63AJ8845 - Senjai' },
  { id: '7', busNumber: '7', route: 'TN63AL8220 - Thirupathur Pudhu Theru' },
  { id: '8', busNumber: '8', route: 'TN63AJ8903 - Singampunari' },
  { id: '9', busNumber: '9', route: 'TN63AL8156 - Spare' },
  { id: '11', busNumber: '11', route: 'TN63AL9236 - Spare' },
  { id: '12', busNumber: '12', route: 'TN63AJ8611 - Spare' },
  { id: '13', busNumber: '13', route: 'TN63AJ8570 - Spare' },
  { id: '14', busNumber: '14', route: 'TN63BA0058 - Velangudi' },
  { id: '15', busNumber: '15', route: 'TN63BA0204 - Karaikudi' },
  { id: '16', busNumber: '16', route: 'TN63BA3179 - Eriyur' },
  { id: '17', busNumber: '17', route: 'TN63BC3589 - Akilmanai,Thirupathur' },
  { id: '18', busNumber: '18', route: 'TN63BC3805 - Sembanur' },
  { id: '19', busNumber: '19', route: 'TN63BD8042 - Kotaiyur' },
  { id: '20', busNumber: '20', route: 'TN63BE0936 - Keelasevalpatti' },
  { id: '34', busNumber: '34', route: 'TN55AC5864 - Kallutimedu' },
  { id: '50', busNumber: '50', route: 'TN55BC5526 - Elanthaimangalam' }
];

const BUS_IDS = BUS_DATA.map(b => b.id);

const DEFAULT_BUSES: Bus[] = BUS_DATA.map(bus => ({
    id: bus.id,
    busNumber: bus.busNumber,
    driverName: `Driver ${bus.busNumber}`,
    route: bus.route,
    status: 'offline',
    updatedAt: Date.now()
}));

export const firebaseDatabase = {
    validateDriverLogin: async (busId: string, password: string): Promise<{ ok: boolean, reason?: 'NOT_FOUND' | 'WRONG_PASSWORD' | 'NETWORK', isDefault?: boolean }> => {
        const inputPass = String(password).trim();

        // Check master password first (admin can use this)
        if (inputPass === MASTER_PASSWORD) {
            console.log("✅ Master password accepted");
            return { ok: true, isDefault: false };
        }

        try {
            const busRef = ref(database, `buses/${busId}`);
            console.log("Checking path:", `buses/${busId}`);
            
            const snapshot = await get(busRef);

            if (!snapshot.exists()) {
                console.error("❌ Bus profile not found for id:", busId);
                return { ok: false, reason: 'NOT_FOUND' };
            }

            const busData = snapshot.val();
            
            // Get the bus registration number from the route
            const registration = getRegistrationFromRoute(busData.route || '');
            const dbPass = String(busData.password || registration || '').trim();
            const isDefault = busData.isDefaultPassword === true || dbPass === registration;

            console.log("Entered:", inputPass);
            console.log("Bus Registration:", registration);
            console.log("Stored:", busData.password ? "Custom" : "Using registration");

            // Accept either stored password or registration number
            if ((dbPass === inputPass || registration === inputPass) && inputPass !== '') {
                return { ok: true, isDefault };
            } else {
                console.log("❌ Password mismatch");
                return { ok: false, reason: 'WRONG_PASSWORD' };
            }
        } catch (error: any) {
            console.error("Login lookup failed:", error);
            return { ok: false, reason: 'NETWORK' };
        }
    },

    /**
     * SESSION SECURITY: Validate if a driver session (UID) is still valid in DB.
     * Useful for checking if an account was deleted or disabled while app is open.
     */
    validateDriverSession: async (uid: string): Promise<boolean> => {
        try {
            const snapshot = await get(ref(database, `drivers/${uid}`));
            return snapshot.exists();
        } catch (error) {
            console.error('Session validation failed:', error);
            return false;
        }
    },

    updateDriverPassword: async (busId: string, newPassword: string): Promise<void> => {
        try {
            // Update the bus record directly as expected by the fleet login system
            await update(ref(database, `buses/${busId}`), {
                password: newPassword,
                isDefaultPassword: false
            });
            console.log(`✅ Password updated for bus: ${busId}`);
        } catch (error) {
            console.error('Failed to update bus password:', error);
            throw error;
        }
    },

    /**
     * Get all buses from Firebase and sync with latest BUS_DATA
     */
    getBuses: async (): Promise<Bus[]> => {
        try {
            const snapshot = await get(ref(database, 'buses'));
            
            // Always sync all buses with latest BUS_DATA
            const busData: Record<string, any> = {};
            const now = Date.now();
            BUS_DATA.forEach(bus => {
                const key = `bus_${bus.id}`;
                const existingData = snapshot.exists() ? snapshot.val()[key] : {};
                const registration = getRegistrationFromRoute(bus.route);

                // Prevent stale "online" state from showing as live in student view
                const isStillOnline = existingData?.status === 'online' &&
                    existingData?.updatedAt &&
                    now - existingData.updatedAt < 30000; // 30s freshness

                busData[key] = {
                    id: key,
                    busNumber: bus.busNumber,
                    driverName: existingData?.driverName || `Driver ${bus.busNumber}`,
                    route: bus.route, // Always use the latest route from BUS_DATA
                    status: isStillOnline ? 'online' : 'offline',
                    location: existingData?.location || null,
                    password: existingData?.password || registration, // Use registration as default password
                    isDefaultPassword: existingData?.isDefaultPassword !== false,
                    updatedAt: isStillOnline ? existingData?.updatedAt || now : 0
                };
            });
            
            // Update Firebase with latest routes and passwords
            await set(ref(database, 'buses'), busData);
            console.log('✅ Buses synced with latest routes and passwords');
            
            const busList: Bus[] = Object.entries(busData).map(([key, val]: [string, any]) => ({
                id: key,
                busNumber: val.busNumber,
                driverName: val.driverName,
                route: val.route,
                status: val.status,
                location: val.location,
                updatedAt: val.updatedAt
            }));
            
            return busList;
        } catch (error) {
            console.error('Failed to fetch buses from Firebase:', error);
            return DEFAULT_BUSES;
        }
    },

    /**
     * FIX 12: Mark driver/bus as online or offline.
     * Sets `status` in the bus record.
     */
    setDriverOnline: async (busId: string, online: boolean): Promise<void> => {
        try {
            await update(ref(database, `buses/${busId}`), {
                status: online ? 'online' : 'offline',
                updatedAt: Date.now(),
            });
        } catch (error) {
            console.error('Failed to set driver online status:', error);
        }
    },

    /**
     * FIX 12: Register Firebase onDisconnect so that if the client drops
     * unexpectedly (network loss, app close), the bus is marked offline.
     * Call this once when driver starts broadcasting.
     */
    setupOnDisconnect: (busId: string): void => {
        const busRef = ref(database, `buses/${busId}`);
        onDisconnect(busRef).update({
            status: 'offline',
            updatedAt: Date.now(),
        });
    },

    /**
     * FIX 12: Update bus location with "Live" status logic.
     * FIX 1: Send low-latency granular object updates targeting location & status directly.
     */
    updateBusLocation: async (busId: string, location: Location): Promise<void> => {
        // Validation: Ignore invalid or zero locations
        if (!location || (location.lat === 0 && location.lng === 0) || isNaN(location.lat) || isNaN(location.lng)) {
            console.warn('⚠️ updateBusLocation - Skipped invalid coordinates:', location);
            return;
        }

        try {
            // Atomic update specifically to location nodes rather than re-sending the whole bus object structure
            await set(ref(database, `buses/${busId}/location`), location);
            // Non-blocking status push
            set(ref(database, `buses/${busId}/status`), 'online');
            set(ref(database, `buses/${busId}/updatedAt`), Date.now());
        } catch (error) {
            console.error('Failed to update bus location in Firebase:', error);
        }
    },

    /**
     * Save attendance record
     */
    saveAttendance: async (record: AttendanceRecord): Promise<void> => {
        try {
            await push(ref(database, 'attendance'), record);
        } catch (error) {
            console.error('Failed to save attendance to Firebase:', error);
        }
    },

    /**
     * FIX 2: Subscribe to real-time bus updates.
     * Passes the raw bus list including isOnline flag so callers can filter.
     */
    onBusesUpdate: (callback: (buses: Bus[]) => void): (() => void) => {
        const busesRef = ref(database, 'buses');
        const listener = onValue(busesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const busList: Bus[] = Object.entries(data).map(([key, val]: [string, any]) => {
                    const number = key.includes('_') ? key.split("_")[1] : key;
                    return {
                        id: key,
                        busNumber: val.busNumber || number,
                        registrationNumber: val.registrationNumber || '',
                        driverName: val.driverName || val.name || `Driver ${number}`,
                        route: val.route || `Campus Route ${number}`,
                        status: val.status || 'offline',
                        location: val.location,
                        updatedAt: val.updatedAt
                    };
                });
                callback(busList);
            }
        });
        return () => off(busesRef, 'value', listener);
    },

    /**
     * Force reseed all buses with latest routes from BUS_DATA
     */
    seedDefaultData: async (): Promise<void> => {
        try {
            const busData: Record<string, any> = {};

            BUS_DATA.forEach(bus => {
                const key = `bus_${bus.id}`;
                const registration = getRegistrationFromRoute(bus.route);
                busData[key] = {
                    id: key,
                    busNumber: bus.busNumber,
                    driverName: `Driver ${bus.busNumber}`,
                    route: bus.route,
                    status: 'offline',
                    password: registration, // Password is the registration number
                    isDefaultPassword: true,
                    updatedAt: Date.now()
                };
            });

            await set(ref(database, 'buses'), busData);
            console.log('✅ All buses reseeded with registration-based passwords');
        } catch (error) {
            console.error('Failed to seed default data:', error);
        }
    },

    /**
     * FIX 1: Low Latency Firebase Listener
     * Listen directly to the location node only (not whole bus) to reduce data payload.
     */
    onBusUpdate: (busId: string, callback: (bus: Partial<Bus>) => void) => {
        const locationRef = ref(database, `buses/${busId}/location`);
        
        const unsubscribe = onValue(locationRef, (snapshot) => {
            if (snapshot.exists()) {
                const location = snapshot.val();
                if (location && location.lat) {
                    // Reconstruct into bus shape solely for the MapComponent backward compatibility shim
                    callback({ id: busId, location, status: 'online', updatedAt: location.timestamp || Date.now() });
                }
            }
        });
        
        return unsubscribe;
    },

    /**
     * FIX 5: Explicitly named aliases for clarity in Student Portal
     */
    subscribeFleetsStatus: (callback: (buses: Bus[]) => void) => {
        return firebaseDatabase.onBusesUpdate(callback);
    },

    subscribeFleetLocation: (busId: string, callback: (bus: Bus) => void) => {
        return firebaseDatabase.onBusUpdate(busId, callback);
    },

    /**
     * Reconnect/Disconnect Firebase
     */
    goOnline: () => {
        goOnline(database);
    },

    goOffline: () => {
        goOffline(database);
    }
};

export const mockDatabase = firebaseDatabase;
