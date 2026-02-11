/**
 * useInvoiceState Hook
 * 
 * Manages the current Lightning invoice state for POS payments.
 * Handles invoice creation, display state, and payment status polling.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

/**
 * Lightning invoice data structure
 */
export interface InvoiceData {
  /** BOLT11 payment request string */
  paymentRequest: string;
  /** Payment hash for status tracking */
  paymentHash: string;
  /** Amount in satoshis */
  satoshis?: number;
  /** Alternative amount field */
  amount?: number;
  /** Invoice description/memo */
  memo?: string;
  /** Optional expiry timestamp */
  expiresAt?: number;
  /** Optional creation timestamp */
  createdAt?: number;
}

/**
 * Payment status from polling
 */
export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'error';

/**
 * Polling configuration options
 */
export interface PollingConfig {
  /** Polling interval in milliseconds (default: 1000) */
  intervalMs?: number;
  /** Polling timeout in milliseconds (default: 15 minutes) */
  timeoutMs?: number;
  /** Enable polling (default: true when invoice exists) */
  enabled?: boolean;
}

/**
 * Payment received callback data
 */
export interface PaymentReceivedData {
  amount: number;
  currency: string;
  memo: string;
  paymentHash: string;
  timestamp: number;
}

/**
 * State returned by useInvoiceState hook
 */
export interface InvoiceState {
  // Core state
  currentInvoice: InvoiceData | null;
  showingInvoice: boolean;
  
  // Polling state
  isPolling: boolean;
  pollingStartTime: number | null;
  pollingTimeRemaining: number | null;
  
  // Derived state
  hasInvoice: boolean;
  paymentRequest: string | null;
  paymentHash: string | null;
  invoiceAmount: number | null;
}

/**
 * Actions returned by useInvoiceState hook
 */
export interface InvoiceActions {
  // Core setters
  setCurrentInvoice: (invoice: InvoiceData | null) => void;
  setShowingInvoice: (showing: boolean) => void;
  
  // Convenience actions
  createInvoice: (invoice: InvoiceData) => void;
  clearInvoice: () => void;
  showInvoice: () => void;
  hideInvoice: () => void;
  
  // Polling control
  startPolling: () => void;
  stopPolling: () => void;
}

/**
 * Combined return type for useInvoiceState hook
 */
export type UseInvoiceStateReturn = InvoiceState & InvoiceActions;

/**
 * Hook options
 */
export interface UseInvoiceStateOptions {
  /** Polling configuration */
  pollingConfig?: PollingConfig;
  /** Callback when payment is received */
  onPaymentReceived?: (data: PaymentReceivedData) => void;
  /** Callback when polling times out */
  onPollingTimeout?: () => void;
  /** Callback when polling encounters an error */
  onPollingError?: (error: Error) => void;
}

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
 * @param options - Hook configuration options
 * @returns Invoice state and actions
 * 
 * @example
 * ```tsx
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
export function useInvoiceState(options: UseInvoiceStateOptions = {}): UseInvoiceStateReturn {
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
  
  const [currentInvoice, setCurrentInvoiceState] = useState<InvoiceData | null>(null);
  const [showingInvoice, setShowingInvoice] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingStartTime, setPollingStartTime] = useState<number | null>(null);
  
  // Refs for polling management
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingStartTimeRef = useRef<number | null>(null);

  // ===========================================================================
  // Derived State
  // ===========================================================================
  
  const hasInvoice = useMemo(() => currentInvoice !== null, [currentInvoice]);
  
  const paymentRequest = useMemo(() => 
    currentInvoice?.paymentRequest ?? null, 
    [currentInvoice]
  );
  
  const paymentHash = useMemo(() => 
    currentInvoice?.paymentHash ?? null, 
    [currentInvoice]
  );
  
  const invoiceAmount = useMemo(() => 
    currentInvoice?.satoshis ?? currentInvoice?.amount ?? null, 
    [currentInvoice]
  );

  // Calculate time remaining in polling
  const pollingTimeRemaining = useMemo(() => {
    if (!pollingStartTime || !isPolling) return null;
    const elapsed = Date.now() - pollingStartTime;
    const remaining = timeoutMs - elapsed;
    return remaining > 0 ? remaining : 0;
  }, [pollingStartTime, isPolling, timeoutMs]);

  // ===========================================================================
  // Polling Logic
  // ===========================================================================
  
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    pollingStartTimeRef.current = null;
    setIsPolling(false);
    setPollingStartTime(null);
  }, []);

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
  
  const setCurrentInvoice = useCallback((invoice: InvoiceData | null) => {
    setCurrentInvoiceState(invoice);
    if (!invoice) {
      setShowingInvoice(false);
      stopPolling();
    }
  }, [stopPolling]);

  // ===========================================================================
  // Convenience Actions
  // ===========================================================================
  
  const createInvoice = useCallback((invoice: InvoiceData) => {
    setCurrentInvoiceState(invoice);
    setShowingInvoice(true);
  }, []);
  
  const clearInvoice = useCallback(() => {
    setCurrentInvoiceState(null);
    setShowingInvoice(false);
    stopPolling();
  }, [stopPolling]);
  
  const showInvoice = useCallback(() => {
    if (currentInvoice) {
      setShowingInvoice(true);
    }
  }, [currentInvoice]);
  
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
