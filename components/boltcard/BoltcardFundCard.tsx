/**
 * BoltcardFundCard - Fund card modal component
 *
 * Allows users to transfer funds from their Sending Wallet to a Boltcard.
 * The actual sats stay in the Sending Wallet - we just increment the card's virtual balance.
 */

import { useState } from "react"

import { useTheme } from "../../lib/hooks/useTheme"
import { formatBitcoinAmount, BitcoinFormatPreference } from "../../lib/number-format"

import { BoltcardRecord } from "./useBoltcards"

/**
 * Result from the onFund callback
 */
interface FundCallbackResult {
  success: boolean
  error?: string
}

/**
 * Props for BoltcardFundCard component
 */
interface BoltcardFundCardProps {
  card: BoltcardRecord
  walletBalance: number // Available balance in the Sending Wallet (sats for BTC, cents for USD)
  onFund: (cardId: string, amount: number) => Promise<FundCallbackResult>
  onClose: () => void
  loading?: boolean
  exchangeRate?: number | null // BTC/USD exchange rate for display
  bitcoinFormat?: BitcoinFormatPreference // User's bitcoin format preference
}

/**
 * Format balance for display based on user's bitcoin format preference
 */
function formatBalance(
  balance: number,
  currency: string,
  bitcoinFormat: BitcoinFormatPreference = "sats",
): string {
  if (currency === "USD") {
    return `$${(balance / 100).toFixed(2)}`
  }
  return formatBitcoinAmount(balance, bitcoinFormat)
}

/**
 * Quick amount buttons (in sats or cents based on currency)
 */
const QUICK_AMOUNTS_BTC: number[] = [1000, 5000, 10000, 50000, 100000]
const QUICK_AMOUNTS_USD: number[] = [100, 500, 1000, 2500, 5000] // in cents

/**
 * BoltcardFundCard component
 */
