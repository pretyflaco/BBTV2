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
