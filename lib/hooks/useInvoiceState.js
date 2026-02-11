/**
 * useInvoiceState Hook
 *
 * Manages raw current invoice state for POS payments and NFC.
 * Polling logic remains in Dashboard.js since it depends on triggerPaymentAnimation,
 * posPaymentReceivedRef, fetchData, and other Dashboard-specific concerns.
 *
 * @module lib/hooks/useInvoiceState
 */

import { useState, useCallback } from 'react';

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing current invoice state
 *
 * @returns {Object} Invoice state and setters
 * @returns {Object|null} returns.currentInvoice - Current invoice data
 * @returns {function} returns.setCurrentInvoice - Set current invoice
 * @returns {function} returns.clearInvoice - Clear current invoice
 * @returns {boolean} returns.hasInvoice - Whether an invoice exists
 *
 * @example
 * ```jsx
 * const { currentInvoice, setCurrentInvoice, clearInvoice } = useInvoiceState();
 *
 * // POS sets the invoice when created
 * setCurrentInvoice({ paymentRequest: 'lnbc...', paymentHash: 'abc123', satoshis: 1000 });
 *
 * // Dashboard polls for payment using currentInvoice.paymentHash
 * // Dashboard clears invoice on payment success
 * clearInvoice();
 * ```
 */
export function useInvoiceState() {
  const [currentInvoice, setCurrentInvoice] = useState(null);

  const clearInvoice = useCallback(() => {
    setCurrentInvoice(null);
  }, []);

  const hasInvoice = currentInvoice !== null;

  return {
    currentInvoice,
    setCurrentInvoice,
    clearInvoice,
    hasInvoice,
  };
}

export default useInvoiceState;
