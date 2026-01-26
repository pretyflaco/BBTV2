/**
 * Citrusrate Currency Definitions (Client-side ES Module)
 * 
 * This file mirrors citrusrate-currencies.js but uses ES module exports
 * for use in React components and hooks.
 * 
 * Contains metadata for all 40 African currencies supported by Citrusrate API.
 */

/**
 * 24 African currencies available ONLY through Citrusrate (not in Blink API)
 * These are added directly to the currency list
 */
export const CITRUSRATE_EXCLUSIVE_CURRENCIES = [
  { id: 'AOA', name: 'Angolan Kwanza', flag: '🇦🇴', symbol: 'Kz', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'BIF', name: 'Burundian Franc', flag: '🇧🇮', symbol: 'FBu', fractionDigits: 0, rateProvider: 'citrusrate_official' },
  { id: 'BWP', name: 'Botswana Pula', flag: '🇧🇼', symbol: 'P', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'CDF', name: 'Congolese Franc', flag: '🇨🇩', symbol: 'FC', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'CVE', name: 'Cape Verdean Escudo', flag: '🇨🇻', symbol: '$', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'DJF', name: 'Djiboutian Franc', flag: '🇩🇯', symbol: 'Fdj', fractionDigits: 0, rateProvider: 'citrusrate_official' },
  { id: 'DZD', name: 'Algerian Dinar', flag: '🇩🇿', symbol: 'د.ج', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'ERN', name: 'Eritrean Nakfa', flag: '🇪🇷', symbol: 'Nfk', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'GMD', name: 'Gambian Dalasi', flag: '🇬🇲', symbol: 'D', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'GNF', name: 'Guinean Franc', flag: '🇬🇳', symbol: 'FG', fractionDigits: 0, rateProvider: 'citrusrate_official' },
  { id: 'KMF', name: 'Comorian Franc', flag: '🇰🇲', symbol: 'CF', fractionDigits: 0, rateProvider: 'citrusrate_official' },
  { id: 'LSL', name: 'Lesotho Loti', flag: '🇱🇸', symbol: 'L', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'LYD', name: 'Libyan Dinar', flag: '🇱🇾', symbol: 'ل.د', fractionDigits: 3, rateProvider: 'citrusrate_official' },
  { id: 'MGA', name: 'Malagasy Ariary', flag: '🇲🇬', symbol: 'Ar', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'MRO', name: 'Mauritanian Ouguiya', flag: '🇲🇷', symbol: 'UM', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'RWF', name: 'Rwandan Franc', flag: '🇷🇼', symbol: 'RF', fractionDigits: 0, rateProvider: 'citrusrate_official' },
  { id: 'SCR', name: 'Seychellois Rupee', flag: '🇸🇨', symbol: 'SR', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'SDG', name: 'Sudanese Pound', flag: '🇸🇩', symbol: 'ج.س', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'SLL', name: 'Sierra Leonean Leone', flag: '🇸🇱', symbol: 'Le', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'SOS', name: 'Somali Shilling', flag: '🇸🇴', symbol: 'S', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'STD', name: 'São Tomé Dobra', flag: '🇸🇹', symbol: 'Db', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'SZL', name: 'Swazi Lilangeni', flag: '🇸🇿', symbol: 'E', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'TND', name: 'Tunisian Dinar', flag: '🇹🇳', symbol: 'د.ت', fractionDigits: 3, rateProvider: 'citrusrate_official' },
  { id: 'ZWD', name: 'Zimbabwean Dollar', flag: '🇿🇼', symbol: 'Z$', fractionDigits: 2, rateProvider: 'citrusrate_official' }
];

/**
 * 16 Citrusrate alternative currencies for those that overlap with Blink API
 * These provide an alternative rate source (Citrusrate aggregated African rates)
 * Displayed as "XXX (citrus)" in the currency selector
 */
