/**
 * Number formatting utilities with locale support
 * 
 * Provides consistent number formatting across the app with user-configurable
 * locale preferences for thousands separators and decimal points.
 */

// Locale mapping for explicit format preferences
export const FORMAT_LOCALES = {
  'auto': undefined,        // Use browser default
  'comma-period': 'en-US',  // 1,234.56
  'period-comma': 'de-DE',  // 1.234,56
  'space-comma': 'fr-FR',   // 1 234,56
};

// Format labels for UI display
export const FORMAT_LABELS = {
  'auto': 'Automatic (use device settings)',
  'comma-period': '1,234.56',
  'period-comma': '1.234,56',
  'space-comma': '1 234,56',
};

// Format descriptions for UI
export const FORMAT_DESCRIPTIONS = {
  'auto': 'Uses your device\'s regional settings',
  'comma-period': 'Comma for thousands, period for decimals (US, UK, Australia)',
  'period-comma': 'Period for thousands, comma for decimals (Germany, France, Spain)',
  'space-comma': 'Space for thousands, comma for decimals (France, Russia)',
};

// All available format options in display order
export const FORMAT_OPTIONS = ['auto', 'comma-period', 'period-comma', 'space-comma'];

// Default format when 'auto' can't determine browser locale
export const DEFAULT_FALLBACK_FORMAT = 'comma-period';

// =============================================================================
// Bitcoin Format Configuration
// =============================================================================

// Bitcoin format options
export const BITCOIN_FORMAT_OPTIONS = ['sats', 'bip177', 'sat'];

// Bitcoin format labels for UI display
export const BITCOIN_FORMAT_LABELS = {
  'sats': 'sats',
  'bip177': 'BIP-177 (₿)',
  'sat': 'SAT',
};

// Bitcoin format descriptions for UI
export const BITCOIN_FORMAT_DESCRIPTIONS = {
  'sats': 'Standard satoshi notation - most common in Lightning',
  'bip177': 'Unicode Bitcoin symbol with sats value',
  'sat': 'Bitcoin Beach legacy format - uppercase unit',
};

// Default Bitcoin format
export const DEFAULT_BITCOIN_FORMAT = 'sats';

// =============================================================================
// Numpad Layout Configuration
// =============================================================================

// Numpad layout options
export const NUMPAD_LAYOUT_OPTIONS = ['calculator', 'telephone'];

// Numpad layout labels for UI display
export const NUMPAD_LAYOUT_LABELS = {
  'calculator': '7-8-9 Top Row (Calculator)',
  'telephone': '1-2-3 Top Row (Telephone)',
};

// Numpad layout descriptions for UI
export const NUMPAD_LAYOUT_DESCRIPTIONS = {
  'calculator': 'Standard calculator layout with 7-8-9 on top',
  'telephone': 'Phone/ATM style layout with 1-2-3 on top',
};

// Default numpad layout
export const DEFAULT_NUMPAD_LAYOUT = 'calculator';

/**
 * Format a Bitcoin/sats amount according to the specified format
 * @param {number} sats - Amount in satoshis
 * @param {string} bitcoinFormat - Bitcoin format preference ('sats', 'bip177', 'sat')
 * @param {string} numberFormat - Number format preference ('auto', 'comma-period', etc.)
 * @returns {string} Formatted Bitcoin amount string
 */
export const formatBitcoinAmount = (sats, bitcoinFormat = 'sats', numberFormat = 'auto') => {
  const formattedNumber = formatNumber(sats, numberFormat, 0);
  
  switch (bitcoinFormat) {
    case 'sats':
      return `${formattedNumber} sats`;
    case 'sat':
      return `${formattedNumber} SAT`;
    case 'bip177':
    default:
      return `₿${formattedNumber}`;
  }
};

/**
 * Get a preview of how Bitcoin amounts will look with a given format
 * @param {string} bitcoinFormat - Bitcoin format preference
 * @param {string} numberFormat - Number format preference
 * @returns {string} Preview string with example amount
 */
export const getBitcoinFormatPreview = (bitcoinFormat, numberFormat = 'auto') => {
  return formatBitcoinAmount(21000, bitcoinFormat, numberFormat);
};

/**
 * Get the locale string for a given format preference
 * @param {string} format - Format preference ('auto', 'comma-period', etc.)
 * @returns {string|undefined} Locale string or undefined for auto
 */
export const getLocaleForFormat = (format) => {
  return FORMAT_LOCALES[format] || FORMAT_LOCALES[DEFAULT_FALLBACK_FORMAT];
};

/**
 * Format a number with the specified format preference
 * @param {number} value - Number to format
 * @param {string} format - Format preference ('auto', 'comma-period', etc.)
 * @param {number} decimals - Number of decimal places (default: 0)
 * @returns {string} Formatted number string
 */
export const formatNumber = (value, format = 'auto', decimals = 0) => {
  const numValue = parseFloat(value) || 0;
  
  // For 'auto', use undefined to let browser choose; otherwise use explicit locale
  let locale;
  if (format === 'auto') {
    locale = undefined; // Browser will use system locale
  } else {
    locale = FORMAT_LOCALES[format] || FORMAT_LOCALES[DEFAULT_FALLBACK_FORMAT];
  }
  
  try {
    return numValue.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch (error) {
    // Fallback if locale not supported
    console.warn(`Locale formatting failed for format "${format}":`, error);
    return numValue.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
};

/**
 * Get a preview of how numbers will look with a given format
 * @param {string} format - Format preference
 * @returns {object} Preview object with example formatted numbers
 */
export const getFormatPreview = (format) => {
  return {
    integer: formatNumber(1234567, format, 0),
    decimal: formatNumber(1234567.89, format, 2),
    small: formatNumber(42.5, format, 2),
  };
};
