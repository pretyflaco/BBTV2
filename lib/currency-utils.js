/**
 * Currency utilities for dynamic currency handling
 * Supports all Blink-supported currencies automatically
 */

// Satoshi currency metadata (not in Blink's fiat currency list)
export const SAT_CURRENCY = {
  id: 'BTC',
  symbol: 'sats',
  name: 'Bitcoin (Satoshis)',
  flag: '₿',
  fractionDigits: 0
};

/**
 * Format currency amount using dynamic currency metadata
 * @param {number|string} value - The amount to format
 * @param {object} currency - Currency metadata object from Blink API
 * @returns {string} Formatted currency string
 */
export const formatCurrencyAmount = (value, currency) => {
  const numValue = parseFloat(value) || 0;
  
  // Special handling for BTC/sats
  if (currency.id === 'BTC') {
    return `${numValue.toLocaleString()} sats`;
  }
  
  // Use currency metadata for formatting
  const symbol = currency.symbol || currency.id;
  // Use nullish coalescing - fractionDigits of 0 is valid (e.g., JPY, XOF, HUF)
  const decimals = currency.fractionDigits ?? 2;
  const formattedAmount = numValue.toFixed(decimals);
  
  // For currencies with standard symbols, format as: symbol + amount
  // For currencies with text symbols, format as: symbol + space + amount
  const needsSpace = symbol.length > 1 && !['$', '£', '€', '¥', '₹', '₽', '₦', '₱', '₴', '₸', '₺', '₩', '₪', '฿', '₫', '₡', '₵', '₲', '₪', 'ƒ'].includes(symbol);
  
  return needsSpace ? `${symbol} ${formattedAmount}` : `${symbol}${formattedAmount}`;
};

/**
 * Get currency object by ID from currency list
 * @param {string} currencyId - Currency ID (e.g., 'USD', 'EUR')
 * @param {array} currencyList - Array of currency metadata from Blink API
 * @returns {object|null} Currency object or null if not found
 */
export const getCurrencyById = (currencyId, currencyList) => {
  if (!currencyId || !currencyList) return null;
  
  // Check for BTC/sats
  if (currencyId === 'BTC') {
    return SAT_CURRENCY;
  }
  
  return currencyList.find(c => c.id === currencyId) || null;
};

/**
 * Format currency for display with proper symbol and decimals
 * @param {number|string} value - Amount to format
 * @param {string} currencyId - Currency ID
 * @param {array} currencyList - Array of currency metadata
 * @returns {string} Formatted string or fallback format
 */
export const formatDisplayAmount = (value, currencyId, currencyList) => {
  const currency = getCurrencyById(currencyId, currencyList);
  
  if (!currency) {
    // Fallback formatting if currency not found
    const numValue = parseFloat(value) || 0;
    return `${numValue.toFixed(2)} ${currencyId}`;
  }
  
  return formatCurrencyAmount(value, currency);
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
