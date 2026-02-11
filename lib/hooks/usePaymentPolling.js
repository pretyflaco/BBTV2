import { useEffect, useRef } from "react"
import { useNFC } from "../../components/NFCPayment"

const POLLING_INTERVAL_MS = 1000 // Poll every 1 second
const POLLING_TIMEOUT_MS = 15 * 60 * 1000 // Stop polling after 15 minutes

/**
 * Hook for polling payment status and managing NFC payments.
 *
 * Extracted from Dashboard.js — contains:
 * - Payment status polling with 1s interval + 15min timeout
 * - NFC setup for Boltcard payments
 *
 * @param {Object} params
 * @param {Object|null} params.currentInvoice - Current invoice object
 * @param {Function} params.triggerPaymentAnimation - Trigger payment animation
 * @param {Object} params.posPaymentReceivedRef - Ref for POS payment received callback
 * @param {Function} params.fetchData - Fetch transaction data
 * @param {boolean} params.soundEnabled - Whether sound is enabled
 * @param {string} params.soundTheme - Current sound theme
 * @returns {Object} { nfcState }
 */
export function usePaymentPolling({
  currentInvoice,
  triggerPaymentAnimation,
  posPaymentReceivedRef,
  fetchData,
  soundEnabled,
  soundTheme,
}) {
  const pollingIntervalRef = useRef(null)
  const pollingStartTimeRef = useRef(null)

  // Poll for payment status when we have a pending invoice
  useEffect(() => {
    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }

    // Start polling if we have a payment hash to watch
    if (currentInvoice?.paymentHash) {
      console.log(
        "🔄 Starting payment status polling for:",
        currentInvoice.paymentHash.substring(0, 16) + "...",
      )
      pollingStartTimeRef.current = Date.now()

      const pollPaymentStatus = async () => {
        // Check if we've exceeded the timeout
        if (Date.now() - pollingStartTimeRef.current > POLLING_TIMEOUT_MS) {
          console.log("⏱️ Payment polling timeout reached (15 min) - stopping")
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          return
        }

        try {
          const response = await fetch(
            `/api/payment-status/${currentInvoice.paymentHash}`,
          )
          const data = await response.json()

          if (data.status === "completed") {
            console.log("✅ Payment completed detected via polling!")

            // Stop polling
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }

            // Trigger payment animation
            triggerPaymentAnimation({
              amount: currentInvoice.satoshis || currentInvoice.amount,
              currency: "BTC",
              memo: currentInvoice.memo || `Payment received`,
              isForwarded: true,
            })

            // Clear POS invoice
            if (posPaymentReceivedRef.current) {
              posPaymentReceivedRef.current()
            }

            // Refresh transaction data
            fetchData()
          } else if (data.status === "expired") {
            console.log("⏰ Payment expired")
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }
          }
          // For 'pending', 'processing', 'not_found' - keep polling
        } catch (error) {
          console.error("Payment status poll error:", error)
          // Continue polling despite errors
        }
      }

      // Poll immediately, then on interval
      pollPaymentStatus()
      pollingIntervalRef.current = setInterval(pollPaymentStatus, POLLING_INTERVAL_MS)
    }

    // Cleanup on unmount or when invoice changes
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [currentInvoice?.paymentHash])

  // Setup NFC for Boltcard payments
  const nfcState = useNFC({
    paymentRequest: currentInvoice?.paymentRequest,
    onPaymentSuccess: () => {
      console.log("🎉 NFC Boltcard payment successful")
      // Payment will be detected via webhook + polling
    },
    onPaymentError: (error) => {
      console.error("NFC payment error:", error)
    },
    soundEnabled,
    soundTheme,
  })

  return {
    nfcState,
  }
}

export default usePaymentPolling
