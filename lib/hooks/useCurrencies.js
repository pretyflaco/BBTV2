import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatDisplayAmount, getCurrencyById, SAT_CURRENCY, STREET_RATE_CURRENCIES } from '../currency-utils';
import { 
  CITRUSRATE_EXCLUSIVE_CURRENCIES, 
  CITRUSRATE_ALT_CURRENCIES 
} from '../citrusrate-currencies-client';

/**
 * Country mapping for Blink currencies (for search functionality)
 * Citrusrate currencies already have country info in their definitions
 */
const CURRENCY_COUNTRIES = {
  'USD': 'United States',
  'EUR': 'European Union',
  'GBP': 'United Kingdom',
  'JPY': 'Japan',
  'CAD': 'Canada',
  'AUD': 'Australia',
  'CHF': 'Switzerland',
  'CNY': 'China',
  'HKD': 'Hong Kong',
  'NZD': 'New Zealand',
  'SEK': 'Sweden',
  'KRW': 'South Korea',
  'SGD': 'Singapore',
  'NOK': 'Norway',
  'MXN': 'Mexico',
  'INR': 'India',
  'RUB': 'Russia',
  'BRL': 'Brazil',
  'TWD': 'Taiwan',
  'DKK': 'Denmark',
  'PLN': 'Poland',
  'THB': 'Thailand',
  'IDR': 'Indonesia',
  'HUF': 'Hungary',
  'CZK': 'Czech Republic',
  'ILS': 'Israel',
  'CLP': 'Chile',
  'PHP': 'Philippines',
  'AED': 'United Arab Emirates',
  'COP': 'Colombia',
  'SAR': 'Saudi Arabia',
  'MYR': 'Malaysia',
  'RON': 'Romania',
  'PEN': 'Peru',
  'ARS': 'Argentina',
  'VND': 'Vietnam',
  'PKR': 'Pakistan',
  'EGP': 'Egypt',
  'BDT': 'Bangladesh',
  'NGN': 'Nigeria',
  'KES': 'Kenya',
  'ZAR': 'South Africa',
  'GHS': 'Ghana',
  'TZS': 'Tanzania',
  'UGX': 'Uganda',
  'ETB': 'Ethiopia',
  'MAD': 'Morocco',
  'XAF': 'Central Africa',
  'XOF': 'West Africa',
  'MZN': 'Mozambique',
  'ZMW': 'Zambia',
  'MWK': 'Malawi',
  'NAD': 'Namibia',
  'MUR': 'Mauritius',
  'LRD': 'Liberia',
  'TRY': 'Turkey',
  'UAH': 'Ukraine',
  'BGN': 'Bulgaria',
  'HRK': 'Croatia',
  'ISK': 'Iceland',
  'QAR': 'Qatar',
  'KWD': 'Kuwait',
  'BHD': 'Bahrain',
  'OMR': 'Oman',
  'JOD': 'Jordan',
  'LBP': 'Lebanon',
  'LKR': 'Sri Lanka',
  'NPR': 'Nepal',
  'MMK': 'Myanmar',
  'KHR': 'Cambodia',
  'LAK': 'Laos',
  'BND': 'Brunei',
  'FJD': 'Fiji',
  'PGK': 'Papua New Guinea',
  'XPF': 'French Pacific',
  'WST': 'Samoa',
  'TOP': 'Tonga',
  'SBD': 'Solomon Islands',
  'VUV': 'Vanuatu',
  'TTD': 'Trinidad and Tobago',
  'JMD': 'Jamaica',
  'BBD': 'Barbados',
  'BSD': 'Bahamas',
  'BZD': 'Belize',
  'GYD': 'Guyana',
  'SRD': 'Suriname',
  'HTG': 'Haiti',
  'DOP': 'Dominican Republic',
  'CUP': 'Cuba',
  'GTQ': 'Guatemala',
  'HNL': 'Honduras',
  'NIO': 'Nicaragua',
  'PAB': 'Panama',
  'PYG': 'Paraguay',
  'UYU': 'Uruguay',
  'VES': 'Venezuela',
  'BOB': 'Bolivia',
  'CRC': 'Costa Rica',
  'AWG': 'Aruba',
  'ANG': 'Netherlands Antilles',
  'XCD': 'Eastern Caribbean',
  'KYD': 'Cayman Islands',
  'BMD': 'Bermuda',
};

