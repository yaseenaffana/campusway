/**
 * Error Handling & Recovery Utilities
 * Comprehensive error handling for production reliability
 */

import React, { Component, ReactNode } from 'react';

export interface ErrorResponse {
  code: string;
  message: string;
  details?: string;
  timestamp: string;
  retryable: boolean;
}

/**
 * Connection Error Handler
 */
export class ConnectionError extends Error {
  retryable = true;
  code = 'CONNECTION_ERROR';

  constructor(message: string, public details?: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}

/**
 * Authentication Error Handler
 */
export class AuthenticationError extends Error {
  retryable = false;
  code = 'AUTH_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * WebSocket Error Handler
 */
export class WebSocketError extends Error {
  retryable = true;
  code = 'WEBSOCKET_ERROR';

  constructor(message: string, public details?: string) {
    super(message);
    this.name = 'WebSocketError';
  }
}

/**
 * GPS Error Handler
 */
export class GPSError extends Error {
  retryable = true;
  code = 'GPS_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'GPSError';
  }
}

/**
 * Create error response
 */
export function createErrorResponse(error: any): ErrorResponse {
  let code = 'UNKNOWN_ERROR';
  let message = 'An unexpected error occurred';
  let retryable = false;
  let details: string | undefined;

  if (error instanceof ConnectionError) {
    code = 'CONNECTION_ERROR';
    message = error.message;
    details = error.details;
    retryable = true;
  } else if (error instanceof AuthenticationError) {
    code = 'AUTH_ERROR';
    message = error.message;
    retryable = false;
  } else if (error instanceof WebSocketError) {
    code = 'WEBSOCKET_ERROR';
    message = error.message;
    details = error.details;
    retryable = true;
  } else if (error instanceof GPSError) {
    code = 'GPS_ERROR';
    message = error.message;
    retryable = true;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return {
    code,
    message,
    details,
    timestamp: new Date().toISOString(),
    retryable,
  };
}

/**
 * Global error handler for React
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('React Error Boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const errorResponse = createErrorResponse(this.state.error);
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>{errorResponse.message}</p>
          {errorResponse.details && <p className="details">{errorResponse.details}</p>}
          {errorResponse.retryable && (
            <button onClick={() => window.location.reload()}>Retry</button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Async operation with retry
 */
export async function retryAsync<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt); // Exponential backoff
        console.log(`[RETRY] Attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Connection retry helper
 */
export async function connectWithRetry(
  connectFn: () => Promise<void>,
  maxRetries = 5
): Promise<void> {
  return retryAsync(connectFn, maxRetries, 1000);
}

/**
 * Handle API errors
 */
export function handleApiError(response: any): ErrorResponse {
  if (!response.success) {
    return createErrorResponse({
      message: response.error || 'API request failed',
      details: response.details,
    });
  }

  return {
    code: 'OK',
    message: 'Success',
    timestamp: new Date().toISOString(),
    retryable: false,
  };
}

/**
 * Handle network errors
 */
export function isNetworkError(error: any): boolean {
  if (error instanceof ConnectionError) return true;
  if (error instanceof WebSocketError) return true;
  if (error instanceof TypeError && error.message === 'Failed to fetch') return true;

  return false;
}

/**
 * Safe localStorage operations
 */
export const SafeStorage = {
  setItem(key: string, value: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('[STORAGE] Failed to set item:', key);
    }
  },

  getItem<T>(key: string, defaultValue?: T): T | null {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultValue || null;
    } catch (e) {
      console.error('[STORAGE] Failed to get item:', key);
      return defaultValue || null;
    }
  },

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error('[STORAGE] Failed to remove item:', key);
    }
  },

  clear(): void {
    try {
      localStorage.clear();
    } catch (e) {
      console.error('[STORAGE] Failed to clear storage');
    }
  },
};

/**
 * Request wrapper with error handling
 */
export async function safeRequest<T>(
  fn: () => Promise<T>,
  errorHandler?: (error: any) => void
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error('[REQUEST] Failed:', error);

    if (errorHandler) {
      const errorResponse = createErrorResponse(error);
      errorHandler(errorResponse);
    }

    return null;
  }
}

/**
 * Log tracking
 */
export const Logger = {
  info(context: string, message: string, data?: any): void {
    console.log(`[${context}] ${message}`, data || '');
  },

  warn(context: string, message: string, data?: any): void {
    console.warn(`[${context}] ⚠️ ${message}`, data || '');
  },

  error(context: string, message: string, error?: any): void {
    console.error(`[${context}] ❌ ${message}`, error || '');
  },

  debug(context: string, message: string, data?: any): void {
    if (import.meta.env.VITE_DEBUG_MODE) {
      console.debug(`[${context}] 🐛 ${message}`, data || '');
    }
  },
};
