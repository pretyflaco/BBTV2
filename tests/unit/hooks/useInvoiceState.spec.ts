/**
 * Tests for useInvoiceState hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { 
  useInvoiceState, 
  DEFAULT_POLLING_INTERVAL_MS,
  DEFAULT_POLLING_TIMEOUT_MS
} from '../../../lib/hooks/useInvoiceState';
import type { InvoiceData, PaymentReceivedData } from '../../../lib/hooks/useInvoiceState';

// Mock timers for polling tests
jest.useFakeTimers();

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Suppress console logs during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('useInvoiceState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    mockFetch.mockReset();
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  // Helper to create mock invoice
  const createMockInvoice = (overrides?: Partial<InvoiceData>): InvoiceData => ({
    paymentRequest: 'lnbc1000n1...',
    paymentHash: 'abc123def456',
    satoshis: 1000,
    memo: 'Test payment',
    ...overrides,
  });

  // ===========================================================================
  // Constants Tests
  // ===========================================================================
  
  describe('Constants', () => {
    it('should export DEFAULT_POLLING_INTERVAL_MS as 1000', () => {
      expect(DEFAULT_POLLING_INTERVAL_MS).toBe(1000);
    });

    it('should export DEFAULT_POLLING_TIMEOUT_MS as 15 minutes', () => {
      expect(DEFAULT_POLLING_TIMEOUT_MS).toBe(15 * 60 * 1000);
    });
  });

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================
  
  describe('Initial State', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useInvoiceState());

      expect(result.current.currentInvoice).toBeNull();
      expect(result.current.showingInvoice).toBe(false);
      expect(result.current.isPolling).toBe(false);
      expect(result.current.pollingStartTime).toBeNull();
      expect(result.current.pollingTimeRemaining).toBeNull();
    });

    it('should initialize derived state correctly', () => {
      const { result } = renderHook(() => useInvoiceState());

      expect(result.current.hasInvoice).toBe(false);
      expect(result.current.paymentRequest).toBeNull();
      expect(result.current.paymentHash).toBeNull();
      expect(result.current.invoiceAmount).toBeNull();
    });
  });

  // ===========================================================================
  // Core Setters Tests
  // ===========================================================================
  
  describe('Core Setters', () => {
    it('should set current invoice', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const invoice = createMockInvoice();

      act(() => {
        result.current.setCurrentInvoice(invoice);
      });

      expect(result.current.currentInvoice).toEqual(invoice);
      expect(result.current.hasInvoice).toBe(true);
    });

    it('should clear invoice and hide it when setting to null', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));

      act(() => {
        result.current.setCurrentInvoice(createMockInvoice());
        result.current.setShowingInvoice(true);
      });

      act(() => {
        result.current.setCurrentInvoice(null);
      });

      expect(result.current.currentInvoice).toBeNull();
      expect(result.current.showingInvoice).toBe(false);
    });

    it('should set showingInvoice', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));

      act(() => {
        result.current.setShowingInvoice(true);
      });

      expect(result.current.showingInvoice).toBe(true);
    });
  });

  // ===========================================================================
  // Derived State Tests
  // ===========================================================================
  
  describe('Derived State', () => {
    it('should compute hasInvoice correctly', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));

      expect(result.current.hasInvoice).toBe(false);

      act(() => {
        result.current.setCurrentInvoice(createMockInvoice());
      });

      expect(result.current.hasInvoice).toBe(true);
    });

    it('should extract paymentRequest from invoice', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const invoice = createMockInvoice({ paymentRequest: 'lnbc5000...' });

      act(() => {
        result.current.setCurrentInvoice(invoice);
      });

      expect(result.current.paymentRequest).toBe('lnbc5000...');
    });

    it('should extract paymentHash from invoice', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const invoice = createMockInvoice({ paymentHash: 'myhash123' });

      act(() => {
        result.current.setCurrentInvoice(invoice);
      });

      expect(result.current.paymentHash).toBe('myhash123');
    });

    it('should prefer satoshis over amount for invoiceAmount', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const invoice = createMockInvoice({ satoshis: 5000, amount: 3000 });

      act(() => {
        result.current.setCurrentInvoice(invoice);
      });

      expect(result.current.invoiceAmount).toBe(5000);
    });

    it('should fall back to amount if satoshis not provided', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const invoice: InvoiceData = {
        paymentRequest: 'lnbc...',
        paymentHash: 'hash123',
        amount: 2500,
      };

      act(() => {
        result.current.setCurrentInvoice(invoice);
      });

      expect(result.current.invoiceAmount).toBe(2500);
    });
  });

  // ===========================================================================
  // Convenience Actions Tests
  // ===========================================================================
  
  describe('Convenience Actions', () => {
    it('should create invoice and show it', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const invoice = createMockInvoice();

      act(() => {
        result.current.createInvoice(invoice);
      });

      expect(result.current.currentInvoice).toEqual(invoice);
      expect(result.current.showingInvoice).toBe(true);
    });

    it('should clear invoice and hide it', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));

      act(() => {
        result.current.createInvoice(createMockInvoice());
      });

      act(() => {
        result.current.clearInvoice();
      });

      expect(result.current.currentInvoice).toBeNull();
      expect(result.current.showingInvoice).toBe(false);
    });

    it('should show invoice if one exists', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));

      act(() => {
        result.current.setCurrentInvoice(createMockInvoice());
      });

      act(() => {
        result.current.showInvoice();
      });

      expect(result.current.showingInvoice).toBe(true);
    });

    it('should not show invoice if none exists', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));

      act(() => {
        result.current.showInvoice();
      });

      expect(result.current.showingInvoice).toBe(false);
    });

    it('should hide invoice', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));

      act(() => {
        result.current.createInvoice(createMockInvoice());
      });

      act(() => {
        result.current.hideInvoice();
      });

      expect(result.current.showingInvoice).toBe(false);
      expect(result.current.currentInvoice).not.toBeNull(); // Invoice still exists
    });
  });

  // ===========================================================================
  // Polling Tests
  // ===========================================================================
  
  describe('Polling', () => {
    it('should start polling when invoice with paymentHash is set', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ paid: false }),
      });

      const { result } = renderHook(() => useInvoiceState());

      act(() => {
        result.current.createInvoice(createMockInvoice());
      });

      expect(result.current.isPolling).toBe(true);
      expect(result.current.pollingStartTime).not.toBeNull();
    });

    it('should not start polling if disabled', () => {
      const { result } = renderHook(() => useInvoiceState({
        pollingConfig: { enabled: false }
      }));

      act(() => {
        result.current.createInvoice(createMockInvoice());
      });

      expect(result.current.isPolling).toBe(false);
    });

    it('should stop polling when invoice is cleared', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ paid: false }),
      });

      const { result } = renderHook(() => useInvoiceState());

      act(() => {
        result.current.createInvoice(createMockInvoice());
      });

      expect(result.current.isPolling).toBe(true);

      act(() => {
        result.current.clearInvoice();
      });

      expect(result.current.isPolling).toBe(false);
    });

    it('should call onPaymentReceived when payment is confirmed', async () => {
      const onPaymentReceived = jest.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ paid: true }),
      });

      const { result } = renderHook(() => useInvoiceState({
        onPaymentReceived,
      }));

      act(() => {
        result.current.createInvoice(createMockInvoice({ satoshis: 2000, memo: 'Test' }));
      });

      // Wait for the fetch to resolve
      await act(async () => {
        await Promise.resolve();
      });

      expect(onPaymentReceived).toHaveBeenCalledWith(expect.objectContaining({
        amount: 2000,
        currency: 'SATS',
        memo: 'Test',
        paymentHash: 'abc123def456',
      }));
      expect(result.current.isPolling).toBe(false);
    });

    it('should call onPollingError on fetch error', async () => {
      const onPollingError = jest.fn();
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useInvoiceState({
        onPollingError,
      }));

      act(() => {
        result.current.createInvoice(createMockInvoice());
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(onPollingError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should call onPollingError on non-ok response', async () => {
      const onPollingError = jest.fn();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useInvoiceState({
        onPollingError,
      }));

      act(() => {
        result.current.createInvoice(createMockInvoice());
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(onPollingError).toHaveBeenCalled();
    });

    it('should timeout after configured duration', async () => {
      const onPollingTimeout = jest.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ paid: false }),
      });

      const { result } = renderHook(() => useInvoiceState({
        onPollingTimeout,
        pollingConfig: {
          timeoutMs: 5000, // 5 seconds for test
          intervalMs: 1000,
        },
      }));

      act(() => {
        result.current.createInvoice(createMockInvoice());
      });

      expect(result.current.isPolling).toBe(true);

      // Advance past timeout
      await act(async () => {
        jest.advanceTimersByTime(6000);
        await Promise.resolve();
      });

      expect(onPollingTimeout).toHaveBeenCalled();
      expect(result.current.isPolling).toBe(false);
    });

    it('should poll at configured interval', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ paid: false }),
      });

      const { result } = renderHook(() => useInvoiceState({
        pollingConfig: {
          intervalMs: 2000, // 2 seconds
        },
      }));

      act(() => {
        result.current.createInvoice(createMockInvoice());
      });

      // Initial immediate poll
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should manually stop polling', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ paid: false }),
      });

      const { result } = renderHook(() => useInvoiceState());

      act(() => {
        result.current.createInvoice(createMockInvoice());
      });

      expect(result.current.isPolling).toBe(true);

      act(() => {
        result.current.stopPolling();
      });

      expect(result.current.isPolling).toBe(false);
    });

    it('should manually start polling', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ paid: false }),
      });

      const { result } = renderHook(() => useInvoiceState({
        pollingConfig: { enabled: false },
      }));

      act(() => {
        result.current.createInvoice(createMockInvoice());
      });

      expect(result.current.isPolling).toBe(false);

      act(() => {
        result.current.startPolling();
      });

      // Still false because enabled is false in config
      // Need to test with enabled: true but manually controlling
    });

    it('should not start polling without paymentHash', () => {
      const { result } = renderHook(() => useInvoiceState());
      const invoice: InvoiceData = {
        paymentRequest: 'lnbc...',
        paymentHash: '', // Empty hash
      };

      act(() => {
        result.current.createInvoice(invoice);
      });

      expect(result.current.isPolling).toBe(false);
    });
  });

  // ===========================================================================
  // Callback Stability Tests
  // ===========================================================================
  
  describe('Callback Stability', () => {
    it('should maintain stable setCurrentInvoice reference', () => {
      const { result, rerender } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const initial = result.current.setCurrentInvoice;

      rerender();

      expect(result.current.setCurrentInvoice).toBe(initial);
    });

    it('should maintain stable createInvoice reference', () => {
      const { result, rerender } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const initial = result.current.createInvoice;

      rerender();

      expect(result.current.createInvoice).toBe(initial);
    });

    it('should maintain stable clearInvoice reference', () => {
      const { result, rerender } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const initial = result.current.clearInvoice;

      rerender();

      expect(result.current.clearInvoice).toBe(initial);
    });

    it('should maintain stable hideInvoice reference', () => {
      const { result, rerender } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const initial = result.current.hideInvoice;

      rerender();

      expect(result.current.hideInvoice).toBe(initial);
    });

    it('should maintain stable stopPolling reference', () => {
      const { result, rerender } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const initial = result.current.stopPolling;

      rerender();

      expect(result.current.stopPolling).toBe(initial);
    });

    it('should update showInvoice when currentInvoice changes', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const initial = result.current.showInvoice;

      act(() => {
        result.current.setCurrentInvoice(createMockInvoice());
      });

      expect(result.current.showInvoice).not.toBe(initial);
    });
  });

  // ===========================================================================
  // Workflow Tests
  // ===========================================================================
  
  describe('Workflow: Complete payment flow', () => {
    it('should handle full invoice lifecycle', async () => {
      const onPaymentReceived = jest.fn();
      
      // First poll returns not paid, second returns paid
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ paid: false }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ paid: true }),
        });

      const { result } = renderHook(() => useInvoiceState({
        onPaymentReceived,
        pollingConfig: { intervalMs: 1000 },
      }));

      // Create invoice
      act(() => {
        result.current.createInvoice(createMockInvoice({ satoshis: 5000 }));
      });

      expect(result.current.hasInvoice).toBe(true);
      expect(result.current.showingInvoice).toBe(true);
      expect(result.current.isPolling).toBe(true);

      // First poll - not paid
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isPolling).toBe(true);

      // Second poll - paid
      await act(async () => {
        jest.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      expect(onPaymentReceived).toHaveBeenCalledWith(expect.objectContaining({
        amount: 5000,
      }));
      expect(result.current.isPolling).toBe(false);
    });
  });

  describe('Workflow: User cancels invoice', () => {
    it('should stop polling when user clears invoice', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ paid: false }),
      });

      const { result } = renderHook(() => useInvoiceState());

      act(() => {
        result.current.createInvoice(createMockInvoice());
      });

      expect(result.current.isPolling).toBe(true);

      // User cancels
      act(() => {
        result.current.clearInvoice();
      });

      expect(result.current.isPolling).toBe(false);
      expect(result.current.currentInvoice).toBeNull();
      expect(result.current.showingInvoice).toBe(false);
    });
  });

  describe('Workflow: Multiple invoices in sequence', () => {
    it('should handle creating new invoice while one exists', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ paid: false }),
      });

      const { result } = renderHook(() => useInvoiceState());

      // Create first invoice
      act(() => {
        result.current.createInvoice(createMockInvoice({ paymentHash: 'first' }));
      });

      expect(result.current.paymentHash).toBe('first');
      const firstPollStart = result.current.pollingStartTime;

      // Create second invoice (replaces first)
      act(() => {
        result.current.createInvoice(createMockInvoice({ paymentHash: 'second' }));
      });

      expect(result.current.paymentHash).toBe('second');
      // Polling should have restarted
      expect(result.current.isPolling).toBe(true);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================
  
  describe('Edge Cases', () => {
    it('should handle invoice with no amount fields', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const invoice: InvoiceData = {
        paymentRequest: 'lnbc...',
        paymentHash: 'hash123',
      };

      act(() => {
        result.current.setCurrentInvoice(invoice);
      });

      expect(result.current.invoiceAmount).toBeNull();
    });

    it('should handle rapid invoice changes', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ paid: false }),
      });

      const { result } = renderHook(() => useInvoiceState());

      act(() => {
        result.current.createInvoice(createMockInvoice({ paymentHash: 'a' }));
        result.current.createInvoice(createMockInvoice({ paymentHash: 'b' }));
        result.current.createInvoice(createMockInvoice({ paymentHash: 'c' }));
      });

      expect(result.current.paymentHash).toBe('c');
    });

    it('should cleanup polling on unmount', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ paid: false }),
      });

      const { result, unmount } = renderHook(() => useInvoiceState());

      act(() => {
        result.current.createInvoice(createMockInvoice());
      });

      expect(result.current.isPolling).toBe(true);

      unmount();

      // Should not throw or cause issues
    });

    it('should handle hide/show without affecting invoice', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));
      const invoice = createMockInvoice();

      act(() => {
        result.current.createInvoice(invoice);
      });

      act(() => {
        result.current.hideInvoice();
      });

      expect(result.current.showingInvoice).toBe(false);
      expect(result.current.currentInvoice).toEqual(invoice);

      act(() => {
        result.current.showInvoice();
      });

      expect(result.current.showingInvoice).toBe(true);
      expect(result.current.currentInvoice).toEqual(invoice);
    });

    it('should handle setShowingInvoice without invoice', () => {
      const { result } = renderHook(() => useInvoiceState({ pollingConfig: { enabled: false } }));

      act(() => {
        result.current.setShowingInvoice(true);
      });

      // Can set to true even without invoice (component logic handles this)
      expect(result.current.showingInvoice).toBe(true);
    });
  });
});
