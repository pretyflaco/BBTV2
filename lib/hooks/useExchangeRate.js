/**
 * useExchangeRate Hook
 *
 * Manages exchange rate state for displaying sats equivalent values.
 * The exchange rate shape matches Dashboard.js: { satPriceInCurrency, currency }
 *
 * Note: Fetch logic remains in Dashboard.js since it depends on displayCurrency 
 * and apiKey from other hooks/auth context.
 *
 * @module lib/hooks/useExchangeRate
 */

import { useState, useCallback } from 'react';

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing exchange rate state
 *
 * @returns {Object} Exchange rate state and setters
 * @property {Object|null} exchangeRate - Current exchange rate data { satPriceInCurrency, currency }
 * @property {function} setExchangeRate - Set exchange rate
 * @property {function} clearExchangeRate - Clear exchange rate
 * @property {boolean} loadingRate - Whether rate is being fetched
 * @property {function} setLoadingRate - Set loading state
 * @property {boolean} hasRate - Whether rate is available
 *
 * @example
 * const { exchangeRate, setExchangeRate, loadingRate, setLoadingRate } = useExchangeRate();
 * 
 * // Fetch and set rate (typically in a useEffect)
 * setLoadingRate(true);
 * const data = await fetchRate();
 * setExchangeRate({ satPriceInCurrency: data.satPriceInCurrency, currency: data.currency });
 * setLoadingRate(false);
 */
export function useExchangeRate() {
  const [exchangeRate, setExchangeRate] = useState(null);
  const [loadingRate, setLoadingRate] = useState(false);

  const clearExchangeRate = useCallback(() => {
    setExchangeRate(null);
  }, []);

  const hasRate = exchangeRate !== null;

  return {
    exchangeRate,
    setExchangeRate,
    clearExchangeRate,
    loadingRate,
    setLoadingRate,
    hasRate,
  };
}

export default useExchangeRate;
