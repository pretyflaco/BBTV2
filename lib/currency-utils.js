/**
 * Currency utilities for dynamic currency handling
 * Supports all Blink-supported currencies automatically
 */

import { formatNumber } from './number-format.js';

// Satoshi currency metadata (traditional sats display: "10,000 sats")
export const SAT_CURRENCY = {
  id: 'BTC',
  symbol: 'sats',
  name: 'Bitcoin (sats)',
  flag: '₿',
  fractionDigits: 0
};

// BIP-177 Bitcoin currency metadata (new display: "₿10,000")
export const BTC_BIP177_CURRENCY = {
  id: 'BTC-BIP177',
  displayId: 'BTC',  // Show as "BTC" in dropdown, but use id for logic
  symbol: '₿',
  name: 'Bitcoin (BIP-177)',
  flag: '₿',
  fractionDigits: 0
};

/**
 * Format currency amount using dynamic currency metadata
 * @param {number|string} value - The amount to format
 * @param {object} currency - Currency metadata object from Blink API
 * @param {string} numberFormat - Number format preference ('auto', 'comma-period', etc.)
 * @returns {string} Formatted currency string
 */
export const formatCurrencyAmount = (value, currency, numberFormat = 'auto') => {
  const numValue = parseFloat(value) || 0;
  
  // Special handling for BTC/sats (traditional format)
  if (currency.id === 'BTC') {
    return `${formatNumber(numValue, numberFormat, 0)} sats`;
  }
  
  // Special handling for BTC-BIP177 (new format: ₿10,000)
  if (currency.id === 'BTC-BIP177') {
    return `₿${formatNumber(numValue, numberFormat, 0)}`;
  }
  
  // Use currency metadata for formatting
  const symbol = currency.symbol || currency.id;
  // Use nullish coalescing - fractionDigits of 0 is valid (e.g., JPY, XOF, HUF)
  const decimals = currency.fractionDigits ?? 2;
  const formattedAmount = formatNumber(numValue, numberFormat, decimals);
  
  // For currencies with standard symbols, format as: symbol + amount
  // For currencies with text symbols, format as: symbol + space + amount
  const needsSpace = symbol.length > 1 && !['$', '£', '€', '¥', '₹', '₽', '₦', '₱', '₴', '₸', '₺', '₩', '₪', '฿', '₫', '₡', '₵', '₲', '₪', 'ƒ'].includes(symbol);
  
  return needsSpace ? `${symbol} ${formattedAmount}` : `${symbol}${formattedAmount}`;
};

/**
 * Get currency object by ID from currency list
 * @param {string} currencyId - Currency ID (e.g., 'USD', 'EUR', 'BTC', 'BTC-BIP177')
 * @param {array} currencyList - Array of currency metadata from Blink API
 * @returns {object|null} Currency object or null if not found
 */
export const getCurrencyById = (currencyId, currencyList) => {
  if (!currencyId || !currencyList) return null;
  
  // Check for BTC/sats (traditional format)
  if (currencyId === 'BTC') {
    return SAT_CURRENCY;
  }
  
  // Check for BTC-BIP177 (new format)
  if (currencyId === 'BTC-BIP177') {
    return BTC_BIP177_CURRENCY;
  }
  
  return currencyList.find(c => c.id === currencyId) || null;
};

/**
 * Format currency for display with proper symbol and decimals
 * @param {number|string} value - Amount to format
 * @param {string} currencyId - Currency ID
 * @param {array} currencyList - Array of currency metadata
 * @param {string} numberFormat - Number format preference ('auto', 'comma-period', etc.)
 * @returns {string} Formatted string or fallback format
 */
export const formatDisplayAmount = (value, currencyId, currencyList, numberFormat = 'auto') => {
  const currency = getCurrencyById(currencyId, currencyList);
  
  if (!currency) {
    // Fallback formatting if currency not found
    const numValue = parseFloat(value) || 0;
    return `${formatNumber(numValue, numberFormat, 2)} ${currencyId}`;
  }
  
  return formatCurrencyAmount(value, currency, numberFormat);
};

/**
 * Create a currency dropdown option object
 * @param {object} currency - Currency metadata
 * @returns {object} Option object for select dropdown
 */
export const createCurrencyOption = (currency) => {
  const flag = currency.flag ? `${currency.flag} ` : '';
  return {
    value: currency.id,
    label: `${flag}${currency.id} - ${currency.name}`,
    currency: currency
  };
};

/**
 * Check if currency is a Bitcoin/satoshi-based currency (BTC or BTC-BIP177)
 * Both use satoshis internally, just displayed differently
 * @param {string} currencyId - Currency ID to check
 * @returns {boolean} True if currency is Bitcoin-based
 */
export const isBitcoinCurrency = (currencyId) => {
  return currencyId === 'BTC' || currencyId === 'BTC-BIP177';
};

/**
 * Parse formatted amount into symbol and value parts for custom rendering
 * Useful when you need to style the symbol differently (e.g., smaller ₿ symbol)
 * @param {string} formattedAmount - The formatted amount string from formatDisplayAmount
 * @param {string} currencyId - Currency ID to determine parsing logic
 * @returns {object} { symbol, value, isBip177 } - Parts for custom rendering
 */
export const parseAmountParts = (formattedAmount, currencyId) => {
  if (currencyId === 'BTC-BIP177') {
    // BIP-177 format: "₿10,000" - symbol is first character
    return {
      symbol: '₿',
      value: formattedAmount.substring(1),
      isBip177: true
    };
  }
  
  if (currencyId === 'BTC') {
    // Traditional sats format: "10,000 sats" - no symbol prefix
    return {
      symbol: '',
      value: formattedAmount,
      isBip177: false
    };
  }
  
  // For fiat currencies, try to extract symbol
  // Most formats are: "$100.00" or "€100.00" or "CHF 100.00"
  const match = formattedAmount.match(/^([^\d\s]+\s?)(.+)$/);
  if (match) {
    return {
      symbol: match[1],
      value: match[2],
      isBip177: false
    };
  }
  
  return {
    symbol: '',
    value: formattedAmount,
    isBip177: false
  };
};
