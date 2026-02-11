/**
 * useInvoiceState Hook
 * 
 * Manages the current Lightning invoice state for POS payments.
 * Handles invoice creation, display state, and payment status polling.
 * 
 * @module lib/hooks/useInvoiceState
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

// ============================================================================
// Constants
// ============================================================================

/** Default polling interval in milliseconds */
export const DEFAULT_POLLING_INTERVAL_MS = 1000;

/** Default polling timeout in milliseconds (15 minutes) */
export const DEFAULT_POLLING_TIMEOUT_MS = 15 * 60 * 1000;

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing Lightning invoice state and payment status polling
 * 
 * @param {Object} [options] - Hook configuration options
 * @param {Object} [options.pollingConfig] - Polling configuration
 * @param {number} [options.pollingConfig.intervalMs=1000] - Polling interval in milliseconds
 * @param {number} [options.pollingConfig.timeoutMs=900000] - Polling timeout in milliseconds (15 min)
 * @param {boolean} [options.pollingConfig.enabled=true] - Enable polling
 * @param {function} [options.onPaymentReceived] - Callback when payment is received
 * @param {function} [options.onPollingTimeout] - Callback when polling times out
 * @param {function} [options.onPollingError] - Callback when polling encounters an error
 * @returns {Object} Invoice state and actions
 * 
 * @example
 * ```jsx
 * const {
 *   currentInvoice,
 *   showingInvoice,
 *   isPolling,
 *   createInvoice,
 *   clearInvoice
 * } = useInvoiceState({
 *   onPaymentReceived: (data) => {
 *     console.log('Payment received!', data);
 *     playSuccessSound();
 *   }
 * });
 * 
 * // Create and display an invoice
 * createInvoice({
 *   paymentRequest: 'lnbc...',
 *   paymentHash: 'abc123...',
 *   satoshis: 1000,
 *   memo: 'Coffee'
 * });
 * ```
 */
