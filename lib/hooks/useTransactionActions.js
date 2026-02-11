import { useCallback } from "react"
import { getEnvironment } from "../config/api"
import { SPINNER_COLORS } from "./useViewNavigation"

/**
 * Hook for transaction operations: loading, filtering, searching, exporting,
 * date range handling, view transitions, and month grouping.
 *
 * Extracted from Dashboard.js — the largest extraction (~940 lines).
 *
 * @param {Object} params - All required state, setters, and refs
 * @returns {Object} Transaction action functions
 */
export function useTransactionActions({
  // From useWalletState
  apiKey,
  wallets,
  // From useCombinedAuth
  user,
  // From useTransactionState
  transactions,
  setTransactions,
  loadingMore,
  setLoadingMore,
  hasMoreTransactions,
  setHasMoreTransactions,
  setPastTransactionsLoaded,
  setDateFilterActive,
  setSelectedDateRange,
  setFilteredTransactions,
  setExportingData,
  dateFilterActive,
  filteredTransactions,
  clearDateFilter,
  txSearchQuery,
  txSearchInput,
  setIsSearchingTx,
  setTxSearchInput,
  setIsSearchLoading,
  setTxSearchQuery,
  expandedMonths,
  setExpandedMonths,
  // From useUIVisibility
  showTimeInputs,
  setShowTimeInputs,
  setShowDateRangeSelector,
  setShowExportOptions,
  // From useViewNavigation
  currentView,
  setCurrentView,
  setTransitionColorIndex,
  setIsViewTransitioning,
  // From useTransactionState (custom date range inputs)
  customDateStart,
  customDateEnd,
  customTimeStart,
  customTimeEnd,
  // From useDashboardData
  fetchData,
  // Refs
  txSearchInputRef,
  cartRef,
}) {
  const loadMoreHistoricalTransactions = async (cursor, currentTransactions) => {
    try {
      // Load several batches to get a good historical view
      let allTransactions = [...currentTransactions]
      let nextCursor = cursor
      let hasMore = true
      let batchCount = 0
      const maxBatches = 5 // Load up to 5 more batches (500 more transactions)

      // Build request headers
      // Always include API key to ensure correct account is used
      const headers = {}
      if (apiKey) {
        headers["X-API-KEY"] = apiKey
      }

      while (hasMore && batchCount < maxBatches) {
        const currentEnv = getEnvironment()
        const response = await fetch(
          `/api/blink/transactions?first=100&after=${nextCursor}&environment=${currentEnv}`,
          { headers, credentials: "include" },
        )

        if (response.ok) {
          const data = await response.json()
          allTransactions = [...allTransactions, ...data.transactions]

          hasMore = data.pageInfo?.hasNextPage
          nextCursor = data.pageInfo?.endCursor
          batchCount++

          // Update transactions in real-time so user sees progress
          setTransactions([...allTransactions])
        } else {
          break
        }
      }

      console.log(
        `Loaded ${allTransactions.length} total transactions across ${batchCount + 1} batches`,
      )
      return hasMore // Return whether more transactions are available
    } catch (error) {
      console.error("Error loading historical transactions:", error)
      return false
    }
  }

  // Load past transactions (initial load of historical data)
  const loadPastTransactions = async () => {
    if (loadingMore || !hasMoreTransactions) return

    setLoadingMore(true)
    try {
      // Get the last transaction from current transactions
      const lastTransaction = transactions[transactions.length - 1]

      if (lastTransaction?.cursor) {
        // Load historical transactions (same logic as before, but triggered by user)
        const finalHasMore = await loadMoreHistoricalTransactions(
          lastTransaction.cursor,
          transactions,
        )
        setHasMoreTransactions(finalHasMore)
        setPastTransactionsLoaded(true)
      }
    } catch (error) {
      console.error("Error loading past transactions:", error)
    } finally {
      setLoadingMore(false)
    }
  }

  // Load more months on demand (after initial past transactions are loaded)
  const loadMoreMonths = async () => {
    if (loadingMore || !hasMoreTransactions) return

    setLoadingMore(true)
    try {
      // Always include API key to ensure correct account is used
      const headers = {}
      if (apiKey) {
        headers["X-API-KEY"] = apiKey
      }

      const lastTransaction = transactions[transactions.length - 1]
      const currentEnv = getEnvironment()
      const response = await fetch(
        `/api/blink/transactions?first=100&after=${lastTransaction?.cursor || ""}&environment=${currentEnv}`,
        { headers, credentials: "include" },
      )

      if (response.ok) {
        const data = await response.json()
        const newTransactions = data.transactions

        if (newTransactions.length > 0) {
          setTransactions((prev) => [...prev, ...newTransactions])
          setHasMoreTransactions(data.pageInfo?.hasNextPage || false)
        } else {
          setHasMoreTransactions(false)
        }
      }
    } catch (error) {
      console.error("Error loading more months:", error)
    } finally {
      setLoadingMore(false)
    }
  }

  // Date range presets for transaction filtering
  const getDateRangePresets = () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0) // Last day of previous month

    const last7Days = new Date(today)
    last7Days.setDate(last7Days.getDate() - 6) // 7 days including today

    const last30Days = new Date(today)
    last30Days.setDate(last30Days.getDate() - 29) // 30 days including today

    return [
      {
        id: "today",
        label: "Today",
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1), // End of today
      },
      {
        id: "yesterday",
        label: "Yesterday",
        start: yesterday,
        end: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1),
      },
      {
        id: "last7days",
        label: "Last 7 Days",
        start: last7Days,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
      },
      {
        id: "last30days",
        label: "Last 30 Days",
        start: last30Days,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
      },
      {
        id: "thismonth",
        label: "This Month",
        start: thisMonthStart,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
      },
      {
        id: "lastmonth",
        label: "Last Month",
        start: lastMonthStart,
        end: lastMonthEnd,
      },
    ]
  }

  // Parse createdAt value to Date object (handles various formats from Blink API)
  const parseCreatedAt = (createdAt) => {
    if (!createdAt) return null

    try {
      // If it's a number, it's likely a Unix timestamp
      if (typeof createdAt === "number") {
        // Check if it's in seconds (10 digits) or milliseconds (13 digits)
        if (createdAt < 10000000000) {
          // Unix timestamp in seconds
          return new Date(createdAt * 1000)
        } else {
          // Unix timestamp in milliseconds
          return new Date(createdAt)
        }
      }

      // If it's a string
      if (typeof createdAt === "string") {
        // Check if it's a numeric string (timestamp)
        const numericValue = parseInt(createdAt, 10)
        if (!isNaN(numericValue) && createdAt.match(/^\d+$/)) {
          // It's a numeric timestamp string
          if (numericValue < 10000000000) {
            return new Date(numericValue * 1000)
          } else {
            return new Date(numericValue)
          }
        }

        // Otherwise treat as ISO string or date string
        const date = new Date(createdAt)
        if (!isNaN(date.getTime())) {
          return date
        }
      }

      return null
    } catch (error) {
      console.error("Error parsing createdAt:", createdAt, error)
      return null
    }
  }

  // Parse transaction date string to Date object (for formatted display dates)
  const parseTransactionDate = (dateString) => {
    try {
      // Handle format like "Dec 14, 2025, 10:30 AM"
      const date = new Date(dateString)
      if (!isNaN(date.getTime())) {
        return date
      }
      return null
    } catch (error) {
      console.error("Error parsing date:", dateString, error)
      return null
    }
  }

  // Filter transactions by date range
  const filterTransactionsByDateRange = (txs, startDate, endDate) => {
    console.log("Filtering transactions:", {
      count: txs.length,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    })

    const filtered = txs.filter((tx) => {
      // Parse the createdAt field properly (handles Unix timestamps)
      const txDate = parseCreatedAt(tx.createdAt) || parseTransactionDate(tx.date)

      if (!txDate) {
        console.log("Could not parse date for tx:", tx.id, tx.createdAt, tx.date)
        return false
      }

      const isInRange = txDate >= startDate && txDate <= endDate
      return isInRange
    })

    console.log("Filtered result:", filtered.length, "transactions")
    if (txs.length > 0 && filtered.length === 0) {
      // Debug: show first transaction's date info
      const firstTx = txs[0]
      const parsedDate = parseCreatedAt(firstTx.createdAt)
      console.log("Debug first tx:", {
        createdAt: firstTx.createdAt,
        type: typeof firstTx.createdAt,
        parsedDate: parsedDate?.toISOString(),
        date: firstTx.date,
      })
    }

    return filtered
  }

  // Load and filter transactions by date range
  const loadTransactionsForDateRange = async (dateRange) => {
    if (loadingMore) return

    setLoadingMore(true)
    setDateFilterActive(true)
    setSelectedDateRange(dateRange)

    try {
      // Always include API key to ensure correct account is used
      const headers = {}
      if (apiKey) {
        headers["X-API-KEY"] = apiKey
      }

      // We need to load enough transactions to cover the date range
      // Start by loading initial batch, then load more if needed
      let allTransactions = [...transactions]
      let cursor =
        allTransactions.length > 0
          ? allTransactions[allTransactions.length - 1]?.cursor
          : null
      let hasMore = hasMoreTransactions
      let batchCount = 0
      const maxBatches = 10 // Load up to 10 batches (1000 transactions)

      // Check if we already have transactions covering the date range
      const existingFiltered = filterTransactionsByDateRange(
        allTransactions,
        dateRange.start,
        dateRange.end,
      )

      // If we have existing transactions and the oldest one is older than our range start,
      // we might have enough data
      const oldestTx = allTransactions[allTransactions.length - 1]
      let oldestDate =
        parseCreatedAt(oldestTx?.createdAt) || parseTransactionDate(oldestTx?.date)

      // Load more if we don't have enough data covering the date range
      while (hasMore && batchCount < maxBatches) {
        // If oldest transaction is older than our range start, we have enough
        if (oldestDate && oldestDate < dateRange.start) {
          break
        }

        batchCount++
        const currentEnv = getEnvironment()
        const url = cursor
          ? `/api/blink/transactions?first=100&after=${cursor}&environment=${currentEnv}`
          : `/api/blink/transactions?first=100&environment=${currentEnv}`

        const response = await fetch(url, { headers, credentials: "include" })

        if (response.ok) {
          const data = await response.json()

          if (data.transactions && data.transactions.length > 0) {
            allTransactions = [...allTransactions, ...data.transactions]
            cursor = data.pageInfo?.endCursor
            hasMore = data.pageInfo?.hasNextPage || false

            // Update the oldest date check
            const newOldest = allTransactions[allTransactions.length - 1]
            const newOldestDate =
              parseCreatedAt(newOldest?.createdAt) ||
              parseTransactionDate(newOldest?.date)
            if (newOldestDate && newOldestDate < dateRange.start) {
              break // We have enough data
            }
          } else {
            break
          }
        } else {
          break
        }
      }

      // Update main transactions state
      setTransactions(allTransactions)
      setHasMoreTransactions(hasMore)

      // Filter and set filtered transactions
      const filtered = filterTransactionsByDateRange(
        allTransactions,
        dateRange.start,
        dateRange.end,
      )
      setFilteredTransactions(filtered)
      setPastTransactionsLoaded(true)

      console.log(
        `Date range filter: ${dateRange.label}, found ${filtered.length} transactions out of ${allTransactions.length} total`,
      )
    } catch (error) {
      console.error("Error loading transactions for date range:", error)
    } finally {
      setLoadingMore(false)
      setShowDateRangeSelector(false)
    }
  }

  // Handle custom date range selection
  const handleCustomDateRange = () => {
    if (!customDateStart || !customDateEnd) {
      return
    }

    const start = new Date(customDateStart)
    const end = new Date(customDateEnd)

    // Apply time if time inputs are shown
    if (showTimeInputs && customTimeStart) {
      const [startHour, startMin] = customTimeStart.split(":").map(Number)
      start.setHours(startHour, startMin, 0, 0)
    } else {
      start.setHours(0, 0, 0, 0)
    }

    if (showTimeInputs && customTimeEnd) {
      const [endHour, endMin] = customTimeEnd.split(":").map(Number)
      end.setHours(endHour, endMin, 59, 999)
    } else {
      end.setHours(23, 59, 59, 999)
    }

    if (start > end) {
      alert("Start date/time must be before end date/time")
      return
    }

    // Format label based on whether time is included
    let label
    if (showTimeInputs) {
      const formatDateTime = (d) => {
        return (
          d.toLocaleDateString() +
          " " +
          d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        )
      }
      label = `${formatDateTime(start)} - ${formatDateTime(end)}`
    } else {
      label = `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`
    }

    const dateRange = {
      type: "custom",
      start,
      end,
      label,
    }

    loadTransactionsForDateRange(dateRange)
  }

  // Clear date filter - uses hook's clearDateFilter plus local UI state
  const handleClearDateFilter = () => {
    clearDateFilter() // From useTransactionState hook
    setShowTimeInputs(false)
  }

  // Calculate summary stats for filtered transactions
  const getFilteredStats = () => {
    const txs = dateFilterActive ? filteredTransactions : transactions

    let totalReceived = 0
    let totalSent = 0
    let receiveCount = 0
    let sendCount = 0

    txs.forEach((tx) => {
      const amount = Math.abs(tx.settlementAmount || 0)
      if (tx.direction === "RECEIVE") {
        totalReceived += amount
        receiveCount++
      } else {
        totalSent += amount
        sendCount++
      }
    })

    return {
      totalReceived,
      totalSent,
      receiveCount,
      sendCount,
      netAmount: totalReceived - totalSent,
      transactionCount: txs.length,
    }
  }

  // Filter transactions by search query (memo, username, amount)
  const filterTransactionsBySearch = (txList, query) => {
    if (!query || !query.trim()) return txList
    const lowerQuery = query.toLowerCase().trim()
    return txList.filter((tx) => {
      // Search in memo
      if (tx.memo && tx.memo.toLowerCase().includes(lowerQuery)) return true
      // Search in amount string
      if (tx.amount && tx.amount.toLowerCase().includes(lowerQuery)) return true
      // Search in counterparty username (from settlementVia or initiationVia)
      const username =
        tx.settlementVia?.counterPartyUsername || tx.initiationVia?.counterPartyUsername
      if (username && username.toLowerCase().includes(lowerQuery)) return true
      return false
    })
  }

  // Get display transactions (applies search filter on top of date filter)
  const getDisplayTransactions = () => {
    const baseTxs = dateFilterActive ? filteredTransactions : transactions
    return filterTransactionsBySearch(baseTxs, txSearchQuery)
  }

  // Handle transaction search activation
  const handleTxSearchClick = () => {
    setIsSearchingTx(true)
    setTxSearchInput(txSearchQuery) // Pre-fill with current search if any
    setTimeout(() => {
      txSearchInputRef.current?.focus()
    }, 100)
  }

  // Handle transaction search submit (lock in the search)
  const handleTxSearchSubmit = () => {
    if (!txSearchInput.trim()) {
      // If empty, just close the input
      setIsSearchingTx(false)
      return
    }

    // Show loading animation
    setIsSearchLoading(true)
    setIsSearchingTx(false) // Close input immediately

    // Brief delay to show loading, then apply search
    setTimeout(() => {
      setTxSearchQuery(txSearchInput.trim())
      setIsSearchLoading(false)
    }, 400)
  }

  // Handle Enter key in search input
  const handleTxSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleTxSearchSubmit()
    } else if (e.key === "Escape") {
      setIsSearchingTx(false)
      setTxSearchInput("")
    }
  }

  // Handle transaction search close/clear
  const handleTxSearchClose = () => {
    setIsSearchingTx(false)
    setTxSearchInput("")
    setTxSearchQuery("")
  }

  // Handle view transition with loading animation
  const handleViewTransition = (newView) => {
    if (newView === currentView) return

    // Rotate to next spinner color
    setTransitionColorIndex((prev) => (prev + 1) % SPINNER_COLORS.length)

    // Show loading animation
    setIsViewTransitioning(true)

    // Brief delay to show the animation, then switch view
    setTimeout(() => {
      setCurrentView(newView)
      setIsViewTransitioning(false)

      // Reset cart navigation when entering cart view
      if (newView === "cart" && cartRef.current) {
        cartRef.current.resetNavigation?.()
      }
    }, 150)
  }

  const handleRefresh = () => {
    fetchData()
  }

  // Export all transactions to CSV using official Blink CSV export
  const exportFullTransactions = async () => {
    setExportingData(true)
    try {
      console.log("Starting full transaction export using Blink official CSV...")

      // Get all wallet IDs
      const walletIds = wallets.map((w) => w.id)

      if (walletIds.length === 0) {
        throw new Error("No wallets found. Please ensure you are logged in.")
      }

      console.log(`Exporting CSV for wallets: ${walletIds.join(", ")}`)

      // Build request headers
      const headers = {
        "Content-Type": "application/json",
      }
      // Always include API key to ensure correct account is used
      if (apiKey) {
        headers["X-API-KEY"] = apiKey
      }

      // Call the CSV export API
      const response = await fetch("/api/blink/csv-export", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ walletIds }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `API returned ${response.status}`)
      }

      const data = await response.json()

      if (!data.csv) {
        throw new Error("No CSV data received from API")
      }

      const csv = data.csv
      console.log(`CSV received, length: ${csv.length} characters`)

      // Generate filename with date and username
      const date = new Date()
      const dateStr =
        date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, "0") +
        String(date.getDate()).padStart(2, "0")
      const username = user?.username || "user"
      const filename = `${dateStr}-${username}-transactions-FULL-blink.csv`

      // Trigger download
      downloadCSV(csv, filename)

      setShowExportOptions(false)
    } catch (error) {
      console.error("Error exporting transactions:", error)
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      })
      alert(
        `Failed to export transactions: ${error.message || "Unknown error"}. Check console for details.`,
      )
    } finally {
      setExportingData(false)
    }
  }

  // Export basic transactions to CSV (simplified format)
  const exportBasicTransactions = async () => {
    setExportingData(true)
    try {
      console.log("Starting basic transaction export...")

      // Always include API key to ensure correct account is used
      const headers = {}
      if (apiKey) {
        headers["X-API-KEY"] = apiKey
      }

      // Fetch ALL transactions by paginating through all pages
      let allTransactions = []
      let hasMore = true
      let cursor = null
      let pageCount = 0

      while (hasMore) {
        pageCount++
        const currentEnv = getEnvironment()
        const url = cursor
          ? `/api/blink/transactions?first=100&after=${cursor}&environment=${currentEnv}`
          : `/api/blink/transactions?first=100&environment=${currentEnv}`

        console.log(
          `Fetching page ${pageCount}, cursor: ${cursor ? cursor.substring(0, 20) + "..." : "none"}`,
        )

        const response = await fetch(url, { headers, credentials: "include" })

        if (!response.ok) {
          const errorText = await response.text()
          console.error("API response error:", response.status, errorText)
          throw new Error(
            `API returned ${response.status}: ${errorText.substring(0, 200)}`,
          )
        }

        const data = await response.json()
        console.log(`Received ${data.transactions?.length || 0} transactions`)

        if (!data.transactions || !Array.isArray(data.transactions)) {
          console.error("Invalid data structure:", data)
          throw new Error("Invalid transaction data received from API")
        }

        allTransactions = [...allTransactions, ...data.transactions]
        hasMore = data.pageInfo?.hasNextPage || false
        cursor = data.pageInfo?.endCursor

        console.log(`Total so far: ${allTransactions.length}, hasMore: ${hasMore}`)
      }

      console.log(
        `Fetched ${allTransactions.length} total transactions across ${pageCount} pages`,
      )

      // Convert transactions to Basic CSV format
      console.log("Converting to Basic CSV...")
      const csv = convertTransactionsToBasicCSV(allTransactions)
      console.log(`CSV generated, length: ${csv.length} characters`)

      // Generate filename with date and username
      const date = new Date()
      const dateStr =
        date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, "0") +
        String(date.getDate()).padStart(2, "0")
      const username = user?.username || "user"
      const filename = `${dateStr}-${username}-transactions-BASIC-blink.csv`

      // Trigger download
      downloadCSV(csv, filename)

      setShowExportOptions(false)
    } catch (error) {
      console.error("Error exporting basic transactions:", error)
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      })
      alert(
        `Failed to export transactions: ${error.message || "Unknown error"}. Check console for details.`,
      )
    } finally {
      setExportingData(false)
    }
  }

  // Convert transactions to Basic CSV format (simplified)
  const convertTransactionsToBasicCSV = (txs) => {
    // CSV Header: timestamp, type, credit, debit, fee, currency, status, InMemo, username
    const header = "timestamp,type,credit,debit,fee,currency,status,InMemo,username"

    // CSV Rows
    const rows = txs.map((tx, index) => {
      try {
        // Timestamp - convert Unix timestamp to readable format
        const timestamp = tx.createdAt
          ? new Date(parseInt(tx.createdAt) * 1000).toString()
          : ""

        // Determine transaction type from settlementVia
        let type = ""
        if (tx.settlementVia?.__typename === "SettlementViaLn") {
          type = "ln_on_us"
        } else if (tx.settlementVia?.__typename === "SettlementViaOnChain") {
          type = "onchain"
        } else if (tx.settlementVia?.__typename === "SettlementViaIntraLedger") {
          type = "intraledger"
        }

        // Calculate credit/debit based on direction and amount
        const absoluteAmount = Math.abs(tx.settlementAmount || 0)
        const credit = tx.direction === "RECEIVE" ? absoluteAmount : 0
        const debit = tx.direction === "SEND" ? absoluteAmount : 0

        // Fee
        const fee = Math.abs(tx.settlementFee || 0)

        // Currency
        const currency = tx.settlementCurrency || "BTC"

        // Status
        const status = tx.status || ""

        // InMemo (memo field)
        const inMemo = tx.memo || ""

        // Username - extract from initiationVia or settlementVia
        let username = ""

        // For RECEIVE transactions: get sender info from initiationVia
        if (tx.direction === "RECEIVE") {
          if (tx.initiationVia?.__typename === "InitiationViaIntraLedger") {
            username = tx.initiationVia.counterPartyUsername || ""
          }
          // Also check settlementVia for intraledger receives
          if (!username && tx.settlementVia?.__typename === "SettlementViaIntraLedger") {
            username = tx.settlementVia.counterPartyUsername || ""
          }
        }

        // For SEND transactions: get recipient info from settlementVia
        if (tx.direction === "SEND") {
          if (tx.settlementVia?.__typename === "SettlementViaIntraLedger") {
            username = tx.settlementVia.counterPartyUsername || ""
          }
          // Fallback to initiationVia
          if (!username && tx.initiationVia?.__typename === "InitiationViaIntraLedger") {
            username = tx.initiationVia.counterPartyUsername || ""
          }
        }

        // Escape commas and quotes in fields
        const escape = (field) => {
          const str = String(field)
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return str
        }

        return [
          escape(timestamp),
          escape(type),
          escape(credit),
          escape(debit),
          escape(fee),
          escape(currency),
          escape(status),
          escape(inMemo),
          escape(username),
        ].join(",")
      } catch (error) {
        console.error(`Error processing transaction ${index}:`, error)
        console.error("Transaction data:", tx)
        throw new Error(`Failed to convert transaction ${index}: ${error.message}`)
      }
    })

    return [header, ...rows].join("\n")
  }

  // Download CSV file
  const downloadCSV = (csvContent, filename) => {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })

    // Check if native share is available (for mobile)
    if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      // Create a File object for sharing
      const file = new File([blob], filename, { type: "text/csv" })

      navigator
        .share({
          files: [file],
          title: "Blink Transactions Export",
          text: "Transaction history from Blink",
        })
        .catch((error) => {
          console.log("Share failed, falling back to download:", error)
          // Fallback to regular download
          triggerDownload(blob, filename)
        })
    } else {
      // Regular download for desktop or if share not available
      triggerDownload(blob, filename)
    }
  }

  // Trigger download via link
  const triggerDownload = (blob, filename) => {
    const link = document.createElement("a")
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", filename)
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
  }

  const groupTransactionsByMonth = (transactions) => {
    const grouped = {}

    transactions.forEach((tx) => {
      try {
        // Parse the date string more robustly
        let date
        if (tx.date.includes(",")) {
          // Format like "Jan 15, 2024, 10:30 AM"
          date = new Date(tx.date)
        } else {
          // Try parsing as is
          date = new Date(tx.date)
        }

        // Validate the date
        if (isNaN(date.getTime())) {
          console.warn("Invalid date format:", tx.date)
          return
        }

        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
        const monthLabel = date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
        })

        if (!grouped[monthKey]) {
          grouped[monthKey] = {
            label: monthLabel,
            transactions: [],
            year: date.getFullYear(),
            month: date.getMonth(),
          }
        }

        grouped[monthKey].transactions.push(tx)
      } catch (error) {
        console.error("Error processing transaction date:", tx.date, error)
      }
    })

    // Sort months by date (newest first)
    const sortedEntries = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a))

    return Object.fromEntries(sortedEntries)
  }

  // Get month groups from current transactions (excluding recent 5)
  const getMonthGroups = () => {
    const pastTransactions = transactions.slice(5) // Skip the 5 most recent
    return groupTransactionsByMonth(pastTransactions)
  }

  // Toggle month expansion and load more transactions if needed
  const toggleMonth = async (monthKey) => {
    const newExpanded = new Set(expandedMonths)

    if (newExpanded.has(monthKey)) {
      newExpanded.delete(monthKey)
    } else {
      newExpanded.add(monthKey)

      // If we don't have enough transactions for this month, load more
      const monthData = getMonthGroups()[monthKey]
      if (monthData && monthData.transactions.length < 20) {
        await loadMoreTransactionsForMonth(monthKey)
      }
    }

    setExpandedMonths(newExpanded)
  }

  // Load more transactions for a specific month
  const loadMoreTransactionsForMonth = async (monthKey) => {
    try {
      // If we already have enough transactions for most months, don't load more
      const monthGroups = getMonthGroups()
      const monthData = monthGroups[monthKey]

      if (monthData && monthData.transactions.length >= 10) {
        return // Already have enough transactions for this month
      }

      // Load more transactions if we don't have enough historical data
      if (hasMoreTransactions) {
        await loadMoreMonths()
      }
    } catch (error) {
      console.error("Error loading more transactions for month:", error)
    }
  }

  return {
    // View transition
    handleViewTransition,
    // Transaction loading
    loadMoreMonths,
    loadPastTransactions,
    // Date range filtering
    getDateRangePresets,
    loadTransactionsForDateRange,
    handleCustomDateRange,
    handleClearDateFilter,
    // Transaction display/stats
    getFilteredStats,
    getDisplayTransactions,
    filterTransactionsBySearch,
    // Transaction search
    handleTxSearchClick,
    handleTxSearchSubmit,
    handleTxSearchKeyDown,
    handleTxSearchClose,
    // CSV export
    convertTransactionsToBasicCSV,
    downloadCSV,
    exportBasicTransactions,
    exportFullTransactions,
    // Month grouping
    groupTransactionsByMonth,
    getMonthGroups,
    toggleMonth,
    loadMoreTransactionsForMonth,
    // Refresh
    handleRefresh,
  }
}

export default useTransactionActions
