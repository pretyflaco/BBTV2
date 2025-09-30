/**
 * Server-side currency formatting utilities
 * Simplified version for use in API routes
 */

// Common currency symbols mapping
const CURRENCY_SYMBOLS = {
  'USD': '$',
  'EUR': '€',
  'GBP': '£',
  'JPY': '¥',
  'CNY': '¥',
  'INR': '₹',
  'RUB': '₽',
  'NGN': '₦',
  'PHP': '₱',
  'UAH': '₴',
  'KZT': '₸',
  'TRY': '₺',
  'KRW': '₩',
  'ILS': '₪',
  'THB': '฿',
  'VND': '₫',
  'CRC': '₡',
  'GHS': '₵',
  'PYG': '₲',
  'ARS': '$',
  'AUD': '$',
  'CAD': '$',
  'NZD': '$',
  'HKD': 'HK$',
  'SGD': 'S$',
  'MXN': '$',
  'BRL': 'R$',
  'ZAR': 'R',
  'KES': 'KSh',
  'TZS': 'TSh',
  'UGX': 'USh',
  'CHF': 'CHF',
  'SEK': 'kr',
  'NOK': 'kr',
  'DKK': 'kr.',
  'PLN': 'zł',
  'CZK': 'Kč',
  'HUF': 'Ft',
  'RON': 'RON',
  'BGN': 'лв',
  'EGP': 'E£',
  'MAD': 'د.م.',
  'AED': 'د.إ',
  'PKR': '₨',
  'BDT': '৳',
  'LKR': 'Rs',
  'IDR': 'Rp',
  'MYR': 'RM',
  'BTC': 'sats'
};

// Currencies with 0 decimal places
const ZERO_DECIMAL_CURRENCIES = [
  'JPY', 'KRW', 'VND', 'CLP', 'PYG', 'UGX', 'XAF', 'XOF', 'XPF', 'ALL', 'LBP', 'RSD'
];

/**
 * Format currency amount for display on server-side
 * @param {number|string} value - Amount to format
 * @param {string} currencyCode - Currency code (e.g., 'USD', 'EUR')
 * @returns {string} Formatted currency string
 */
function formatCurrencyServer(value, currencyCode) {
  const numValue = parseFloat(value) || 0;
  
  // Special handling for BTC/sats
  if (currencyCode === 'BTC') {
    return `${numValue.toLocaleString()} sats`;
  }
  
  // Get symbol and decimals
  const symbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode;
  const decimals = ZERO_DECIMAL_CURRENCIES.includes(currencyCode) ? 0 : 2;
  const formattedAmount = numValue.toFixed(decimals);
  
  // Determine if space is needed between symbol and amount
  const needsSpace = symbol.length > 1 && !['$', '£', '€', '¥', '₹', '₽', '₦', '₱', '₴', '₸', '₺', '₩', '₪', '฿', '₫', '₡', '₵', '₲', 'ƒ'].includes(symbol);
  
  return needsSpace ? `${symbol} ${formattedAmount}` : `${symbol}${formattedAmount}`;
}

module.exports = {
  formatCurrencyServer,
  CURRENCY_SYMBOLS,
  ZERO_DECIMAL_CURRENCIES
};
