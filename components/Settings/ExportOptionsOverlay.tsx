/**
 * ExportOptionsOverlay - Transaction export options (filtered, basic, full)
 * Extracted from Dashboard.js
 */

import type { Transaction } from "../../lib/hooks/useTransactionState"
import type { DateRange } from "../../lib/hooks/useTransactionState"
import type { CombinedUser } from "../../lib/hooks/useCombinedAuth"

interface ExportOptionsOverlayProps {
  exportingData: boolean
  dateFilterActive: boolean
  filteredTransactions: Transaction[]
  selectedDateRange: DateRange | null
  user: CombinedUser | null
  setShowExportOptions: (show: boolean) => void
  convertTransactionsToBasicCSV: (transactions: Transaction[]) => string
  downloadCSV: (csv: string, filename: string) => void
  exportBasicTransactions: () => void
  exportFullTransactions: () => void
  getSubmenuBgClasses: () => string
  getSubmenuHeaderClasses: () => string
}

export default function ExportOptionsOverlay({
  exportingData,
  dateFilterActive,
  filteredTransactions,
  selectedDateRange,
  user,
  setShowExportOptions,
  convertTransactionsToBasicCSV,
  downloadCSV,
  exportBasicTransactions,
  exportFullTransactions,
  getSubmenuBgClasses,
  getSubmenuHeaderClasses,
}: ExportOptionsOverlayProps) {
  return (
    <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-y-auto`}>
      <div className="min-h-screen">
        {/* Header */}
        <div className={`${getSubmenuHeaderClasses()} sticky top-0 z-10`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <button
                onClick={() => setShowExportOptions(false)}
                className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
              >
                <span className="text-2xl mr-2">‹</span>
                <span className="text-lg">Back</span>
              </button>
              <h1
                className="text-xl font-bold text-gray-900 dark:text-white"
                style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
              >
                Export Options
              </h1>
              <div className="w-16"></div>
            </div>
          </div>
        </div>

        {/* Export Options List */}
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="space-y-3">
            {/* Filtered Export - Show when date filter is active */}
            {dateFilterActive && filteredTransactions.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    Active Filter: {selectedDateRange?.label} (
                    {filteredTransactions.length} transactions)
                  </span>
                </div>
                <button
                  onClick={() => {
                    // Export filtered transactions
                    const csv = convertTransactionsToBasicCSV(filteredTransactions)
                    const date = new Date()
                    const dateStr =
                      date.getFullYear() +
                      String(date.getMonth() + 1).padStart(2, "0") +
                      String(date.getDate()).padStart(2, "0")
                    const username = user?.username || "user"
                    const rangeLabel =
                      selectedDateRange?.label?.replace(/[^a-zA-Z0-9]/g, "-") ||
                      "filtered"
                    const filename = `${dateStr}-${username}-${rangeLabel}-transactions.csv`
                    downloadCSV(csv, filename)
                    setShowExportOptions(false)
                  }}
                  disabled={exportingData}
                  className="w-full p-4 rounded-lg border-2 border-green-500 dark:border-green-400 bg-white dark:bg-blink-dark hover:border-green-600 dark:hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3
                        className="text-lg font-semibold text-gray-900 dark:text-white mb-1"
                        style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
                      >
                        Export Filtered
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {selectedDateRange?.label} - {filteredTransactions.length}{" "}
                        transactions (CSV)
                      </p>
                    </div>
                    <div className="text-green-600 dark:text-green-400 text-xl">↓</div>
                  </div>
                </button>
              </div>
            )}

            {dateFilterActive && filteredTransactions.length > 0 && (
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-black text-gray-500">
                    Or export all history
                  </span>
                </div>
              </div>
            )}

            {/* Basic Export */}
            <button
              onClick={exportBasicTransactions}
              disabled={exportingData}
              className="w-full p-4 rounded-lg border-2 border-blue-500 dark:border-blue-400 bg-white dark:bg-blink-dark hover:border-blue-600 dark:hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <h3
                    className="text-lg font-semibold text-gray-900 dark:text-white mb-1"
                    style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
                  >
                    Basic (All)
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {exportingData
                      ? "Exporting simplified transaction summary..."
                      : "All transactions - simplified format (CSV)"}
                  </p>
                </div>
                {exportingData ? (
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 dark:border-blue-400 border-t-transparent"></div>
                ) : (
                  <div className="text-blue-600 dark:text-blue-400 text-xl">↓</div>
                )}
              </div>
            </button>

            {/* Full Export */}
            <button
              onClick={exportFullTransactions}
              disabled={exportingData}
              className="w-full p-4 rounded-lg border-2 border-yellow-500 dark:border-yellow-400 bg-white dark:bg-blink-dark hover:border-yellow-600 dark:hover:border-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <h3
                    className="text-lg font-semibold text-gray-900 dark:text-white mb-1"
                    style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
                  >
                    Full (All)
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {exportingData
                      ? "Exporting complete transaction history..."
                      : "All transactions - complete format (CSV)"}
                  </p>
                </div>
                {exportingData ? (
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-yellow-600 dark:border-yellow-400 border-t-transparent"></div>
                ) : (
                  <div className="text-yellow-600 dark:text-yellow-400 text-xl">↓</div>
                )}
              </div>
            </button>
          </div>

          {/* Info Text */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            {dateFilterActive && filteredTransactions.length > 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                <strong>Filtered Export:</strong> Only transactions from{" "}
                {selectedDateRange?.label}.
              </p>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              <strong>Basic Export:</strong> Simplified CSV with 9 essential columns
              (timestamp, type, credit, debit, fee, currency, status, memo, username).
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Full Export:</strong> Complete transaction data with all 24 fields
              matching Blink&apos;s official format.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
              On mobile devices, you&apos;ll have the option to save or share the file
              with other apps.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
