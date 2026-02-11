import { useEffect, useRef, useCallback } from "react"
import { getEnvironment } from "../config/api"

/**
 * Hook for Dashboard data fetching: API key, transactions, wallets, voucher balance.
 *
 * Extracted from Dashboard.js — contains:
 * - fetchApiKey + fetch-on-user-change useEffect
 * - fetchData (NWC + Blink transaction fetcher, ~200 lines)
 * - fetchWallets + fetch-on-apiKey useEffect
 * - fetchVoucherWalletBalance + fetch-on-view/overlay useEffects
 * - getCapacityColor
 * - Display currency useEffect, refresh-on-view-switch, poll voucher amount,
 *   refresh-on-wallet-change, refresh-on-payment-received useEffects
 *
 * @param {Object} params - All required state, setters, and refs
 * @returns {Object} fetchData, fetchVoucherWalletBalance, getCapacityColor
 */
export function useDashboardData({
  // From useCombinedAuth
  user,
  getApiKey: getApiKeyFn,
  hasServerSession,
  activeBlinkAccount,
  blinkAccounts,
  activeNWC,
  nwcClientReady,
  nwcListTransactions,
  nwcHasCapability,
  activeNpubCashWallet,
  // From useViewNavigation
  currentView,
  // From useDisplaySettings
  setDisplayCurrency,
  // From useUIVisibility
  showVoucherWalletSettings,
  showBoltcards,
  // From useWalletState
  apiKey,
  setApiKey,
  setWallets,
  // From useTransactionState
  setTransactions,
  setLoading,
  setError,
  setHasMoreTransactions,
  setPastTransactionsLoaded,
  setFilteredTransactions,
  setDateFilterActive,
  // From useVoucherWalletState
  voucherWallet,
  setVoucherWalletBalance,
  setVoucherWalletUsdBalance,
  setVoucherWalletBalanceLoading,
  setVoucherWalletBtcId,
  setVoucherWalletUsdId,
  setCurrentAmountInSats,
  setCurrentAmountInUsdCents,
  setCurrentVoucherCurrencyMode,
  // From useBlinkWebSocket
  lastPayment,
  // Refs (created in Dashboard, passed in)
  posPaymentReceivedRef,
  voucherRef,
  multiVoucherRef,
}) {
  // --- fetchApiKey ---
  const fetchApiKey = async () => {
    try {
      // useCombinedAuth.getApiKey() handles both auth methods:
      // - Legacy: fetches from server (/api/auth/get-api-key)
      // - Nostr: decrypts from local profile storage
      const key = await getApiKeyFn()
      if (key) {
        setApiKey(key)
        return key // Return the key so callers can use it immediately
      }
      return null
    } catch (error) {
      console.error("Failed to get API key:", error)
      return null
    }
  }

  // Fetch API key when user changes or active Blink account switches
  useEffect(() => {
    if (user) {
      fetchApiKey()
    }
  }, [user, activeBlinkAccount])

  // Set display currency from user preference (removed immediate fetchData)
  useEffect(() => {
    if (user) {
      // ✅ REMOVED: fetchData() - transactions now load ONLY when user clicks "Transactions" tab

      // Set display currency from user preference
      if (user.preferredCurrency) {
        console.log(
          `Setting display currency to user preference: ${user.preferredCurrency}`,
        )
        setDisplayCurrency(user.preferredCurrency)
      }
    }
  }, [user])

  // Refresh transaction data when switching to transaction history view
  useEffect(() => {
    if (currentView === "transactions" && user) {
      console.log("Switching to transaction history - refreshing data...")
      fetchData()
    }
  }, [currentView])

  // Fetch voucher wallet balance when switching to voucher/multivoucher view
  useEffect(() => {
    if (
      voucherWallet?.apiKey &&
      (currentView === "voucher" || currentView === "multivoucher")
    ) {
      fetchVoucherWalletBalance()
    }
  }, [voucherWallet?.apiKey, currentView, fetchVoucherWalletBalance])

  // Poll for current amount from child components (for capacity indicator)
  useEffect(() => {
    if (currentView !== "voucher" && currentView !== "multivoucher") {
      setCurrentAmountInSats(0)
      setCurrentAmountInUsdCents(0)
      setCurrentVoucherCurrencyMode("BTC")
      return
    }

    const pollAmount = () => {
      const ref = currentView === "voucher" ? voucherRef.current : multiVoucherRef.current
      const amountSats = ref?.getAmountInSats?.() || 0
      const amountUsdCents = ref?.getAmountInUsdCents?.() || 0
      const currencyMode = ref?.getVoucherCurrencyMode?.() || "BTC"
      setCurrentAmountInSats(amountSats)
      setCurrentAmountInUsdCents(amountUsdCents)
      setCurrentVoucherCurrencyMode(currencyMode)
    }

    pollAmount() // Initial
    const interval = setInterval(pollAmount, 300) // Poll every 300ms

    return () => clearInterval(interval)
  }, [currentView])

  // Get capacity indicator color based on amount vs wallet balance
  const getCapacityColor = useCallback((amountInSats, balance) => {
    // Gray: Balance unknown/loading OR amount is 0
    if (balance === null || amountInSats === 0) {
      return "bg-gray-400 dark:bg-gray-500"
    }

    const percentage = (amountInSats / balance) * 100

    // Green: Amount ≤ 50% of balance
    if (percentage <= 50) {
      return "bg-green-500"
    }
    // Yellow: Amount > 50% and ≤ 90% of balance
    if (percentage <= 90) {
      return "bg-yellow-500"
    }
    // Red: Amount > 90% of balance OR exceeds
    return "bg-red-500"
  }, [])

  // Fetch balance when Send Wallet overlay opens
  useEffect(() => {
    if (showVoucherWalletSettings && voucherWallet?.apiKey) {
      fetchVoucherWalletBalance()
    }
  }, [showVoucherWalletSettings, voucherWallet?.apiKey, fetchVoucherWalletBalance])

  // Fetch balance when Boltcards overlay opens (needed for wallet IDs)
  useEffect(() => {
    if (showBoltcards && voucherWallet?.apiKey) {
      fetchVoucherWalletBalance()
    }
  }, [showBoltcards, voucherWallet?.apiKey, fetchVoucherWalletBalance])

  // Refresh transaction data when active wallet changes (NWC or Blink)
  // This ensures we show the correct wallet's transactions
  const prevActiveNWCRef = useRef(activeNWC?.id)
  const prevActiveBlinkRef = useRef(activeBlinkAccount?.id)

  useEffect(() => {
    const nwcChanged = activeNWC?.id !== prevActiveNWCRef.current
    const blinkChanged = activeBlinkAccount?.id !== prevActiveBlinkRef.current

    if (nwcChanged || blinkChanged) {
      console.log("[Dashboard] Active wallet changed:", {
        nwcFrom: prevActiveNWCRef.current?.substring(0, 8),
        nwcTo: activeNWC?.id?.substring(0, 8),
        blinkFrom: prevActiveBlinkRef.current?.substring(0, 8),
        blinkTo: activeBlinkAccount?.id?.substring(0, 8),
      })

      prevActiveNWCRef.current = activeNWC?.id
      prevActiveBlinkRef.current = activeBlinkAccount?.id

      // Clear existing transactions and reset all history state
      setTransactions([])
      setPastTransactionsLoaded(false)
      setHasMoreTransactions(false)
      setFilteredTransactions([])
      setDateFilterActive(false)

      // Refresh API key for the new account first, then fetch transactions
      if (blinkChanged && activeBlinkAccount) {
        fetchApiKey().then((newApiKey) => {
          // If we're viewing transactions, refresh the data for the new active wallet
          // Pass the new API key directly to avoid race condition with state update
          if (currentView === "transactions") {
            console.log(
              "[Dashboard] Refreshing transactions for new active Blink wallet, newApiKey:",
              newApiKey ? newApiKey.substring(0, 8) + "..." : "none",
            )
            fetchData(newApiKey)
          }
        })
      } else if (currentView === "transactions") {
        // For NWC changes, just fetch directly
        setTimeout(() => {
          console.log("[Dashboard] Refreshing transactions for new active wallet")
          fetchData()
        }, 100)
      }
    }
  }, [activeNWC?.id, activeBlinkAccount?.id, currentView])

  // Fetch wallets when API key becomes available
  useEffect(() => {
    if (apiKey) {
      fetchWallets()
    }
  }, [apiKey, fetchWallets])

  // Refresh data when payment received (direct Blink payments, NOT BlinkPOS forwarded payments)
  useEffect(() => {
    // Skip if this is a forwarded payment (already handled in BlinkPOS callback)
    // Forwarded payments have isForwarded: true set by triggerPaymentAnimation
    if (lastPayment && !lastPayment.isForwarded) {
      // Clear the POS invoice immediately when payment is received
      if (posPaymentReceivedRef.current) {
        posPaymentReceivedRef.current()
      }

      // Small delay to ensure transaction is processed
      setTimeout(() => {
        fetchData()
      }, 1000)
    }
  }, [lastPayment])

  // --- fetchData: main transaction fetcher ---
  const fetchData = async (overrideApiKey = null) => {
    // Use override API key if provided (for account switching), otherwise use state
    const effectiveApiKey = overrideApiKey || apiKey

    // Check if NWC wallet is ACTIVE (user chose to use NWC for this session)
    const isNwcActive = activeNWC && nwcClientReady
    const hasBlinkAccount = blinkAccounts && blinkAccounts.length > 0

    // If NWC wallet is ACTIVE, fetch NWC transactions (even if user also has Blink account)
    // This respects the user's choice of which wallet to use
    if (isNwcActive && nwcHasCapability("list_transactions")) {
      console.log(
        "Fetching NWC transaction history for ACTIVE NWC wallet:",
        activeNWC?.label,
      )
      setLoading(true)
      try {
        const result = await nwcListTransactions({ limit: 100 })
        console.log("NWC list_transactions raw result:", JSON.stringify(result, null, 2))
        if (result.success && result.transactions) {
          // Convert NWC transactions to our format
          // NIP-47 fields: type, amount (msats), description, payment_hash, created_at, settled_at
          // Load locally stored memos for NWC transactions
          // (needed because long memos are hashed in BOLT11 and NWC returns description_hash, not the text)
          let storedMemos = {}
          try {
            storedMemos = JSON.parse(localStorage.getItem("blinkpos_nwc_memos") || "{}")
          } catch (e) {
            console.warn("Failed to load stored NWC memos:", e)
          }

          const formattedTransactions = result.transactions.map((tx, index) => {
            console.log(`NWC Transaction ${index}:`, JSON.stringify(tx, null, 2))
            // Convert millisats to sats
            const satsAmount = Math.round((tx.amount || 0) / 1000)
            // Format date like Blink API does
            const txDate = tx.created_at
              ? new Date(tx.created_at * 1000).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : new Date().toLocaleDateString()

            // Try to find the memo:
            // 1. First check if we have it stored locally (for BlinkPOS-created invoices with long memos)
            // 2. Then try the NWC response fields
            // 3. Fall back to a descriptive default
            const localMemo = tx.payment_hash && storedMemos[tx.payment_hash]?.memo
            const memo =
              localMemo ||
              tx.description ||
              tx.memo ||
              tx.metadata?.description ||
              tx.metadata?.memo ||
              tx.invoice_description ||
              (tx.type === "incoming"
                ? `Received ${satsAmount} sats`
                : `Sent ${satsAmount} sats`)

            if (localMemo) {
              console.log(
                `✓ Found stored memo for ${tx.payment_hash?.substring(0, 16)}:`,
                localMemo.substring(0, 50) + "...",
              )
            }

            return {
              id: tx.payment_hash || tx.preimage || `nwc-${Date.now()}-${index}`,
              direction: tx.type === "incoming" ? "RECEIVE" : "SEND",
              status: tx.settled_at ? "SUCCESS" : "PENDING",
              // Format amount like Blink: "21 sats" or "-21 sats"
              amount:
                tx.type === "incoming" ? `${satsAmount} sats` : `-${satsAmount} sats`,
              settlementAmount: satsAmount,
              currency: "BTC",
              date: txDate,
              createdAt: tx.created_at
                ? new Date(tx.created_at * 1000).toISOString()
                : new Date().toISOString(),
              memo: memo,
              isNwc: true,
            }
          })
          console.log("Formatted NWC transactions:", formattedTransactions)
          setTransactions(formattedTransactions)
          setError("")
        } else {
          console.log("NWC transaction fetch failed:", result.error)
          setTransactions([])
        }
      } catch (err) {
        console.error("NWC transaction error:", err)
        setTransactions([])
      } finally {
        setLoading(false)
      }
      return // NWC transactions fetched, don't continue to Blink
    }

    // NWC is active but doesn't support list_transactions
    if (isNwcActive) {
      console.log("NWC wallet active but doesn't support list_transactions capability")
      setLoading(false)
      setTransactions([])
      return
    }

    // NWC is not active - check if we can fetch Blink transactions
    // Skip if active Blink wallet is a Lightning Address wallet (no transaction history available)
    if (activeBlinkAccount?.type === "ln-address") {
      console.log("Lightning Address wallet active - transaction history not available")
      setLoading(false)
      setTransactions([])
      return
    }

    // Skip if npub.cash wallet is active (no transaction history available via Blink API)
    if (activeNpubCashWallet) {
      console.log(
        "npub.cash wallet active - transaction history not available via Blink API",
      )
      setLoading(false)
      setTransactions([])
      return
    }

    // Skip if no Blink API credentials available
    if (!effectiveApiKey && !hasServerSession) {
      console.log("No wallet credentials available for transaction fetch")
      setLoading(false)
      setTransactions([])
      return
    }

    console.log(
      "Fetching Blink transaction history for active Blink wallet, apiKey:",
      effectiveApiKey ? effectiveApiKey.substring(0, 8) + "..." : "none",
    )

    try {
      setLoading(true)

      // ✅ ADDED: Fetch with 10 second timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      try {
        // Build request headers
        // Always include API key for Blink accounts to ensure correct account is used
        // (server session may have cached a different account's key)
        const headers = {}
        if (effectiveApiKey) {
          headers["X-API-KEY"] = effectiveApiKey
        }

        // Fetch transactions only (no balance for employee privacy)
        // Include environment for staging/production switching
        const currentEnv = getEnvironment()
        const transactionsRes = await fetch(
          `/api/blink/transactions?first=100&environment=${currentEnv}`,
          {
            signal: controller.signal,
            headers,
            credentials: "include", // Include cookies for session-based auth
          },
        )

        clearTimeout(timeoutId)

        if (transactionsRes.ok) {
          const transactionsData = await transactionsRes.json()

          setTransactions(transactionsData.transactions)
          setHasMoreTransactions(transactionsData.pageInfo?.hasNextPage || false)
          setError("")

          // Don't automatically load past transactions - user must click "Show" button
          // This saves bandwidth and respects user's data plan
        } else {
          const errorData = await transactionsRes.json().catch(() => ({}))
          throw new Error(errorData.error || "Failed to fetch transactions")
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId)
        if (fetchErr.name === "AbortError") {
          throw new Error("Transaction loading timed out. Please try again.")
        }
        throw fetchErr
      }
    } catch (err) {
      console.error("Fetch error:", err)
      setError(err.message || "Failed to load data")
    } finally {
      setLoading(false)
    }
  }

  // --- fetchWallets ---
  const fetchWallets = useCallback(async () => {
    if (!apiKey) {
      console.log("No API key available yet, skipping wallet fetch")
      return
    }

    try {
      const currentEnv = getEnvironment()
      const response = await fetch("/api/blink/wallets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey, environment: currentEnv }),
      })

      if (response.ok) {
        const walletsData = await response.json()
        const walletsList = walletsData.wallets || []
        setWallets(walletsList)

        // Debug log
        console.log("Fetched wallets:", walletsList)
      } else {
        console.error("Failed to fetch wallets:", response.status, response.statusText)
      }
    } catch (err) {
      console.error("Failed to fetch wallets:", err)
    }
  }, [apiKey])

  // --- fetchVoucherWalletBalance ---
  const fetchVoucherWalletBalance = useCallback(async () => {
    if (!voucherWallet?.apiKey) {
      setVoucherWalletBalance(null)
      setVoucherWalletUsdBalance(null)
      setVoucherWalletBtcId(null)
      setVoucherWalletUsdId(null)
      return
    }

    setVoucherWalletBalanceLoading(true)
    try {
      const currentEnv = getEnvironment()
      const response = await fetch("/api/blink/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: voucherWallet.apiKey, environment: currentEnv }),
      })

      const data = await response.json()
      if (data.success && data.wallets) {
        const btcWallet = data.wallets.find((w) => w.walletCurrency === "BTC")
        const usdWallet = data.wallets.find((w) => w.walletCurrency === "USD")
        setVoucherWalletBalance(btcWallet?.balance || 0)
        setVoucherWalletUsdBalance(usdWallet?.balance ?? null) // null if no USD wallet
        setVoucherWalletBtcId(btcWallet?.id || null)
        setVoucherWalletUsdId(usdWallet?.id || null)
        console.log(
          "[VoucherWallet] Balance fetched - BTC:",
          btcWallet?.balance || 0,
          "sats (id:",
          btcWallet?.id,
          "), USD:",
          usdWallet?.balance ?? "N/A",
          "cents (id:",
          usdWallet?.id,
          ")",
        )
      } else {
        console.error("[VoucherWallet] Failed to fetch balance:", data.error)
        setVoucherWalletBalance(null)
        setVoucherWalletUsdBalance(null)
        setVoucherWalletBtcId(null)
        setVoucherWalletUsdId(null)
      }
    } catch (error) {
      console.error("[VoucherWallet] Failed to fetch balance:", error)
      setVoucherWalletBalance(null)
      setVoucherWalletUsdBalance(null)
      setVoucherWalletBtcId(null)
      setVoucherWalletUsdId(null)
    } finally {
      setVoucherWalletBalanceLoading(false)
    }
  }, [voucherWallet?.apiKey])

  return {
    fetchData,
    fetchVoucherWalletBalance,
    getCapacityColor,
  }
}

export default useDashboardData
