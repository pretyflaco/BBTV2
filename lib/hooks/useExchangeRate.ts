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
// Types
// ============================================================================

/** Exchange rate data structure matching Dashboard.js */
export interface ExchangeRateData {
  /** Price of 1 sat in the display currency */
  satPriceInCurrency: number;
  /** Currency code (e.g., 'USD', 'BTC') */
  currency: string;
}

/** Return type for the useExchangeRate hook */
export interface UseExchangeRateReturn {
  // Exchange rate state
  exchangeRate: ExchangeRateData | null;
  setExchangeRate: React.Dispatch<React.SetStateAction<ExchangeRateData | null>>;
  clearExchangeRate: () => void;

  // Loading state
  loadingRate: boolean;
  setLoadingRate: React.Dispatch<React.SetStateAction<boolean>>;

  // Derived state
  hasRate: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing exchange rate state
 *
 * @returns Exchange rate state and setters
 *
 * @example
 * ```tsx
 * const { exchangeRate, setExchangeRate, loadingRate, setLoadingRate } = useExchangeRate();
 * 
 * // Fetch and set rate (typically in a useEffect)
 * setLoadingRate(true);
 * const data = await fetchRate();
 * setExchangeRate({ satPriceInCurrency: data.satPriceInCurrency, currency: data.currency });
 * setLoadingRate(false);
 * ```
 */
export function useExchangeRate(): UseExchangeRateReturn {
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateData | null>(null);
  const [loadingRate, setLoadingRate] = useState<boolean>(false);

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
