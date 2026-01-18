/**
 * Voucher Expiry Configuration
 * 
 * Defines expiry presets and constants for the voucher system.
 * Designed for easy migration to PostgreSQL later.
 */

// Expiry preset options
const EXPIRY_PRESETS = [
  { id: '15m', label: '15 min', ms: 15 * 60 * 1000 },
  { id: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { id: '24h', label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { id: '6mo', label: '6 months', ms: 180 * 24 * 60 * 60 * 1000 },
];

// Default expiry for new vouchers
const DEFAULT_EXPIRY_ID = '6mo';

// Maximum unclaimed vouchers per wallet (prevents runaway creation)
const MAX_UNCLAIMED_PER_WALLET = 1000;

// How long to keep claimed vouchers in history (30 days)
const CLAIMED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// How long to keep cancelled vouchers in history (30 days)
const CANCELLED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// How long to keep expired unclaimed vouchers in history (7 days grace period)
const EXPIRED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Get expiry preset by ID
 * @param {string} id - Preset ID (e.g., '6mo', '24h')
 * @returns {object|null} Preset object or null if not found
 */
function getExpiryPreset(id) {
  return EXPIRY_PRESETS.find(preset => preset.id === id) || null;
}

/**
 * Get expiry milliseconds by ID
 * @param {string} id - Preset ID
 * @returns {number} Milliseconds, defaults to 6 months if invalid
 */
function getExpiryMs(id) {
  const preset = getExpiryPreset(id);
  if (preset) return preset.ms;
  // Default to 6 months if invalid ID
  const defaultPreset = getExpiryPreset(DEFAULT_EXPIRY_ID);
  return defaultPreset ? defaultPreset.ms : 180 * 24 * 60 * 60 * 1000;
}

/**
 * Get default expiry preset
 * @returns {object} Default preset object
 */
function getDefaultExpiry() {
  return getExpiryPreset(DEFAULT_EXPIRY_ID);
}

/**
 * Validate expiry ID
 * @param {string} id - Preset ID to validate
 * @returns {boolean} True if valid
 */
function isValidExpiryId(id) {
  return EXPIRY_PRESETS.some(preset => preset.id === id);
}

/**
 * Format expiry date for display
 * @param {number} expiresAt - Timestamp
 * @returns {string} Formatted date string
 */
function formatExpiryDate(expiresAt) {
  if (!expiresAt) return 'No expiry';
  const date = new Date(expiresAt);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

/**
 * Get voucher status based on its state
 * @param {object} voucher - Voucher object
 * @returns {string} Status: ACTIVE, CLAIMED, CANCELLED, EXPIRED
 */
function getVoucherStatus(voucher) {
  if (!voucher) return 'NOT_FOUND';
  if (voucher.claimed) return 'CLAIMED';
  if (voucher.cancelledAt) return 'CANCELLED';
  if (voucher.expiresAt && voucher.expiresAt < Date.now()) return 'EXPIRED';
  return 'ACTIVE';
}

// CommonJS exports for Node.js API routes
module.exports = {
  EXPIRY_PRESETS,
  DEFAULT_EXPIRY_ID,
  MAX_UNCLAIMED_PER_WALLET,
  CLAIMED_RETENTION_MS,
  CANCELLED_RETENTION_MS,
  EXPIRED_RETENTION_MS,
  getExpiryPreset,
  getExpiryMs,
  getDefaultExpiry,
  isValidExpiryId,
  formatExpiryDate,
  getVoucherStatus,
};
