/**
 * API Service Client
 * Handles all HTTP requests with error handling and retry logic
 */

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    delayMs: 1000,
    backoffMultiplier: 2,
  };

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  /**
   * Get authentication token
   */
  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  /**
   * Clear authentication
   */
  clearToken(): void {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  /**
   * Build headers with auth
   */
  private getHeaders(custom: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...custom,
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    attempt = 0
  ): Promise<Response> {
    try {
      const response = await fetch(url, options);

      // Don't retry on 4xx errors (client errors)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry on 5xx and network errors
      if (!response.ok && attempt < this.retryConfig.maxRetries) {
        const delayMs = this.retryConfig.delayMs * Math.pow(
          this.retryConfig.backoffMultiplier,
          attempt
        );

        console.warn(
          `[API] Retry ${attempt + 1}/${this.retryConfig.maxRetries} after ${delayMs}ms`
        );

        await this.sleep(delayMs);
        return this.fetchWithRetry(url, options, attempt + 1);
      }

      return response;
    } catch (error) {
      // Network error - retry
      if (attempt < this.retryConfig.maxRetries) {
        const delayMs = this.retryConfig.delayMs * Math.pow(
          this.retryConfig.backoffMultiplier,
          attempt
        );

        console.warn(
          `[API] Network error, retry ${attempt + 1}/${this.retryConfig.maxRetries} after ${delayMs}ms`
        );

        await this.sleep(delayMs);
        return this.fetchWithRetry(url, options, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Generic request handler
   */
  private async request<T = any>(
    method: string,
    endpoint: string,
    body?: any,
    customHeaders?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const headers = this.getHeaders(customHeaders);

      const options: RequestInit = {
        method,
        headers,
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await this.fetchWithRetry(url, options);

      // Handle empty response
      if (response.status === 204) {
        return { success: true, data: null };
      }

      // Parse response
      let data: any;
      try {
        data = await response.json();
      } catch {
        data = await response.text();
      }

      // Check response status
      if (!response.ok) {
        console.error(`[API] Error ${response.status}:`, data);

        return {
          success: false,
          error: data?.error || `HTTP ${response.status}`,
          details: data?.details || response.statusText,
        };
      }

      return data || { success: true, data: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[API] Request failed:', message);

      return {
        success: false,
        error: 'Request failed',
        details: message,
      };
    }
  }

  /**
   * GET request
   */
  async get<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', endpoint);
  }

  /**
   * POST request
   */
  async post<T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>('POST', endpoint, body);
  }

  /**
   * PUT request
   */
  async put<T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', endpoint, body);
  }

  /**
   * DELETE request
   */
  async delete<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', endpoint);
  }

  /**
   * API: Get all buses
   */
  async getAllBuses(): Promise<ApiResponse> {
    return this.get('/api/buses');
  }

  /**
   * API: Get specific bus
   */
  async getBus(busNo: string | number): Promise<ApiResponse> {
    return this.get(`/api/buses/${busNo}`);
  }

  /**
   * API: Get live buses
   */
  async getLiveBuses(): Promise<ApiResponse> {
    return this.get('/api/buses/live');
  }

  /**
   * API: Login driver
   */
  async loginDriver(
    license_number: string,
    password: string
  ): Promise<ApiResponse> {
    const response = await this.post('/api/login', {
      license_number,
      password,
    });

    if (response.success && response.data?.token) {
      this.setToken(response.data.token);
    }

    return response;
  }

  /**
   * API: Update location
   */
  async updateLocation(
    latitude: number,
    longitude: number,
    speed?: number,
    accuracy?: number
  ): Promise<ApiResponse> {
    return this.post('/api/bus/update-location', {
      latitude,
      longitude,
      speed,
      accuracy,
    });
  }

  /**
   * API: Disconnect
   */
  async disconnect(): Promise<ApiResponse> {
    return this.post('/api/bus/disconnect');
  }

  /**
   * API: Get admin buses
   */
  async getAdminBuses(): Promise<ApiResponse> {
    return this.get('/api/admin/buses');
  }

  /**
   * API: Get statistics
   */
  async getStats(): Promise<ApiResponse> {
    return this.get('/api/stats/buses');
  }
}

// Export singleton
let apiClientInstance: ApiClient | null = null;

export function initializeApiClient(baseUrl: string): ApiClient {
  apiClientInstance = new ApiClient(baseUrl);
  return apiClientInstance;
}

export function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    throw new Error('API client not initialized. Call initializeApiClient first.');
  }
  return apiClientInstance;
}

export default ApiClient;
