/**
 * DateRangeSelectorOverlay - Date range selection for transaction filtering
 * Extracted from Dashboard.js
 */

import type { DateRangePreset } from "../../lib/hooks/useTransactionActions"

interface DateRangeLoadParams {
  type: string
  id: string
  label: string
  start: Date
  end: Date
}

interface DateRangeSelectorOverlayProps {
  customDateStart: string
  customDateEnd: string
  customTimeStart: string
  customTimeEnd: string
  showTimeInputs: boolean
  loadingMore: boolean
  setShowDateRangeSelector: (show: boolean) => void
  setCustomDateStart: (date: string) => void
  setCustomDateEnd: (date: string) => void
  setCustomTimeStart: (time: string) => void
  setCustomTimeEnd: (time: string) => void
  setShowTimeInputs: (show: boolean) => void
  getDateRangePresets: () => DateRangePreset[]
  loadTransactionsForDateRange: (params: DateRangeLoadParams) => void
  handleCustomDateRange: () => void
  getSubmenuBgClasses: () => string
  getSubmenuHeaderClasses: () => string
}

export default function DateRangeSelectorOverlay({
  customDateStart,
  customDateEnd,
  customTimeStart,
  customTimeEnd,
  showTimeInputs,
  loadingMore,
  setShowDateRangeSelector,
  setCustomDateStart,
  setCustomDateEnd,
  setCustomTimeStart,
  setCustomTimeEnd,
  setShowTimeInputs,
  getDateRangePresets,
  loadTransactionsForDateRange,
  handleCustomDateRange,
  getSubmenuBgClasses,
  getSubmenuHeaderClasses,
}: DateRangeSelectorOverlayProps) {
  return (
    <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-y-auto`}>
      <div className="min-h-screen">
        {/* Header */}
        <div className={`${getSubmenuHeaderClasses()} sticky top-0 z-10`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <button
                onClick={() => setShowDateRangeSelector(false)}
                className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
              >
                <span className="text-2xl mr-2">‹</span>
                <span className="text-lg">Back</span>
              </button>
              <h1
                className="text-xl font-bold text-gray-900 dark:text-white"
                style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
              >
                Select Date Range
              </h1>
              <div className="w-16"></div>
            </div>
          </div>
        </div>

        {/* Date Range Options */}
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="space-y-3">
            {/* Quick Options */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
                Quick Options
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {getDateRangePresets().map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() =>
                      loadTransactionsForDateRange({ type: "preset", ...preset })
                    }
                    disabled={loadingMore}
                    className="p-4 rounded-lg border-2 border-blue-500 dark:border-blue-400 bg-white dark:bg-blink-dark hover:border-blue-600 dark:hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-left"
                  >
                    <h4
                      className="text-base font-semibold text-gray-900 dark:text-white"
                      style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
                    >
                      {preset.label}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {preset.start.toLocaleDateString()}{" "}
                      {preset.id !== "today" &&
                        preset.id !== "yesterday" &&
                        `- ${preset.end.toLocaleDateString()}`}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Range */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
                Custom Range
              </h3>
              <div className="space-y-3">
                {/* Start Date/Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start Date
                  </label>
                  <div
                    className={`flex gap-2 ${showTimeInputs ? "flex-col sm:flex-row" : ""}`}
                  >
                    <input
                      type="date"
                      value={customDateStart}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCustomDateStart(e.target.value)
                      }
                      max={customDateEnd || new Date().toISOString().split("T")[0]}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {showTimeInputs && (
                      <input
                        type="time"
                        value={customTimeStart}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setCustomTimeStart(e.target.value)
                        }
                        className="w-full sm:w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                  </div>
                </div>

                {/* End Date/Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    End Date
                  </label>
                  <div
                    className={`flex gap-2 ${showTimeInputs ? "flex-col sm:flex-row" : ""}`}
                  >
                    <input
                      type="date"
                      value={customDateEnd}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCustomDateEnd(e.target.value)
                      }
                      min={customDateStart}
                      max={new Date().toISOString().split("T")[0]}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {showTimeInputs && (
                      <input
                        type="time"
                        value={customTimeEnd}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setCustomTimeEnd(e.target.value)
                        }
                        className="w-full sm:w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                  </div>
                </div>

                {/* Toggle Time Inputs */}
                <button
                  type="button"
                  onClick={() => setShowTimeInputs(!showTimeInputs)}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                    showTimeInputs
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                  }`}
                >
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
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {showTimeInputs ? "Hide time options" : "Add specific times"}
                </button>

                {/* Apply Button */}
                <button
                  onClick={handleCustomDateRange}
                  disabled={!customDateStart || !customDateEnd || loadingMore}
                  className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loadingMore ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                      Loading...
                    </div>
                  ) : (
                    "Apply Custom Range"
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Info Text */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Select a date range to filter and view transactions. You can then export the
              filtered data using the Export button.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