/**
 * Default popular currencies (user can customize)
 */
const DEFAULT_POPULAR_CURRENCIES = ['BTC', 'USD', 'EUR', 'KES', 'ZAR', 'NGN'];

/**
 * Custom hook to fetch and manage currency list from Blink API
 * Merges Blink currencies with Citrusrate exclusive and alternative currencies
 * Caches currencies in localStorage to minimize API calls
 */
export function useCurrencies() {
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [popularCurrencyIds, setPopularCurrencyIds] = useState(DEFAULT_POPULAR_CURRENCIES);

  // Load popular currencies from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('popular-currencies');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPopularCurrencyIds(parsed);
          }
        }
      } catch (e) {
        console.error('Error loading popular currencies:', e);
      }
    }
  }, []);

  useEffect(() => {
    fetchCurrencies();
  }, []);

  const fetchCurrencies = async () => {
    try {
      // Check localStorage cache first (cache for 24 hours)
      const cached = getCachedCurrencies();
      if (cached) {
        setCurrencies(cached);
        setLoading(false);
        return;
      }

      // Fetch from API if no cache
      const response = await fetch('/api/blink/currency-list');
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch currencies');
      }

      const currencyList = data.currencies || [];
      setCurrencies(currencyList);
      
      // Cache in localStorage
      cacheCurrencies(currencyList);
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching currencies:', err);
      setError(err.message);
      setLoading(false);
      
      // Use fallback currencies if fetch fails
      setCurrencies(getFallbackCurrencies());
    }
  };

  const getCachedCurrencies = () => {
    if (typeof window === 'undefined') return null;
    
    try {
      const cached = localStorage.getItem('blink-currencies');
      if (!cached) return null;

      const { currencies: currencyList, timestamp } = JSON.parse(cached);
      const now = Date.now();
      const cacheAge = now - timestamp;
      const cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours

      if (cacheAge < cacheExpiry) {
        return currencyList;
      }
      
      return null;
    } catch (error) {
      console.error('Error reading currency cache:', error);
      return null;
    }
  };

  const cacheCurrencies = (currencyList) => {
    if (typeof window === 'undefined') return;
    
    try {
      const cacheData = {
        currencies: currencyList,
        timestamp: Date.now()
      };
      localStorage.setItem('blink-currencies', JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error caching currencies:', error);
    }
  };

  const getFallbackCurrencies = () => {
    // Fallback to basic currencies if API fails
    return [
      { id: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸', fractionDigits: 2 },
      { id: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺', fractionDigits: 2 },
      { id: 'GBP', symbol: '£', name: 'Pound Sterling', flag: '🇬🇧', fractionDigits: 2 },
      { id: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', flag: '🇰🇪', fractionDigits: 2 },
      { id: 'ZAR', symbol: 'R', name: 'South African Rand', flag: '🇿🇦', fractionDigits: 2 },
    ];
  };

  // Helper function to format amounts
  const formatAmount = (value, currencyId) => {
    return formatDisplayAmount(value, currencyId, currencies);
  };

  // Helper function to get currency by ID
  const getCurrency = (currencyId) => {
    return getCurrencyById(currencyId, currencies);
  };

  /**
   * Enrich a currency object with country data for search
   */
  const enrichCurrencyWithCountry = useCallback((currency) => {
    // If currency already has country (Citrusrate exclusive), return as is
    if (currency.country) return currency;
    
    // Look up country from our mapping
    const country = CURRENCY_COUNTRIES[currency.id] || CURRENCY_COUNTRIES[currency.baseId];
    if (country) {
      return { ...currency, country };
    }
    
    return currency;
  }, []);

  /**
   * Update popular currencies list (persisted to localStorage)
   */
  const setPopularCurrencies = useCallback((currencyIds) => {
    if (!Array.isArray(currencyIds)) return;
    
    setPopularCurrencyIds(currencyIds);
    
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('popular-currencies', JSON.stringify(currencyIds));
      } catch (e) {
        console.error('Error saving popular currencies:', e);
      }
    }
  }, []);

  /**
   * Add a currency to popular list
   */
  const addToPopular = useCallback((currencyId) => {
    if (!currencyId || popularCurrencyIds.includes(currencyId)) return;
    
    const newList = [...popularCurrencyIds, currencyId];
    setPopularCurrencies(newList);
  }, [popularCurrencyIds, setPopularCurrencies]);

  /**
   * Remove a currency from popular list
   */
  const removeFromPopular = useCallback((currencyId) => {
    if (!currencyId) return;
    
    const newList = popularCurrencyIds.filter(id => id !== currencyId);
    setPopularCurrencies(newList);
  }, [popularCurrencyIds, setPopularCurrencies]);

  /**
   * Check if a currency is in the popular list
   */
  const isPopularCurrency = useCallback((currencyId) => {
    return popularCurrencyIds.includes(currencyId);
  }, [popularCurrencyIds]);

  /**
   * Get all currencies including:
   * - Popular currencies first (with visual separator)
   * - Then all other currencies sorted alphabetically
   * - Street rate currencies injected after their base
   * - Citrusrate alternative currencies injected after their base
   * - Citrusrate exclusive currencies mixed in alphabetically
   * 
   * Returns: { popular: Currency[], all: Currency[] }
   */
  const getAllCurrencies = useCallback(() => {
    // Combine Blink currencies with Citrusrate exclusive currencies
    const allFiatCurrencies = [
      ...currencies,
      ...CITRUSRATE_EXCLUSIVE_CURRENCIES
    ];
    
    // Sort all fiat currencies alphabetically by ID
    allFiatCurrencies.sort((a, b) => a.id.localeCompare(b.id));
    
    // Build the full list with variants
    const fullList = [];
    const addedIds = new Set();
    
    // Add BTC first (always)
    fullList.push(enrichCurrencyWithCountry(SAT_CURRENCY));
    addedIds.add('BTC');
    
    // Add fiat currencies with their variants
    for (const currency of allFiatCurrencies) {
      if (addedIds.has(currency.id)) continue;
      
      const enriched = enrichCurrencyWithCountry(currency);
      fullList.push(enriched);
      addedIds.add(currency.id);
      
      // Check if there's a street rate version (e.g., MZN_STREET)
      const streetCurrency = STREET_RATE_CURRENCIES.find(sc => sc.baseId === currency.id);
      if (streetCurrency && !addedIds.has(streetCurrency.id)) {
        fullList.push(enrichCurrencyWithCountry(streetCurrency));
        addedIds.add(streetCurrency.id);
      }
      
      // Check if there's a Citrusrate alternative version (e.g., NGN_CITRUS)
      const citrusCurrency = CITRUSRATE_ALT_CURRENCIES.find(cc => cc.baseId === currency.id);
      if (citrusCurrency && !addedIds.has(citrusCurrency.id)) {
        fullList.push(enrichCurrencyWithCountry(citrusCurrency));
        addedIds.add(citrusCurrency.id);
      }
    }
    
    // Separate into popular and rest
    const popular = [];
    const rest = [];
    
    for (const currency of fullList) {
      if (popularCurrencyIds.includes(currency.id)) {
        popular.push(currency);
      } else {
        rest.push(currency);
      }
    }
    
    // Sort popular currencies by the order in popularCurrencyIds
    popular.sort((a, b) => {
      return popularCurrencyIds.indexOf(a.id) - popularCurrencyIds.indexOf(b.id);
    });
    
    return { popular, all: rest };
  }, [currencies, popularCurrencyIds, enrichCurrencyWithCountry]);

  /**
   * Get flat list of all currencies (for backward compatibility)
   */
  const getAllCurrenciesFlat = useCallback(() => {
    const { popular, all } = getAllCurrencies();
    return [...popular, ...all];
  }, [getAllCurrencies]);

  return {
    currencies,
    loading,
    error,
    formatAmount,
    getCurrency,
    getAllCurrencies,
    getAllCurrenciesFlat,
    popularCurrencyIds,
    setPopularCurrencies,
    addToPopular,
    removeFromPopular,
    isPopularCurrency,
    refetch: fetchCurrencies
  };
}
