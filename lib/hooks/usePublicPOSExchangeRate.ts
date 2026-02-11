import { useState, useEffect } from "react"
import { isBitcoinCurrency } from "../currency-utils"

interface ExchangeRate {
  satPriceInCurrency: number
  currency: string
}

interface UsePublicPOSExchangeRateParams {
  displayCurrency: string
}

interface UsePublicPOSExchangeRateReturn {
  exchangeRate: ExchangeRate | null
  loadingRate: boolean
  fetchExchangeRate: () => Promise<void>
}

/**
 * usePublicPOSExchangeRate - Fetches exchange rate for sats equivalent display
 *
 * When displayCurrency changes, fetches the current sat price from the exchange rate API.
 * For Bitcoin currencies, returns a static rate of 1.
 *
 * @param {Object} deps
 * @param {string} deps.displayCurrency - The current display currency code
 * @returns {Object} { exchangeRate, loadingRate, fetchExchangeRate }
 */
export function usePublicPOSExchangeRate({
  displayCurrency,
}: UsePublicPOSExchangeRateParams): UsePublicPOSExchangeRateReturn {
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null)
  const [loadingRate, setLoadingRate] = useState(false)

  const fetchExchangeRate = async (): Promise<void> => {
    if (isBitcoinCurrency(displayCurrency)) {
      setExchangeRate({ satPriceInCurrency: 1, currency: "BTC" })
      return
    }

    setLoadingRate(true)
    try {
      const response = await fetch("/api/rates/exchange-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency: displayCurrency,
          useBlinkpos: true, // Public POS always uses BlinkPOS credentials
        }),
      })

      const data = await response.json()

      if (data.success) {
        setExchangeRate({
          satPriceInCurrency: data.satPriceInCurrency,
          currency: data.currency,
        })
        console.log(`Exchange rate for ${displayCurrency}:`, data.satPriceInCurrency)
      } else {
        console.error("Failed to fetch exchange rate:", data.error)
      }
    } catch (error) {
      console.error("Exchange rate error:", error)
    } finally {
      setLoadingRate(false)
    }
  }

  // Fetch exchange rate on mount and when display currency changes
  useEffect(() => {
    fetchExchangeRate()
  }, [displayCurrency])

  return { exchangeRate, loadingRate, fetchExchangeRate }
}
