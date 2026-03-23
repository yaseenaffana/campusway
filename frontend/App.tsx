import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { UserRole, Bus, Location, AttendanceRecord, DriverProfile } from './types';
import { buseService } from './services/busService';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { googleMapsService } from './services/googleMapsService';
import { getSmartETA, getRouteAssistant, getTrafficAnalysis } from './services/geminiService';
import { isBusActive } from './services/locationUtils';
import MapComponent from './components/MapComponent';
import AttendanceModule from './components/AttendanceModule';
import { requestBatteryOptimization, showBrandSpecificInstructions } from './components/BackgroundOptimizationPrompts';
import { checkinDriver, startTrip, endTrip } from './services/api';
import DriverLogin from './components/DriverLogin';
import StudentBusList, { StudentBusCard } from './components/StudentBusList';
import StudentTrackingPage from './components/StudentTrackingPage';
import collegeLogo from './school_logo.jpg';


// Register Native Plugins
const BackgroundGPS = registerPlugin<any>('BackgroundGPS');


const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isDriverManagementOpen, setIsDriverManagementOpen] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [studentLocation, setStudentLocation] = useState<Location | null>(null);
  const samplesRef = useRef<{ student: Location[]; driver: Location[] }>({ student: [], driver: [] });
  const [eta, setEta] = useState<number | null>(null);
  const [aiMessage, setAiMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const prevDriverLocRef = useRef<{ loc: Location; ts: number } | null>(null);
  const lastBroadcastRef = useRef<number>(0);
  const lastSqlLocationWriteRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<any>(null);

  // LOGIN FIX: track the latest login attempt ID to prevent race conditions
  const loginAttemptRef = useRef<number>(0);

  // Driver login state
  const [showDriverLogin, setShowDriverLogin] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [selectedLoginBus, setSelectedLoginBus] = useState<Bus | null>(null);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [currentDriver, setCurrentDriver] = useState<DriverProfile | null>(null);
  const [loginTimestamp, setLoginTimestamp] = useState<number | null>(null);

  // Alternative route state
  const [alternativeRoute, setAlternativeRoute] = useState<{ id: number, timeSaved: number } | null>(null);

  // FEATURE 2: Back button & Disconnect confirm
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  
  // FEATURE 3: PWA Install banner
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const deferredPromptRef = useRef<any>(null);

  // Background GPS states
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'prompt' | 'limited'>('prompt');
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);

  useEffect(() => {
    // Initial fetch from SQL Server API
    buseService.getBuses().then(setBuses).catch(err => {
      console.error('Failed to load buses:', err);
    });

    // Real-time polling for all buses
    const unsubscribe = buseService.subscribeToFleetUpdates((updatedBuses) => {
      setBuses(updatedBuses);
    });

    return () => unsubscribe();
  }, []);

  // SESSION SECURITY: Listen for single fleet updates if one is selected
  useEffect(() => {
    if (role === 'STUDENT' && selectedBus && isTracking) {
      // Poll for this specific bus updates
      const interval = setInterval(async () => {
        try {
          const buses = await buseService.getBuses();
          const updated = buses.find(b => b.id === selectedBus.id);
          if (updated) {
            setSelectedBus(updated);
          }
        } catch (err) {
          console.error('Error polling bus:', err);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [selectedBus?.id, role, isTracking]);

  // SESSION SECURITY: Memory-only authentication (no auto-restore on refresh)
  useEffect(() => {
    // We intentionally do NOT read from localStorage here.
    // Every refresh returns the driver to the login screen.
    console.log('🛡️ Session security active: Memory-only mode');
  }, []);

  // SESSION SECURITY: 30-minute session expiry check
  useEffect(() => {
    if (!loginTimestamp || role !== 'DRIVER') return;

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - loginTimestamp;
      const thirtyMinutes = 30 * 60 * 1000;

      if (elapsed > thirtyMinutes) {
        console.warn('🕒 Session expired (30 mins). Logging out...');
        handleLogout();
        setToastMessage('Session expired. Please login again.');
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [loginTimestamp, role]);

  // Polling for location permissions and GPS status
  useEffect(() => {
    if (role !== 'DRIVER') return;

    const checkStatus = async () => {
      if (!Capacitor.isNativePlatform()) return;

      try {
        const perm = await Geolocation.checkPermissions();
        setLocationPermission(perm.location);

        // Check if GPS is actually on (try to get a quick position)
        try {
          await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
          });
          setGpsEnabled(true);
        } catch (e: any) {
          if (e.code === 3 || e.message?.toLowerCase().includes('location') || e.message?.toLowerCase().includes('gps')) {
            setGpsEnabled(false);
          }
        }
      } catch (err) {
        console.error('Error checking permissions:', err);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, [role]);

  const handleLogout = useCallback(async () => {
    if (role === 'DRIVER' && selectedBus) {
      // Mark offline in SQL Server before clearing state
      const busNo = parseInt(selectedBus.id.replace('bus_', ''));
      await buseService.setDriverOnline(busNo, false);
      setCurrentLocation(null);
      setIsTracking(false);
    }

    setRole(null);
    setCurrentDriver(null);
    setSelectedBus(null);
    setIsTracking(false);
    setCurrentLocation(null);
    setLoginTimestamp(null);
    prevDriverLocRef.current = null;
    setShowDriverLogin(false);
    setShowDisconnectConfirm(false);
  }, [role, selectedBus]);

  // Back button and exit logic
  const backPressTime = useRef<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let backListener: any;
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App: CapApp }) => {
        backListener = CapApp.addListener('backButton', () => {
          // 1. If map is open, let StudentTrackingPage handle it
          if (selectedBus) return;

          // 2. Clear other states if open
          if (role) {
            setRole(null);
            return;
          }

          // 3. Home Screen -> Exit safety
          const now = Date.now();
          if (now - backPressTime.current < 2000) {
            CapApp.exitApp();
          } else {
            backPressTime.current = now;
            setToastMessage('Press back again to exit');
            setTimeout(() => setToastMessage(null), 2000);
          }
        });
      });
    }
    return () => {
      if (backListener) backListener.then((l: any) => l.remove());
    };
  }, [role, selectedBus]);

  // FEATURE 2: Handle hardware back button and modal states
  useEffect(() => {
    // Push state so back button is interceptable
    window.history.pushState(null, '', window.location.href);

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();

      if (role === 'DRIVER' && isTracking) {
        // Show confirm before leaving
        setShowDisconnectConfirm(true);
        // Push state again to prevent navigation
        window.history.pushState(null, '', window.location.href);
      } else if (role === 'STUDENT' && selectedBus) {
        // Just deselect if student has a bus
        setSelectedBus(null);
        setIsTracking(false);
        window.history.pushState(null, '', window.location.href);
      } else if (showDriverLogin || role) {
        // Go back to role selection
        setRole(null);
        setShowDriverLogin(false);
        window.history.pushState(null, '', window.location.href);
      } else {
        // Actually go back if we are on the landing page
        // (This might trigger exit if Capacitor is used)
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [role, isTracking, selectedBus, showDriverLogin]);

  // FEATURE 3: Wake Lock and PART 4: Visibility Change
  useEffect(() => {
    const requestLock = async () => {
      if (isTracking && role === 'DRIVER' && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          console.log('✅ Wake Lock Active');
        } catch (err) {
          console.error('❌ Wake Lock failed:', err);
        }
      }
    };

    const handleVisibilityChange = () => {
      // Feature 3: Wake Lock for Driver
      if (document.visibilityState === 'visible' && isTracking && role === 'DRIVER') {
        requestLock();
      }
      
      // Part 4: Refresh data when app foregrounded
      if (document.visibilityState === 'visible') {
        console.log('App foregrounded - refreshing buses...');
        // Refresh map if open - dispatch event for MapComponent
        window.dispatchEvent(new Event('resize'));
      }
    };

    if (isTracking && role === 'DRIVER') {
      requestLock();
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().then(() => {
          wakeLockRef.current = null;
          console.log('🔓 Wake Lock Released');
        }).catch(() => {});
      }
    };
  }, [isTracking, role]);

  // FEATURE 3: PWA Install Prompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Sync selectedBus with buses list (for live updates) and calculate ETA
  useEffect(() => {
    if (selectedBus) {
      const updatedBus = buses.find(b => b.id === selectedBus.id);
      if (updatedBus) {
        if (JSON.stringify(updatedBus) !== JSON.stringify(selectedBus)) {
          setSelectedBus(updatedBus);
        }

        if (role === 'STUDENT' && studentLocation) {
          if (isBusActive(updatedBus)) {
            const distance = googleMapsService.calculateDistance(studentLocation, updatedBus.location!, {
              lastUpdateTs: updatedBus.updatedAt,
              driverOnline: updatedBus.status === 'online'
            });
            if (distance !== null) {
              const currentEta = googleMapsService.estimateETA(distance);
              setEta(currentEta);
            }
          } else {
            setEta(null);
            setAiMessage("This bus is currently offline. Tracking will resume once the driver is back online.");
          }
        }
      }
    }
  }, [buses, selectedBus?.id, role, studentLocation]);

  useEffect(() => {
    if (role === 'STUDENT') {
      console.log('🎓 Student mode - Passive monitoring only (No GPS usage)');
      setStudentLocation(null);
      return;
    }
  }, [role]);

  // Listen for manual override (map click calibration)
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail;
      if (!detail) return;
      const corrected: Location = {
        lat: Number(detail.lat),
        lng: Number(detail.lng),
        timestamp: Date.now(),
        accuracy: 5,
      };
      console.log('Manual location override received:', corrected);
      if (role === 'STUDENT') {
        setStudentLocation(corrected);
      }
      if (role === 'DRIVER' && selectedBus) {
        setCurrentLocation(corrected);
        const busNo = parseInt(selectedBus.id.replace('bus_', ''));
        buseService.updateBusLocation(busNo, corrected);
      }
    };

    window.addEventListener('override-location', handler as EventListener);
    return () => window.removeEventListener('override-location', handler as EventListener);
  }, [role, selectedBus]);

  // Driver location watch and traffic checking
  useEffect(() => {
    let trafficInterval: number;

    if (isTracking && role === 'DRIVER' && selectedBus) {
      // FIX 21: Strictly prevent duplicate watchers
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      console.log('🚌 Driver mode - Starting hyper-fast GPS broadcast for bus', selectedBus.busNumber);

      let lastLat = 0;
      let lastLng = 0;

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;

          // Only update if moved more than 3 meters
          const distMoved = googleMapsService.calculateDistance(
             { lat: lastLat, lng: lastLng, timestamp: 0, accuracy: 0 },
             { lat, lng, timestamp: 0, accuracy: 0 }
          );

          if (distMoved !== null && distMoved < 3) return; // skip if not moved > 3m

          lastLat = lat;
          lastLng = lng;

          const loc: Location = {
            lat,
            lng,
            timestamp: Date.now(),
            speed: pos.coords.speed || 0,
            accuracy: pos.coords.accuracy ?? 50,
          };
          
          console.log('📍 Driver GPS:', {
            bus: selectedBus.busNumber,
            lat: lat.toFixed(6),
            lng: lng.toFixed(6),
            accuracy: loc.accuracy,
            speed_m_s: loc.speed
          });

          setCurrentLocation(loc);

          // Update SQL Server Location with 1-second manual throttle
          const now = Date.now();
          if (now - lastBroadcastRef.current >= 1000) {
            const busNo = parseInt(selectedBus.id.replace('bus_', ''));
            buseService.updateBusLocation(busNo, loc);
            lastBroadcastRef.current = now;
          }
        },
        (err) => {
          console.error('🚌 Driver location error:', err);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );

      // Periodically check traffic
      trafficInterval = window.setInterval(async () => {
        if (currentLocation) {
          const analysis = await getTrafficAnalysis(currentLocation);
          if (analysis.fasterRouteAvailable) {
            setAlternativeRoute({ id: analysis.routeId, timeSaved: analysis.timeSaved });
          } else {
            setAlternativeRoute(null);
          }
        }
      }, 30000);
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (trafficInterval) clearInterval(trafficInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTracking, role, selectedBus?.id]);

  const handleAttendanceSuccess = (photoUrl: string, loc: Location) => {
    if (!selectedBus) {
      console.error('❌ Check-in failed: No bus selected');
      return;
    }

    console.log('✅ Check-in successful!');
    console.log('📸 Photo captured:', photoUrl.substring(0, 50) + '...');
    console.log('📍 Location:', loc);
    console.log('🚌 Bus:', selectedBus.busNumber);

    const record: AttendanceRecord = {
      id: Math.random().toString(36).substr(2, 9),
      driverId: 'driver-123',
      busId: selectedBus.id,
      timestamp: new Date().toISOString(),
      location: loc,
      photoUrl
    };

    // Log attendance (Firebase removed - use SQL if needed)
    console.log('📝 Attendance record:', record);

    setIsAttendanceOpen(false);
    console.log('🚀 Starting location tracking...');

    setIsTracking(true);
    setCurrentLocation(loc);
    const busNo = parseInt(selectedBus.id.replace('bus_', ''));
    buseService.updateBusLocation(busNo, loc);

    console.log('✨ Driver is now LIVE and broadcasting location');

    // Send check-in to server (MSSQL API)
    checkinDriver(selectedBus.driverName || 'Sivabalan', selectedBus.busNumber || '21', {
      lat: loc.lat,
      lng: loc.lng,
      accuracy: loc.accuracy || 0,
      speed: loc.speed ?? null,
      heading: null
    });
    lastSqlLocationWriteRef.current = Date.now();
  };

  const handleStartBroadcasting = async (targetBus?: Bus) => {
    const bus = targetBus || selectedBus;
    if (!bus) {
      console.error('❌ No bus selected');
      return;
    }

    console.log('🚀 Starting broadcast directly for bus:', bus.busNumber);

    // FIX 17: Immediate UI switch and SQL Server status update
    setIsTracking(true);
    const busNo = parseInt(bus.id.replace('bus_', ''));
    await buseService.setDriverOnline(busNo, true);

    // PWA Background GPS Strategy
    try {
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }
    } catch (e) {
      console.log('Storage persist not supported or denied', e);
    }

    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (e) {
      console.log('Wake lock not supported or denied', e);
    }

    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification('MZSJS BUZZ GPS Active', {
            body: 'Your location is being shared. Keep this tab open.',
            icon: '/icon-192.png',
            requireInteraction: true
          });
        }
      });
    }

    console.log('🚀 Starting Persistent Native GPS for bus:', bus.busNumber);

    try {
      if (Capacitor.isNativePlatform()) {
        // 1. Check & Request Location Permissions
        const permStatus = await BackgroundGPS.checkPermissions();
        if (permStatus.location !== 'granted') {
           const request = await BackgroundGPS.requestPermissions();
           if (request.location !== 'granted') {
             setLoginError('Background Location permission is mandatory');
             return;
           }
        }

        // 2. Check if GPS is enabled
        const gpsStatus = await BackgroundGPS.isGPSEnabled();
        if (!gpsStatus.enabled) {
          alert('Please turn on GPS/Location in your system settings');
          await BackgroundGPS.openLocationSettings();
          return;
        }

        // 3. Request Battery Optimization (Unrestricted)
        await BackgroundGPS.requestBatteryOptimization();

        // 4. Show Brand-Specific Guide if first time
        await showBrandSpecificInstructions();

        // 5. Start the Native Foreground Service
        await BackgroundGPS.startService({ busId: bus.id });
        console.log('✅ Native Background GPS service STARTED');
      }
      
      // Update UI state and SQL Server status
      setIsTracking(true);
      const busNo = parseInt(bus.id.replace('bus_', ''));
      await buseService.setDriverOnline(busNo, true);
      
    } catch (e) {
      console.error('❌ Failed to start Native GPS:', e);
      setToastMessage('Failed to start GPS service');
    }
  };


  const handleDriverLogout = useCallback(async () => {
    if (selectedBus) {
      const busNo = parseInt(selectedBus.id.replace('bus_', ''));
      await buseService.setDriverOnline(busNo, false);

      // Stop native background service if on Android
      if (Capacitor.isNativePlatform()) {
        await BackgroundGPS.stopService().catch((err: any) =>
          console.error('Failed to stop Background GPS service', err)
        );
      }
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (heartbeatRef.current !== null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (wakeLockRef.current !== null) {
      wakeLockRef.current.release().catch(console.error);
      wakeLockRef.current = null;
    }
    setIsTracking(false);
    setSelectedBus(null);
    setShowDisconnectConfirm(false);
    setRole(null);

    // Trip end (on disconnect)
    const tripId = localStorage.getItem('currentTripId');
    if (tripId) {
      endTrip(tripId).then(() => {
        localStorage.removeItem('currentTripId');
        console.log('✅ Trip ended:', tripId);
      });
    }
  }, [selectedBus]);



  const handleStudentSelectBus = useCallback(async (bus: Bus) => {
    console.log('🚌 Student selected bus:', bus.busNumber);
    setSelectedBus(bus);
    setIsTracking(true); // Ensure tracking view is enabled
    setIsChatOpen(false);
    setIsLoading(true);

    if (bus.status === 'MAINTENANCE') {
      setEta(null);
      setAiMessage(`Vehicle ${bus.busNumber} is currently in maintenance. Please check for a replacement bus or contact administration.`);
    } else {
      // If bus is online, use Gemini for smart ETA or fallback to distance calc
      try {
        const distance = googleMapsService.calculateDistance(studentLocation, bus.location!, {
          lastUpdateTs: bus.updatedAt,
          driverOnline: bus.status === 'online'
        });

        let newEta: number | null = null;
        let msg = "";

        if (distance !== null) {
          try {
            // Try Gemini for smart ETA
            newEta = await getSmartETA(bus.location!, bus.route);
            msg = await getRouteAssistant(bus.busNumber, bus.status);
          } catch (geminiError) {
            console.warn("⚠️ Gemini API Error - Falling back to manual calculation:", geminiError);
            newEta = googleMapsService.estimateETA(distance);
            msg = "Live tracking activated. ETA calculated via distance fallback.";
          }

          setEta(newEta);
          const dStr = googleMapsService.formatDistance(distance);
          const distanceText = dStr !== '--' ? ` (${dStr} away)` : '';
          setAiMessage(msg + distanceText);
        } else {
          setEta(null);
          setAiMessage("Live tracking activated. Awaiting real-time updates.");
        }
      } catch (error) {
        console.error("Selection logic error:", error);
        setEta(null);
        setAiMessage("Live tracking activated. Awaiting real-time updates.");
      }
    }
    setIsLoading(false);
  }, [studentLocation, buses]);
  const handleAcceptReroute = () => {
    setAlternativeRoute(null);
    setAiMessage("Route updated! Navigating through the faster alternative.");
  };

  const handleDriverLogin = async () => {
    if (!selectedLoginBus) {
      setLoginError('Please select a bus first');
      return;
    }

    const busId = selectedLoginBus.id; // e.g., "bus_16"
    const pass = password.trim();

    console.log("🛠️ Login Process Started");
    console.log("🔹 Selected Bus:", selectedLoginBus.busNumber);
    console.log("🔹 Using busId:", busId);

    if (!pass) {
      setLoginError('Please enter your password');
      return;
    }

    if (isLoading) return; // Block concurrent clicks

    const currentAttemptId = ++loginAttemptRef.current;
    setLoginError('');
    setIsLoading(true);

    try {
      const busNo = Number(selectedLoginBus.busNumber || selectedLoginBus.id.replace('bus_', ''));
      const result = await buseService.validateDriverLogin(busNo, pass);

      if (currentAttemptId !== loginAttemptRef.current) return;

      if (result?.ok || result?.success) {
        console.log("✅ Authenticated successfully for bus:", busId);
        
        const dummyDriver: DriverProfile = {
          uid: busId,
          busId: busId,
          username: busId,
          mustChangePassword: result.isDefault || false
        };

        setCurrentDriver(dummyDriver);

        if (result.isDefault) {
           console.log("→ Show change password screen");
           setShowPasswordChange(true);
           // We do not set role to DRIVER yet or start broadcasting.
           // They must finish the reset password flow first.
        } else {
           console.log("→ Start GPS sharing");
           setLoginTimestamp(Date.now());
           setRole('DRIVER');
           setSelectedBus(selectedLoginBus); // Fix bus number display
           setShowDriverLogin(false);
           handleStartBroadcasting(selectedLoginBus);
        }

        // SQL Trip Start
        startTrip(selectedLoginBus.busNumber, selectedLoginBus.driverName).then(tripResult => {
          if (tripResult.success) {
            localStorage.setItem('currentTripId', tripResult.tripId);
            console.log('✅ Trip started:', tripResult.tripId);
          }
        });

        setSelectedLoginBus(null);
        setPassword('');
      } else {
        switch (result.reason) {
          case 'NOT_FOUND':
            setLoginError('Bus profile not found. Contact admin.');
            break;
          case 'WRONG_PASSWORD':
            setLoginError('Invalid PIN.');
            break;
          case 'NETWORK':
            setLoginError('Network issue. Please try again.');
            break;
          default:
            setLoginError(result?.error || 'Authentication failed. Please try again.');
        }
      }
    } catch (error) {
      if (currentAttemptId === loginAttemptRef.current) {
        setLoginError('Network issue. Please try again.');
      }
    } finally {
      if (currentAttemptId === loginAttemptRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handlePasswordUpdate = async () => {
    // Debug logs as requested
    console.log("=== PASSWORD UPDATE ===");
    console.log("currentDriver:", currentDriver);
    console.log("newPassword length:", newPassword.length);
    
    if (newPassword.length < 6) {
      setLoginError('PIN must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setLoginError('PINs do not match!');
      return;
    }
    if (newPassword === '123456') {
      setLoginError('Cannot use default password!');
      return;
    }

    if (!currentDriver?.busId) {
      alert("Bus connection lost! ID missing!");
      return;
    }

    try {
      setIsLoading(true);
      const busNo = parseInt(currentDriver.busId.replace('bus_', ''));
      console.log("Attempting SQL Server write to:", `bus ${busNo}/password`);
      
      await buseService.updateDriverPassword(busNo, newPassword);
      
      console.log("✅ Password updated successfully!");
      alert("Password updated! ✅");

      setLoginTimestamp(Date.now());
      setRole('DRIVER');
      setShowPasswordChange(false);
      setShowDriverLogin(false);

      // Now grab the bus definition directly from state or the parent bus reference
      const bus = buses.find(b => b.id === currentDriver.busId);
      if (bus) {
        setSelectedBus(bus); // Ensure bus is set after password update
        handleStartBroadcasting(bus);

        // SQL Trip Start after password update
        startTrip(bus.busNumber, bus.driverName).then(tripResult => {
           if (tripResult.success) {
             localStorage.setItem('currentTripId', tripResult.tripId);
             console.log('✅ Trip started:', tripResult.tripId);
           }
        });
      }
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error("❌ SQL Server update error:", err);
      setLoginError('Failed to save new password: ' + (err.message || 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (bus: Bus) => {
    if (isBusActive(bus)) {
      return <span className="text-[9px] font-black px-2 py-0.5 bg-green-100 text-green-700 rounded-full border border-green-200">LIVE</span>;
    }
    if (bus.status === 'MAINTENANCE') {
      return <span className="text-[9px] font-black px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200">SERVICE</span>;
    }
    return <span className="text-[9px] font-black px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full border border-slate-200">OFFLINE</span>;
  };

  // Utility: compute weighted average of last samples (weights inverse to accuracy)
  const averageLocations = (samples: Location[]): Location => {
    if (!samples || samples.length === 0) return { lat: 0, lng: 0, timestamp: Date.now(), speed: null };
    // If any sample lacks accuracy, perform simple average
    const allHaveAccuracy = samples.every(s => s.accuracy != null && !isNaN(Number(s.accuracy)));
    let lat = 0;
    let lng = 0;
    let timestamp = samples[samples.length - 1].timestamp || Date.now();
    let speed = samples[samples.length - 1].speed ?? null;

    if (allHaveAccuracy) {
      let weightSum = 0;
      for (const s of samples) {
        const acc = Number(s.accuracy ?? 1000);
        const w = 1 / (acc + 1); // better accuracy => larger weight
        lat += s.lat * w;
        lng += s.lng * w;
        weightSum += w;
      }
      lat /= weightSum;
      lng /= weightSum;
    } else {
      // fallback: arithmetic mean
      for (const s of samples) {
        lat += s.lat;
        lng += s.lng;
      }
      lat /= samples.length;
      lng /= samples.length;
    }

    return { lat, lng, timestamp, speed };
  };

  if (!role) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-[420px] w-full flex flex-col space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {!showDriverLogin ? (
            <>
              <div className="text-center">
                <div className="mb-8 flex justify-center">
                  <div className="h-28 w-28 flex items-center justify-center active:scale-95 transition-all">
                    <img src={collegeLogo} alt="College Logo" className="w-full h-full object-contain" />
                  </div>
                </div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tighter mb-1 uppercase">
                  MZSJS <span className="text-indigo-500">BUZZ</span>
                </h1>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-8">Bus Tracking System</p>
              </div>

              <div className="space-y-4">
                <button
                  onClick={() => {
                    // FIX 6: (B) Clear old session/state when opening Driver Portal
                    localStorage.removeItem("driverUid");
                    localStorage.removeItem("driverBusId");
                    setCurrentDriver(null);
                    setShowDriverLogin(true);
                  }}
                  className="group w-full flex items-center p-5 bg-white rounded-[2rem] border-2 border-slate-100 hover:border-indigo-600 shadow-sm active:scale-[0.98] transition-all text-left"
                >
                  <div className="flex-shrink-0 w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Fleet Access</p>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Driver Portal</h2>
                  </div>
                  <div className="ml-auto opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                  </div>
                </button>

                <button
                  onClick={() => setRole('STUDENT')}
                  className="group w-full flex items-center p-5 bg-white rounded-[2rem] border-2 border-slate-100 hover:border-indigo-600 shadow-sm active:scale-[0.98] transition-all text-left"
                >
                  <div className="flex-shrink-0 w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Live Tracking</p>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Student Portal</h2>
                  </div>
                  <div className="ml-auto opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                  </div>
                </button>
              </div>

              {/* Install PWA Prompt */}
              {showInstallBanner && (
                <div className="mt-8 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex items-center gap-4 animate-in fade-in zoom-in duration-300">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white text-xl">📲</div>
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest leading-none mb-1">Install App</p>
                    <p className="text-xs font-bold text-slate-600">Add to home screen for real-time alerts</p>
                  </div>
                  <button 
                    onClick={() => {
                      deferredPromptRef.current?.prompt();
                      setShowInstallBanner(false);
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg"
                  >
                    Install
                  </button>
                </div>
              )}
            </>
          ) : (
             <DriverLogin 
                onDriverLogin={(session) => {
                   setLoginTimestamp(Date.now());
                   setRole('DRIVER');
                   // Ensure we always have a bus object for driver mode.
                   // `buses` may not be loaded yet at this moment, so fallback to session data.
                   const busFromList = buses.find(b => b.busNumber === session.busNo.toString());
                   const bus = busFromList ?? ({
                     id: `bus_${session.busNo}`,
                     BusNo: Number(session.busNo),
                     Registration: session.registration,
                     Route: session.route,
                     IsActive: true,
                     busNumber: String(session.busNo),
                     registrationNumber: session.registration,
                     route: session.route,
                     status: 'online',
                   } as any);
                   setSelectedBus(bus);
                   setShowDriverLogin(false);
                   handleStartBroadcasting(bus);
                }}
                onCancel={() => setShowDriverLogin(false)}
             />
          )}
        </div>
      </div>
    );
  }

  // LOGGED IN VIEW
  return (
    <div className="min-h-[100dvh] bg-white flex flex-col relative overflow-hidden select-none">
      {role === 'STUDENT' ? (
        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden relative">
          {selectedBus && isTracking ? (
            <StudentTrackingPage
              selectedBus={selectedBus}
              studentLocation={studentLocation}
              onBack={() => {
                setSelectedBus(null);
                setIsTracking(false);
              }}
              eta={eta}
              isActive={isBusActive(selectedBus)}
            />
          ) : (
            <div className="flex-1 flex flex-col p-4 space-y-4 pb-20">
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={handleLogout}
                  className="w-10 h-10 bg-white/80 backdrop-blur shadow-sm text-slate-400 rounded-2xl flex items-center justify-center active:scale-90 transition-all border border-slate-100"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                </button>
              </div>

              <div className="pt-2">
                <StudentBusList
                  buses={buses}
                  studentLocation={studentLocation}
                  onSelectBus={handleStudentSelectBus}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col relative">
           {/* Driver portal: map removed (requested). Keep a clean light background. */}
           <div className="absolute inset-0 bg-slate-50" />
           
           <div className="absolute top-[calc(env(safe-area-inset-top)+16px)] left-0 right-0 px-4 flex items-center justify-between pointer-events-none">
              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="w-11 h-11 bg-white shadow-xl rounded-2xl flex items-center justify-center text-slate-900 pointer-events-auto active:scale-95 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              
              <div className="bg-slate-900/90 backdrop-blur px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-3 border border-white/10">
                 <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                 <div className="flex flex-col">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Bus {selectedBus?.busNumber}</span>
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{selectedBus?.route} Route</span>
                 </div>
              </div>
           </div>

           <div className="absolute bottom-6 left-6 right-6 p-6 bg-white rounded-[2.5rem] shadow-2xl border border-slate-50 flex items-center gap-5">
              <div className="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center text-3xl shadow-lg shadow-indigo-100">📡</div>
              <div className="flex-1">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Broadcasting</p>
                 <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none">Live GPS Active</h3>
                 <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-widest">Every 1s</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">•</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">High Accuracy</span>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* MODALS & OVERLAYS */}
      {showDisconnectConfirm && (
         <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDisconnectConfirm(false)}></div>
            <div className="relative bg-white w-full max-w-[340px] p-8 rounded-[2.5rem] shadow-2xl text-center">
               <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6">⚠️</div>
               <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Stop Tracking?</h3>
               <p className="text-sm font-bold text-slate-400 leading-relaxed mb-8">You will stop broadcasting your location to students.</p>
               <div className="flex flex-col gap-3">
                  <button onClick={handleDriverLogout} className="w-full py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all">Yes, Disconnect</button>
                  <button onClick={() => setShowDisconnectConfirm(false)} className="w-full py-4 bg-slate-100 text-slate-900 rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all">Cancel</button>
               </div>
            </div>
         </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] px-6 py-3 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-full shadow-2xl animate-in fade-in slide-in-from-bottom-4">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default App;
