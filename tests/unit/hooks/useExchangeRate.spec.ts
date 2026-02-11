/**
 * Tests for useExchangeRate hook
 *
 * @module tests/unit/hooks/useExchangeRate.spec
 */

import { renderHook, act } from '@testing-library/react';
import { useExchangeRate, ExchangeRateData } from '../../../lib/hooks/useExchangeRate';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockRate = (overrides?: Partial<ExchangeRateData>): ExchangeRateData => ({
  usdPerBtc: 50000,
  timestamp: Date.now(),
  currency: 'USD',
  ...overrides,
});

// ============================================================================
// Test Setup
// ============================================================================

describe('useExchangeRate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==========================================================================
  // Initial State Tests
  // ==========================================================================

  describe('Initial State', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useExchangeRate());

      expect(result.current.exchangeRate).toBeNull();
      expect(result.current.loadingRate).toBe(false);
      expect(result.current.rateError).toBeNull();
      expect(result.current.hasRate).toBe(false);
      expect(result.current.isStale).toBe(false);
      expect(result.current.rateAge).toBeNull();
    });
  });

  // ==========================================================================
  // Exchange Rate State Tests
  // ==========================================================================

  describe('Exchange Rate State', () => {
    it('should set exchange rate', () => {
      const { result } = renderHook(() => useExchangeRate());
      const mockRate = createMockRate();

      act(() => {
        result.current.setExchangeRate(mockRate);
      });

      expect(result.current.exchangeRate).toEqual(mockRate);
      expect(result.current.hasRate).toBe(true);
    });

    it('should clear exchange rate', () => {
      const { result } = renderHook(() => useExchangeRate());
      const mockRate = createMockRate();

      act(() => {
        result.current.setExchangeRate(mockRate);
      });

      act(() => {
        result.current.clearExchangeRate();
      });

      expect(result.current.exchangeRate).toBeNull();
      expect(result.current.hasRate).toBe(false);
    });

    it('should clear error when setting valid rate', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.setRateError('Network error');
      });

      expect(result.current.rateError).toBe('Network error');

      act(() => {
        result.current.setExchangeRate(createMockRate());
      });

      expect(result.current.rateError).toBeNull();
    });

    it('should not clear error when setting null rate', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.setRateError('Network error');
      });

      act(() => {
        result.current.setExchangeRate(null);
      });

      expect(result.current.rateError).toBe('Network error');
    });
  });

  // ==========================================================================
  // Loading State Tests
  // ==========================================================================

  describe('Loading State', () => {
    it('should set loading to true', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.setLoadingRate(true);
      });

      expect(result.current.loadingRate).toBe(true);
    });

    it('should set loading to false', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.setLoadingRate(true);
      });

      act(() => {
        result.current.setLoadingRate(false);
      });

      expect(result.current.loadingRate).toBe(false);
    });

    it('should start loading and clear error', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.setRateError('Previous error');
      });

      act(() => {
        result.current.startLoading();
      });

      expect(result.current.loadingRate).toBe(true);
      expect(result.current.rateError).toBeNull();
    });

    it('should stop loading', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.startLoading();
      });

      act(() => {
        result.current.stopLoading();
      });

      expect(result.current.loadingRate).toBe(false);
    });
  });

  // ==========================================================================
  // Error State Tests
  // ==========================================================================

  describe('Error State', () => {
    it('should set rate error', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.setRateError('Failed to fetch rate');
      });

      expect(result.current.rateError).toBe('Failed to fetch rate');
    });

    it('should clear rate error', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.setRateError('Error');
      });

      act(() => {
        result.current.clearRateError();
      });

      expect(result.current.rateError).toBeNull();
    });
  });

  // ==========================================================================
  // Combined Actions Tests
  // ==========================================================================

  describe('Combined Actions', () => {
    it('should update rate and clear loading/error', () => {
      const { result } = renderHook(() => useExchangeRate());
      const mockRate = createMockRate();

      // Set initial loading and error
      act(() => {
        result.current.startLoading();
        result.current.setRateError('Some error');
      });

      act(() => {
        result.current.updateRate(mockRate);
      });

      expect(result.current.exchangeRate).toEqual(mockRate);
      expect(result.current.loadingRate).toBe(false);
      expect(result.current.rateError).toBeNull();
    });

    it('should handle rate fetch error', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.startLoading();
      });

      act(() => {
        result.current.handleRateFetchError('Network timeout');
      });

      expect(result.current.loadingRate).toBe(false);
      expect(result.current.rateError).toBe('Network timeout');
    });

    it('should reset all rate state', () => {
      const { result } = renderHook(() => useExchangeRate());

      // Set various states
      act(() => {
        result.current.setExchangeRate(createMockRate());
        result.current.setLoadingRate(true);
        result.current.setRateError('Error');
      });

      act(() => {
        result.current.resetRateState();
      });

      expect(result.current.exchangeRate).toBeNull();
      expect(result.current.loadingRate).toBe(false);
      expect(result.current.rateError).toBeNull();
    });
  });

  // ==========================================================================
  // Derived State Tests
  // ==========================================================================

  describe('Derived State', () => {
    it('should calculate rate age', () => {
      const { result } = renderHook(() => useExchangeRate());
      const timestamp = Date.now() - 60000; // 1 minute ago

      act(() => {
        result.current.setExchangeRate(createMockRate({ timestamp }));
      });

      expect(result.current.rateAge).toBeGreaterThanOrEqual(60000);
    });

    it('should return null rate age when no rate', () => {
      const { result } = renderHook(() => useExchangeRate());

      expect(result.current.rateAge).toBeNull();
    });

    it('should detect stale rate (older than 5 minutes)', () => {
      const { result } = renderHook(() => useExchangeRate());
      const timestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago

      act(() => {
        result.current.setExchangeRate(createMockRate({ timestamp }));
      });

      expect(result.current.isStale).toBe(true);
    });

    it('should not be stale for fresh rate', () => {
      const { result } = renderHook(() => useExchangeRate());
      const timestamp = Date.now() - 60 * 1000; // 1 minute ago

      act(() => {
        result.current.setExchangeRate(createMockRate({ timestamp }));
      });

      expect(result.current.isStale).toBe(false);
    });

    it('should not be stale when no rate', () => {
      const { result } = renderHook(() => useExchangeRate());

      expect(result.current.isStale).toBe(false);
    });
  });

  // ==========================================================================
  // Conversion Utilities Tests
  // ==========================================================================

  describe('Conversion Utilities', () => {
    describe('satsToFiat', () => {
      it('should convert sats to fiat', () => {
        const { result } = renderHook(() => useExchangeRate());

        act(() => {
          result.current.setExchangeRate(createMockRate({ usdPerBtc: 50000 }));
        });

        // 1 BTC = 100,000,000 sats = $50,000
        // 100,000 sats = 0.001 BTC = $50
        expect(result.current.satsToFiat(100000)).toBe(50);
      });

      it('should return null when no rate', () => {
        const { result } = renderHook(() => useExchangeRate());

        expect(result.current.satsToFiat(100000)).toBeNull();
      });

      it('should handle 1 sat conversion', () => {
        const { result } = renderHook(() => useExchangeRate());

        act(() => {
          result.current.setExchangeRate(createMockRate({ usdPerBtc: 50000 }));
        });

        // 1 sat = 0.00000001 BTC = $0.0005
        expect(result.current.satsToFiat(1)).toBeCloseTo(0.0005, 6);
      });

      it('should handle 1 BTC conversion', () => {
        const { result } = renderHook(() => useExchangeRate());

        act(() => {
          result.current.setExchangeRate(createMockRate({ usdPerBtc: 50000 }));
        });

        expect(result.current.satsToFiat(100000000)).toBe(50000);
      });

      it('should handle zero sats', () => {
        const { result } = renderHook(() => useExchangeRate());

        act(() => {
          result.current.setExchangeRate(createMockRate({ usdPerBtc: 50000 }));
        });

        expect(result.current.satsToFiat(0)).toBe(0);
      });
    });

    describe('fiatToSats', () => {
      it('should convert fiat to sats', () => {
        const { result } = renderHook(() => useExchangeRate());

        act(() => {
          result.current.setExchangeRate(createMockRate({ usdPerBtc: 50000 }));
        });

        // $50 = 0.001 BTC = 100,000 sats
        expect(result.current.fiatToSats(50)).toBe(100000);
      });

      it('should return null when no rate', () => {
        const { result } = renderHook(() => useExchangeRate());

        expect(result.current.fiatToSats(50)).toBeNull();
      });

      it('should return null when rate is zero', () => {
        const { result } = renderHook(() => useExchangeRate());

        act(() => {
          result.current.setExchangeRate(createMockRate({ usdPerBtc: 0 }));
        });

        expect(result.current.fiatToSats(50)).toBeNull();
      });

      it('should round to nearest sat', () => {
        const { result } = renderHook(() => useExchangeRate());

        act(() => {
          result.current.setExchangeRate(createMockRate({ usdPerBtc: 50000 }));
        });

        // $0.01 = 0.0000002 BTC = 20 sats
        expect(result.current.fiatToSats(0.01)).toBe(20);
      });

      it('should handle $1 conversion', () => {
        const { result } = renderHook(() => useExchangeRate());

        act(() => {
          result.current.setExchangeRate(createMockRate({ usdPerBtc: 50000 }));
        });

        // $1 = 0.00002 BTC = 2,000 sats
        expect(result.current.fiatToSats(1)).toBe(2000);
      });

      it('should handle zero fiat', () => {
        const { result } = renderHook(() => useExchangeRate());

        act(() => {
          result.current.setExchangeRate(createMockRate({ usdPerBtc: 50000 }));
        });

        expect(result.current.fiatToSats(0)).toBe(0);
      });
    });

    describe('formatFiatAmount', () => {
      it('should format sats as currency string', () => {
        const { result } = renderHook(() => useExchangeRate());

        act(() => {
          result.current.setExchangeRate(createMockRate({ usdPerBtc: 50000, currency: 'USD' }));
        });

        // 100,000 sats = $50
        expect(result.current.formatFiatAmount(100000)).toBe('$50.00');
      });

      it('should return null when no rate', () => {
        const { result } = renderHook(() => useExchangeRate());

        expect(result.current.formatFiatAmount(100000)).toBeNull();
      });

      it('should format small amounts', () => {
        const { result } = renderHook(() => useExchangeRate());

        act(() => {
          result.current.setExchangeRate(createMockRate({ usdPerBtc: 50000 }));
        });

        // 100 sats = $0.05
        expect(result.current.formatFiatAmount(100)).toBe('$0.05');
      });

      it('should format large amounts', () => {
        const { result } = renderHook(() => useExchangeRate());

        act(() => {
          result.current.setExchangeRate(createMockRate({ usdPerBtc: 50000 }));
        });

        // 1 BTC = $50,000
        expect(result.current.formatFiatAmount(100000000)).toBe('$50,000.00');
      });

      it('should accept custom format options', () => {
        const { result } = renderHook(() => useExchangeRate());

        act(() => {
          result.current.setExchangeRate(createMockRate({ usdPerBtc: 50000 }));
        });

        const formatted = result.current.formatFiatAmount(100000, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });

        expect(formatted).toBe('$50');
      });
    });
  });

  // ==========================================================================
  // Callback Stability Tests
  // ==========================================================================

  describe('Callback Stability', () => {
    it('should maintain stable setExchangeRate reference', () => {
      const { result, rerender } = renderHook(() => useExchangeRate());

      const firstRef = result.current.setExchangeRate;

      rerender();

      expect(result.current.setExchangeRate).toBe(firstRef);
    });

    it('should maintain stable clearExchangeRate reference', () => {
      const { result, rerender } = renderHook(() => useExchangeRate());

      const firstRef = result.current.clearExchangeRate;

      rerender();

      expect(result.current.clearExchangeRate).toBe(firstRef);
    });

    it('should maintain stable startLoading reference', () => {
      const { result, rerender } = renderHook(() => useExchangeRate());

      const firstRef = result.current.startLoading;

      rerender();

      expect(result.current.startLoading).toBe(firstRef);
    });

    it('should maintain stable stopLoading reference', () => {
      const { result, rerender } = renderHook(() => useExchangeRate());

      const firstRef = result.current.stopLoading;

      rerender();

      expect(result.current.stopLoading).toBe(firstRef);
    });

    it('should maintain stable updateRate reference', () => {
      const { result, rerender } = renderHook(() => useExchangeRate());

      const firstRef = result.current.updateRate;

      rerender();

      expect(result.current.updateRate).toBe(firstRef);
    });

    it('should maintain stable handleRateFetchError reference', () => {
      const { result, rerender } = renderHook(() => useExchangeRate());

      const firstRef = result.current.handleRateFetchError;

      rerender();

      expect(result.current.handleRateFetchError).toBe(firstRef);
    });

    it('should maintain stable resetRateState reference', () => {
      const { result, rerender } = renderHook(() => useExchangeRate());

      const firstRef = result.current.resetRateState;

      rerender();

      expect(result.current.resetRateState).toBe(firstRef);
    });

    it('should update satsToFiat when exchangeRate changes', () => {
      const { result, rerender } = renderHook(() => useExchangeRate());

      const firstRef = result.current.satsToFiat;

      act(() => {
        result.current.setExchangeRate(createMockRate());
      });

      rerender();

      expect(result.current.satsToFiat).not.toBe(firstRef);
    });

    it('should update fiatToSats when exchangeRate changes', () => {
      const { result, rerender } = renderHook(() => useExchangeRate());

      const firstRef = result.current.fiatToSats;

      act(() => {
        result.current.setExchangeRate(createMockRate());
      });

      rerender();

      expect(result.current.fiatToSats).not.toBe(firstRef);
    });
  });

  // ==========================================================================
  // Workflow Tests
  // ==========================================================================

  describe('Workflow: Successful rate fetch', () => {
    it('should handle complete fetch flow', () => {
      const { result } = renderHook(() => useExchangeRate());
      const mockRate = createMockRate({ usdPerBtc: 60000 });

      // Start fetching
      act(() => {
        result.current.startLoading();
      });

      expect(result.current.loadingRate).toBe(true);
      expect(result.current.rateError).toBeNull();

      // Fetch succeeds
      act(() => {
        result.current.updateRate(mockRate);
      });

      expect(result.current.loadingRate).toBe(false);
      expect(result.current.exchangeRate).toEqual(mockRate);
      expect(result.current.hasRate).toBe(true);

      // Can now convert
      expect(result.current.satsToFiat(100000)).toBe(60); // $60 at $60k/BTC
    });
  });

  describe('Workflow: Failed rate fetch', () => {
    it('should handle fetch error flow', () => {
      const { result } = renderHook(() => useExchangeRate());

      // Start fetching
      act(() => {
        result.current.startLoading();
      });

      expect(result.current.loadingRate).toBe(true);

      // Fetch fails
      act(() => {
        result.current.handleRateFetchError('Network error: timeout');
      });

      expect(result.current.loadingRate).toBe(false);
      expect(result.current.rateError).toBe('Network error: timeout');
      expect(result.current.hasRate).toBe(false);

      // Conversions return null
      expect(result.current.satsToFiat(100000)).toBeNull();
    });
  });

  describe('Workflow: Rate refresh with stale detection', () => {
    it('should detect when rate needs refresh', () => {
      const { result } = renderHook(() => useExchangeRate());

      // Set initial rate
      act(() => {
        result.current.setExchangeRate(createMockRate({ timestamp: Date.now() }));
      });

      expect(result.current.isStale).toBe(false);

      // Advance time by 6 minutes
      act(() => {
        jest.advanceTimersByTime(6 * 60 * 1000);
      });

      // Need to trigger a rerender to recalculate isStale
      const { result: newResult } = renderHook(() => useExchangeRate());
      act(() => {
        newResult.current.setExchangeRate(createMockRate({
          timestamp: Date.now() - 6 * 60 * 1000,
        }));
      });

      expect(newResult.current.isStale).toBe(true);
    });
  });

  describe('Workflow: Retry after error', () => {
    it('should allow retry after error', () => {
      const { result } = renderHook(() => useExchangeRate());

      // First attempt fails
      act(() => {
        result.current.startLoading();
      });

      act(() => {
        result.current.handleRateFetchError('First attempt failed');
      });

      expect(result.current.rateError).toBe('First attempt failed');

      // Retry
      act(() => {
        result.current.startLoading();
      });

      expect(result.current.rateError).toBeNull(); // Error cleared
      expect(result.current.loadingRate).toBe(true);

      // Second attempt succeeds
      act(() => {
        result.current.updateRate(createMockRate());
      });

      expect(result.current.hasRate).toBe(true);
      expect(result.current.rateError).toBeNull();
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle very small BTC price', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.setExchangeRate(createMockRate({ usdPerBtc: 1 }));
      });

      // 100,000 sats at $1/BTC = $0.001
      expect(result.current.satsToFiat(100000)).toBeCloseTo(0.001, 6);
    });

    it('should handle very large BTC price', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.setExchangeRate(createMockRate({ usdPerBtc: 1000000 }));
      });

      // 100,000 sats at $1M/BTC = $1,000
      expect(result.current.satsToFiat(100000)).toBe(1000);
    });

    it('should handle negative sats (should not happen but handle gracefully)', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.setExchangeRate(createMockRate({ usdPerBtc: 50000 }));
      });

      expect(result.current.satsToFiat(-100000)).toBe(-50);
    });

    it('should handle rapid state changes', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.startLoading();
        result.current.stopLoading();
        result.current.startLoading();
        result.current.updateRate(createMockRate());
      });

      expect(result.current.loadingRate).toBe(false);
      expect(result.current.hasRate).toBe(true);
    });

    it('should handle multiple rate updates', () => {
      const { result } = renderHook(() => useExchangeRate());

      act(() => {
        result.current.updateRate(createMockRate({ usdPerBtc: 50000 }));
      });

      expect(result.current.satsToFiat(100000)).toBe(50);

      act(() => {
        result.current.updateRate(createMockRate({ usdPerBtc: 60000 }));
      });

      expect(result.current.satsToFiat(100000)).toBe(60);
    });
  });
});