export function useInvoiceState(options = {}) {
  const {
    pollingConfig = {},
    onPaymentReceived,
    onPollingTimeout,
    onPollingError,
  } = options;

  const {
    intervalMs = DEFAULT_POLLING_INTERVAL_MS,
    timeoutMs = DEFAULT_POLLING_TIMEOUT_MS,
    enabled = true,
  } = pollingConfig;

  // ===========================================================================
  // Core State
  // ===========================================================================
  
  /** @type {[Object|null, function]} */
  const [currentInvoice, setCurrentInvoiceState] = useState(null);
  
  /** @type {[boolean, function]} */
  const [showingInvoice, setShowingInvoice] = useState(false);
  
  /** @type {[boolean, function]} */
  const [isPolling, setIsPolling] = useState(false);
  
  /** @type {[number|null, function]} */
  const [pollingStartTime, setPollingStartTime] = useState(null);
  
  // Refs for polling management
  /** @type {React.MutableRefObject<number|null>} */
  const pollingIntervalRef = useRef(null);
  
  /** @type {React.MutableRefObject<number|null>} */
  const pollingStartTimeRef = useRef(null);

  // ===========================================================================
  // Derived State
  // ===========================================================================
  
  /** @type {boolean} */
  const hasInvoice = useMemo(() => currentInvoice !== null, [currentInvoice]);
  
  /** @type {string|null} */
  const paymentRequest = useMemo(() => 
    currentInvoice?.paymentRequest ?? null, 
    [currentInvoice]
  );
  
  /** @type {string|null} */
  const paymentHash = useMemo(() => 
    currentInvoice?.paymentHash ?? null, 
    [currentInvoice]
  );
  
  /** @type {number|null} */
  const invoiceAmount = useMemo(() => 
    currentInvoice?.satoshis ?? currentInvoice?.amount ?? null, 
    [currentInvoice]
  );

  /** @type {number|null} */
  const pollingTimeRemaining = useMemo(() => {
    if (!pollingStartTime || !isPolling) return null;
    const elapsed = Date.now() - pollingStartTime;
    const remaining = timeoutMs - elapsed;
    return remaining > 0 ? remaining : 0;
  }, [pollingStartTime, isPolling, timeoutMs]);

  // ===========================================================================
  // Polling Logic
  // ===========================================================================
  
  /**
   * Stop payment status polling
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    pollingStartTimeRef.current = null;
    setIsPolling(false);
    setPollingStartTime(null);
  }, []);

  /**
   * Start payment status polling
   */
  const startPolling = useCallback(() => {
    if (!currentInvoice?.paymentHash || !enabled) return;

    // Clear any existing polling
    stopPolling();

    const startTime = Date.now();
    pollingStartTimeRef.current = startTime;
    setPollingStartTime(startTime);
    setIsPolling(true);

    const pollPaymentStatus = async () => {
      // Check for timeout
      if (pollingStartTimeRef.current && 
          Date.now() - pollingStartTimeRef.current > timeoutMs) {
        console.log('⏱️ Payment polling timed out');
        stopPolling();
        onPollingTimeout?.();
        return;
      }

      try {
        const response = await fetch(`/api/payment-status/${currentInvoice.paymentHash}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.paid) {
          console.log('✅ Payment confirmed via polling');
          stopPolling();
          
          onPaymentReceived?.({
            amount: currentInvoice.satoshis || currentInvoice.amount || 0,
            currency: 'SATS',
            memo: currentInvoice.memo || 'Payment received',
            paymentHash: currentInvoice.paymentHash,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        console.error('Payment polling error:', error);
        onPollingError?.(error instanceof Error ? error : new Error(String(error)));
      }
    };

    // Start polling
    pollingIntervalRef.current = setInterval(pollPaymentStatus, intervalMs);
    
    // Also poll immediately
    pollPaymentStatus();
  }, [currentInvoice, enabled, intervalMs, timeoutMs, stopPolling, onPaymentReceived, onPollingTimeout, onPollingError]);

  // ===========================================================================
  // Auto-start/stop polling based on invoice
  // ===========================================================================
  
  useEffect(() => {
    if (currentInvoice?.paymentHash && enabled) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [currentInvoice?.paymentHash, enabled]);

  // ===========================================================================
  // Core Setters
  // ===========================================================================
  
  /**
   * Set the current invoice
   * @param {Object|null} invoice - Invoice data or null to clear
   */
  const setCurrentInvoice = useCallback((invoice) => {
    setCurrentInvoiceState(invoice);
    if (!invoice) {
      setShowingInvoice(false);
      stopPolling();
    }
  }, [stopPolling]);

  // ===========================================================================
  // Convenience Actions
  // ===========================================================================
  
  /**
   * Create and display a new invoice
   * @param {Object} invoice - Invoice data
   */
  const createInvoice = useCallback((invoice) => {
    setCurrentInvoiceState(invoice);
    setShowingInvoice(true);
  }, []);
  
  /**
   * Clear the current invoice
   */
  const clearInvoice = useCallback(() => {
    setCurrentInvoiceState(null);
    setShowingInvoice(false);
    stopPolling();
  }, [stopPolling]);
  
  /**
   * Show the invoice QR/display
   */
  const showInvoice = useCallback(() => {
    if (currentInvoice) {
      setShowingInvoice(true);
    }
  }, [currentInvoice]);
  
  /**
   * Hide the invoice display
   */
  const hideInvoice = useCallback(() => {
    setShowingInvoice(false);
  }, []);

  // ===========================================================================
  // Return
  // ===========================================================================
  
  return {
    // Core state
    currentInvoice,
    showingInvoice,
    
    // Polling state
    isPolling,
    pollingStartTime,
    pollingTimeRemaining,
    
    // Derived state
    hasInvoice,
    paymentRequest,
    paymentHash,
    invoiceAmount,
    
    // Core setters
    setCurrentInvoice,
    setShowingInvoice,
    
    // Convenience actions
    createInvoice,
    clearInvoice,
    showInvoice,
    hideInvoice,
    
    // Polling control
    startPolling,
    stopPolling,
  };
}

export default useInvoiceState;
