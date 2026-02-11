/**
 * useVoucherWalletState Hook
 *
 * Manages voucher wallet state for the Dashboard component.
 * Handles voucher wallet configuration, balance tracking, and voucher creation settings.
 *
 * This hook extracts voucher wallet-related state from Dashboard.js to reduce complexity.
 */

import { useState, useCallback } from "react"

/**
 * Load voucher currency mode from localStorage
 */
function loadVoucherCurrencyMode() {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("blinkpos-voucher-currency-mode")
    return saved === "USD" ? "USD" : "BTC"
  }
  return "BTC"
}

/**
 * Load voucher expiry from localStorage
 */
function loadVoucherExpiry() {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("blinkpos-voucher-expiry")
    // Migration: if saved is legacy values, migrate to '24h'
    if (!saved || saved === "7d" || saved === "15m" || saved === "1h") {
      return "24h"
    }
    return saved
  }
  return "24h"
}

/**
 * Hook for managing voucher wallet state
 *
 * @example
 * ```jsx
 * const {
 *   voucherWallet,
 *   setVoucherWallet,
 *   voucherWalletBalance,
 *   voucherCurrencyMode,
 *   setVoucherCurrencyMode,
 *   resetVoucherWalletForm
 * } = useVoucherWalletState()
 *
 * // Configure voucher wallet
 * setVoucherWallet({ id: '123', label: 'My Voucher Wallet', apiKey: 'key' })
 *
 * // Switch currency mode
 * setVoucherCurrencyMode('USD')
 *
 * // Reset form after disconnecting
 * resetVoucherWalletForm()
 * ```
 */
export function useVoucherWalletState() {
  // Wallet configuration
  const [voucherWallet, setVoucherWallet] = useState(null)
  const [voucherWalletApiKey, setVoucherWalletApiKey] = useState("")
  const [voucherWalletLabel, setVoucherWalletLabel] = useState("")

  // Loading/error states
  const [voucherWalletLoading, setVoucherWalletLoading] = useState(false)
  const [voucherWalletError, setVoucherWalletError] = useState(null)
  const [voucherWalletValidating, setVoucherWalletValidating] = useState(false)

  // Wallet details
  const [voucherWalletScopes, setVoucherWalletScopes] = useState(null) // Scopes returned from authorization query
  const [voucherWalletBtcId, setVoucherWalletBtcId] = useState(null) // BTC wallet ID for voucher creation
  const [voucherWalletUsdId, setVoucherWalletUsdId] = useState(null) // USD wallet ID for Stablesats vouchers

  // Balance tracking
  const [voucherWalletBalance, setVoucherWalletBalance] = useState(null) // BTC balance in sats
  const [voucherWalletUsdBalance, setVoucherWalletUsdBalance] = useState(null) // USD balance in cents
  const [voucherWalletBalanceLoading, setVoucherWalletBalanceLoading] =
    useState(false)
  const [usdExchangeRate, setUsdExchangeRate] = useState(null) // USD exchange rate for voucher conversion

  // Voucher creation settings (loaded from localStorage)
  const [voucherCurrencyMode, setVoucherCurrencyModeState] = useState(
    loadVoucherCurrencyMode
  ) // 'BTC' or 'USD'
  const [voucherExpiry, setVoucherExpiryState] = useState(loadVoucherExpiry) // '24h', '48h', '72h', '168h'

  // Capacity indicator state (for real-time amount tracking)
  const [currentAmountInSats, setCurrentAmountInSats] = useState(0)
  const [currentAmountInUsdCents, setCurrentAmountInUsdCents] = useState(0)
  const [currentVoucherCurrencyMode, setCurrentVoucherCurrencyMode] =
    useState("BTC")

  /**
   * Set voucher currency mode and persist to localStorage
   */
  const setVoucherCurrencyMode = useCallback((mode) => {
    setVoucherCurrencyModeState(mode)
    if (typeof window !== "undefined") {
      localStorage.setItem("blinkpos-voucher-currency-mode", mode)
    }
  }, [])

  /**
   * Set voucher expiry and persist to localStorage
   */
  const setVoucherExpiry = useCallback((expiry) => {
    setVoucherExpiryState(expiry)
    if (typeof window !== "undefined") {
      localStorage.setItem("blinkpos-voucher-expiry", expiry)
    }
  }, [])

  /**
   * Reset the voucher wallet form (for adding new wallet)
   */
  const resetVoucherWalletForm = useCallback(() => {
    setVoucherWalletApiKey("")
    setVoucherWalletLabel("")
    setVoucherWalletLoading(false)
    setVoucherWalletError(null)
    setVoucherWalletValidating(false)
    setVoucherWalletScopes(null)
  }, [])

  /**
   * Clear the voucher wallet completely (disconnect)
   */
  const clearVoucherWallet = useCallback(() => {
    setVoucherWallet(null)
    setVoucherWalletApiKey("")
    setVoucherWalletLabel("")
    setVoucherWalletLoading(false)
    setVoucherWalletError(null)
    setVoucherWalletValidating(false)
    setVoucherWalletScopes(null)
    setVoucherWalletBtcId(null)
    setVoucherWalletUsdId(null)
    setVoucherWalletBalance(null)
    setVoucherWalletUsdBalance(null)
    setVoucherWalletBalanceLoading(false)
  }, [])

  /**
   * Reset capacity indicator state
   */
  const resetCapacityIndicator = useCallback(() => {
    setCurrentAmountInSats(0)
    setCurrentAmountInUsdCents(0)
    setCurrentVoucherCurrencyMode("BTC")
  }, [])

  return {
    // State
    voucherWallet,
    voucherWalletApiKey,
    voucherWalletLabel,
    voucherWalletLoading,
    voucherWalletError,
    voucherWalletValidating,
    voucherWalletScopes,
    voucherWalletBtcId,
    voucherWalletUsdId,
    voucherWalletBalance,
    voucherWalletUsdBalance,
    voucherWalletBalanceLoading,
    usdExchangeRate,
    voucherCurrencyMode,
    voucherExpiry,
    currentAmountInSats,
    currentAmountInUsdCents,
    currentVoucherCurrencyMode,

    // Actions
    setVoucherWallet,
    setVoucherWalletApiKey,
    setVoucherWalletLabel,
    setVoucherWalletLoading,
    setVoucherWalletError,
    setVoucherWalletValidating,
    setVoucherWalletScopes,
    setVoucherWalletBtcId,
    setVoucherWalletUsdId,
    setVoucherWalletBalance,
    setVoucherWalletUsdBalance,
    setVoucherWalletBalanceLoading,
    setUsdExchangeRate,
    setVoucherCurrencyMode,
    setVoucherExpiry,
    setCurrentAmountInSats,
    setCurrentAmountInUsdCents,
    setCurrentVoucherCurrencyMode,
    resetVoucherWalletForm,
    clearVoucherWallet,
    resetCapacityIndicator,
  }
}

export default useVoucherWalletState
