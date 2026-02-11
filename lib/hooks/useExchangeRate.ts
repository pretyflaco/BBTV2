/**
 * useExchangeRate Hook
 *
 * Manages exchange rate state for displaying sats equivalent values
 * in fiat currency displays (e.g., ItemCart).
 *
 * State includes:
 * - Current exchange rate (USD per BTC)
 * - Loading state for rate fetching
 * - Error state for failed fetches
 *
 * Also provides conversion utilities for sats <-> fiat calculations.
 *
 * @module lib/hooks/useExchangeRate
 */

import { useState, useCallback, useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

/** Exchange rate data structure */
export interface ExchangeRateData {
  /** USD price per BTC */
  usdPerBtc: number;
  /** Timestamp when rate was fetched */
  timestamp: number;
  /** Currency code (e.g., 'USD') */
  currency: string;
}

/** Return type for the useExchangeRate hook */
export interface UseExchangeRateReturn {
  // Exchange rate state
  exchangeRate: ExchangeRateData | null;
  setExchangeRate: (rate: ExchangeRateData | null) => void;
  clearExchangeRate: () => void;

  // Loading state
  loadingRate: boolean;
  setLoadingRate: (loading: boolean) => void;
  startLoading: () => void;
  stopLoading: () => void;

  // Error state
  rateError: string | null;
  setRateError: (error: string | null) => void;
  clearRateError: () => void;

  // Derived state
  hasRate: boolean;
  isStale: boolean;
  rateAge: number | null;

  // Conversion utilities
  satsToFiat: (sats: number) => number | null;
  fiatToSats: (fiat: number) => number | null;
  formatFiatAmount: (sats: number, options?: Intl.NumberFormatOptions) => string | null;

  // Combined actions
  updateRate: (rate: ExchangeRateData) => void;
  handleRateFetchError: (error: string) => void;
  resetRateState: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Rate is considered stale after 5 minutes */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

/** Satoshis per Bitcoin */
const SATS_PER_BTC = 100_000_000;

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing exchange rate state and conversions
 *
 * @returns Exchange rate state and conversion utilities
 *
 * @example
 * ```tsx
 * const {
 *   exchangeRate,
 *   loadingRate,
 *   hasRate,
 *   satsToFiat,
 *   fiatToSats,
 *   formatFiatAmount,
 *   updateRate,
 *   startLoading,
 *   stopLoading,
 *   handleRateFetchError
 * } = useExchangeRate();
 *
 * // Fetch and update rate
 * useEffect(() => {
 *   async function fetchRate() {
 *     startLoading();
 *     try {
 *       const rate = await getExchangeRate();
 *       updateRate(rate);
 *     } catch (error) {
 *       handleRateFetchError(error.message);
 *     }
 *   }
 *   fetchRate();
 * }, []);
 *
 * // Convert and display
 * {hasRate && (
 *   <span>≈ {formatFiatAmount(satsAmount)}</span>
 * )}
 * ```
 */
export function useExchangeRate(): UseExchangeRateReturn {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [exchangeRate, setExchangeRateState] = useState<ExchangeRateData | null>(null);
  const [loadingRate, setLoadingRateState] = useState<boolean>(false);
  const [rateError, setRateErrorState] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Callbacks - Exchange Rate
  // ---------------------------------------------------------------------------

  const setExchangeRate = useCallback((rate: ExchangeRateData | null) => {
    setExchangeRateState(rate);
    if (rate !== null) {
      setRateErrorState(null);
    }
  }, []);

  const clearExchangeRate = useCallback(() => {
    setExchangeRateState(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - Loading State
  // ---------------------------------------------------------------------------

  const setLoadingRate = useCallback((loading: boolean) => {
    setLoadingRateState(loading);
  }, []);

  const startLoading = useCallback(() => {
    setLoadingRateState(true);
    setRateErrorState(null);
  }, []);

  const stopLoading = useCallback(() => {
    setLoadingRateState(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - Error State
  // ---------------------------------------------------------------------------

  const setRateError = useCallback((error: string | null) => {
    setRateErrorState(error);
  }, []);

  const clearRateError = useCallback(() => {
    setRateErrorState(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - Combined Actions
  // ---------------------------------------------------------------------------

  const updateRate = useCallback((rate: ExchangeRateData) => {
    setExchangeRateState(rate);
    setLoadingRateState(false);
    setRateErrorState(null);
  }, []);

  const handleRateFetchError = useCallback((error: string) => {
    setLoadingRateState(false);
    setRateErrorState(error);
  }, []);

  const resetRateState = useCallback(() => {
    setExchangeRateState(null);
    setLoadingRateState(false);
    setRateErrorState(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const hasRate = exchangeRate !== null;

  const rateAge = useMemo(() => {
    if (!exchangeRate) return null;
    return Date.now() - exchangeRate.timestamp;
  }, [exchangeRate]);

  const isStale = useMemo(() => {
    if (rateAge === null) return false;
    return rateAge > STALE_THRESHOLD_MS;
  }, [rateAge]);

  // ---------------------------------------------------------------------------
  // Conversion Utilities
  // ---------------------------------------------------------------------------

  const satsToFiat = useCallback(
    (sats: number): number | null => {
      if (!exchangeRate) return null;
      const btcAmount = sats / SATS_PER_BTC;
      return btcAmount * exchangeRate.usdPerBtc;
    },
    [exchangeRate]
  );

  const fiatToSats = useCallback(
    (fiat: number): number | null => {
      if (!exchangeRate || exchangeRate.usdPerBtc === 0) return null;
      const btcAmount = fiat / exchangeRate.usdPerBtc;
      return Math.round(btcAmount * SATS_PER_BTC);
    },
    [exchangeRate]
  );

  const formatFiatAmount = useCallback(
    (sats: number, options?: Intl.NumberFormatOptions): string | null => {
      const fiatValue = satsToFiat(sats);
      if (fiatValue === null) return null;

      const defaultOptions: Intl.NumberFormatOptions = {
        style: 'currency',
        currency: exchangeRate?.currency || 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      };

      try {
        return new Intl.NumberFormat('en-US', { ...defaultOptions, ...options }).format(fiatValue);
      } catch {
        return `$${fiatValue.toFixed(2)}`;
      }
    },
    [satsToFiat, exchangeRate]
  );

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // Exchange rate state
    exchangeRate,
    setExchangeRate,
    clearExchangeRate,

    // Loading state
    loadingRate,
    setLoadingRate,
    startLoading,
    stopLoading,

    // Error state
    rateError,
    setRateError,
    clearRateError,

    // Derived state
    hasRate,
    isStale,
    rateAge,

    // Conversion utilities
    satsToFiat,
    fiatToSats,
    formatFiatAmount,

    // Combined actions
    updateRate,
    handleRateFetchError,
    resetRateState,
  };
}

export default useExchangeRate;
