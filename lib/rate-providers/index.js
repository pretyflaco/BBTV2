/**
 * Rate Provider Registry
 * 
 * Central registry for exchange rate providers.
 * Supports multiple providers (Blink official, Citrusrate street rates, Citrusrate official, etc.)
 */

const {
  CITRUSRATE_EXCLUSIVE_CURRENCIES,
  CITRUSRATE_ALT_CURRENCIES,
  CITRUSRATE_EXCLUSIVE_IDS,
  isCitrusrateExclusiveCurrency,
  isCitrusrateAltCurrency,
  getCitrusrateBaseCurrency
} = require('./citrusrate-currencies');

/**
 * Provider configurations
 * Each provider specifies which currencies it handles and how to fetch rates
 */
const RATE_PROVIDERS = {
  blink: {
    id: 'blink',
    name: 'Blink (Official)',
    description: 'Official exchange rates from Blink API',
    // Handles all currencies by default
    isDefault: true
  },
  citrusrate_street: {
    id: 'citrusrate_street',
    name: 'Citrusrate (Street)',
    description: 'Black market / street exchange rates from Citrusrate',
    // Specific currencies this provider handles
    currencies: ['MZN_STREET'],
    rateType: 'blackmarket'
  },
  citrusrate_official: {
    id: 'citrusrate_official',
    name: 'Citrusrate (Official)',
    description: 'Official aggregated exchange rates from Citrusrate (African currencies)',
    // Handles Citrusrate-exclusive currencies and _CITRUS alternative currencies
    rateType: 'official'
  }
};

/**
 * Street rate currency configurations
 * Maps virtual currency IDs (e.g., MZN_STREET) to their base currencies and metadata
 */
const STREET_RATE_CURRENCIES = [
  {
    id: 'MZN_STREET',
    baseId: 'MZN',
    displayId: 'MZN (street)',
    symbol: 'MT',
    name: 'Mozambican Metical (street rate)',
    flag: '🇲🇿',
    fractionDigits: 2,
    rateProvider: 'citrusrate_street'
  }
  // More street rate currencies can be added when Citrusrate expands support
];

/**
 * Get the rate provider for a given currency
 * @param {string} currencyId - Currency ID (e.g., 'MZN', 'MZN_STREET', 'NGN_CITRUS', 'AOA')
 * @returns {object} Provider configuration
 */
function getProviderForCurrency(currencyId) {
  // Check if this is a street rate currency (e.g., MZN_STREET)
  const streetCurrency = STREET_RATE_CURRENCIES.find(c => c.id === currencyId);
  if (streetCurrency) {
    return RATE_PROVIDERS[streetCurrency.rateProvider];
  }
  
  // Check if this is a Citrusrate alternative currency (e.g., NGN_CITRUS)
  if (isCitrusrateAltCurrency(currencyId)) {
    return RATE_PROVIDERS.citrusrate_official;
  }
  
  // Check if this is a Citrusrate-exclusive currency (e.g., AOA, BIF, BWP)
  if (isCitrusrateExclusiveCurrency(currencyId)) {
    return RATE_PROVIDERS.citrusrate_official;
  }
  
  // Check if any provider explicitly handles this currency
  for (const [key, provider] of Object.entries(RATE_PROVIDERS)) {
    if (provider.currencies && provider.currencies.includes(currencyId)) {
      return provider;
    }
  }
  
  // Default to Blink provider
  return RATE_PROVIDERS.blink;
}

/**
 * Check if a currency ID is a street rate currency
 * @param {string} currencyId 
 * @returns {boolean}
 */
function isStreetRateCurrency(currencyId) {
  return currencyId.endsWith('_STREET');
}

/**
 * Get the base currency for a special currency (street rate or citrus alt)
 * @param {string} currencyId - e.g., 'MZN_STREET' or 'NGN_CITRUS'
 * @returns {string} Base currency ID, e.g., 'MZN' or 'NGN'
 */
function getBaseCurrency(currencyId) {
  if (isStreetRateCurrency(currencyId)) {
    return currencyId.replace('_STREET', '');
  }
  if (isCitrusrateAltCurrency(currencyId)) {
    return getCitrusrateBaseCurrency(currencyId);
  }
  return currencyId;
}

/**
 * Get street rate currency config by ID
 * @param {string} currencyId 
 * @returns {object|null}
 */
function getStreetRateCurrency(currencyId) {
  return STREET_RATE_CURRENCIES.find(c => c.id === currencyId) || null;
}

/**
 * Get all configured street rate currencies
 * @returns {array}
 */
function getAllStreetRateCurrencies() {
  return STREET_RATE_CURRENCIES;
}

/**
 * Get all Citrusrate exclusive currencies (not in Blink)
 * @returns {array}
 */
function getAllCitrusrateExclusiveCurrencies() {
  return CITRUSRATE_EXCLUSIVE_CURRENCIES;
}

/**
 * Get all Citrusrate alternative currencies
 * @returns {array}
 */
function getAllCitrusrateAltCurrencies() {
  return CITRUSRATE_ALT_CURRENCIES;
}

module.exports = {
  RATE_PROVIDERS,
  STREET_RATE_CURRENCIES,
  CITRUSRATE_EXCLUSIVE_CURRENCIES,
  CITRUSRATE_ALT_CURRENCIES,
  CITRUSRATE_EXCLUSIVE_IDS,
  getProviderForCurrency,
  isStreetRateCurrency,
  isCitrusrateExclusiveCurrency,
  isCitrusrateAltCurrency,
  getBaseCurrency,
  getStreetRateCurrency,
  getAllStreetRateCurrencies,
  getAllCitrusrateExclusiveCurrencies,
  getAllCitrusrateAltCurrencies
};
