/**
 * useDisplaySettings Hook
 *
 * Manages display and regional settings for the dashboard including:
 * - Display currency (USD/BTC toggle)
 * - Number format (locale settings)
 * - Bitcoin format (sats, BIP-177, etc.)
 * - Numpad layout (calculator vs phone)
 * - Currency filter for search
 *
 * All settings are persisted to localStorage where applicable.
 *
 * @module lib/hooks/useDisplaySettings
 */

import { useState, useCallback, useEffect } from 'react';

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEYS = {
  NUMBER_FORMAT: 'blinkpos-number-format',
  BITCOIN_FORMAT: 'blinkpos-bitcoin-format',
  NUMPAD_LAYOUT: 'blinkpos-numpad-layout',
};

const DEFAULT_NUMBER_FORMAT = 'auto';
const DEFAULT_BITCOIN_FORMAT = 'sats';
const DEFAULT_NUMPAD_LAYOUT = 'calculator';
const DEFAULT_DISPLAY_CURRENCY = 'USD';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Safely get value from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Stored value or default
 */
function getFromStorage(key, defaultValue) {
  if (typeof window === 'undefined') {
    return defaultValue;
  }
  try {
    const stored = localStorage.getItem(key);
    return stored !== null ? stored : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Safely set value to localStorage
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 */
function setToStorage(key, value) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors (e.g., quota exceeded, private browsing)
  }
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing display and regional settings
 *
 * @returns {Object} Display settings state and actions
 * @property {'USD'|'BTC'} displayCurrency - Current display currency
 * @property {function('USD'|'BTC'): void} setDisplayCurrency - Set display currency
 * @property {function(): void} toggleDisplayCurrency - Toggle between USD and BTC
 * @property {'auto'|'en-US'|'de-DE'|'fr-FR'|'es-ES'|'pt-BR'|'ja-JP'|'zh-CN'} numberFormat - Number format locale
 * @property {function(string): void} setNumberFormat - Set number format
 * @property {'sats'|'btc'|'bip177'} bitcoinFormat - Bitcoin display format
 * @property {function(string): void} setBitcoinFormat - Set bitcoin format
 * @property {'calculator'|'phone'} numpadLayout - Numpad button layout
 * @property {function(string): void} setNumpadLayout - Set numpad layout
 * @property {string} currencyFilter - Currency search filter
 * @property {function(string): void} setCurrencyFilter - Set currency filter
 * @property {string} currencyFilterDebounced - Debounced currency filter
 * @property {function(string): void} setCurrencyFilterDebounced - Set debounced filter
 * @property {function(): void} clearCurrencyFilter - Clear currency filter
 * @property {function(number, Object=): string} formatNumber - Format number for display
 * @property {function(number): string} formatBitcoin - Format sats for display
 * @property {function(): string} getLocaleFromFormat - Get current locale string
 *
 * @example
 * const {
 *   displayCurrency,
 *   toggleDisplayCurrency,
 *   numberFormat,
 *   setNumberFormat,
 *   formatNumber,
 *   formatBitcoin
 * } = useDisplaySettings();
 *
 * // Toggle between USD and BTC display
 * <button onClick={toggleDisplayCurrency}>
 *   {displayCurrency}
 * </button>
 *
 * // Format a number according to locale
 * <span>{formatNumber(1234.56)}</span>
 *
 * // Format sats according to bitcoin format setting
 * <span>{formatBitcoin(100000)}</span>
 */
export function useDisplaySettings() {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [displayCurrency, setDisplayCurrencyState] = useState(DEFAULT_DISPLAY_CURRENCY);

  const [numberFormat, setNumberFormatState] = useState(() =>
    getFromStorage(STORAGE_KEYS.NUMBER_FORMAT, DEFAULT_NUMBER_FORMAT)
  );

  const [bitcoinFormat, setBitcoinFormatState] = useState(() =>
    getFromStorage(STORAGE_KEYS.BITCOIN_FORMAT, DEFAULT_BITCOIN_FORMAT)
  );

  const [numpadLayout, setNumpadLayoutState] = useState(() =>
    getFromStorage(STORAGE_KEYS.NUMPAD_LAYOUT, DEFAULT_NUMPAD_LAYOUT)
  );

  const [currencyFilter, setCurrencyFilterState] = useState('');
  const [currencyFilterDebounced, setCurrencyFilterDebouncedState] = useState('');

  // ---------------------------------------------------------------------------
  // Callbacks - Display Currency
  // ---------------------------------------------------------------------------

  const setDisplayCurrency = useCallback((currency) => {
    setDisplayCurrencyState(currency);
  }, []);

  const toggleDisplayCurrency = useCallback(() => {
    setDisplayCurrencyState((prev) => (prev === 'USD' ? 'BTC' : 'USD'));
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - Number Format
  // ---------------------------------------------------------------------------

  const setNumberFormat = useCallback((format) => {
    setNumberFormatState(format);
    setToStorage(STORAGE_KEYS.NUMBER_FORMAT, format);
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - Bitcoin Format
  // ---------------------------------------------------------------------------

  const setBitcoinFormat = useCallback((format) => {
    setBitcoinFormatState(format);
    setToStorage(STORAGE_KEYS.BITCOIN_FORMAT, format);
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - Numpad Layout
  // ---------------------------------------------------------------------------

  const setNumpadLayout = useCallback((layout) => {
    setNumpadLayoutState(layout);
    setToStorage(STORAGE_KEYS.NUMPAD_LAYOUT, layout);
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - Currency Filter
  // ---------------------------------------------------------------------------

  const setCurrencyFilter = useCallback((filter) => {
    setCurrencyFilterState(filter);
  }, []);

  const setCurrencyFilterDebounced = useCallback((filter) => {
    setCurrencyFilterDebouncedState(filter);
  }, []);

  const clearCurrencyFilter = useCallback(() => {
    setCurrencyFilterState('');
    setCurrencyFilterDebouncedState('');
  }, []);

  // ---------------------------------------------------------------------------
  // Utility Functions
  // ---------------------------------------------------------------------------

  const getLocaleFromFormat = useCallback(() => {
    if (numberFormat === 'auto') {
      return typeof navigator !== 'undefined' ? navigator.language : 'en-US';
    }
    return numberFormat;
  }, [numberFormat]);

  const formatNumber = useCallback(
    (value, options) => {
      const locale = getLocaleFromFormat();
      try {
        return new Intl.NumberFormat(locale, options).format(value);
      } catch {
        return value.toString();
      }
    },
    [getLocaleFromFormat]
  );

  const formatBitcoin = useCallback(
    (sats) => {
      const locale = getLocaleFromFormat();

      switch (bitcoinFormat) {
        case 'btc': {
          const btc = sats / 100_000_000;
          try {
            return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 8, maximumFractionDigits: 8 }).format(btc)} BTC`;
          } catch {
            return `${btc.toFixed(8)} BTC`;
          }
        }
        case 'bip177': {
          // BIP-177: Use ₿ symbol with appropriate decimal places
          const btc = sats / 100_000_000;
          try {
            return `₿${new Intl.NumberFormat(locale, { minimumFractionDigits: 8, maximumFractionDigits: 8 }).format(btc)}`;
          } catch {
            return `₿${btc.toFixed(8)}`;
          }
        }
        case 'sats':
        default: {
          try {
            return `${new Intl.NumberFormat(locale).format(sats)} sats`;
          } catch {
            return `${sats} sats`;
          }
        }
      }
    },
    [bitcoinFormat, getLocaleFromFormat]
  );

  // ---------------------------------------------------------------------------
  // Debounce Effect for Currency Filter
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrencyFilterDebouncedState(currencyFilter);
    }, 300);

    return () => clearTimeout(timer);
  }, [currencyFilter]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // Display currency
    displayCurrency,
    setDisplayCurrency,
    toggleDisplayCurrency,

    // Number format
    numberFormat,
    setNumberFormat,

    // Bitcoin format
    bitcoinFormat,
    setBitcoinFormat,

    // Numpad layout
    numpadLayout,
    setNumpadLayout,

    // Currency filter
    currencyFilter,
    setCurrencyFilter,
    currencyFilterDebounced,
    setCurrencyFilterDebounced,
    clearCurrencyFilter,

    // Utility functions
    formatNumber,
    formatBitcoin,
    getLocaleFromFormat,
  };
}

export default useDisplaySettings;
