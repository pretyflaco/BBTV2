/**
 * Tests for useDisplaySettings hook
 *
 * @module tests/unit/hooks/useDisplaySettings.spec
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useDisplaySettings } from '../../../lib/hooks/useDisplaySettings';

// ============================================================================
// Test Setup
// ============================================================================

describe('useDisplaySettings', () => {
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    // Reset localStorage mock
    mockLocalStorage = {};

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key: string) => mockLocalStorage[key] ?? null),
        setItem: jest.fn((key: string, value: string) => {
          mockLocalStorage[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete mockLocalStorage[key];
        }),
        clear: jest.fn(() => {
          mockLocalStorage = {};
        }),
      },
      writable: true,
    });

    // Mock navigator.language
    Object.defineProperty(navigator, 'language', {
      value: 'en-US',
      writable: true,
    });

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // ==========================================================================
  // Initial State Tests
  // ==========================================================================

  describe('Initial State', () => {
    it('should initialize with default values when localStorage is empty', () => {
      const { result } = renderHook(() => useDisplaySettings());

      expect(result.current.displayCurrency).toBe('USD');
      expect(result.current.numberFormat).toBe('auto');
      expect(result.current.bitcoinFormat).toBe('sats');
      expect(result.current.numpadLayout).toBe('calculator');
      expect(result.current.currencyFilter).toBe('');
      expect(result.current.currencyFilterDebounced).toBe('');
    });

    it('should load number format from localStorage', () => {
      mockLocalStorage['blinkpos-number-format'] = 'de-DE';

      const { result } = renderHook(() => useDisplaySettings());

      expect(result.current.numberFormat).toBe('de-DE');
    });

    it('should load bitcoin format from localStorage', () => {
      mockLocalStorage['blinkpos-bitcoin-format'] = 'btc';

      const { result } = renderHook(() => useDisplaySettings());

      expect(result.current.bitcoinFormat).toBe('btc');
    });

    it('should load numpad layout from localStorage', () => {
      mockLocalStorage['blinkpos-numpad-layout'] = 'phone';

      const { result } = renderHook(() => useDisplaySettings());

      expect(result.current.numpadLayout).toBe('phone');
    });

    it('should load all persisted settings from localStorage', () => {
      mockLocalStorage['blinkpos-number-format'] = 'fr-FR';
      mockLocalStorage['blinkpos-bitcoin-format'] = 'bip177';
      mockLocalStorage['blinkpos-numpad-layout'] = 'phone';

      const { result } = renderHook(() => useDisplaySettings());

      expect(result.current.numberFormat).toBe('fr-FR');
      expect(result.current.bitcoinFormat).toBe('bip177');
      expect(result.current.numpadLayout).toBe('phone');
    });
  });

  // ==========================================================================
  // Display Currency Tests
  // ==========================================================================

  describe('Display Currency', () => {
    it('should set display currency to BTC', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setDisplayCurrency('BTC');
      });

      expect(result.current.displayCurrency).toBe('BTC');
    });

    it('should set display currency to USD', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setDisplayCurrency('BTC');
      });

      act(() => {
        result.current.setDisplayCurrency('USD');
      });

      expect(result.current.displayCurrency).toBe('USD');
    });

    it('should toggle display currency from USD to BTC', () => {
      const { result } = renderHook(() => useDisplaySettings());

      expect(result.current.displayCurrency).toBe('USD');

      act(() => {
        result.current.toggleDisplayCurrency();
      });

      expect(result.current.displayCurrency).toBe('BTC');
    });

    it('should toggle display currency from BTC to USD', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setDisplayCurrency('BTC');
      });

      act(() => {
        result.current.toggleDisplayCurrency();
      });

      expect(result.current.displayCurrency).toBe('USD');
    });

    it('should toggle multiple times correctly', () => {
      const { result } = renderHook(() => useDisplaySettings());

      expect(result.current.displayCurrency).toBe('USD');

      act(() => {
        result.current.toggleDisplayCurrency();
      });
      expect(result.current.displayCurrency).toBe('BTC');

      act(() => {
        result.current.toggleDisplayCurrency();
      });
      expect(result.current.displayCurrency).toBe('USD');

      act(() => {
        result.current.toggleDisplayCurrency();
      });
      expect(result.current.displayCurrency).toBe('BTC');
    });
  });

  // ==========================================================================
  // Number Format Tests
  // ==========================================================================

  describe('Number Format', () => {
    it('should set number format and persist to localStorage', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setNumberFormat('de-DE');
      });

      expect(result.current.numberFormat).toBe('de-DE');
      expect(localStorage.setItem).toHaveBeenCalledWith('blinkpos-number-format', 'de-DE');
    });

    it('should support all number format options', () => {
      const { result } = renderHook(() => useDisplaySettings());

      const formats = ['auto', 'en-US', 'de-DE', 'fr-FR', 'es-ES', 'pt-BR', 'ja-JP', 'zh-CN'];

      formats.forEach((format) => {
        act(() => {
          result.current.setNumberFormat(format as any);
        });
        expect(result.current.numberFormat).toBe(format);
      });
    });
  });

  // ==========================================================================
  // Bitcoin Format Tests
  // ==========================================================================

  describe('Bitcoin Format', () => {
    it('should set bitcoin format and persist to localStorage', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setBitcoinFormat('btc');
      });

      expect(result.current.bitcoinFormat).toBe('btc');
      expect(localStorage.setItem).toHaveBeenCalledWith('blinkpos-bitcoin-format', 'btc');
    });

    it('should support sats format', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setBitcoinFormat('sats');
      });

      expect(result.current.bitcoinFormat).toBe('sats');
    });

    it('should support btc format', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setBitcoinFormat('btc');
      });

      expect(result.current.bitcoinFormat).toBe('btc');
    });

    it('should support bip177 format', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setBitcoinFormat('bip177');
      });

      expect(result.current.bitcoinFormat).toBe('bip177');
    });
  });

  // ==========================================================================
  // Numpad Layout Tests
  // ==========================================================================

  describe('Numpad Layout', () => {
    it('should set numpad layout and persist to localStorage', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setNumpadLayout('phone');
      });

      expect(result.current.numpadLayout).toBe('phone');
      expect(localStorage.setItem).toHaveBeenCalledWith('blinkpos-numpad-layout', 'phone');
    });

    it('should support calculator layout', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setNumpadLayout('calculator');
      });

      expect(result.current.numpadLayout).toBe('calculator');
    });

    it('should support phone layout', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setNumpadLayout('phone');
      });

      expect(result.current.numpadLayout).toBe('phone');
    });
  });

  // ==========================================================================
  // Currency Filter Tests
  // ==========================================================================

  describe('Currency Filter', () => {
    it('should set currency filter', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setCurrencyFilter('USD');
      });

      expect(result.current.currencyFilter).toBe('USD');
    });

    it('should debounce currency filter', async () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setCurrencyFilter('EU');
      });

      // Immediate value should be updated
      expect(result.current.currencyFilter).toBe('EU');
      // Debounced value should still be empty
      expect(result.current.currencyFilterDebounced).toBe('');

      // Fast-forward debounce timer
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Now debounced value should be updated
      expect(result.current.currencyFilterDebounced).toBe('EU');
    });

    it('should update debounced filter when typing quickly', () => {
      const { result } = renderHook(() => useDisplaySettings());

      // Type multiple characters quickly
      act(() => {
        result.current.setCurrencyFilter('E');
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      act(() => {
        result.current.setCurrencyFilter('EU');
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      act(() => {
        result.current.setCurrencyFilter('EUR');
      });

      // Debounced should still be empty
      expect(result.current.currencyFilterDebounced).toBe('');

      // Complete the debounce
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should have final value
      expect(result.current.currencyFilterDebounced).toBe('EUR');
    });

    it('should manually set debounced filter', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setCurrencyFilterDebounced('GBP');
      });

      expect(result.current.currencyFilterDebounced).toBe('GBP');
    });

    it('should clear currency filter', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setCurrencyFilter('EUR');
        result.current.setCurrencyFilterDebounced('EUR');
      });

      act(() => {
        result.current.clearCurrencyFilter();
      });

      expect(result.current.currencyFilter).toBe('');
      expect(result.current.currencyFilterDebounced).toBe('');
    });
  });

  // ==========================================================================
  // Utility Functions Tests
  // ==========================================================================

  describe('Utility Functions', () => {
    describe('getLocaleFromFormat', () => {
      it('should return navigator language when format is auto', () => {
        const { result } = renderHook(() => useDisplaySettings());

        expect(result.current.getLocaleFromFormat()).toBe('en-US');
      });

      it('should return specific locale when format is set', () => {
        const { result } = renderHook(() => useDisplaySettings());

        act(() => {
          result.current.setNumberFormat('de-DE');
        });

        expect(result.current.getLocaleFromFormat()).toBe('de-DE');
      });
    });

    describe('formatNumber', () => {
      it('should format numbers according to locale', () => {
        const { result } = renderHook(() => useDisplaySettings());

        const formatted = result.current.formatNumber(1234.56);

        // en-US locale uses comma for thousands
        expect(formatted).toBe('1,234.56');
      });

      it('should format numbers with German locale', () => {
        const { result } = renderHook(() => useDisplaySettings());

        act(() => {
          result.current.setNumberFormat('de-DE');
        });

        const formatted = result.current.formatNumber(1234.56);

        // de-DE locale uses period for thousands and comma for decimal
        expect(formatted).toBe('1.234,56');
      });

      it('should accept number format options', () => {
        const { result } = renderHook(() => useDisplaySettings());

        const formatted = result.current.formatNumber(1234.567, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

        expect(formatted).toBe('1,234.57');
      });

      it('should format currency correctly', () => {
        const { result } = renderHook(() => useDisplaySettings());

        const formatted = result.current.formatNumber(1234.56, {
          style: 'currency',
          currency: 'USD',
        });

        expect(formatted).toBe('$1,234.56');
      });
    });

    describe('formatBitcoin', () => {
      it('should format in sats by default', () => {
        const { result } = renderHook(() => useDisplaySettings());

        const formatted = result.current.formatBitcoin(100000);

        expect(formatted).toBe('100,000 sats');
      });

      it('should format in BTC', () => {
        const { result } = renderHook(() => useDisplaySettings());

        act(() => {
          result.current.setBitcoinFormat('btc');
        });

        const formatted = result.current.formatBitcoin(100000000);

        expect(formatted).toBe('1.00000000 BTC');
      });

      it('should format in BIP-177 style', () => {
        const { result } = renderHook(() => useDisplaySettings());

        act(() => {
          result.current.setBitcoinFormat('bip177');
        });

        const formatted = result.current.formatBitcoin(100000000);

        expect(formatted).toBe('₿1.00000000');
      });

      it('should format small amounts in sats', () => {
        const { result } = renderHook(() => useDisplaySettings());

        const formatted = result.current.formatBitcoin(1);

        expect(formatted).toBe('1 sats');
      });

      it('should format small amounts in BTC', () => {
        const { result } = renderHook(() => useDisplaySettings());

        act(() => {
          result.current.setBitcoinFormat('btc');
        });

        const formatted = result.current.formatBitcoin(1);

        expect(formatted).toBe('0.00000001 BTC');
      });

      it('should format with German locale in sats', () => {
        const { result } = renderHook(() => useDisplaySettings());

        act(() => {
          result.current.setNumberFormat('de-DE');
        });

        const formatted = result.current.formatBitcoin(100000);

        expect(formatted).toBe('100.000 sats');
      });

      it('should format with German locale in BTC', () => {
        const { result } = renderHook(() => useDisplaySettings());

        act(() => {
          result.current.setNumberFormat('de-DE');
          result.current.setBitcoinFormat('btc');
        });

        const formatted = result.current.formatBitcoin(100000000);

        expect(formatted).toBe('1,00000000 BTC');
      });
    });
  });

  // ==========================================================================
  // Callback Stability Tests
  // ==========================================================================

  describe('Callback Stability', () => {
    it('should maintain stable setDisplayCurrency reference', () => {
      const { result, rerender } = renderHook(() => useDisplaySettings());

      const firstRef = result.current.setDisplayCurrency;

      rerender();

      expect(result.current.setDisplayCurrency).toBe(firstRef);
    });

    it('should maintain stable toggleDisplayCurrency reference', () => {
      const { result, rerender } = renderHook(() => useDisplaySettings());

      const firstRef = result.current.toggleDisplayCurrency;

      rerender();

      expect(result.current.toggleDisplayCurrency).toBe(firstRef);
    });

    it('should maintain stable setNumberFormat reference', () => {
      const { result, rerender } = renderHook(() => useDisplaySettings());

      const firstRef = result.current.setNumberFormat;

      rerender();

      expect(result.current.setNumberFormat).toBe(firstRef);
    });

    it('should maintain stable setBitcoinFormat reference', () => {
      const { result, rerender } = renderHook(() => useDisplaySettings());

      const firstRef = result.current.setBitcoinFormat;

      rerender();

      expect(result.current.setBitcoinFormat).toBe(firstRef);
    });

    it('should maintain stable setNumpadLayout reference', () => {
      const { result, rerender } = renderHook(() => useDisplaySettings());

      const firstRef = result.current.setNumpadLayout;

      rerender();

      expect(result.current.setNumpadLayout).toBe(firstRef);
    });

    it('should maintain stable setCurrencyFilter reference', () => {
      const { result, rerender } = renderHook(() => useDisplaySettings());

      const firstRef = result.current.setCurrencyFilter;

      rerender();

      expect(result.current.setCurrencyFilter).toBe(firstRef);
    });

    it('should maintain stable clearCurrencyFilter reference', () => {
      const { result, rerender } = renderHook(() => useDisplaySettings());

      const firstRef = result.current.clearCurrencyFilter;

      rerender();

      expect(result.current.clearCurrencyFilter).toBe(firstRef);
    });

    it('should update formatBitcoin when bitcoinFormat changes', () => {
      const { result, rerender } = renderHook(() => useDisplaySettings());

      const firstRef = result.current.formatBitcoin;

      act(() => {
        result.current.setBitcoinFormat('btc');
      });

      rerender();

      // formatBitcoin depends on bitcoinFormat, so reference should change
      expect(result.current.formatBitcoin).not.toBe(firstRef);
    });

    it('should update getLocaleFromFormat when numberFormat changes', () => {
      const { result, rerender } = renderHook(() => useDisplaySettings());

      const firstRef = result.current.getLocaleFromFormat;

      act(() => {
        result.current.setNumberFormat('de-DE');
      });

      rerender();

      // getLocaleFromFormat depends on numberFormat, so reference should change
      expect(result.current.getLocaleFromFormat).not.toBe(firstRef);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle zero value in formatNumber', () => {
      const { result } = renderHook(() => useDisplaySettings());

      const formatted = result.current.formatNumber(0);

      expect(formatted).toBe('0');
    });

    it('should handle negative values in formatNumber', () => {
      const { result } = renderHook(() => useDisplaySettings());

      const formatted = result.current.formatNumber(-1234.56);

      expect(formatted).toBe('-1,234.56');
    });

    it('should handle zero sats in formatBitcoin', () => {
      const { result } = renderHook(() => useDisplaySettings());

      const formatted = result.current.formatBitcoin(0);

      expect(formatted).toBe('0 sats');
    });

    it('should handle very large values in formatBitcoin', () => {
      const { result } = renderHook(() => useDisplaySettings());

      // 21 million BTC in sats
      const formatted = result.current.formatBitcoin(2_100_000_000_000_000);

      expect(formatted).toBe('2,100,000,000,000,000 sats');
    });

    it('should handle empty string for currency filter', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setCurrencyFilter('EUR');
      });

      act(() => {
        result.current.setCurrencyFilter('');
      });

      expect(result.current.currencyFilter).toBe('');
    });

    it('should handle special characters in currency filter', () => {
      const { result } = renderHook(() => useDisplaySettings());

      act(() => {
        result.current.setCurrencyFilter('$€£');
      });

      expect(result.current.currencyFilter).toBe('$€£');
    });
  });

  // ==========================================================================
  // Workflow Tests
  // ==========================================================================

  describe('Workflow: User changes regional settings', () => {
    it('should handle complete regional settings configuration', () => {
      const { result } = renderHook(() => useDisplaySettings());

      // User opens regional settings and changes format to German
      act(() => {
        result.current.setNumberFormat('de-DE');
      });

      // User changes bitcoin display to BTC
      act(() => {
        result.current.setBitcoinFormat('btc');
      });

      // User prefers phone-style numpad
      act(() => {
        result.current.setNumpadLayout('phone');
      });

      // Verify all settings
      expect(result.current.numberFormat).toBe('de-DE');
      expect(result.current.bitcoinFormat).toBe('btc');
      expect(result.current.numpadLayout).toBe('phone');

      // Verify persistence
      expect(localStorage.setItem).toHaveBeenCalledWith('blinkpos-number-format', 'de-DE');
      expect(localStorage.setItem).toHaveBeenCalledWith('blinkpos-bitcoin-format', 'btc');
      expect(localStorage.setItem).toHaveBeenCalledWith('blinkpos-numpad-layout', 'phone');

      // Verify formatting works with new settings
      expect(result.current.formatNumber(1234.56)).toBe('1.234,56');
      expect(result.current.formatBitcoin(100000000)).toBe('1,00000000 BTC');
    });
  });

  describe('Workflow: User searches for currency', () => {
    it('should handle currency search with debouncing', () => {
      const { result } = renderHook(() => useDisplaySettings());

      // User starts typing
      act(() => {
        result.current.setCurrencyFilter('E');
      });

      expect(result.current.currencyFilter).toBe('E');
      expect(result.current.currencyFilterDebounced).toBe('');

      // Continue typing
      act(() => {
        jest.advanceTimersByTime(100);
        result.current.setCurrencyFilter('EU');
      });

      act(() => {
        jest.advanceTimersByTime(100);
        result.current.setCurrencyFilter('EUR');
      });

      // Still no debounced value
      expect(result.current.currencyFilterDebounced).toBe('');

      // Wait for debounce
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Now we have the final value
      expect(result.current.currencyFilterDebounced).toBe('EUR');

      // User clears search
      act(() => {
        result.current.clearCurrencyFilter();
      });

      expect(result.current.currencyFilter).toBe('');
      expect(result.current.currencyFilterDebounced).toBe('');
    });
  });

  describe('Workflow: User toggles display currency while viewing dashboard', () => {
    it('should toggle currency display for price viewing', () => {
      const { result } = renderHook(() => useDisplaySettings());

      // Start with USD
      expect(result.current.displayCurrency).toBe('USD');

      // User wants to see BTC equivalent
      act(() => {
        result.current.toggleDisplayCurrency();
      });

      expect(result.current.displayCurrency).toBe('BTC');

      // Format some bitcoin
      expect(result.current.formatBitcoin(50000)).toBe('50,000 sats');

      // User switches back to USD
      act(() => {
        result.current.toggleDisplayCurrency();
      });

      expect(result.current.displayCurrency).toBe('USD');
    });
  });
});