export default function BoltcardFundCard({
  card,
  walletBalance,
  onFund,
  onClose,
  loading: _loading = false,
  exchangeRate = null,
  bitcoinFormat = "sats",
}: BoltcardFundCardProps) {
  const { darkMode } = useTheme()
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isBTC = card.walletCurrency === "BTC"
  const quickAmounts = isBTC ? QUICK_AMOUNTS_BTC : QUICK_AMOUNTS_USD

  // Calculate max fundable amount (limited by wallet balance)
  const maxAmount = walletBalance || 0

  // Parse current input amount
  const parsedAmount = isBTC
    ? parseInt(amount) || 0
    : Math.round(parseFloat(amount) * 100) || 0 // Convert USD to cents

  // Validate amount
  const isValidAmount = parsedAmount > 0 && parsedAmount <= maxAmount

  // Calculate equivalent value for display
  const getEquivalentDisplay = (): string | null => {
    if (!exchangeRate || parsedAmount === 0) return null

    if (isBTC) {
      // Show USD equivalent
      const usdValue = (parsedAmount / 100000000) * exchangeRate
      return `~$${usdValue.toFixed(2)} USD`
    } else {
      // Show sats equivalent
      const satsValue = Math.round((parsedAmount / 100 / exchangeRate) * 100000000)
      return `~${satsValue.toLocaleString()} sats`
    }
  }

  /**
   * Handle quick amount button
   */
  const handleQuickAmount = (quickAmount: number): void => {
    if (isBTC) {
      setAmount(quickAmount.toString())
    } else {
      setAmount((quickAmount / 100).toFixed(2))
    }
    setError(null)
  }

  /**
   * Handle max button
   */
  const handleMax = (): void => {
    if (isBTC) {
      setAmount(maxAmount.toString())
    } else {
      setAmount((maxAmount / 100).toFixed(2))
    }
    setError(null)
  }

  /**
   * Handle submit
   */
  const handleSubmit = async (): Promise<void> => {
    if (!isValidAmount) {
      setError("Please enter a valid amount")
      return
    }

    if (parsedAmount > maxAmount) {
      setError("Amount exceeds wallet balance")
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      const result = await onFund(card.id, parsedAmount)

      if (result.success) {
        onClose()
      } else {
        setError(result.error || "Failed to fund card")
      }
    } catch (err: unknown) {
      console.error("Fund card error:", err)
      setError((err as Error).message || "An error occurred")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
      <div
        className={`w-full max-w-sm rounded-xl shadow-2xl overflow-hidden ${
          darkMode ? "bg-gray-900" : "bg-white"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b ${
            darkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <h3
            className={`text-lg font-bold ${darkMode ? "text-white" : "text-gray-900"}`}
          >
            Fund Card
          </h3>
          <button
            onClick={onClose}
            disabled={submitting}
            className={`p-2 -mr-2 rounded-md ${
              darkMode
                ? "text-gray-400 hover:text-gray-300 hover:bg-gray-800"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
            } disabled:opacity-50`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Card Info */}
          <div className={`p-3 rounded-lg ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                {card.name || "Boltcard"}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  darkMode
                    ? "bg-blink-accent/20 text-blink-accent"
                    : "bg-blink-accent/10 text-blink-accent"
                }`}
              >
                {card.walletCurrency}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                Current Balance
              </span>
              <span
                className={`text-lg font-bold ${darkMode ? "text-white" : "text-gray-900"}`}
              >
                {formatBalance(card.balance || 0, card.walletCurrency)}
              </span>
            </div>
          </div>

          {/* Wallet Balance */}
          <div
            className={`p-3 rounded-lg border ${
              darkMode
                ? "bg-blue-900/10 border-blue-500/30"
                : "bg-blue-50 border-blue-200"
            }`}
          >
            <div className="flex justify-between items-baseline">
              <span className={`text-xs ${darkMode ? "text-blue-300" : "text-blue-600"}`}>
                Available in Sending Wallet
              </span>
              <span
                className={`text-sm font-medium ${darkMode ? "text-blue-400" : "text-blue-700"}`}
              >
                {formatBalance(maxAmount, card.walletCurrency, bitcoinFormat)}
              </span>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label
              className={`block text-xs mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              Amount to Fund {isBTC ? "(sats)" : "(USD)"}
            </label>
            <div className="relative">
              <input
                type={isBTC ? "number" : "text"}
                value={amount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setAmount(e.target.value)
                  setError(null)
                }}
                placeholder={isBTC ? "0" : "0.00"}
                min="0"
                step={isBTC ? "1" : "0.01"}
                disabled={submitting}
                className={`w-full px-3 py-3 rounded-lg border text-lg font-medium ${
                  darkMode
                    ? "bg-gray-800 border-gray-600 text-white placeholder-gray-500"
                    : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
                } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent disabled:opacity-50`}
              />
              <button
                onClick={handleMax}
                disabled={submitting || maxAmount === 0}
                className={`absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium rounded ${
                  darkMode
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                } disabled:opacity-50 transition-colors`}
              >
                MAX
              </button>
            </div>

            {/* Equivalent value display */}
            {getEquivalentDisplay() && (
              <p
                className={`text-xs mt-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}
              >
                {getEquivalentDisplay()}
              </p>
            )}
          </div>

          {/* Quick Amount Buttons */}
          <div className="grid grid-cols-5 gap-2">
            {quickAmounts.map((quickAmount) => {
              const displayAmount = isBTC
                ? `${(quickAmount / 1000).toFixed(quickAmount >= 1000 ? 0 : 1)}k`
                : `$${(quickAmount / 100).toFixed(0)}`
              const isDisabled = quickAmount > maxAmount

              return (
                <button
                  key={quickAmount}
                  onClick={() => handleQuickAmount(quickAmount)}
                  disabled={submitting || isDisabled}
                  className={`py-2 text-xs font-medium rounded-md transition-colors ${
                    isDisabled
                      ? darkMode
                        ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                        : "bg-gray-100 text-gray-300 cursor-not-allowed"
                      : darkMode
                        ? "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                  }`}
                >
                  {displayAmount}
                </button>
              )
            })}
          </div>

          {/* Error Message */}
          {error && (
            <div className={`p-3 rounded-lg ${darkMode ? "bg-red-900/20" : "bg-red-50"}`}>
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          {/* New Balance Preview */}
          {parsedAmount > 0 && (
            <div
              className={`p-3 rounded-lg ${darkMode ? "bg-green-900/10" : "bg-green-50"}`}
            >
              <div className="flex justify-between items-baseline">
                <span
                  className={`text-xs ${darkMode ? "text-green-400" : "text-green-600"}`}
                >
                  New Card Balance
                </span>
                <span
                  className={`text-lg font-bold ${darkMode ? "text-green-400" : "text-green-600"}`}
                >
                  {formatBalance((card.balance || 0) + parsedAmount, card.walletCurrency)}
                </span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !isValidAmount}
            className={`w-full py-3 text-base font-medium rounded-lg transition-colors ${
              isValidAmount && !submitting
                ? "bg-blink-accent text-black hover:bg-blink-accent/90"
                : darkMode
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
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
                Funding...
              </span>
            ) : (
              `Fund ${parsedAmount > 0 ? formatBalance(parsedAmount, card.walletCurrency) : "Card"}`
            )}
          </button>

          {/* Info Note */}
          <p
            className={`text-xs text-center ${darkMode ? "text-gray-500" : "text-gray-400"}`}
          >
            Funds are allocated from your Sending Wallet to this card&apos;s spending
            limit.
          </p>
        </div>
      </div>
    </div>
  )
}
