/**
 * Tests for useTransactionState hook
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react"
import {
  useTransactionState,
  type Transaction,
  type DateRange,
} from "@/lib/hooks/useTransactionState"

// Mock transaction data
const mockTransaction: Transaction = {
  id: "tx-123",
  createdAt: "2024-01-15T10:30:00Z",
  direction: "RECEIVE",
  settlementAmount: 100000,
  settlementCurrency: "BTC",
  status: "SUCCESS",
  memo: "Test payment",
}

const mockTransactions: Transaction[] = [
  mockTransaction,
  {
    id: "tx-456",
    createdAt: "2024-01-14T15:00:00Z",
    direction: "SEND",
    settlementAmount: 50000,
    settlementCurrency: "BTC",
    status: "SUCCESS",
  },
]

describe("useTransactionState", () => {
  describe("initial state", () => {
    it("initializes with empty transactions array", () => {
      const { result } = renderHook(() => useTransactionState())
      expect(result.current.transactions).toEqual([])
    })

    it("initializes with loading as false", () => {
      const { result } = renderHook(() => useTransactionState())
      expect(result.current.loading).toBe(false)
    })

    it("initializes with empty error string", () => {
      const { result } = renderHook(() => useTransactionState())
      expect(result.current.error).toBe("")
    })

    it("initializes with empty expanded months set", () => {
      const { result } = renderHook(() => useTransactionState())
      expect(result.current.expandedMonths).toEqual(new Set())
    })

    it("initializes with empty monthly transactions", () => {
      const { result } = renderHook(() => useTransactionState())
      expect(result.current.monthlyTransactions).toEqual({})
    })

    it("initializes with pagination state as false", () => {
      const { result } = renderHook(() => useTransactionState())
      expect(result.current.hasMoreTransactions).toBe(false)
      expect(result.current.loadingMore).toBe(false)
      expect(result.current.pastTransactionsLoaded).toBe(false)
    })

    it("initializes with export state as false", () => {
      const { result } = renderHook(() => useTransactionState())
      expect(result.current.exportingData).toBe(false)
    })

    it("initializes with null date range", () => {
      const { result } = renderHook(() => useTransactionState())
      expect(result.current.selectedDateRange).toBeNull()
    })

    it("initializes with default time values", () => {
      const { result } = renderHook(() => useTransactionState())
      expect(result.current.customTimeStart).toBe("00:00")
      expect(result.current.customTimeEnd).toBe("23:59")
    })

    it("initializes with empty date filter values", () => {
      const { result } = renderHook(() => useTransactionState())
      expect(result.current.customDateStart).toBe("")
      expect(result.current.customDateEnd).toBe("")
      expect(result.current.filteredTransactions).toEqual([])
      expect(result.current.dateFilterActive).toBe(false)
    })

    it("initializes with null selected transaction", () => {
      const { result } = renderHook(() => useTransactionState())
      expect(result.current.selectedTransaction).toBeNull()
    })

    it("initializes with search state as inactive", () => {
      const { result } = renderHook(() => useTransactionState())
      expect(result.current.isSearchingTx).toBe(false)
      expect(result.current.txSearchInput).toBe("")
      expect(result.current.txSearchQuery).toBe("")
      expect(result.current.isSearchLoading).toBe(false)
    })
  })

  describe("core transaction actions", () => {
    it("setTransactions updates transactions array", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setTransactions(mockTransactions)
      })

      expect(result.current.transactions).toEqual(mockTransactions)
    })

    it("setLoading toggles loading state", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setLoading(true)
      })

      expect(result.current.loading).toBe(true)

      act(() => {
        result.current.setLoading(false)
      })

      expect(result.current.loading).toBe(false)
    })

    it("setError sets error message", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setError("Failed to fetch transactions")
      })

      expect(result.current.error).toBe("Failed to fetch transactions")
    })
  })

  describe("monthly grouping and pagination actions", () => {
    it("setExpandedMonths updates expanded months", () => {
      const { result } = renderHook(() => useTransactionState())
      const months = new Set(["2024-01", "2024-02"])

      act(() => {
        result.current.setExpandedMonths(months)
      })

      expect(result.current.expandedMonths).toEqual(months)
    })

    it("toggleExpandedMonth adds month if not present", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.toggleExpandedMonth("2024-01")
      })

      expect(result.current.expandedMonths.has("2024-01")).toBe(true)
    })

    it("toggleExpandedMonth removes month if present", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setExpandedMonths(new Set(["2024-01", "2024-02"]))
      })

      act(() => {
        result.current.toggleExpandedMonth("2024-01")
      })

      expect(result.current.expandedMonths.has("2024-01")).toBe(false)
      expect(result.current.expandedMonths.has("2024-02")).toBe(true)
    })

    it("setMonthlyTransactions updates monthly grouping", () => {
      const { result } = renderHook(() => useTransactionState())
      const monthly = {
        "2024-01": [mockTransaction],
        "2024-02": [],
      }

      act(() => {
        result.current.setMonthlyTransactions(monthly)
      })

      expect(result.current.monthlyTransactions).toEqual(monthly)
    })

    it("setHasMoreTransactions updates pagination flag", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setHasMoreTransactions(true)
      })

      expect(result.current.hasMoreTransactions).toBe(true)
    })

    it("setLoadingMore toggles loading more state", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setLoadingMore(true)
      })

      expect(result.current.loadingMore).toBe(true)
    })

    it("setPastTransactionsLoaded updates loaded flag", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setPastTransactionsLoaded(true)
      })

      expect(result.current.pastTransactionsLoaded).toBe(true)
    })
  })

  describe("export actions", () => {
    it("setExportingData toggles export state", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setExportingData(true)
      })

      expect(result.current.exportingData).toBe(true)
    })
  })

  describe("date range filtering actions", () => {
    it("setSelectedDateRange sets date range", () => {
      const { result } = renderHook(() => useTransactionState())
      const dateRange: DateRange = {
        type: "preset",
        start: new Date("2024-01-01"),
        end: new Date("2024-01-31"),
        label: "January 2024",
      }

      act(() => {
        result.current.setSelectedDateRange(dateRange)
      })

      expect(result.current.selectedDateRange).toEqual(dateRange)
    })

    it("setCustomDateStart sets custom start date", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setCustomDateStart("2024-01-01")
      })

      expect(result.current.customDateStart).toBe("2024-01-01")
    })

    it("setCustomDateEnd sets custom end date", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setCustomDateEnd("2024-01-31")
      })

      expect(result.current.customDateEnd).toBe("2024-01-31")
    })

    it("setCustomTimeStart sets custom start time", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setCustomTimeStart("09:00")
      })

      expect(result.current.customTimeStart).toBe("09:00")
    })

    it("setCustomTimeEnd sets custom end time", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setCustomTimeEnd("17:00")
      })

      expect(result.current.customTimeEnd).toBe("17:00")
    })

    it("setFilteredTransactions updates filtered list", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setFilteredTransactions([mockTransaction])
      })

      expect(result.current.filteredTransactions).toEqual([mockTransaction])
    })

    it("setDateFilterActive toggles filter active state", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setDateFilterActive(true)
      })

      expect(result.current.dateFilterActive).toBe(true)
    })
  })

  describe("transaction detail actions", () => {
    it("setSelectedTransaction sets selected transaction", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setSelectedTransaction(mockTransaction)
      })

      expect(result.current.selectedTransaction).toEqual(mockTransaction)
    })

    it("setSelectedTransaction can clear selection", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setSelectedTransaction(mockTransaction)
      })

      act(() => {
        result.current.setSelectedTransaction(null)
      })

      expect(result.current.selectedTransaction).toBeNull()
    })

    it("triggerLabelUpdate increments trigger counter", () => {
      const { result } = renderHook(() => useTransactionState())

      expect(result.current.labelUpdateTrigger).toBe(0)

      act(() => {
        result.current.triggerLabelUpdate()
      })

      expect(result.current.labelUpdateTrigger).toBe(1)

      act(() => {
        result.current.triggerLabelUpdate()
      })

      expect(result.current.labelUpdateTrigger).toBe(2)
    })
  })

  describe("search actions", () => {
    it("setIsSearchingTx toggles searching state", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setIsSearchingTx(true)
      })

      expect(result.current.isSearchingTx).toBe(true)
    })

    it("setTxSearchInput updates search input", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setTxSearchInput("coffee")
      })

      expect(result.current.txSearchInput).toBe("coffee")
    })

    it("setTxSearchQuery updates active search query", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setTxSearchQuery("coffee shop")
      })

      expect(result.current.txSearchQuery).toBe("coffee shop")
    })

    it("setIsSearchLoading toggles search loading state", () => {
      const { result } = renderHook(() => useTransactionState())

      act(() => {
        result.current.setIsSearchLoading(true)
      })

      expect(result.current.isSearchLoading).toBe(true)
    })
  })

  describe("clearTransactions", () => {
    it("clears transactions and related state", () => {
      const { result } = renderHook(() => useTransactionState())

      // Set up state
      act(() => {
        result.current.setTransactions(mockTransactions)
        result.current.setMonthlyTransactions({ "2024-01": mockTransactions })
        result.current.setExpandedMonths(new Set(["2024-01"]))
        result.current.setHasMoreTransactions(true)
        result.current.setPastTransactionsLoaded(true)
        result.current.setFilteredTransactions([mockTransaction])
        result.current.setError("Some error")
      })

      // Clear transactions
      act(() => {
        result.current.clearTransactions()
      })

      expect(result.current.transactions).toEqual([])
      expect(result.current.monthlyTransactions).toEqual({})
      expect(result.current.expandedMonths).toEqual(new Set())
      expect(result.current.hasMoreTransactions).toBe(false)
      expect(result.current.pastTransactionsLoaded).toBe(false)
      expect(result.current.filteredTransactions).toEqual([])
      expect(result.current.error).toBe("")
    })
  })

  describe("clearDateFilter", () => {
    it("clears all date filter state", () => {
      const { result } = renderHook(() => useTransactionState())

      // Set up date filter state
      act(() => {
        result.current.setSelectedDateRange({
          type: "custom",
          start: new Date(),
          end: new Date(),
          label: "Custom",
        })
        result.current.setCustomDateStart("2024-01-01")
        result.current.setCustomDateEnd("2024-01-31")
        result.current.setCustomTimeStart("09:00")
        result.current.setCustomTimeEnd("17:00")
        result.current.setFilteredTransactions([mockTransaction])
        result.current.setDateFilterActive(true)
      })

      // Clear date filter
      act(() => {
        result.current.clearDateFilter()
      })

      expect(result.current.selectedDateRange).toBeNull()
      expect(result.current.customDateStart).toBe("")
      expect(result.current.customDateEnd).toBe("")
      expect(result.current.customTimeStart).toBe("00:00")
      expect(result.current.customTimeEnd).toBe("23:59")
      expect(result.current.filteredTransactions).toEqual([])
      expect(result.current.dateFilterActive).toBe(false)
    })
  })

  describe("clearSearch", () => {
    it("clears all search state", () => {
      const { result } = renderHook(() => useTransactionState())

      // Set up search state
      act(() => {
        result.current.setIsSearchingTx(true)
        result.current.setTxSearchInput("coffee")
        result.current.setTxSearchQuery("coffee")
        result.current.setIsSearchLoading(true)
      })

      // Clear search
      act(() => {
        result.current.clearSearch()
      })

      expect(result.current.isSearchingTx).toBe(false)
      expect(result.current.txSearchInput).toBe("")
      expect(result.current.txSearchQuery).toBe("")
      expect(result.current.isSearchLoading).toBe(false)
    })
  })

  describe("resetTransactionState", () => {
    it("resets all transaction state to initial values", () => {
      const { result } = renderHook(() => useTransactionState())

      // Set up various state
      act(() => {
        result.current.setTransactions(mockTransactions)
        result.current.setLoading(true)
        result.current.setLoadingMore(true)
        result.current.setError("Some error")
        result.current.setSelectedDateRange({
          type: "preset",
          start: new Date(),
          end: new Date(),
          label: "Today",
        })
        result.current.setIsSearchingTx(true)
        result.current.setTxSearchInput("search")
        result.current.setSelectedTransaction(mockTransaction)
        result.current.setExportingData(true)
        result.current.triggerLabelUpdate()
      })

      // Reset all state
      act(() => {
        result.current.resetTransactionState()
      })

      expect(result.current.transactions).toEqual([])
      expect(result.current.loading).toBe(false)
      expect(result.current.loadingMore).toBe(false)
      expect(result.current.error).toBe("")
      expect(result.current.selectedDateRange).toBeNull()
      expect(result.current.isSearchingTx).toBe(false)
      expect(result.current.txSearchInput).toBe("")
      expect(result.current.selectedTransaction).toBeNull()
      expect(result.current.exportingData).toBe(false)
      expect(result.current.labelUpdateTrigger).toBe(0)
    })
  })

  describe("callback stability", () => {
    it("toggleExpandedMonth maintains referential equality", () => {
      const { result, rerender } = renderHook(() => useTransactionState())

      const first = result.current.toggleExpandedMonth
      rerender()
      const second = result.current.toggleExpandedMonth

      expect(first).toBe(second)
    })

    it("triggerLabelUpdate maintains referential equality", () => {
      const { result, rerender } = renderHook(() => useTransactionState())

      const first = result.current.triggerLabelUpdate
      rerender()
      const second = result.current.triggerLabelUpdate

      expect(first).toBe(second)
    })

    it("clearTransactions maintains referential equality", () => {
      const { result, rerender } = renderHook(() => useTransactionState())

      const first = result.current.clearTransactions
      rerender()
      const second = result.current.clearTransactions

      expect(first).toBe(second)
    })

    it("clearDateFilter maintains referential equality", () => {
      const { result, rerender } = renderHook(() => useTransactionState())

      const first = result.current.clearDateFilter
      rerender()
      const second = result.current.clearDateFilter

      expect(first).toBe(second)
    })

    it("clearSearch maintains referential equality", () => {
      const { result, rerender } = renderHook(() => useTransactionState())

      const first = result.current.clearSearch
      rerender()
      const second = result.current.clearSearch

      expect(first).toBe(second)
    })
  })

  describe("typical workflow scenarios", () => {
    it("handles transaction loading workflow", () => {
      const { result } = renderHook(() => useTransactionState())

      // Start loading
      act(() => {
        result.current.setLoading(true)
      })

      expect(result.current.loading).toBe(true)

      // Receive transactions
      act(() => {
        result.current.setTransactions(mockTransactions)
        result.current.setHasMoreTransactions(true)
        result.current.setLoading(false)
      })

      expect(result.current.transactions).toEqual(mockTransactions)
      expect(result.current.hasMoreTransactions).toBe(true)
      expect(result.current.loading).toBe(false)
    })

    it("handles load more workflow", () => {
      const { result } = renderHook(() => useTransactionState())

      // Initial load
      act(() => {
        result.current.setTransactions(mockTransactions)
        result.current.setHasMoreTransactions(true)
      })

      // User clicks load more
      act(() => {
        result.current.setLoadingMore(true)
      })

      expect(result.current.loadingMore).toBe(true)

      // More transactions loaded
      const moreTransactions = [
        ...mockTransactions,
        { ...mockTransaction, id: "tx-789" },
      ]

      act(() => {
        result.current.setTransactions(moreTransactions)
        result.current.setLoadingMore(false)
        result.current.setPastTransactionsLoaded(true)
        result.current.setHasMoreTransactions(false)
      })

      expect(result.current.transactions).toHaveLength(3)
      expect(result.current.loadingMore).toBe(false)
      expect(result.current.pastTransactionsLoaded).toBe(true)
    })

    it("handles date range filtering workflow", () => {
      const { result } = renderHook(() => useTransactionState())

      // Load transactions
      act(() => {
        result.current.setTransactions(mockTransactions)
      })

      // Apply date filter
      const dateRange: DateRange = {
        type: "preset",
        start: new Date("2024-01-15"),
        end: new Date("2024-01-15"),
        label: "January 15",
      }

      act(() => {
        result.current.setSelectedDateRange(dateRange)
        result.current.setFilteredTransactions([mockTransaction])
        result.current.setDateFilterActive(true)
      })

      expect(result.current.selectedDateRange).toEqual(dateRange)
      expect(result.current.filteredTransactions).toHaveLength(1)
      expect(result.current.dateFilterActive).toBe(true)

      // Clear filter
      act(() => {
        result.current.clearDateFilter()
      })

      expect(result.current.selectedDateRange).toBeNull()
      expect(result.current.dateFilterActive).toBe(false)
    })

    it("handles search workflow", () => {
      const { result } = renderHook(() => useTransactionState())

      // User starts searching
      act(() => {
        result.current.setIsSearchingTx(true)
        result.current.setTxSearchInput("coffee")
      })

      expect(result.current.isSearchingTx).toBe(true)
      expect(result.current.txSearchInput).toBe("coffee")

      // User submits search
      act(() => {
        result.current.setTxSearchQuery("coffee")
        result.current.setIsSearchLoading(true)
      })

      expect(result.current.txSearchQuery).toBe("coffee")
      expect(result.current.isSearchLoading).toBe(true)

      // Search complete
      act(() => {
        result.current.setIsSearchLoading(false)
      })

      expect(result.current.isSearchLoading).toBe(false)

      // User clears search
      act(() => {
        result.current.clearSearch()
      })

      expect(result.current.isSearchingTx).toBe(false)
      expect(result.current.txSearchInput).toBe("")
      expect(result.current.txSearchQuery).toBe("")
    })

    it("handles transaction detail viewing workflow", () => {
      const { result } = renderHook(() => useTransactionState())

      // User selects a transaction
      act(() => {
        result.current.setSelectedTransaction(mockTransaction)
      })

      expect(result.current.selectedTransaction).toEqual(mockTransaction)

      // User closes detail view
      act(() => {
        result.current.setSelectedTransaction(null)
      })

      expect(result.current.selectedTransaction).toBeNull()
    })

    it("handles export workflow", () => {
      const { result } = renderHook(() => useTransactionState())

      // Start export
      act(() => {
        result.current.setExportingData(true)
      })

      expect(result.current.exportingData).toBe(true)

      // Export complete
      act(() => {
        result.current.setExportingData(false)
      })

      expect(result.current.exportingData).toBe(false)
    })

    it("handles wallet switch workflow", () => {
      const { result } = renderHook(() => useTransactionState())

      // Load initial transactions
      act(() => {
        result.current.setTransactions(mockTransactions)
        result.current.setExpandedMonths(new Set(["2024-01"]))
        result.current.setSelectedDateRange({
          type: "preset",
          start: new Date(),
          end: new Date(),
          label: "Today",
        })
      })

      // User switches wallet - clear everything
      act(() => {
        result.current.clearTransactions()
      })

      expect(result.current.transactions).toEqual([])
      expect(result.current.expandedMonths).toEqual(new Set())
    })
  })
})
