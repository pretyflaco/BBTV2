/**
 * Centralized version tracking for Blink POS authentication system
 * 
 * The version is displayed in the UI and logged to console on auth operations.
 * 
 * VERSION FORMAT: v{major}-{git-short-hash}
 * - Major version: Increment for significant releases
 * - Git hash: Auto-populated at build time by Next.js from NEXT_PUBLIC_GIT_COMMIT
 * 
 * The git commit hash is injected during Docker build via next.config.js
 */

// Major version - increment for significant releases
export const AUTH_VERSION_MAJOR = 'v76';

// Git commit hash (injected at build time, fallback for local dev)
const GIT_COMMIT = typeof process !== 'undefined' 
  ? (process.env.NEXT_PUBLIC_GIT_COMMIT || 'dev')
  : 'dev';

// Full version string: v76-abc1234 or v76-dev for local
export const AUTH_VERSION = AUTH_VERSION_MAJOR;
export const AUTH_VERSION_DATE = '2026-02-06';
export const AUTH_VERSION_DESCRIPTION = 'Auto-versioning with git commit hash';

// Full version string for display (includes git hash)
export const AUTH_VERSION_FULL = `${AUTH_VERSION_MAJOR}-${GIT_COMMIT.substring(0, 7)}`;

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
