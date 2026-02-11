/**
 * useTransactionState Hook
 *
 * Manages transaction history state for the Dashboard component.
 * Handles transaction listing, filtering, searching, and date range selection.
 *
 * This hook extracts transaction-related state from Dashboard.js to reduce complexity.
 */

import { useState, useCallback } from "react"

/**
 * Hook for managing transaction history state
 *
 * @example
 * ```jsx
 * const {
 *   transactions,
 *   setTransactions,
 *   loading,
 *   setLoading,
 *   selectedDateRange,
 *   setSelectedDateRange,
 *   clearDateFilter
 * } = useTransactionState()
 *
 * // Load transactions
 * setLoading(true)
 * const data = await fetchTransactions()
 * setTransactions(data)
 * setLoading(false)
 *
 * // Filter by date
 * setSelectedDateRange({ type: 'preset', start: new Date(), end: new Date(), label: 'Today' })
 *
 * // Clear filter
 * clearDateFilter()
 * ```
 */
export function useTransactionState() {
  // Core transaction data
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Monthly grouping and pagination
  const [expandedMonths, setExpandedMonths] = useState(new Set())
  const [monthlyTransactions, setMonthlyTransactions] = useState({})
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pastTransactionsLoaded, setPastTransactionsLoaded] = useState(false)

  // Export
  const [exportingData, setExportingData] = useState(false)

  // Date range filtering
  const [selectedDateRange, setSelectedDateRange] = useState(null) // { type: 'preset' | 'custom', start: Date, end: Date, label: string }
  const [customDateStart, setCustomDateStart] = useState("")
  const [customDateEnd, setCustomDateEnd] = useState("")
  const [customTimeStart, setCustomTimeStart] = useState("00:00")
  const [customTimeEnd, setCustomTimeEnd] = useState("23:59")
  const [filteredTransactions, setFilteredTransactions] = useState([])
  const [dateFilterActive, setDateFilterActive] = useState(false)

  // Transaction detail
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [labelUpdateTrigger, setLabelUpdateTrigger] = useState(0)

  // Search
  const [isSearchingTx, setIsSearchingTx] = useState(false)
  const [txSearchInput, setTxSearchInput] = useState("")
  const [txSearchQuery, setTxSearchQuery] = useState("")
  const [isSearchLoading, setIsSearchLoading] = useState(false)

  /**
   * Toggle a month's expanded state in the transaction list
   */
  const toggleExpandedMonth = useCallback((month) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(month)) {
        next.delete(month)
      } else {
        next.add(month)
      }
      return next
    })
  }, [])

  /**
   * Trigger a re-render when transaction labels change
   */
  const triggerLabelUpdate = useCallback(() => {
    setLabelUpdateTrigger((prev) => prev + 1)
  }, [])

  /**
   * Clear all transactions and reset related state
   */
  const clearTransactions = useCallback(() => {
    setTransactions([])
    setMonthlyTransactions({})
    setExpandedMonths(new Set())
    setHasMoreTransactions(false)
    setPastTransactionsLoaded(false)
    setFilteredTransactions([])
    setError("")
  }, [])

  /**
   * Clear date filter and show all transactions
   */
  const clearDateFilter = useCallback(() => {
    setSelectedDateRange(null)
    setCustomDateStart("")
    setCustomDateEnd("")
    setCustomTimeStart("00:00")
    setCustomTimeEnd("23:59")
    setFilteredTransactions([])
    setDateFilterActive(false)
  }, [])

  /**
   * Clear search state
   */
  const clearSearch = useCallback(() => {
    setIsSearchingTx(false)
    setTxSearchInput("")
    setTxSearchQuery("")
    setIsSearchLoading(false)
  }, [])

  /**
   * Reset all transaction state to initial values
   */
  const resetTransactionState = useCallback(() => {
    clearTransactions()
    clearDateFilter()
    clearSearch()
    setSelectedTransaction(null)
    setLabelUpdateTrigger(0)
    setExportingData(false)
    setLoading(false)
    setLoadingMore(false)
  }, [clearTransactions, clearDateFilter, clearSearch])

  return {
    // State
    transactions,
    loading,
    error,
    expandedMonths,
    monthlyTransactions,
    hasMoreTransactions,
    loadingMore,
    pastTransactionsLoaded,
    exportingData,
    selectedDateRange,
    customDateStart,
    customDateEnd,
    customTimeStart,
    customTimeEnd,
    filteredTransactions,
    dateFilterActive,
    selectedTransaction,
    labelUpdateTrigger,
    isSearchingTx,
    txSearchInput,
    txSearchQuery,
    isSearchLoading,

    // Actions
    setTransactions,
    setLoading,
    setError,
    setExpandedMonths,
    toggleExpandedMonth,
    setMonthlyTransactions,
    setHasMoreTransactions,
    setLoadingMore,
    setPastTransactionsLoaded,
    setExportingData,
    setSelectedDateRange,
    setCustomDateStart,
    setCustomDateEnd,
    setCustomTimeStart,
    setCustomTimeEnd,
    setFilteredTransactions,
    setDateFilterActive,
    setSelectedTransaction,
    triggerLabelUpdate,
    setIsSearchingTx,
    setTxSearchInput,
    setTxSearchQuery,
    setIsSearchLoading,
    clearTransactions,
    clearDateFilter,
    clearSearch,
    resetTransactionState,
  }
}

export default useTransactionState
