/**
 * usePaycodeState Hook
 *
 * Manages state for the Paycode feature which allows users to generate
 * static payment codes (QR codes) that can be printed and reused.
 *
 * State includes:
 * - Show/hide paycode modal
 * - Amount for the paycode (in sats, or empty for any amount)
 * - PDF generation loading state
 *
 * @module lib/hooks/usePaycodeState
 */

import { useState, useCallback } from 'react';

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing paycode (static payment code) state
 *
 * @returns {Object} Paycode state and actions
 * @property {boolean} showPaycode - Whether paycode modal is visible
 * @property {function(boolean): void} setShowPaycode - Set paycode visibility
 * @property {function(): void} openPaycode - Open paycode modal
 * @property {function(): void} closePaycode - Close paycode modal
 * @property {function(): void} togglePaycode - Toggle paycode modal
 * @property {string} paycodeAmount - Amount for the paycode in sats
 * @property {function(string): void} setPaycodeAmount - Set paycode amount
 * @property {function(): void} clearPaycodeAmount - Clear paycode amount
 * @property {boolean} hasPaycodeAmount - Whether amount is set
 * @property {boolean} paycodeGeneratingPdf - Whether PDF is being generated
 * @property {function(boolean): void} setPaycodeGeneratingPdf - Set PDF generation state
 * @property {function(): void} startPdfGeneration - Start PDF generation
 * @property {function(): void} finishPdfGeneration - Finish PDF generation
 * @property {function(): void} resetPaycode - Reset all paycode state
 * @property {function(string): void} openPaycodeWithAmount - Open modal with amount
 *
 * @example
 * const {
 *   showPaycode,
 *   openPaycode,
 *   closePaycode,
 *   paycodeAmount,
 *   setPaycodeAmount,
 *   paycodeGeneratingPdf,
 *   startPdfGeneration,
 *   finishPdfGeneration
 * } = usePaycodeState();
 *
 * // Open paycode modal
 * <button onClick={openPaycode}>Generate Paycode</button>
 *
 * // Set amount for paycode
 * <input
 *   value={paycodeAmount}
 *   onChange={(e) => setPaycodeAmount(e.target.value)}
 * />
 *
 * // Generate PDF
 * <button
 *   onClick={async () => {
 *     startPdfGeneration();
 *     await generatePdf();
 *     finishPdfGeneration();
 *   }}
 *   disabled={paycodeGeneratingPdf}
 * >
 *   {paycodeGeneratingPdf ? 'Generating...' : 'Download PDF'}
 * </button>
 */
export function usePaycodeState() {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [showPaycode, setShowPaycodeState] = useState(false);
  const [paycodeAmount, setPaycodeAmountState] = useState('');
  const [paycodeGeneratingPdf, setPaycodeGeneratingPdfState] = useState(false);

  // ---------------------------------------------------------------------------
  // Callbacks - Visibility
  // ---------------------------------------------------------------------------

  const setShowPaycode = useCallback((show) => {
    setShowPaycodeState(show);
  }, []);

  const openPaycode = useCallback(() => {
    setShowPaycodeState(true);
  }, []);

  const closePaycode = useCallback(() => {
    setShowPaycodeState(false);
  }, []);

  const togglePaycode = useCallback(() => {
    setShowPaycodeState((prev) => !prev);
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - Amount
  // ---------------------------------------------------------------------------

  const setPaycodeAmount = useCallback((amount) => {
    setPaycodeAmountState(amount);
  }, []);

  const clearPaycodeAmount = useCallback(() => {
    setPaycodeAmountState('');
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - PDF Generation
  // ---------------------------------------------------------------------------

  const setPaycodeGeneratingPdf = useCallback((generating) => {
    setPaycodeGeneratingPdfState(generating);
  }, []);

  const startPdfGeneration = useCallback(() => {
    setPaycodeGeneratingPdfState(true);
  }, []);

  const finishPdfGeneration = useCallback(() => {
    setPaycodeGeneratingPdfState(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - Combined Actions
  // ---------------------------------------------------------------------------

  const resetPaycode = useCallback(() => {
    setShowPaycodeState(false);
    setPaycodeAmountState('');
    setPaycodeGeneratingPdfState(false);
  }, []);

  const openPaycodeWithAmount = useCallback((amount) => {
    setPaycodeAmountState(amount);
    setShowPaycodeState(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const hasPaycodeAmount = paycodeAmount !== '';

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // Visibility
    showPaycode,
    setShowPaycode,
    openPaycode,
    closePaycode,
    togglePaycode,

    // Amount
    paycodeAmount,
    setPaycodeAmount,
    clearPaycodeAmount,
    hasPaycodeAmount,

    // PDF generation
    paycodeGeneratingPdf,
    setPaycodeGeneratingPdf,
    startPdfGeneration,
    finishPdfGeneration,

    // Combined actions
    resetPaycode,
    openPaycodeWithAmount,
  };
}

export default usePaycodeState;
