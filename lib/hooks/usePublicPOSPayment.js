import { useState, useEffect, useCallback } from "react"
import { getApiUrl } from "../config/api"

/**
 * usePublicPOSPayment - Manages payment state and polling for PublicPOSDashboard
 *
 * Handles:
 * - Current invoice tracking
 * - Payment success state + animation data
 * - Payment status polling (5s interval, 15min timeout)
 * - Invoice change handler
 * - Payment animation dismiss handler
 */
export function usePublicPOSPayment({
  showingInvoice,
  soundEnabled,
  posPaymentReceivedRef,
}) {
  const [currentInvoice, setCurrentInvoice] = useState(null)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [paymentData, setPaymentData] = useState(null)

  // Poll for payment status when showing invoice
  useEffect(() => {
    if (!currentInvoice?.paymentRequest || !showingInvoice) return

    let cancelled = false
    let pollCount = 0
    const maxPolls = 180 // 15 minutes at 5 second intervals

    const pollPayment = async () => {
      if (cancelled || pollCount >= maxPolls) {
        return
      }

      try {
        // Query Blink API directly for payment status (public query)
        const response = await fetch(getApiUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
              query LnInvoicePaymentStatus($input: LnInvoicePaymentStatusInput!) {
                lnInvoicePaymentStatus(input: $input) {
                  status
                }
              }
            `,
            variables: {
              input: { paymentRequest: currentInvoice.paymentRequest },
            },
          }),
        })

        const data = await response.json()
        const status = data.data?.lnInvoicePaymentStatus?.status

        if (status === "PAID") {
          console.log("✅ Public invoice payment received!")

          // Set payment data for animation
          setPaymentData({
            amount: currentInvoice.satAmount || currentInvoice.amount,
            currency: "BTC", // Always show sats
            memo: currentInvoice.memo,
          })
          setPaymentSuccess(true)

          // Note: Sound is handled by PaymentAnimation component
          return
        }
      } catch (err) {
        console.warn("Payment poll error:", err)
      }

      pollCount++
      if (!cancelled) {
        setTimeout(pollPayment, 5000) // Poll every 5 seconds
      }
    }

    // Start polling after a short delay
    const initialDelay = setTimeout(pollPayment, 2000)

    return () => {
      cancelled = true
      clearTimeout(initialDelay)
    }
  }, [currentInvoice, showingInvoice, soundEnabled])

  // Handle invoice changes from POS
  const handleInvoiceChange = useCallback((invoice) => {
    setCurrentInvoice(invoice)
  }, [])

  // Handle payment animation dismiss
  const handlePaymentAnimationHide = useCallback(() => {
    setPaymentSuccess(false)
    setPaymentData(null)
    setCurrentInvoice(null)
    if (posPaymentReceivedRef?.current) {
      posPaymentReceivedRef.current()
    }
  }, [posPaymentReceivedRef])

  return {
    currentInvoice,
    setCurrentInvoice,
    paymentSuccess,
    paymentData,
    handleInvoiceChange,
    handlePaymentAnimationHide,
  }
}
