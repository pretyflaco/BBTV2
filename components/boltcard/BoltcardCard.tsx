/**
 * BoltcardCard - Individual card display component
 *
 * Shows card info: name, UID, balance, status, currency
 * Quick actions: view details, disable/enable
 */

import { useTheme } from "../../lib/hooks/useTheme"

import { CardStatus, type BoltcardRecord } from "./useBoltcards"

// ============================================================================
// Types
// ============================================================================

interface StatusInfo {
  label: string
  bgColor: string
  textColor: string
  borderColor: string
}

interface BoltcardCardProps {
  card: BoltcardRecord
  onViewDetails: () => void
  onDisable?: () => void
  onEnable?: () => void
  compact?: boolean
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format balance for display
 */
function formatBalance(balance: number, currency: string): string {
  if (currency === "USD") {
    return `$${(balance / 100).toFixed(2)}`
  }
  // BTC - show in sats
  if (balance >= 100000) {
    return `${(balance / 100000000).toFixed(8)} BTC`
  }
  return `${balance.toLocaleString()} sats`
}

/**
 * Get status color and label
 */
function getStatusInfo(status: string, darkMode: boolean): StatusInfo {
  switch (status) {
    case CardStatus.ACTIVE:
      return {
        label: "Active",
        bgColor: darkMode ? "bg-green-900/20" : "bg-green-50",
        textColor: "text-green-500",
        borderColor: "border-green-500",
      }
    case CardStatus.PENDING:
      return {
        label: "Pending",
        bgColor: darkMode ? "bg-yellow-900/20" : "bg-yellow-50",
        textColor: "text-yellow-500",
        borderColor: "border-yellow-500",
      }
    case CardStatus.DISABLED:
      return {
        label: "Disabled",
        bgColor: darkMode ? "bg-red-900/20" : "bg-red-50",
        textColor: "text-red-500",
        borderColor: "border-red-500",
      }
    case CardStatus.WIPED:
      return {
        label: "Wiped",
        bgColor: darkMode ? "bg-gray-800" : "bg-gray-100",
        textColor: darkMode ? "text-gray-500" : "text-gray-400",
        borderColor: darkMode ? "border-gray-700" : "border-gray-300",
      }
    default:
      return {
        label: status,
        bgColor: darkMode ? "bg-gray-800" : "bg-gray-100",
        textColor: darkMode ? "text-gray-400" : "text-gray-500",
        borderColor: darkMode ? "border-gray-700" : "border-gray-300",
      }
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * BoltcardCard component
 */
export default function BoltcardCard({
  card,
  onViewDetails,
  onDisable,
  onEnable,
  compact = false,
}: BoltcardCardProps) {
  const { darkMode } = useTheme()
  const statusInfo = getStatusInfo(card.status, darkMode)

  // Card icon based on currency
  const _CurrencyIcon =
    card.walletCurrency === "USD" ? (
      <span className="text-lg">$</span>
    ) : (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.88-11.24l-.88-.18V7h-1v1.58l-.87.18C9.49 8.91 9 9.51 9 10.2c0 .83.61 1.55 1.43 1.71l.57.11V14h-.07c-.31 0-.57-.26-.57-.57h-1c0 .83.61 1.55 1.43 1.71l.21.04V17h1v-1.82l.87-.18c.64-.15 1.13-.75 1.13-1.5 0-.83-.61-1.55-1.43-1.71L12 11.68V10h.07c.31 0 .57.26.57.57h1c0-.83-.61-1.55-1.43-1.71l-.33-.1z" />
      </svg>
    )

  if (compact) {
    // Compact view for list display
    return (
      <div
        onClick={onViewDetails}
        className={`rounded-lg p-3 border cursor-pointer transition-colors ${
          darkMode
            ? "bg-gray-900 border-gray-700 hover:bg-gray-800"
            : "bg-gray-50 border-gray-200 hover:bg-gray-100"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Card icon */}
            <div
              className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                card.status === CardStatus.ACTIVE
                  ? "bg-blink-accent/20 text-blink-accent"
                  : darkMode
                    ? "bg-gray-800 text-gray-400"
                    : "bg-gray-200 text-gray-500"
              }`}
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
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            </div>

            {/* Card info */}
            <div className="min-w-0">
              <h5
                className={`font-medium truncate ${darkMode ? "text-white" : "text-gray-900"}`}
              >
                {card.name || `Card ${card.cardUid.slice(-4).toUpperCase()}`}
              </h5>
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}
                >
                  {formatBalance(card.balance || 0, card.walletCurrency)}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${statusInfo.bgColor} ${statusInfo.textColor}`}
                >
                  {statusInfo.label}
                </span>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <svg
            className={`w-5 h-5 flex-shrink-0 ${darkMode ? "text-gray-600" : "text-gray-400"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    )
  }

  // Full card view
  return (
    <div
      className={`rounded-xl p-4 border ${
        card.status === CardStatus.ACTIVE
          ? darkMode
            ? "bg-blink-accent/5 border-blink-accent/30"
            : "bg-blink-accent/5 border-blink-accent/30"
          : darkMode
            ? "bg-gray-900 border-gray-700"
            : "bg-gray-50 border-gray-200"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Card chip icon */}
          <div
            className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              card.status === CardStatus.ACTIVE
                ? "bg-blink-accent/20 text-blink-accent"
                : darkMode
                  ? "bg-gray-800 text-gray-400"
                  : "bg-gray-200 text-gray-500"
            }`}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          </div>
          <div>
            <h4 className={`font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}>
              {card.name || `Boltcard`}
            </h4>
            <p
              className={`text-xs font-mono ${darkMode ? "text-gray-500" : "text-gray-400"}`}
            >
              UID: {card.cardUid.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${statusInfo.bgColor} ${statusInfo.textColor}`}
        >
          {statusInfo.label}
        </span>
      </div>

      {/* Balance */}
      <div className="mb-4">
        <p className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
          Balance
        </p>
        <div className="flex items-baseline gap-2">
          <span
            className={`text-2xl font-bold ${darkMode ? "text-white" : "text-gray-900"}`}
          >
            {formatBalance(card.balance || 0, card.walletCurrency)}
          </span>
          <span className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
            {card.walletCurrency}
          </span>
        </div>
      </div>

      {/* Limits info */}
      {(card.maxTxAmount || card.dailyLimit) && (
        <div className={`mb-4 p-2 rounded-lg ${darkMode ? "bg-gray-800" : "bg-white"}`}>
          <div className="flex gap-4 text-xs">
            {card.maxTxAmount && (
              <div>
                <span className={darkMode ? "text-gray-500" : "text-gray-400"}>
                  Max/tx:{" "}
                </span>
                <span className={darkMode ? "text-gray-300" : "text-gray-600"}>
                  {formatBalance(card.maxTxAmount, card.walletCurrency)}
                </span>
              </div>
            )}
            {card.dailyLimit && (
              <div>
                <span className={darkMode ? "text-gray-500" : "text-gray-400"}>
                  Daily:{" "}
                </span>
                <span className={darkMode ? "text-gray-300" : "text-gray-600"}>
                  {formatBalance(card.dailySpent || 0, card.walletCurrency)} /{" "}
                  {formatBalance(card.dailyLimit, card.walletCurrency)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onViewDetails}
          className="flex-1 py-2 text-sm font-medium bg-blink-accent text-black rounded-md hover:bg-blink-accent/90 transition-colors"
        >
          View Details
        </button>
        {card.status === CardStatus.ACTIVE && onDisable && (
          <button
            onClick={onDisable}
            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              darkMode
                ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Disable
          </button>
        )}
        {card.status === CardStatus.DISABLED && onEnable && (
          <button
            onClick={onEnable}
            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              darkMode
                ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Enable
          </button>
        )}
      </div>
    </div>
  )
}
