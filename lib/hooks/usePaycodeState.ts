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

import { useState, useCallback } from "react"

// ============================================================================
// Types
// ============================================================================

/** Return type for the usePaycodeState hook */
export interface UsePaycodeStateReturn {
  // Visibility state
  showPaycode: boolean
  setShowPaycode: (show: boolean) => void
  openPaycode: () => void
  closePaycode: () => void
  togglePaycode: () => void

  // Amount state
  paycodeAmount: string
  setPaycodeAmount: (amount: string) => void
  clearPaycodeAmount: () => void
  hasPaycodeAmount: boolean

  // PDF generation state
  paycodeGeneratingPdf: boolean
  setPaycodeGeneratingPdf: (generating: boolean) => void
  startPdfGeneration: () => void
  finishPdfGeneration: () => void

  // Combined actions
  resetPaycode: () => void
  openPaycodeWithAmount: (amount: string) => void
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing paycode (static payment code) state
 *
 * @returns Paycode state and actions
 *
 * @example
 * ```tsx
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
 * ```
 */
export function usePaycodeState(): UsePaycodeStateReturn {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [showPaycode, setShowPaycodeState] = useState<boolean>(false)
  const [paycodeAmount, setPaycodeAmountState] = useState<string>("")
  const [paycodeGeneratingPdf, setPaycodeGeneratingPdfState] = useState<boolean>(false)

  // ---------------------------------------------------------------------------
  // Callbacks - Visibility
  // ---------------------------------------------------------------------------

  const setShowPaycode = useCallback((show: boolean) => {
    setShowPaycodeState(show)
  }, [])

  const openPaycode = useCallback(() => {
    setShowPaycodeState(true)
  }, [])

  const closePaycode = useCallback(() => {
    setShowPaycodeState(false)
  }, [])

  const togglePaycode = useCallback(() => {
    setShowPaycodeState((prev) => !prev)
  }, [])

  // ---------------------------------------------------------------------------
  // Callbacks - Amount
  // ---------------------------------------------------------------------------

  const setPaycodeAmount = useCallback((amount: string) => {
    setPaycodeAmountState(amount)
  }, [])

  const clearPaycodeAmount = useCallback(() => {
    setPaycodeAmountState("")
  }, [])

  // ---------------------------------------------------------------------------
  // Callbacks - PDF Generation
  // ---------------------------------------------------------------------------

  const setPaycodeGeneratingPdf = useCallback((generating: boolean) => {
    setPaycodeGeneratingPdfState(generating)
  }, [])

  const startPdfGeneration = useCallback(() => {
    setPaycodeGeneratingPdfState(true)
  }, [])

  const finishPdfGeneration = useCallback(() => {
    setPaycodeGeneratingPdfState(false)
  }, [])

  // ---------------------------------------------------------------------------
  // Callbacks - Combined Actions
  // ---------------------------------------------------------------------------

  const resetPaycode = useCallback(() => {
    setShowPaycodeState(false)
    setPaycodeAmountState("")
    setPaycodeGeneratingPdfState(false)
  }, [])

  const openPaycodeWithAmount = useCallback((amount: string) => {
    setPaycodeAmountState(amount)
    setShowPaycodeState(true)
  }, [])

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const hasPaycodeAmount = paycodeAmount !== ""

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
  }
}

export default usePaycodeState
