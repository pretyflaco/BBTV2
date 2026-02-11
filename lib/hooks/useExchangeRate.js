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
 * @returns {Object} Exchange rate state and conversion utilities
 * @property {Object|null} exchangeRate - Current exchange rate data
 * @property {function(Object|null): void} setExchangeRate - Set exchange rate
 * @property {function(): void} clearExchangeRate - Clear exchange rate
 * @property {boolean} loadingRate - Whether rate is being fetched
 * @property {function(boolean): void} setLoadingRate - Set loading state
 * @property {function(): void} startLoading - Start loading state
 * @property {function(): void} stopLoading - Stop loading state
 * @property {string|null} rateError - Error message if fetch failed
 * @property {function(string|null): void} setRateError - Set error state
 * @property {function(): void} clearRateError - Clear error state
 * @property {boolean} hasRate - Whether rate is available
 * @property {boolean} isStale - Whether rate is older than 5 minutes
 * @property {number|null} rateAge - Age of rate in milliseconds
 * @property {function(number): number|null} satsToFiat - Convert sats to fiat
 * @property {function(number): number|null} fiatToSats - Convert fiat to sats
 * @property {function(number, Object=): string|null} formatFiatAmount - Format sats as fiat string
 * @property {function(Object): void} updateRate - Update rate and clear loading/error
 * @property {function(string): void} handleRateFetchError - Handle fetch error
 * @property {function(): void} resetRateState - Reset all rate state
 *
 * @example
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
 */
export function useExchangeRate() {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [exchangeRate, setExchangeRateState] = useState(null);
  const [loadingRate, setLoadingRateState] = useState(false);
  const [rateError, setRateErrorState] = useState(null);

  // ---------------------------------------------------------------------------
  // Callbacks - Exchange Rate
  // ---------------------------------------------------------------------------

  const setExchangeRate = useCallback((rate) => {
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

  const setLoadingRate = useCallback((loading) => {
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

  const setRateError = useCallback((error) => {
    setRateErrorState(error);
  }, []);

  const clearRateError = useCallback(() => {
    setRateErrorState(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - Combined Actions
  // ---------------------------------------------------------------------------

  const updateRate = useCallback((rate) => {
    setExchangeRateState(rate);
    setLoadingRateState(false);
    setRateErrorState(null);
  }, []);

  const handleRateFetchError = useCallback((error) => {
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
    (sats) => {
      if (!exchangeRate) return null;
      const btcAmount = sats / SATS_PER_BTC;
      return btcAmount * exchangeRate.usdPerBtc;
    },
    [exchangeRate]
  );

  const fiatToSats = useCallback(
    (fiat) => {
      if (!exchangeRate || exchangeRate.usdPerBtc === 0) return null;
      const btcAmount = fiat / exchangeRate.usdPerBtc;
      return Math.round(btcAmount * SATS_PER_BTC);
    },
    [exchangeRate]
  );

  const formatFiatAmount = useCallback(
    (sats, options) => {
      const fiatValue = satsToFiat(sats);
      if (fiatValue === null) return null;

      const defaultOptions = {
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
