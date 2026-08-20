function getEnvUrl(key: 'VITE_API_URL' | 'VITE_SOCKET_URL'): string {
  const value = import.meta.env[key];
  return typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
}

const DEV_LOCAL_BACKEND_FALLBACK = 'http://localhost:4010';

function dedupe(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function getPreferredBrowserOrigin(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return import.meta.env.DEV ? window.location.origin : '';
}

export function getApiUrlCandidates(): string[] {
  const envUrl = getEnvUrl('VITE_API_URL');
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const devProxy = getPreferredBrowserOrigin();

  if (import.meta.env.DEV) {
    if (envUrl) {
      return [envUrl];
    }

    return dedupe([
      devProxy,
      browserOrigin
    ]);
  }

  return dedupe([
    devProxy,
    envUrl,
    browserOrigin
  ]);
}

export function getSocketUrlCandidates(): string[] {
  const envUrl = getEnvUrl('VITE_SOCKET_URL') || getEnvUrl('VITE_API_URL');
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  if (import.meta.env.DEV) {
    if (envUrl) {
      return [envUrl];
    }

    return dedupe([
      getPreferredBrowserOrigin(),
      browserOrigin
    ]);
  }

  return dedupe([
    getPreferredBrowserOrigin(),
    envUrl,
    browserOrigin
  ]);
}

export function getApiUrl(): string {
  if (import.meta.env.DEV) {
    return getApiUrlCandidates()[0] || DEV_LOCAL_BACKEND_FALLBACK;
  }

  const resolvedUrl = getApiUrlCandidates()[0];
  if (!resolvedUrl) {
    throw new Error('VITE_API_URL is not configured for production builds');
  }

  return resolvedUrl;
}

export function getSocketUrl(): string {
  if (import.meta.env.DEV) {
    return getSocketUrlCandidates()[0] || DEV_LOCAL_BACKEND_FALLBACK;
  }

  const resolvedUrl = getSocketUrlCandidates()[0];
  if (!resolvedUrl) {
    throw new Error('VITE_SOCKET_URL or VITE_API_URL is not configured for production builds');
  }

  return resolvedUrl;
}

export async function readJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    console.error('Invalid JSON response:', text.slice(0, 200));
    throw new Error('Server returned an invalid response');
  }
}

export async function fetchWithApiFallback(path: string, init?: RequestInit) {
  const candidates = getApiUrlCandidates();
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (const baseUrl of candidates) {
    const url = `${baseUrl}${path}`;

    try {
      const response = await fetch(url, init);

      if (response.status === 404 && candidates.length > 1) {
        lastResponse = response;
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${path}`);
}

export const API_URL = getApiUrl();

export const apiClient = {
  async login(username, password) {
    try {
      const response = await fetchWithApiFallback('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!response.ok) return null;
      return readJsonResponse(response);
    } catch (error) {
      console.error('API Login Error:', error);
      return null;
    }
  },

  async driverLogin(username: string, password: string) {
    try {
      const response = await fetchWithApiFallback('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await readJsonResponse(response);

      if (!response.ok || !data) {
        return {
          success: false,
          error: data?.error || data?.message || 'Invalid credentials'
        };
      }

      if (data.success) {
        if (data.token) {
          localStorage.setItem('authToken', data.token);
          localStorage.setItem('driver_token', data.token);
        }
        return {
          success: true,
          busDetails: {
            busNo: data.bus?.busNo || username,
            route: data.bus?.destination || 'Unknown'
          },
          token: data.token
        };
      }

      return {
        success: false,
        error: data.message || 'Invalid credentials'
      };
    } catch (error) {
      console.error('Driver Login Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed'
      };
    }
  },

  async getBuses() {
    try {
      const response = await fetchWithApiFallback('/api/buses');
      if (!response.ok) return [];
      const data = await readJsonResponse(response);
      return Array.isArray(data) ? data : (data?.buses || []);
    } catch (error) {
      console.error('API Get Buses Error:', error);
      return [];
    }
  },

  async adminLogin(username: string, password: string) {
    try {
      const response = await fetchWithApiFallback('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await readJsonResponse(response);

      if (!response.ok || !data?.success) {
        return {
          success: false,
          error: data?.error || 'Invalid admin credentials'
        };
      }

      if (data.token) {
        localStorage.setItem('admin_token', data.token);
      }

      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Admin login failed'
      };
    }
  },

  async adminLogout() {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetchWithApiFallback('/api/admin/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      await readJsonResponse(response).catch(() => null);
      localStorage.removeItem('admin_token');
      return { success: response.ok };
    } catch (error) {
      localStorage.removeItem('admin_token');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Admin logout failed'
      };
    }
  }
};

export async function checkinDriver(driverName, busNumber, location) {
  console.log(`Check-in: ${driverName} with bus ${busNumber} at`, location);
  return { success: true };
}

export async function startTrip(busNumber, destination) {
  console.log(`Starting trip for bus ${busNumber} to ${destination}`);
  return { success: true };
}

export async function endTrip(busNumber) {
  console.log(`Ending trip for bus ${busNumber}`);
  return { success: true };
}
