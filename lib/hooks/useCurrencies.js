import { useState, useEffect } from 'react';
import { formatDisplayAmount, getCurrencyById, SAT_CURRENCY } from '../currency-utils';

/**
 * Custom hook to fetch and manage currency list from Blink API
 * Caches currencies in localStorage to minimize API calls
 */
export function useCurrencies() {
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  // Get all currencies including BTC (sats, then fiat)
  const getAllCurrencies = () => {
    return [SAT_CURRENCY, ...currencies];
  };

  return {
    currencies,
    loading,
    error,
    formatAmount,
    getCurrency,
    getAllCurrencies,
    refetch: fetchCurrencies
  };
}