export const CITRUSRATE_ALT_CURRENCIES = [
  { id: 'ETB_CITRUS', baseId: 'ETB', displayId: 'ETB (citrus)', name: 'Ethiopian Birr (Citrusrate)', flag: '🇪🇹', symbol: 'Br', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'GHS_CITRUS', baseId: 'GHS', displayId: 'GHS (citrus)', name: 'Ghanaian Cedi (Citrusrate)', flag: '🇬🇭', symbol: '₵', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'KES_CITRUS', baseId: 'KES', displayId: 'KES (citrus)', name: 'Kenyan Shilling (Citrusrate)', flag: '🇰🇪', symbol: 'KSh', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'LRD_CITRUS', baseId: 'LRD', displayId: 'LRD (citrus)', name: 'Liberian Dollar (Citrusrate)', flag: '🇱🇷', symbol: '$', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'MAD_CITRUS', baseId: 'MAD', displayId: 'MAD (citrus)', name: 'Moroccan Dirham (Citrusrate)', flag: '🇲🇦', symbol: 'د.م.', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'MUR_CITRUS', baseId: 'MUR', displayId: 'MUR (citrus)', name: 'Mauritian Rupee (Citrusrate)', flag: '🇲🇺', symbol: 'Rs', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'MWK_CITRUS', baseId: 'MWK', displayId: 'MWK (citrus)', name: 'Malawian Kwacha (Citrusrate)', flag: '🇲🇼', symbol: 'MK', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'MZN_CITRUS', baseId: 'MZN', displayId: 'MZN (citrus)', name: 'Mozambican Metical (Citrusrate)', flag: '🇲🇿', symbol: 'MT', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'NAD_CITRUS', baseId: 'NAD', displayId: 'NAD (citrus)', name: 'Namibian Dollar (Citrusrate)', flag: '🇳🇦', symbol: '$', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'NGN_CITRUS', baseId: 'NGN', displayId: 'NGN (citrus)', name: 'Nigerian Naira (Citrusrate)', flag: '🇳🇬', symbol: '₦', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'TZS_CITRUS', baseId: 'TZS', displayId: 'TZS (citrus)', name: 'Tanzanian Shilling (Citrusrate)', flag: '🇹🇿', symbol: 'TSh', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'UGX_CITRUS', baseId: 'UGX', displayId: 'UGX (citrus)', name: 'Ugandan Shilling (Citrusrate)', flag: '🇺🇬', symbol: 'USh', fractionDigits: 0, rateProvider: 'citrusrate_official' },
  { id: 'XAF_CITRUS', baseId: 'XAF', displayId: 'XAF (citrus)', name: 'CFA Franc BEAC (Citrusrate)', flag: '🇨🇲', symbol: 'FCFA', fractionDigits: 0, rateProvider: 'citrusrate_official' },
  { id: 'XOF_CITRUS', baseId: 'XOF', displayId: 'XOF (citrus)', name: 'CFA Franc BCEAO (Citrusrate)', flag: '🇸🇳', symbol: 'CFA', fractionDigits: 0, rateProvider: 'citrusrate_official' },
  { id: 'ZAR_CITRUS', baseId: 'ZAR', displayId: 'ZAR (citrus)', name: 'South African Rand (Citrusrate)', flag: '🇿🇦', symbol: 'R', fractionDigits: 2, rateProvider: 'citrusrate_official' },
  { id: 'ZMW_CITRUS', baseId: 'ZMW', displayId: 'ZMW (citrus)', name: 'Zambian Kwacha (Citrusrate)', flag: '🇿🇲', symbol: 'ZK', fractionDigits: 2, rateProvider: 'citrusrate_official' }
];

/**
 * Set of Citrusrate-exclusive currency IDs for quick lookup
 */
export const CITRUSRATE_EXCLUSIVE_IDS = new Set(CITRUSRATE_EXCLUSIVE_CURRENCIES.map(c => c.id));

/**
 * Check if a currency ID is a Citrusrate-exclusive currency
 */
export const isCitrusrateExclusiveCurrency = (currencyId) => CITRUSRATE_EXCLUSIVE_IDS.has(currencyId);

/**
 * Check if a currency ID is a Citrusrate alternative currency
 */
export const isCitrusrateAltCurrency = (currencyId) => currencyId && currencyId.endsWith('_CITRUS');

/**
 * Get the base currency ID from a Citrusrate alt currency
 */
export const getCitrusrateBaseCurrency = (currencyId) => {
  if (isCitrusrateAltCurrency(currencyId)) {
    return currencyId.replace('_CITRUS', '');
  }
  return currencyId;
};

/**
 * Get Citrusrate exclusive currency by ID
 */
export const getCitrusrateExclusiveCurrency = (currencyId) => 
  CITRUSRATE_EXCLUSIVE_CURRENCIES.find(c => c.id === currencyId) || null;

/**
 * Get Citrusrate alternative currency by ID
 */
export const getCitrusrateAltCurrency = (currencyId) => 
  CITRUSRATE_ALT_CURRENCIES.find(c => c.id === currencyId) || null;
