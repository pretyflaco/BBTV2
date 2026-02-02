/**
 * Remote Logger - Sends console logs to server for iOS debugging
 * 
 * v2: More aggressive - sends immediately on init and uses sendBeacon as fallback
 * 
 * This intercepts console.log/warn/error and sends them to /api/debug/remote-log
 * so we can see iOS Safari logs on a desktop browser in real-time.
 */

// Configuration
const REMOTE_LOG_ENDPOINT = '/api/debug/remote-log';
const BATCH_INTERVAL = 500;  // Send logs every 500ms (more aggressive)
const MAX_BATCH_SIZE = 50;   // Max logs per batch
const MAX_LOG_LENGTH = 2000; // Truncate long logs

// State
let logBuffer = [];
let batchTimer = null;
let isInitialized = false;
let deviceId = null;
let sendCount = 0;
let errorCount = 0;

// Original console methods (stored before override)
let originalConsole = {};

/**
 * Generate a unique device ID for this session
 */
function generateDeviceId() {
  // Try to get from sessionStorage for consistency within a session
  try {
    if (typeof sessionStorage !== 'undefined') {
      const stored = sessionStorage.getItem('remoteLogDeviceId');
      if (stored) return stored;
    }
  } catch (e) {
    // sessionStorage might be blocked
  }
  
  // Generate new ID based on platform and random string
  const platform = detectPlatform();
  const random = Math.random().toString(36).substring(2, 8);
  const id = `${platform}-${random}`;
  
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('remoteLogDeviceId', id);
    }
  } catch (e) {
    // Ignore storage errors
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
 * Send logs using sendBeacon (more reliable on iOS for background/unload)
 */
function sendLogsBeacon(logs) {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
  
  try {
    const data = JSON.stringify({
      logs: logs,
      deviceId: deviceId,
      userAgent: navigator.userAgent,
      method: 'beacon'
    });
    
    return navigator.sendBeacon(REMOTE_LOG_ENDPOINT, new Blob([data], { type: 'application/json' }));
  } catch (e) {
    return false;
  }
}

/**
 * Send logs using fetch
 */
async function sendLogsFetch(logs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
  
  try {
    const response = await fetch(REMOTE_LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        logs: logs,
        deviceId: deviceId,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        method: 'fetch',
        sendCount: sendCount
      }),
      signal: controller.signal,
      // Important for iOS - don't let service worker intercept
      cache: 'no-store',
      credentials: 'omit'
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    clearTimeout(timeoutId);
    errorCount++;
    return false;
  }
}

/**
 * Send buffered logs to the server (try fetch first, then beacon)
 */
async function flushLogs() {
  if (logBuffer.length === 0) return;
  
  // Grab current logs and clear buffer
  const logsToSend = logBuffer.splice(0, MAX_BATCH_SIZE);
  
  sendCount++;
  
  // Try fetch first
  const fetchSuccess = await sendLogsFetch(logsToSend);
  
  if (!fetchSuccess) {
    // Try sendBeacon as fallback
    const beaconSuccess = sendLogsBeacon(logsToSend);
    
    if (!beaconSuccess) {
      // Put logs back in buffer if both failed
      logBuffer.unshift(...logsToSend);
    }
  }
}

/**
 * Send a single log immediately (bypass batching)
 */
async function sendImmediate(message) {
  const logs = [`[IMMEDIATE] ${message}`];
  
  // Try both methods
  const fetchSuccess = await sendLogsFetch(logs);
  if (!fetchSuccess) {
    sendLogsBeacon(logs);
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
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console)
  };
  
  // Override console methods
  console.log = createWrappedMethod('log');
  console.warn = createWrappedMethod('warn');
  console.error = createWrappedMethod('error');
  console.info = createWrappedMethod('info');
  console.debug = createWrappedMethod('debug');
  
  // Mark as initialized BEFORE logging (to capture our own logs)
  isInitialized = true;
  
  // Start batch timer
  startBatchTimer();
  
  // Send immediate ping to verify connection works
  sendImmediate(`RemoteLogger INIT - device: ${deviceId}, UA: ${navigator.userAgent.substring(0, 80)}`);
  
  // Also log through the wrapped console
  console.log('[RemoteLogger] Initialized - device:', deviceId);
  console.log('[RemoteLogger] Page URL:', window.location.href);
  
  // Flush logs on page unload
  window.addEventListener('beforeunload', () => {
    // Use sendBeacon for unload - more reliable
    if (logBuffer.length > 0) {
      sendLogsBeacon(logBuffer);
    }
  });
  
  // Also flush when page becomes hidden (mobile tab switch)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushLogs();
    }
  });
  
  // Flush immediately after a short delay to send the init logs
  setTimeout(() => {
    flushLogs();
  }, 100);
  
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
