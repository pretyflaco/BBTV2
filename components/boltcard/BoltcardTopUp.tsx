/**
 * BoltcardTopUp - Card balance management with authenticated funding as primary
 *
 * Features:
 * - Slider to set card balance (up to wallet balance)
 * - Quick adjustment buttons
 * - Collapsible LNURL QR for external top-ups (secondary option)
 * - Real-time wallet balance display
 * - Soft limit warning when card balance exceeds wallet
 */

import { QRCodeSVG } from "qrcode.react"
import { useState, useEffect, useCallback } from "react"

import { useTheme } from "../../lib/hooks/useTheme"
import { formatBitcoinAmount, BitcoinFormatPreference } from "../../lib/number-format"

import type { BoltcardRecord, TopUpQRData, FundResult } from "./useBoltcards"

// ============================================================================
// Types
// ============================================================================

/** Quick adjustment button definition */
interface QuickAdjustment {
  label: string
  amount: number
}

/** Props for the BoltcardTopUp component */
export interface BoltcardTopUpProps {
  card: BoltcardRecord
  topUpQR: TopUpQRData | null
  walletBalance?: number
  onFund: (cardId: string, newBalance: number, mode: string) => Promise<FundResult>
  exchangeRate?: number | null
  loading?: boolean
  bitcoinFormat?: BitcoinFormatPreference
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format balance for display using user's bitcoin format preference
 */
function formatBalance(
  balance: number,
  currency: string,
  bitcoinFormat: BitcoinFormatPreference = "sats",
): string {
  if (currency === "USD") {
    return `$${(balance / 100).toFixed(2)}`
  }
  // Always use the user's bitcoin format preference for BTC
  return formatBitcoinAmount(balance, bitcoinFormat)
}

/**
 * Quick adjustment amounts based on currency
 */
const QUICK_ADJUSTMENTS_BTC: QuickAdjustment[] = [
  { label: "-1k", amount: -1000 },
  { label: "+1k", amount: 1000 },
  { label: "+5k", amount: 5000 },
  { label: "+10k", amount: 10000 },
]

const QUICK_ADJUSTMENTS_USD: QuickAdjustment[] = [
  { label: "-$1", amount: -100 },
  { label: "+$1", amount: 100 },
  { label: "+$5", amount: 500 },
  { label: "+$10", amount: 1000 },
]

// ============================================================================
// Component
// ============================================================================

/**
 * BoltcardTopUp component
 */
export default function BoltcardTopUp({
  card,
  topUpQR,
  walletBalance = 0,
  onFund,
  exchangeRate = null,
  loading = false,
  bitcoinFormat = "sats",
}: BoltcardTopUpProps) {
  const { darkMode } = useTheme()
  const [sliderValue, setSliderValue] = useState<number>(card.balance || 0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showLnurl, setShowLnurl] = useState(false)
  const [copied, setCopied] = useState(false)

  const isBTC = card.walletCurrency === "BTC"
  const quickAdjustments = isBTC ? QUICK_ADJUSTMENTS_BTC : QUICK_ADJUSTMENTS_USD
  const currentBalance = card.balance || 0

  // Max slider value is the wallet balance (but allow viewing current if over-allocated)
  const maxSliderValue = Math.max(walletBalance, currentBalance)
  const isOverAllocated = currentBalance > walletBalance
  const hasChanges = sliderValue !== currentBalance

  // Reset slider when card balance changes
  useEffect(() => {
    setSliderValue(card.balance || 0)
  }, [card.balance])

  /**
   * Calculate equivalent value for display
   */
  const getEquivalentDisplay = useCallback(
    (value: number): string | null => {
      if (!exchangeRate || value === 0) return null

      if (isBTC) {
        const usdValue = (value / 100000000) * exchangeRate
        return `~$${usdValue.toFixed(2)} USD`
      } else {
        const satsValue = Math.round((value / 100 / exchangeRate) * 100000000)
        return `~${formatBitcoinAmount(satsValue, bitcoinFormat)}`
      }
    },
    [exchangeRate, isBTC, bitcoinFormat],
  )

  /**
   * Handle slider change
   */
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value)
    setSliderValue(value)
    setError(null)
    setSuccess(null)
  }

  /**
   * Handle quick adjustment
   */
  const handleQuickAdjust = (adjustment: number) => {
    const newValue = Math.max(0, Math.min(maxSliderValue, sliderValue + adjustment))
    setSliderValue(newValue)
    setError(null)
    setSuccess(null)
  }

  /**
   * Handle set to max (wallet balance)
   */
  const handleSetMax = () => {
    setSliderValue(walletBalance)
    setError(null)
    setSuccess(null)
  }

  /**
   * Handle set to zero
   */
  const handleSetZero = () => {
    setSliderValue(0)
    setError(null)
    setSuccess(null)
  }

  /**
   * Handle update balance
   */
  const handleUpdateBalance = async () => {
    if (!hasChanges || !onFund) return

    setError(null)
    setSuccess(null)
    setSubmitting(true)

    try {
      const result = await onFund(card.id, sliderValue, "set")

      if (result.success) {
        setSuccess(
          `Balance updated to ${formatBalance(sliderValue, card.walletCurrency, bitcoinFormat)}`,
        )

        // Show warning if returned from API
        if (result.warning) {
          setError(result.warning)
        }
      } else {
        setError(result.error || "Failed to update balance")
      }
    } catch (err: unknown) {
      console.error("Update balance error:", err)
      setError((err as Error).message || "An error occurred")
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Copy LNURL to clipboard
   */
  const handleCopy = async () => {
    if (!topUpQR?.lnurl) return

    try {
      await navigator.clipboard.writeText(topUpQR.lnurl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err: unknown) {
      console.error("Failed to copy:", err)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-blink-accent border-t-transparent rounded-full mx-auto" />
        <p className={`text-sm mt-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
          Loading...
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Current Balance Display */}
      <div
        className={`text-center p-4 rounded-lg ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}
      >
        <p className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
          Current Card Balance
        </p>
        <p className={`text-2xl font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
          {formatBalance(currentBalance, card.walletCurrency, bitcoinFormat)}
        </p>
        {getEquivalentDisplay(currentBalance) && (
          <p className={`text-xs mt-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
            {getEquivalentDisplay(currentBalance)}
          </p>
        )}
      </div>

      {/* Underlying Wallet Balance */}
      <div
        className={`p-3 rounded-lg border ${
          isOverAllocated
            ? darkMode
              ? "bg-orange-900/10 border-orange-500/30"
              : "bg-orange-50 border-orange-200"
            : darkMode
              ? "bg-blue-900/10 border-blue-500/30"
              : "bg-blue-50 border-blue-200"
        }`}
      >
        <div className="flex justify-between items-baseline">
          <span
            className={`text-xs ${
              isOverAllocated
                ? darkMode
                  ? "text-orange-400"
                  : "text-orange-600"
                : darkMode
                  ? "text-blue-400"
                  : "text-blue-600"
            }`}
          >
            Underlying {card.walletCurrency} Wallet
          </span>
          <span
            className={`text-sm font-medium ${
              isOverAllocated
                ? darkMode
                  ? "text-orange-300"
                  : "text-orange-700"
                : darkMode
                  ? "text-blue-300"
                  : "text-blue-700"
            }`}
          >
            {formatBalance(walletBalance, card.walletCurrency, bitcoinFormat)}
          </span>
        </div>
        {isOverAllocated && (
          <p
            className={`text-xs mt-1 ${darkMode ? "text-orange-400" : "text-orange-600"}`}
          >
            Card allocation exceeds wallet. Card can only spend available wallet funds.
          </p>
        )}
      </div>

      {/* Balance Adjustment Section */}
      <div className={`p-4 rounded-lg ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        <h4
          className={`text-sm font-medium mb-3 ${darkMode ? "text-white" : "text-gray-900"}`}
        >
          Set Card Balance
        </h4>

        {/* Slider */}
        <div className="mb-4">
          <input
            type="range"
            min="0"
            max={maxSliderValue}
            value={sliderValue}
            onChange={handleSliderChange}
            disabled={submitting || walletBalance === 0}
            className="w-full h-2 bg-gray-300 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blink-accent disabled:opacity-50"
            style={{
              background: `linear-gradient(to right, var(--blink-accent, #facc15) 0%, var(--blink-accent, #facc15) ${(sliderValue / maxSliderValue) * 100}%, ${darkMode ? "#374151" : "#d1d5db"} ${(sliderValue / maxSliderValue) * 100}%, ${darkMode ? "#374151" : "#d1d5db"} 100%)`,
            }}
          />

          {/* Slider Labels */}
          <div className="flex justify-between mt-1">
            <span className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
              0
            </span>
            <span
              className={`text-xs font-medium ${darkMode ? "text-blink-accent" : "text-blink-accent"}`}
            >
              {formatBalance(sliderValue, card.walletCurrency, bitcoinFormat)}
            </span>
            <span className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
              {formatBalance(maxSliderValue, card.walletCurrency, bitcoinFormat)}
            </span>
          </div>
        </div>

        {/* Quick Adjustment Buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={handleSetZero}
            disabled={submitting || sliderValue === 0}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              darkMode
                ? "bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-50"
            }`}
          >
            Zero
          </button>

          {quickAdjustments.map((adj) => (
            <button
              key={adj.label}
              onClick={() => handleQuickAdjust(adj.amount)}
              disabled={
                submitting ||
                (adj.amount > 0 && sliderValue >= maxSliderValue) ||
                (adj.amount < 0 && sliderValue <= 0)
              }
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                adj.amount < 0
                  ? darkMode
                    ? "bg-red-900/20 text-red-400 hover:bg-red-900/30 disabled:opacity-50"
                    : "bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                  : darkMode
                    ? "bg-green-900/20 text-green-400 hover:bg-green-900/30 disabled:opacity-50"
                    : "bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-50"
              }`}
            >
              {adj.label}
            </button>
          ))}

          <button
            onClick={handleSetMax}
            disabled={submitting || sliderValue === walletBalance}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              darkMode
                ? "bg-blink-accent/20 text-blink-accent hover:bg-blink-accent/30 disabled:opacity-50"
                : "bg-blink-accent/10 text-blink-accent hover:bg-blink-accent/20 disabled:opacity-50"
            }`}
          >
            Max
          </button>
        </div>

        {/* Change Preview */}
        {hasChanges && (
          <div
            className={`p-3 rounded-lg mb-4 ${
              sliderValue > currentBalance
                ? darkMode
                  ? "bg-green-900/10"
                  : "bg-green-50"
                : darkMode
                  ? "bg-red-900/10"
                  : "bg-red-50"
            }`}
          >
            <div className="flex justify-between items-baseline">
              <span
                className={`text-xs ${
                  sliderValue > currentBalance
                    ? darkMode
                      ? "text-green-400"
                      : "text-green-600"
                    : darkMode
                      ? "text-red-400"
                      : "text-red-600"
                }`}
              >
                {sliderValue > currentBalance ? "Increasing by" : "Reducing by"}
              </span>
              <span
                className={`text-sm font-bold ${
                  sliderValue > currentBalance
                    ? darkMode
                      ? "text-green-400"
                      : "text-green-600"
                    : darkMode
                      ? "text-red-400"
                      : "text-red-600"
                }`}
              >
                {sliderValue > currentBalance ? "+" : "-"}
                {formatBalance(
                  Math.abs(sliderValue - currentBalance),
                  card.walletCurrency,
                  bitcoinFormat,
                )}
              </span>
            </div>
          </div>
        )}

        {/* Warning for over-allocation */}
        {sliderValue > walletBalance && (
          <div
            className={`p-3 rounded-lg mb-4 ${darkMode ? "bg-orange-900/10" : "bg-orange-50"}`}
          >
            <p className={`text-xs ${darkMode ? "text-orange-400" : "text-orange-600"}`}>
              Setting balance above wallet funds. Card will only be able to spend{" "}
              {formatBalance(walletBalance, card.walletCurrency, bitcoinFormat)}.
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div
            className={`p-3 rounded-lg mb-4 ${darkMode ? "bg-red-900/20" : "bg-red-50"}`}
          >
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div
            className={`p-3 rounded-lg mb-4 ${darkMode ? "bg-green-900/20" : "bg-green-50"}`}
          >
            <p className="text-sm text-green-500">{success}</p>
          </div>
        )}

        {/* Update Button */}
        <button
          onClick={handleUpdateBalance}
          disabled={!hasChanges || submitting}
          className={`w-full py-3 text-sm font-medium rounded-lg transition-colors ${
            hasChanges && !submitting
              ? "bg-blink-accent text-black hover:bg-blink-accent/90"
              : darkMode
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Updating...
            </span>
          ) : hasChanges ? (
            `Update to ${formatBalance(sliderValue, card.walletCurrency, bitcoinFormat)}`
          ) : (
            "No Changes"
          )}
        </button>

        {/* Info Note */}
        <p
          className={`text-xs text-center mt-2 ${darkMode ? "text-gray-500" : "text-gray-400"}`}
        >
          Card balance is a spending limit. Funds stay in your wallet.
        </p>
      </div>

      {/* Collapsible LNURL Section */}
      <div
        className={`rounded-lg overflow-hidden ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}
      >
        <button
          onClick={() => setShowLnurl(!showLnurl)}
          className={`w-full px-4 py-3 flex items-center justify-between ${
            darkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"
          } transition-colors`}
        >
          <span
            className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}
          >
            Top Up from External Wallet
          </span>
          <svg
            className={`w-5 h-5 transition-transform ${showLnurl ? "rotate-180" : ""} ${
              darkMode ? "text-gray-400" : "text-gray-500"
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {showLnurl && (
          <div className="px-4 pb-4 space-y-3">
            {topUpQR?.lnurl ? (
              <>
                <p
                  className={`text-xs text-center ${darkMode ? "text-gray-400" : "text-gray-500"}`}
                >
                  Scan with any Lightning wallet to add funds
                </p>

                <div className="flex justify-center">
                  <div className="p-3 bg-white rounded-lg">
                    <QRCodeSVG
                      value={topUpQR.lnurl.toUpperCase()}
                      size={180}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                </div>

                {/* Copy button */}
                <button
                  onClick={handleCopy}
                  className={`w-full py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${
                    copied
                      ? "bg-green-500/20 text-green-500"
                      : darkMode
                        ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {copied ? (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                        />
                      </svg>
                      Copy LNURL
                    </>
                  )}
                </button>

                {/* Instructions */}
                <div
                  className={`p-3 rounded-lg border ${
                    darkMode
                      ? "bg-blue-900/10 border-blue-500/30"
                      : "bg-blue-50 border-blue-200"
                  }`}
                >
                  <p
                    className={`text-xs ${darkMode ? "text-blue-300" : "text-blue-600"}`}
                  >
                    <strong>Note:</strong> External top-ups add real funds to your wallet.
                    Card owners cannot top up their own cards via LNURL (use the slider
                    above instead).
                  </p>
                </div>
              </>
            ) : (
              <div
                className={`text-center py-4 ${darkMode ? "text-gray-500" : "text-gray-400"}`}
              >
                <svg
                  className="w-8 h-8 mx-auto mb-2 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
                <p className="text-sm">LNURL top-up not available</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Spending Limits Info */}
      {(card.maxTxAmount || card.dailyLimit) && (
        <div className={`p-3 rounded-lg ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
          <h5
            className={`text-xs font-medium mb-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            Spending Limits
          </h5>
          <div className="space-y-1 text-sm">
            {card.maxTxAmount && (
              <div className="flex justify-between">
                <span className={darkMode ? "text-gray-500" : "text-gray-400"}>
                  Max per transaction
                </span>
                <span className={darkMode ? "text-gray-300" : "text-gray-600"}>
                  {formatBalance(card.maxTxAmount, card.walletCurrency, bitcoinFormat)}
                </span>
              </div>
            )}
            {card.dailyLimit && (
              <div className="flex justify-between">
                <span className={darkMode ? "text-gray-500" : "text-gray-400"}>
                  Daily remaining
                </span>
                <span className={darkMode ? "text-gray-300" : "text-gray-600"}>
                  {formatBalance(
                    Math.max(0, card.dailyLimit - (card.dailySpent || 0)),
                    card.walletCurrency,
                    bitcoinFormat,
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
