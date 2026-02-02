/**
 * Remote Logger - Sends console logs to server for iOS debugging
 * 
 * This intercepts console.log/warn/error and sends them to /api/debug/remote-log
 * so we can see iOS Safari logs on a desktop browser in real-time.
 * 
 * Usage:
 *   import { initRemoteLogger } from '../lib/debug/remoteLogger';
 *   
 *   // In _app.js useEffect:
 *   if (isIOS) {
 *     initRemoteLogger();
 *   }
 */

// Configuration
const REMOTE_LOG_ENDPOINT = '/api/debug/remote-log';
const BATCH_INTERVAL = 1000; // Send logs every 1 second
const MAX_BATCH_SIZE = 50;   // Max logs per batch
const MAX_LOG_LENGTH = 2000; // Truncate long logs

// State
let logBuffer = [];
let batchTimer = null;
let isInitialized = false;
let deviceId = null;

// Original console methods (stored before override)
let originalConsole = {};

/**
 * Generate a unique device ID for this session
 */
function generateDeviceId() {
  // Try to get from sessionStorage for consistency within a session
  if (typeof sessionStorage !== 'undefined') {
    const stored = sessionStorage.getItem('remoteLogDeviceId');
    if (stored) return stored;
  }
  
  // Generate new ID based on platform and random string
  const platform = detectPlatform();
  const random = Math.random().toString(36).substring(2, 8);
  const id = `${platform}-${random}`;
  
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('remoteLogDeviceId', id);
  }
  
  return id;
}

/**
 * Detect platform for device ID prefix
 */
function detectPlatform() {
  if (typeof navigator === 'undefined') return 'unknown';
  
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) {
    if (/CriOS/.test(ua)) return 'ios-chrome';
    if (/FxiOS/.test(ua)) return 'ios-firefox';
    return 'ios-safari';
  }
  if (/Android/.test(ua)) {
    if (/Chrome/.test(ua)) return 'android-chrome';
    return 'android';
  }
  if (/Mac/.test(ua)) return 'mac';
  if (/Win/.test(ua)) return 'win';
  return 'other';
}

/**
 * Format log arguments into a string
 */
function formatLogArgs(args) {
  return args.map(arg => {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 0);
      } catch (e) {
        return '[Object - circular or unserializable]';
      }
    }
    return String(arg);
  }).join(' ');
}

/**
 * Add a log entry to the buffer
 */
function bufferLog(level, args) {
  const timestamp = new Date().toISOString();
  const message = formatLogArgs(Array.from(args));
  
  // Truncate very long messages
  const truncated = message.length > MAX_LOG_LENGTH 
    ? message.substring(0, MAX_LOG_LENGTH) + '... [truncated]'
    : message;
  
  const entry = `[${level.toUpperCase()}] ${truncated}`;
  
  logBuffer.push(entry);
  
  // Prevent buffer from growing too large
  if (logBuffer.length > MAX_BATCH_SIZE * 2) {
    logBuffer = logBuffer.slice(-MAX_BATCH_SIZE);
  }
}

/**
 * Send buffered logs to the server
 */
async function flushLogs() {
  if (logBuffer.length === 0) return;
  
  // Grab current logs and clear buffer
  const logsToSend = logBuffer.slice(0, MAX_BATCH_SIZE);
  logBuffer = logBuffer.slice(MAX_BATCH_SIZE);
  
  try {
    const response = await fetch(REMOTE_LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        logs: logsToSend,
        deviceId: deviceId,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
      })
    });
    
    if (!response.ok) {
      // Use original console to avoid recursion
      originalConsole.warn?.('[RemoteLogger] Failed to send logs:', response.status);
    }
  } catch (error) {
    // Silently fail - don't spam console with network errors
    // Use original console if needed for debugging the logger itself
    // originalConsole.warn?.('[RemoteLogger] Network error:', error.message);
  }
}

/**
 * Start the batch timer
 */
function startBatchTimer() {
  if (batchTimer) return;
  
  batchTimer = setInterval(() => {
    flushLogs();
  }, BATCH_INTERVAL);
}

/**
 * Stop the batch timer
 */
function stopBatchTimer() {
  if (batchTimer) {
    clearInterval(batchTimer);
    batchTimer = null;
  }
}

/**
 * Create a wrapped console method
 */
function createWrappedMethod(level) {
  return function(...args) {
    // Always call the original method first
    if (originalConsole[level]) {
      originalConsole[level].apply(console, args);
    }
    
    // Buffer for remote logging
    bufferLog(level, args);
  };
}

/**
 * Initialize remote logging
 * Call this once on app startup (only on iOS for debugging)
 */
export function initRemoteLogger(options = {}) {
  if (typeof window === 'undefined') return;
  if (isInitialized) return;
  
  // Generate device ID
  deviceId = options.deviceId || generateDeviceId();
  
  // Store original console methods
  originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
  };
  
  // Override console methods
  console.log = createWrappedMethod('log');
  console.warn = createWrappedMethod('warn');
  console.error = createWrappedMethod('error');
  console.info = createWrappedMethod('info');
  console.debug = createWrappedMethod('debug');
  
  // Start batch timer
  startBatchTimer();
  
  // Mark as initialized
  isInitialized = true;
  
  // Send initial log indicating remote logging is active
  console.log('[RemoteLogger] Initialized - device:', deviceId);
  
  // Flush logs on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      flushLogs();
    });
    
    // Also flush when page becomes hidden (mobile tab switch)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushLogs();
      }
    });
  }
  
  return {
    deviceId,
    flush: flushLogs,
    stop: stopRemoteLogger
  };
}

/**
 * Stop remote logging and restore original console
 */
export function stopRemoteLogger() {
  if (!isInitialized) return;
  
  // Stop timer
  stopBatchTimer();
  
  // Flush remaining logs
  flushLogs();
  
  // Restore original console
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
  
  isInitialized = false;
  
  originalConsole.log?.('[RemoteLogger] Stopped');
}

/**
 * Check if remote logger is active
 */
export function isRemoteLoggerActive() {
  return isInitialized;
}

/**
 * Manually send a log message (useful for specific debug points)
 */
export function remoteLog(message, level = 'log') {
  if (!isInitialized) {
    console[level]?.(message);
    return;
  }
  
  bufferLog(level, [message]);
}

/**
 * Force immediate flush of all buffered logs
 */
export function forceFlush() {
  return flushLogs();
}

export default {
  init: initRemoteLogger,
  stop: stopRemoteLogger,
  isActive: isRemoteLoggerActive,
  log: remoteLog,
  flush: forceFlush
};
