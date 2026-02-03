/**
 * Centralized version tracking for Blink POS authentication system
 * 
 * Update this when deploying changes to easily verify builds in production.
 * The version is displayed in the UI and logged to console on auth operations.
 */

export const AUTH_VERSION = 'v66';
export const AUTH_VERSION_DATE = '2025-02-03';
export const AUTH_VERSION_DESCRIPTION = 'Legacy code cleanup';

// Full version string for display
export const AUTH_VERSION_FULL = `${AUTH_VERSION}-cleanup`;

/**
 * Log a message with consistent version prefix
 * @param {string} component - Component name (e.g., 'NostrAuth', 'NostrConnect')
 * @param {string} message - Log message
 * @param {...any} args - Additional arguments to log
 */
export function logAuth(component, message, ...args) {
  console.log(`[${component}] ${message}`, ...args);
}

/**
 * Log an error with consistent version prefix
 * @param {string} component - Component name
 * @param {string} message - Error message
 * @param {...any} args - Additional arguments to log
 */
export function logAuthError(component, message, ...args) {
  console.error(`[${component}] ${message}`, ...args);
}

/**
 * Log a warning with consistent version prefix
 * @param {string} component - Component name
 * @param {string} message - Warning message
 * @param {...any} args - Additional arguments to log
 */
export function logAuthWarn(component, message, ...args) {
  console.warn(`[${component}] ${message}`, ...args);
}

export default {
  AUTH_VERSION,
  AUTH_VERSION_DATE,
  AUTH_VERSION_DESCRIPTION,
  AUTH_VERSION_FULL,
  logAuth,
  logAuthError,
  logAuthWarn,
};
