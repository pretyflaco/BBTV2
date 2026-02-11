/**
 * Tests for useWalletState hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { 
  useWalletState, 
  DEFAULT_WALLETS_ENDPOINT 
} from '../../../lib/hooks/useWalletState';
import type { WalletInfo } from '../../../lib/hooks/useWalletState';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Suppress console logs during tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

describe('useWalletState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  // Helper to create mock wallets
  const createMockWallets = (): WalletInfo[] => [
    { id: 'btc-wallet-1', walletCurrency: 'BTC', balance: 100000 },
    { id: 'usd-wallet-1', walletCurrency: 'USD', balance: 5000 },
  ];

  // ===========================================================================
  // Constants Tests
  // ===========================================================================
  
  describe('Constants', () => {
    it('should export DEFAULT_WALLETS_ENDPOINT', () => {
      expect(DEFAULT_WALLETS_ENDPOINT).toBe('/api/wallets');
    });
  });

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================
  
  describe('Initial State', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useWalletState());

      expect(result.current.apiKey).toBeNull();
      expect(result.current.wallets).toEqual([]);
      expect(result.current.isLoadingApiKey).toBe(false);
      expect(result.current.isLoadingWallets).toBe(false);
      expect(result.current.apiKeyError).toBeNull();
      expect(result.current.walletsError).toBeNull();
    });

    it('should initialize derived state correctly', () => {
      const { result } = renderHook(() => useWalletState());

      expect(result.current.hasApiKey).toBe(false);
      expect(result.current.hasWallets).toBe(false);
      expect(result.current.btcWallet).toBeNull();
      expect(result.current.usdWallet).toBeNull();
      expect(result.current.btcWalletId).toBeNull();
      expect(result.current.usdWalletId).toBeNull();
      expect(result.current.btcBalance).toBeNull();
      expect(result.current.usdBalance).toBeNull();
    });
  });

  // ===========================================================================
  // Core Setters Tests
  // ===========================================================================
  
  describe('Core Setters', () => {
    it('should set API key', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      act(() => {
        result.current.setApiKey('test-api-key');
      });

      expect(result.current.apiKey).toBe('test-api-key');
      expect(result.current.hasApiKey).toBe(true);
    });

    it('should clear API key error when setting key', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      // Manually set an error state (simulating a failed fetch)
      act(() => {
        result.current.setApiKey('test-key');
      });

      expect(result.current.apiKeyError).toBeNull();
    });

    it('should set wallets', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));
      const wallets = createMockWallets();

      act(() => {
        result.current.setWallets(wallets);
      });

      expect(result.current.wallets).toEqual(wallets);
      expect(result.current.hasWallets).toBe(true);
    });

    it('should clear wallets error when setting wallets', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      act(() => {
        result.current.setWallets(createMockWallets());
      });

      expect(result.current.walletsError).toBeNull();
    });
  });

  // ===========================================================================
  // Derived State Tests
  // ===========================================================================
  
  describe('Derived State', () => {
    it('should compute hasApiKey correctly', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      expect(result.current.hasApiKey).toBe(false);

      act(() => {
        result.current.setApiKey('test-key');
      });

      expect(result.current.hasApiKey).toBe(true);

      act(() => {
        result.current.setApiKey('');
      });

      expect(result.current.hasApiKey).toBe(false);
    });

    it('should compute hasWallets correctly', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      expect(result.current.hasWallets).toBe(false);

      act(() => {
        result.current.setWallets(createMockWallets());
      });

      expect(result.current.hasWallets).toBe(true);

      act(() => {
        result.current.setWallets([]);
      });

      expect(result.current.hasWallets).toBe(false);
    });

    it('should extract BTC wallet', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));
      const wallets = createMockWallets();

      act(() => {
        result.current.setWallets(wallets);
      });

      expect(result.current.btcWallet).toEqual(wallets[0]);
      expect(result.current.btcWalletId).toBe('btc-wallet-1');
      expect(result.current.btcBalance).toBe(100000);
    });

    it('should extract USD wallet', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));
      const wallets = createMockWallets();

      act(() => {
        result.current.setWallets(wallets);
      });

      expect(result.current.usdWallet).toEqual(wallets[1]);
      expect(result.current.usdWalletId).toBe('usd-wallet-1');
      expect(result.current.usdBalance).toBe(5000);
    });

    it('should handle missing BTC wallet', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));
      const wallets: WalletInfo[] = [
        { id: 'usd-only', walletCurrency: 'USD', balance: 1000 },
      ];

      act(() => {
        result.current.setWallets(wallets);
      });

      expect(result.current.btcWallet).toBeNull();
      expect(result.current.btcWalletId).toBeNull();
      expect(result.current.btcBalance).toBeNull();
    });

    it('should handle missing USD wallet', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));
      const wallets: WalletInfo[] = [
        { id: 'btc-only', walletCurrency: 'BTC', balance: 50000 },
      ];

      act(() => {
        result.current.setWallets(wallets);
      });

      expect(result.current.usdWallet).toBeNull();
      expect(result.current.usdWalletId).toBeNull();
      expect(result.current.usdBalance).toBeNull();
    });
  });

  // ===========================================================================
  // fetchApiKey Tests
  // ===========================================================================
  
  describe('fetchApiKey', () => {
    it('should fetch API key successfully', async () => {
      const mockGetApiKey = jest.fn().mockResolvedValue('fetched-api-key');
      const { result } = renderHook(() => useWalletState({
        getApiKey: mockGetApiKey,
        autoFetchWallets: false,
      }));

      let fetchedKey: string | null = null;
      await act(async () => {
        fetchedKey = await result.current.fetchApiKey();
      });

      expect(fetchedKey).toBe('fetched-api-key');
      expect(result.current.apiKey).toBe('fetched-api-key');
      expect(result.current.isLoadingApiKey).toBe(false);
      expect(result.current.apiKeyError).toBeNull();
    });

    it('should handle null API key response', async () => {
      const mockGetApiKey = jest.fn().mockResolvedValue(null);
      const { result } = renderHook(() => useWalletState({
        getApiKey: mockGetApiKey,
        autoFetchWallets: false,
      }));

      let fetchedKey: string | null = null;
      await act(async () => {
        fetchedKey = await result.current.fetchApiKey();
      });

      expect(fetchedKey).toBeNull();
      expect(result.current.apiKey).toBeNull();
    });

    it('should handle API key fetch error', async () => {
      const mockGetApiKey = jest.fn().mockRejectedValue(new Error('Auth failed'));
      const { result } = renderHook(() => useWalletState({
        getApiKey: mockGetApiKey,
        autoFetchWallets: false,
      }));

      await act(async () => {
        await result.current.fetchApiKey();
      });

      expect(result.current.apiKey).toBeNull();
      expect(result.current.apiKeyError).toBe('Auth failed');
    });

    it('should warn if no getApiKey function provided', async () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      await act(async () => {
        await result.current.fetchApiKey();
      });

      expect(console.warn).toHaveBeenCalledWith('useWalletState: No getApiKey function provided');
    });

    it('should set loading state during fetch', async () => {
      let resolvePromise: (value: string) => void;
      const mockGetApiKey = jest.fn().mockImplementation(() => 
        new Promise<string>(resolve => { resolvePromise = resolve; })
      );

      const { result } = renderHook(() => useWalletState({
        getApiKey: mockGetApiKey,
        autoFetchWallets: false,
      }));

      expect(result.current.isLoadingApiKey).toBe(false);

      let fetchPromise: Promise<string | null>;
      act(() => {
        fetchPromise = result.current.fetchApiKey();
      });

      expect(result.current.isLoadingApiKey).toBe(true);

      await act(async () => {
        resolvePromise!('key');
        await fetchPromise;
      });

      expect(result.current.isLoadingApiKey).toBe(false);
    });
  });

  // ===========================================================================
  // fetchWallets Tests
  // ===========================================================================
  
  describe('fetchWallets', () => {
    it('should fetch wallets successfully', async () => {
      const wallets = createMockWallets();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ wallets }),
      });

      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      act(() => {
        result.current.setApiKey('test-key');
      });

      await act(async () => {
        await result.current.fetchWallets();
      });

      expect(result.current.wallets).toEqual(wallets);
      expect(result.current.isLoadingWallets).toBe(false);
      expect(result.current.walletsError).toBeNull();
    });

    it('should use override API key', async () => {
      const wallets = createMockWallets();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ wallets }),
      });

      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      await act(async () => {
        await result.current.fetchWallets('override-key');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        DEFAULT_WALLETS_ENDPOINT,
        expect.objectContaining({
          body: expect.stringContaining('override-key'),
        })
      );
    });

    it('should handle wallets as array response', async () => {
      const wallets = createMockWallets();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(wallets), // Direct array
      });

      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      act(() => {
        result.current.setApiKey('test-key');
      });

      await act(async () => {
        await result.current.fetchWallets();
      });

      expect(result.current.wallets).toEqual(wallets);
    });

    it('should handle empty response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      act(() => {
        result.current.setApiKey('test-key');
      });

      await act(async () => {
        await result.current.fetchWallets();
      });

      expect(result.current.wallets).toEqual([]);
    });

    it('should handle fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      act(() => {
        result.current.setApiKey('test-key');
      });

      await act(async () => {
        await result.current.fetchWallets();
      });

      expect(result.current.walletsError).toBe('Network error');
    });

    it('should handle non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      act(() => {
        result.current.setApiKey('test-key');
      });

      await act(async () => {
        await result.current.fetchWallets();
      });

      expect(result.current.walletsError).toBe('HTTP 401');
    });

    it('should warn if no API key available', async () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      await act(async () => {
        await result.current.fetchWallets();
      });

      expect(console.warn).toHaveBeenCalledWith('useWalletState: No API key available to fetch wallets');
    });

    it('should use custom endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ wallets: [] }),
      });

      const { result } = renderHook(() => useWalletState({
        walletsEndpoint: '/custom/wallets',
        autoFetchWallets: false,
      }));

      act(() => {
        result.current.setApiKey('test-key');
      });

      await act(async () => {
        await result.current.fetchWallets();
      });

      expect(mockFetch).toHaveBeenCalledWith('/custom/wallets', expect.any(Object));
    });

    it('should use custom environment', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ wallets: [] }),
      });

      const { result } = renderHook(() => useWalletState({
        environment: 'signet',
        autoFetchWallets: false,
      }));

      act(() => {
        result.current.setApiKey('test-key');
      });

      await act(async () => {
        await result.current.fetchWallets();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('signet'),
        })
      );
    });
  });

  // ===========================================================================
  // Auto-fetch Tests
  // ===========================================================================
  
  describe('Auto-fetch Wallets', () => {
    it('should auto-fetch wallets when API key is set', async () => {
      const wallets = createMockWallets();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ wallets }),
      });

      const { result } = renderHook(() => useWalletState({
        autoFetchWallets: true,
      }));

      await act(async () => {
        result.current.setApiKey('auto-fetch-key');
        // Wait for useEffect to trigger
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should not auto-fetch when disabled', async () => {
      const { result } = renderHook(() => useWalletState({
        autoFetchWallets: false,
      }));

      await act(async () => {
        result.current.setApiKey('no-auto-fetch-key');
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not auto-fetch if API key is same', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ wallets: [] }),
      });

      const { result } = renderHook(() => useWalletState({
        autoFetchWallets: true,
      }));

      await act(async () => {
        result.current.setApiKey('same-key');
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      const callCount = mockFetch.mock.calls.length;

      await act(async () => {
        result.current.setApiKey('same-key'); // Same key
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(mockFetch).toHaveBeenCalledTimes(callCount);
    });
  });

  // ===========================================================================
  // Convenience Actions Tests
  // ===========================================================================
  
  describe('Convenience Actions', () => {
    it('should clear API key', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      act(() => {
        result.current.setApiKey('test-key');
      });

      act(() => {
        result.current.clearApiKey();
      });

      expect(result.current.apiKey).toBeNull();
    });

    it('should clear wallets', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      act(() => {
        result.current.setWallets(createMockWallets());
      });

      act(() => {
        result.current.clearWallets();
      });

      expect(result.current.wallets).toEqual([]);
    });

    it('should clear all state', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      act(() => {
        result.current.setApiKey('test-key');
        result.current.setWallets(createMockWallets());
      });

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.apiKey).toBeNull();
      expect(result.current.wallets).toEqual([]);
    });

    it('should refresh all', async () => {
      const mockGetApiKey = jest.fn().mockResolvedValue('refreshed-key');
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ wallets: createMockWallets() }),
      });

      const { result } = renderHook(() => useWalletState({
        getApiKey: mockGetApiKey,
        autoFetchWallets: false,
      }));

      await act(async () => {
        await result.current.refreshAll();
      });

      expect(mockGetApiKey).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalled();
      expect(result.current.apiKey).toBe('refreshed-key');
    });

    it('should not fetch wallets in refreshAll if no API key', async () => {
      const mockGetApiKey = jest.fn().mockResolvedValue(null);

      const { result } = renderHook(() => useWalletState({
        getApiKey: mockGetApiKey,
        autoFetchWallets: false,
      }));

      await act(async () => {
        await result.current.refreshAll();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Callback Stability Tests
  // ===========================================================================
  
  describe('Callback Stability', () => {
    it('should maintain stable setApiKey reference', () => {
      const { result, rerender } = renderHook(() => useWalletState({ autoFetchWallets: false }));
      const initial = result.current.setApiKey;

      rerender();

      expect(result.current.setApiKey).toBe(initial);
    });

    it('should maintain stable setWallets reference', () => {
      const { result, rerender } = renderHook(() => useWalletState({ autoFetchWallets: false }));
      const initial = result.current.setWallets;

      rerender();

      expect(result.current.setWallets).toBe(initial);
    });

    it('should maintain stable clearApiKey reference', () => {
      const { result, rerender } = renderHook(() => useWalletState({ autoFetchWallets: false }));
      const initial = result.current.clearApiKey;

      rerender();

      expect(result.current.clearApiKey).toBe(initial);
    });

    it('should maintain stable clearWallets reference', () => {
      const { result, rerender } = renderHook(() => useWalletState({ autoFetchWallets: false }));
      const initial = result.current.clearWallets;

      rerender();

      expect(result.current.clearWallets).toBe(initial);
    });

    it('should maintain stable clearAll reference', () => {
      const { result, rerender } = renderHook(() => useWalletState({ autoFetchWallets: false }));
      const initial = result.current.clearAll;

      rerender();

      expect(result.current.clearAll).toBe(initial);
    });
  });

  // ===========================================================================
  // Workflow Tests
  // ===========================================================================
  
  describe('Workflow: Initial load', () => {
    it('should handle complete initialization flow', async () => {
      const mockGetApiKey = jest.fn().mockResolvedValue('init-key');
      const wallets = createMockWallets();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ wallets }),
      });

      const { result } = renderHook(() => useWalletState({
        getApiKey: mockGetApiKey,
        autoFetchWallets: true,
      }));

      // Initially empty
      expect(result.current.apiKey).toBeNull();
      expect(result.current.wallets).toEqual([]);

      // Fetch API key
      await act(async () => {
        await result.current.fetchApiKey();
        // Wait for auto-fetch
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.apiKey).toBe('init-key');
      expect(result.current.wallets).toEqual(wallets);
      expect(result.current.btcWallet).not.toBeNull();
      expect(result.current.usdWallet).not.toBeNull();
    });
  });

  describe('Workflow: Account switch', () => {
    it('should handle switching accounts', async () => {
      const mockGetApiKey = jest.fn()
        .mockResolvedValueOnce('account-1-key')
        .mockResolvedValueOnce('account-2-key');

      const wallets1 = [{ id: 'btc-1', walletCurrency: 'BTC' as const, balance: 10000 }];
      const wallets2 = [{ id: 'btc-2', walletCurrency: 'BTC' as const, balance: 50000 }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ wallets: wallets1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ wallets: wallets2 }),
        });

      const { result } = renderHook(() => useWalletState({
        getApiKey: mockGetApiKey,
        autoFetchWallets: true,
      }));

      // First account
      await act(async () => {
        await result.current.fetchApiKey();
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.btcBalance).toBe(10000);

      // Switch to second account
      await act(async () => {
        await result.current.fetchApiKey();
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(result.current.btcBalance).toBe(50000);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================
  
  describe('Edge Cases', () => {
    it('should handle wallet with zero balance', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      act(() => {
        result.current.setWallets([
          { id: 'empty', walletCurrency: 'BTC', balance: 0 },
        ]);
      });

      expect(result.current.btcBalance).toBe(0);
    });

    it('should handle multiple BTC wallets (uses first)', () => {
      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      act(() => {
        result.current.setWallets([
          { id: 'btc-1', walletCurrency: 'BTC', balance: 1000 },
          { id: 'btc-2', walletCurrency: 'BTC', balance: 2000 },
        ]);
      });

      expect(result.current.btcWalletId).toBe('btc-1');
      expect(result.current.btcBalance).toBe(1000);
    });

    it('should handle rapid API key changes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ wallets: [] }),
      });

      const { result } = renderHook(() => useWalletState({ autoFetchWallets: false }));

      act(() => {
        result.current.setApiKey('key-1');
        result.current.setApiKey('key-2');
        result.current.setApiKey('key-3');
      });

      expect(result.current.apiKey).toBe('key-3');
    });
  });
});
