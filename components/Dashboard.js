import { useEffect, useRef, useCallback } from "react"
import { useCombinedAuth } from "../lib/hooks/useCombinedAuth"
import { useBlinkWebSocket } from "../lib/hooks/useBlinkWebSocket"
import { useCurrencies } from "../lib/hooks/useCurrencies"
import { useTheme } from "../lib/hooks/useTheme"
import { useThemeStyles } from "../lib/hooks/useThemeStyles"
import { useViewNavigation, SPINNER_COLORS } from "../lib/hooks/useViewNavigation"
import { useDisplaySettings } from "../lib/hooks/useDisplaySettings"
import { useSoundSettings } from "../lib/hooks/useSoundSettings"
import { useCommissionSettings } from "../lib/hooks/useCommissionSettings"
import { usePaycodeState } from "../lib/hooks/usePaycodeState"
import { usePWAInstall } from "../lib/hooks/usePWAInstall"
import { useAccountManagement } from "../lib/hooks/useAccountManagement"
import { useVoucherWalletState } from "../lib/hooks/useVoucherWalletState"
import { useTransactionState } from "../lib/hooks/useTransactionState"
import { useSplitProfiles } from "../lib/hooks/useSplitProfiles"
import { useUIVisibility } from "../lib/hooks/useUIVisibility"
import { useTipSettings } from "../lib/hooks/useTipSettings"
import { useExchangeRate } from "../lib/hooks/useExchangeRate"
import { useWalletState } from "../lib/hooks/useWalletState"
import { useInvoiceState } from "../lib/hooks/useInvoiceState"
import { useNFC } from "./NFCPayment"
import { isBitcoinCurrency } from "../lib/currency-utils"
import { getApiUrl, getAllValidDomains, getEnvironment } from "../lib/config/api"
import PaymentAnimation from "./PaymentAnimation"
import POS from "./POS"
import Voucher from "./Voucher"
import MultiVoucher from "./MultiVoucher"
import VoucherManager from "./VoucherManager"
import Network from "./Network"
import ItemCart from "./ItemCart"
import BatchPayments from "./BatchPayments"
import KeyManagementSection from "./Settings/KeyManagementSection"
import { BoltcardSection } from "./boltcard"
import {
  isNpubCashAddress,
  validateNpubCashAddress,
  probeNpubCashAddress,
} from "../lib/lnurl"
import TransactionDetail, {
  getTransactionLabel,
  initTransactionLabels,
} from "./TransactionDetail"
import SoundThemesOverlay from "./Settings/SoundThemesOverlay"
import PercentSettingsOverlay from "./Settings/PercentSettingsOverlay"
import CommissionSettingsOverlay from "./Settings/CommissionSettingsOverlay"
import TipProfileSettingsOverlay from "./Settings/TipProfileSettingsOverlay"
import PaycodesOverlay from "./Settings/PaycodesOverlay"
import CurrencySettingsOverlay from "./Settings/CurrencySettingsOverlay"
import RegionalSettingsOverlay from "./Settings/RegionalSettingsOverlay"
import SplitSettingsOverlay from "./Settings/SplitSettingsOverlay"
import CreateEditSplitProfileOverlay from "./Settings/CreateEditSplitProfileOverlay"
import ExportOptionsOverlay from "./Settings/ExportOptionsOverlay"
import DateRangeSelectorOverlay from "./Settings/DateRangeSelectorOverlay"
import WalletsOverlay from "./Settings/WalletsOverlay"
import VoucherWalletOverlay from "./Settings/VoucherWalletOverlay"
import MobileHeader from "./MobileHeader"
import SideMenuOverlay from "./SideMenuOverlay"
import OwnerAgentDisplay from "./OwnerAgentDisplay"

// Voucher Wallet storage key (user-scoped for security)
const VOUCHER_WALLET_OLD_KEY = "blinkpos-voucher-wallet" // Old global key (for cleanup)
const VOUCHER_WALLET_PREFIX = "blinkpos-voucher-wallet"

/**
 * Get user-scoped storage key for voucher wallet
 * @param {string} userPubkey - User's public key
 * @returns {string|null} Storage key or null if no user
 */
const getVoucherWalletKey = (userPubkey) =>
  userPubkey ? `${VOUCHER_WALLET_PREFIX}_${userPubkey}` : null

/**
 * Clean up old global voucher wallet storage key
 * This prevents cross-user data leakage from old versions
 */
const cleanupOldGlobalVoucherWalletStorage = () => {
  try {
    if (localStorage.getItem(VOUCHER_WALLET_OLD_KEY)) {
      console.log("[Dashboard] Removing old global voucher wallet storage (security fix)")
      localStorage.removeItem(VOUCHER_WALLET_OLD_KEY)
    }
  } catch (err) {
    console.error("[Dashboard] Failed to cleanup old voucher wallet storage:", err)
  }
}

// Predefined Tip Profiles for different regions
const TIP_PROFILES = [
  { id: "na", name: "North America (US/CA)", tipOptions: [18, 20, 25] },
  { id: "eu", name: "Western Europe (Standard)", tipOptions: [5, 10, 15] },
  { id: "africa", name: "Africa (Standard/South)", tipOptions: [10, 12, 15] },
  { id: "africa-low", name: "Africa (Low/Round Up)", tipOptions: [5, 10] },
  { id: "asia", name: "Asia & Oceania (Low)", tipOptions: [2, 5, 10] },
  { id: "latam", name: "Latin America (Included)", tipOptions: [10, 12, 15] },
  { id: "mena", name: "Middle East (Variable)", tipOptions: [5, 10, 15] },
]

export default function Dashboard() {
  const {
    user,
    logout,
    authMode,
    getApiKey,
    hasServerSession,
    publicKey,
    activeBlinkAccount,
    blinkAccounts,
    addBlinkAccount,
    addBlinkLnAddressWallet,
    removeBlinkAccount,
    updateBlinkAccount,
    setActiveBlinkAccount,
    storeBlinkAccountOnServer,
    tippingSettings: profileTippingSettings,
    updateTippingSettings: updateProfileTippingSettings,
    nostrProfile,
    // NWC data from useCombinedAuth (user-scoped)
    nwcConnections,
    activeNWC,
    addNWCConnection,
    removeNWCConnection,
    updateNWCConnection,
    setActiveNWC,
    nwcMakeInvoice,
    nwcLookupInvoice,
    nwcListTransactions,
    nwcHasCapability,
    nwcClientReady,
    getActiveNWCUri, // For server-side NWC forwarding via webhook
    // npub.cash wallet data
    activeNpubCashWallet,
    npubCashWallets,
    addNpubCashWallet,
  } = useCombinedAuth()
  const {
    currencies,
    loading: currenciesLoading,
    getAllCurrencies,
    popularCurrencyIds,
    addToPopular,
    removeFromPopular,
    isPopularCurrency,
  } = useCurrencies()
  const { cycleTheme } = useTheme()

  // Theme styling utilities - extracted to useThemeStyles hook
  const {
    theme,
    darkMode,
    isBlinkClassic,
    isBlinkClassicDark,
    isBlinkClassicLight,
    getMenuTileClasses,
    getSubmenuBgClasses,
    getSubmenuHeaderClasses,
    getSelectionTileClasses,
    getSelectionTileActiveClasses,
    getInputClasses,
    getWalletCardClasses,
    getWalletCardActiveClasses,
    getWalletIconClasses,
    getWalletUseButtonClasses,
    getWalletActiveBadgeClasses,
    getWalletDeleteButtonClasses,
    getSubmenuOptionClasses,
    getSubmenuOptionActiveClasses,
    getPreviewBoxClasses,
    getSectionLabelClasses,
    getPrimaryTextClasses,
    getSecondaryTextClasses,
    getCheckmarkClasses,
  } = useThemeStyles()

  // View navigation state - extracted to useViewNavigation hook
  const {
    currentView,
    setCurrentView,
    isViewTransitioning,
    setIsViewTransitioning,
    transitionColorIndex,
    setTransitionColorIndex,
    cartCheckoutData,
    setCartCheckoutData,
    sideMenuOpen,
    setSideMenuOpen,
    toggleSideMenu,
    navigateToView,
    currentSpinnerColor,
    isVoucherRelatedView,
  } = useViewNavigation()

  // Display and regional settings - extracted to useDisplaySettings hook
  const {
    displayCurrency,
    setDisplayCurrency,
    numberFormat,
    setNumberFormat,
    bitcoinFormat,
    setBitcoinFormat,
    numpadLayout,
    setNumpadLayout,
    currencyFilter,
    setCurrencyFilter,
    currencyFilterDebounced,
    clearCurrencyFilter,
  } = useDisplaySettings()

  // UI visibility states - extracted to useUIVisibility hook
  const {
    showAccountSettings,
    setShowAccountSettings,
    showVoucherWalletSettings,
    setShowVoucherWalletSettings,
    showCurrencySettings,
    setShowCurrencySettings,
    showRegionalSettings,
    setShowRegionalSettings,
    showTipSettings,
    setShowTipSettings,
    showTipProfileSettings,
    setShowTipProfileSettings,
    showPercentSettings,
    setShowPercentSettings,
    showKeyManagement,
    setShowKeyManagement,
    showBoltcards,
    setShowBoltcards,
    showBatchPayments,
    setShowBatchPayments,
    showNetworkOverlay,
    setShowNetworkOverlay,
    showAddAccountForm,
    setShowAddAccountForm,
    showDateRangeSelector,
    setShowDateRangeSelector,
    showExportOptions,
    setShowExportOptions,
    showTimeInputs,
    setShowTimeInputs,
    showingInvoice,
    setShowingInvoice,
    showingVoucherQR,
    setShowingVoucherQR,
    closeAllOverlays,
    closeAllSettings,
  } = useUIVisibility()

  // Wallet state (API key and wallet list) managed by useWalletState hook
  const { apiKey, setApiKey, wallets, setWallets } = useWalletState()

  // Transaction state - extracted to useTransactionState hook
  const {
    transactions,
    setTransactions,
    loading,
    setLoading,
    error,
    setError,
    expandedMonths,
    setExpandedMonths,
    toggleExpandedMonth,
    monthlyTransactions,
    setMonthlyTransactions,
    hasMoreTransactions,
    setHasMoreTransactions,
    loadingMore,
    setLoadingMore,
    pastTransactionsLoaded,
    setPastTransactionsLoaded,
    exportingData,
    setExportingData,
    selectedDateRange,
    setSelectedDateRange,
    customDateStart,
    setCustomDateStart,
    customDateEnd,
    setCustomDateEnd,
    customTimeStart,
    setCustomTimeStart,
    customTimeEnd,
    setCustomTimeEnd,
    filteredTransactions,
    setFilteredTransactions,
    dateFilterActive,
    setDateFilterActive,
    selectedTransaction,
    setSelectedTransaction,
    labelUpdateTrigger,
    triggerLabelUpdate,
    isSearchingTx,
    setIsSearchingTx,
    txSearchInput,
    setTxSearchInput,
    txSearchQuery,
    setTxSearchQuery,
    isSearchLoading,
    setIsSearchLoading,
    clearTransactions,
    clearDateFilter,
    clearSearch,
  } = useTransactionState()

  // PWA install state - extracted to usePWAInstall hook
  const {
    deferredPrompt,
    setDeferredPrompt,
    showInstallPrompt,
    setShowInstallPrompt,
    triggerInstall,
  } = usePWAInstall()

  // Sound settings - extracted to useSoundSettings hook
  const {
    soundEnabled,
    setSoundEnabled,
    soundTheme,
    setSoundTheme,
    showSoundThemes,
    setShowSoundThemes,
    toggleSoundEnabled,
  } = useSoundSettings()

  // Tip functionality state - extracted to useTipSettings hook
  const {
    tipsEnabled,
    setTipsEnabled,
    tipPresets,
    setTipPresets,
    tipRecipient,
    setTipRecipient,
    usernameValidation,
    setUsernameValidation,
    activeTipProfile,
    setActiveTipProfile,
    clearUsernameValidation,
    resetTipRecipient,
    toggleTipsEnabled,
  } = useTipSettings()

  // Account management state - extracted to useAccountManagement hook
  const {
    newAccountApiKey,
    setNewAccountApiKey,
    newAccountLabel,
    setNewAccountLabel,
    newAccountNwcUri,
    setNewAccountNwcUri,
    newAccountType,
    setNewAccountType,
    newAccountLnAddress,
    setNewAccountLnAddress,
    newNpubCashAddress,
    setNewNpubCashAddress,
    addAccountLoading,
    setAddAccountLoading,
    addAccountError,
    setAddAccountError,
    nwcValidating,
    setNwcValidating,
    nwcValidated,
    setNwcValidated,
    lnAddressValidating,
    setLnAddressValidating,
    lnAddressValidated,
    setLnAddressValidated,
    npubCashValidating,
    setNpubCashValidating,
    npubCashValidated,
    setNpubCashValidated,
    confirmDeleteWallet,
    setConfirmDeleteWallet,
    editingWalletLabel,
    setEditingWalletLabel,
    editedWalletLabel,
    setEditedWalletLabel,
    resetNewAccountForm,
  } = useAccountManagement()

  // Voucher Wallet state - extracted to useVoucherWalletState hook
  // NOTE: Initial state is null - we load ONLY after authentication to ensure user-scoped storage
  const {
    voucherWallet,
    setVoucherWallet,
    voucherWalletApiKey,
    setVoucherWalletApiKey,
    voucherWalletLabel,
    setVoucherWalletLabel,
    voucherWalletLoading,
    setVoucherWalletLoading,
    voucherWalletError,
    setVoucherWalletError,
    voucherWalletValidating,
    setVoucherWalletValidating,
    voucherWalletScopes,
    setVoucherWalletScopes,
    voucherWalletBalance,
    setVoucherWalletBalance,
    voucherWalletUsdBalance,
    setVoucherWalletUsdBalance,
    voucherWalletBalanceLoading,
    setVoucherWalletBalanceLoading,
    voucherWalletBtcId,
    setVoucherWalletBtcId,
    voucherWalletUsdId,
    setVoucherWalletUsdId,
    voucherCurrencyMode,
    setVoucherCurrencyMode,
    voucherExpiry,
    setVoucherExpiry,
    usdExchangeRate,
    setUsdExchangeRate,
    currentAmountInSats,
    setCurrentAmountInSats,
    currentAmountInUsdCents,
    setCurrentAmountInUsdCents,
    currentVoucherCurrencyMode,
    setCurrentVoucherCurrencyMode,
  } = useVoucherWalletState()

  // Commission settings - extracted to useCommissionSettings hook
  const {
    commissionEnabled,
    setCommissionEnabled,
    commissionPresets,
    setCommissionPresets,
    showCommissionSettings,
    setShowCommissionSettings,
    toggleCommissionEnabled,
  } = useCommissionSettings()

  // Paycode state - extracted to usePaycodeState hook
  const {
    showPaycode,
    setShowPaycode,
    paycodeAmount,
    setPaycodeAmount,
    paycodeGeneratingPdf,
    setPaycodeGeneratingPdf,
  } = usePaycodeState()

  // NOTE: activeTipProfile is now managed by useTipSettings hook above

  // Split Profiles state - extracted to useSplitProfiles hook
  const {
    splitProfiles,
    setSplitProfiles,
    activeSplitProfile,
    setActiveSplitProfile,
    splitProfilesLoading,
    setSplitProfilesLoading,
    showCreateSplitProfile,
    setShowCreateSplitProfile,
    editingSplitProfile,
    setEditingSplitProfile,
    newSplitProfileLabel,
    setNewSplitProfileLabel,
    newSplitProfileRecipients,
    setNewSplitProfileRecipients,
    newRecipientInput,
    setNewRecipientInput,
    splitProfileError,
    setSplitProfileError,
    recipientValidation,
    setRecipientValidation,
    useCustomWeights,
    setUseCustomWeights,
    resetSplitProfileForm,
  } = useSplitProfiles()

  // Exchange rate state for sats equivalent display in ItemCart (managed by useExchangeRate hook)
  const { exchangeRate, setExchangeRate, loadingRate, setLoadingRate } = useExchangeRate()

  // Transaction search ref (state is in useTransactionState hook)
  const txSearchInputRef = useRef(null)

  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const touchStartY = useRef(0)
  const touchEndY = useRef(0)

  // Refs for keyboard navigation
  const posRef = useRef(null)
  const voucherRef = useRef(null)
  const multiVoucherRef = useRef(null)
  const voucherManagerRef = useRef(null)
  const cartRef = useRef(null)

  // NOTE: Sound settings persistence is now handled by useSoundSettings hook

  // Reset currency filter when closing the currency settings overlay
  useEffect(() => {
    if (!showCurrencySettings) {
      clearCurrencyFilter()
    }
  }, [showCurrencySettings, clearCurrencyFilter])

  // NOTE: Tip settings persistence (tipsEnabled, tipPresets) is now handled by useTipSettings hook

  // NOTE: Commission settings persistence is now handled by useCommissionSettings hook
  // NOTE: Number format, Bitcoin format, and Numpad layout persistence
  // are now handled by useDisplaySettings hook

  // NOTE: voucherCurrencyMode and voucherExpiry persistence is now handled by useVoucherWalletState hook

  // Fetch exchange rate when currency changes (for sats equivalent display in ItemCart)
  useEffect(() => {
    const fetchExchangeRate = async () => {
      if (isBitcoinCurrency(displayCurrency)) {
        setExchangeRate({ satPriceInCurrency: 1, currency: "BTC" })
        return
      }

      setLoadingRate(true)
      try {
        const response = await fetch("/api/rates/exchange-rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: apiKey,
            currency: displayCurrency,
            // Use BlinkPOS credentials if no API key available
            useBlinkpos: !apiKey,
          }),
        })

        const data = await response.json()

        if (data.success) {
          setExchangeRate({
            satPriceInCurrency: data.satPriceInCurrency,
            currency: data.currency,
          })
          console.log(`Exchange rate for ${displayCurrency}:`, data.satPriceInCurrency)
        } else {
          console.error("Failed to fetch exchange rate:", data.error)
        }
      } catch (error) {
        console.error("Exchange rate error:", error)
      } finally {
        setLoadingRate(false)
      }
    }

    fetchExchangeRate()
  }, [displayCurrency, apiKey])

  // Fetch USD exchange rate for voucher creation (needed for USD/Stablesats vouchers)
  useEffect(() => {
    const fetchUsdExchangeRate = async () => {
      // Only fetch if voucher wallet is connected
      if (!voucherWallet?.apiKey) {
        setUsdExchangeRate(null)
        return
      }

      try {
        const response = await fetch("/api/rates/exchange-rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: voucherWallet.apiKey,
            currency: "USD",
            // Use BlinkPOS credentials if no API key available
            useBlinkpos: !voucherWallet.apiKey,
          }),
        })

        const data = await response.json()

        if (data.success) {
          setUsdExchangeRate({
            satPriceInCurrency: data.satPriceInCurrency,
            currency: "USD",
          })
          console.log("[VoucherWallet] USD exchange rate:", data.satPriceInCurrency)
        } else {
          console.error("[VoucherWallet] Failed to fetch USD exchange rate:", data.error)
          setUsdExchangeRate(null)
        }
      } catch (error) {
        console.error("[VoucherWallet] USD exchange rate error:", error)
        setUsdExchangeRate(null)
      }
    }

    fetchUsdExchangeRate()

    // Refresh USD rate every 5 minutes while voucher wallet is connected
    const intervalId = voucherWallet?.apiKey
      ? setInterval(fetchUsdExchangeRate, 5 * 60 * 1000)
      : null

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [voucherWallet?.apiKey])

  // NOTE: activeTipProfile localStorage persistence is now handled by useTipSettings hook
  // But we still need to sync tipPresets when profile changes
  useEffect(() => {
    if (activeTipProfile) {
      // Update tipPresets to match the profile's tip options
      setTipPresets(activeTipProfile.tipOptions)
    }
  }, [activeTipProfile])

  // Clear tip recipient when user changes (no persistence across sessions)
  useEffect(() => {
    resetTipRecipient()
    // Also clear any existing localStorage value
    if (typeof window !== "undefined") {
      localStorage.removeItem("blinkpos-tip-recipient")
    }
  }, [user?.username])

  // Server sync for preferences (cross-device sync)
  // Fetch preferences from server on login and sync when changed
  const serverSyncTimerRef = useRef(null)
  const lastSyncedPrefsRef = useRef(null)

  // Sync preferences to server (debounced)
  const syncPreferencesToServer = useCallback(
    async (prefs) => {
      if (!publicKey) return

      // Clear existing timer
      if (serverSyncTimerRef.current) {
        clearTimeout(serverSyncTimerRef.current)
      }

      // Debounce the sync (2 seconds)
      serverSyncTimerRef.current = setTimeout(async () => {
        try {
          console.log("[Dashboard] Syncing preferences to server...")

          const response = await fetch("/api/user/sync", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include", // Include session cookie for auth
            body: JSON.stringify({
              pubkey: publicKey,
              field: "preferences",
              data: prefs,
            }),
          })

          if (response.ok) {
            console.log("[Dashboard] ✓ Preferences synced to server")
            lastSyncedPrefsRef.current = JSON.stringify(prefs)
          }
        } catch (err) {
          console.error("[Dashboard] Server sync error:", err)
        }
      }, 2000)
    },
    [publicKey],
  )

  // Fetch preferences from server on login
  useEffect(() => {
    if (!publicKey) return

    const fetchServerPreferences = async () => {
      try {
        console.log("[Dashboard] Fetching preferences from server...")
        const response = await fetch(`/api/user/sync?pubkey=${publicKey}`, {
          credentials: "include", // Include session cookie for auth
        })

        if (!response.ok) return

        const data = await response.json()
        const serverPrefs = data.preferences

        if (serverPrefs) {
          console.log("[Dashboard] Loaded preferences from server")

          // Apply server preferences to local state
          if (serverPrefs.soundEnabled !== undefined) {
            setSoundEnabled(serverPrefs.soundEnabled)
            localStorage.setItem("soundEnabled", JSON.stringify(serverPrefs.soundEnabled))
          }
          if (serverPrefs.soundTheme) {
            setSoundTheme(serverPrefs.soundTheme)
            localStorage.setItem("soundTheme", serverPrefs.soundTheme)
          }
          if (serverPrefs.tipsEnabled !== undefined) {
            setTipsEnabled(serverPrefs.tipsEnabled)
            localStorage.setItem(
              "blinkpos-tips-enabled",
              serverPrefs.tipsEnabled.toString(),
            )
          }
          if (serverPrefs.tipPresets) {
            setTipPresets(serverPrefs.tipPresets)
            localStorage.setItem(
              "blinkpos-tip-presets",
              JSON.stringify(serverPrefs.tipPresets),
            )
          }
          if (serverPrefs.displayCurrency) {
            setDisplayCurrency(serverPrefs.displayCurrency)
          }
          if (serverPrefs.numberFormat) {
            setNumberFormat(serverPrefs.numberFormat)
            localStorage.setItem("blinkpos-number-format", serverPrefs.numberFormat)
          }
          if (serverPrefs.numpadLayout) {
            setNumpadLayout(serverPrefs.numpadLayout)
            localStorage.setItem("blinkpos-numpad-layout", serverPrefs.numpadLayout)
          }
          if (serverPrefs.voucherCurrencyMode) {
            setVoucherCurrencyMode(serverPrefs.voucherCurrencyMode)
            localStorage.setItem(
              "blinkpos-voucher-currency-mode",
              serverPrefs.voucherCurrencyMode,
            )
          }
          // Handle voucherExpiry with migration from old default '7d' to new default '24h'
          if (serverPrefs.voucherExpiry) {
            // Migration: if server has '7d' or legacy values, migrate to '24h'
            const migratedExpiry =
              serverPrefs.voucherExpiry === "7d" ||
              serverPrefs.voucherExpiry === "15m" ||
              serverPrefs.voucherExpiry === "1h"
                ? "24h"
                : serverPrefs.voucherExpiry
            setVoucherExpiry(migratedExpiry)
            localStorage.setItem("blinkpos-voucher-expiry", migratedExpiry)
          }

          lastSyncedPrefsRef.current = JSON.stringify(serverPrefs)
        } else {
          // No server preferences - sync current local to server
          const currentPrefs = {
            soundEnabled,
            soundTheme,
            tipsEnabled,
            tipPresets,
            displayCurrency,
            numberFormat,
            numpadLayout,
            voucherCurrencyMode,
            voucherExpiry,
          }
          syncPreferencesToServer(currentPrefs)
        }

        // Initialize transaction labels from server
        await initTransactionLabels()
        console.log("[Dashboard] Transaction labels synced from server")

        // Clean up old global voucher wallet key (security fix for cross-profile leakage)
        cleanupOldGlobalVoucherWalletStorage()

        // Sync voucher wallet from server (using user-scoped localStorage key)
        const voucherWalletStorageKey = getVoucherWalletKey(publicKey)
        console.log(
          "[Dashboard] voucherWallet from server:",
          data.voucherWallet
            ? {
                label: data.voucherWallet.label,
                hasApiKey: !!data.voucherWallet.apiKey,
                apiKeyLength: data.voucherWallet.apiKey?.length || 0,
                apiKeyType: typeof data.voucherWallet.apiKey,
              }
            : "null/undefined",
        )

        if (data.voucherWallet && data.voucherWallet.apiKey) {
          console.log(
            "[Dashboard] Loaded voucher wallet from server:",
            data.voucherWallet.label,
          )
          setVoucherWallet(data.voucherWallet)
          if (voucherWalletStorageKey) {
            localStorage.setItem(
              voucherWalletStorageKey,
              JSON.stringify(data.voucherWallet),
            )
          }
        } else if (!data.voucherWallet) {
          // Check if we have local voucher wallet (user-scoped) to sync to server
          if (voucherWalletStorageKey) {
            const localVoucherWallet = localStorage.getItem(voucherWalletStorageKey)
            if (localVoucherWallet) {
              const parsed = JSON.parse(localVoucherWallet)
              console.log("[Dashboard] Syncing local voucher wallet to server")
              syncVoucherWalletToServer(parsed)
              setVoucherWallet(parsed)
            }
          }
        }
      } catch (err) {
        console.error("[Dashboard] Failed to fetch server preferences:", err)
      }
    }

    fetchServerPreferences()
  }, [publicKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync voucher wallet to server
  const syncVoucherWalletToServer = useCallback(
    async (walletData) => {
      if (!publicKey) return

      try {
        console.log("[Dashboard] Syncing voucher wallet to server...")
        const response = await fetch("/api/user/sync", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include", // Include session cookie for auth
          body: JSON.stringify({
            pubkey: publicKey,
            field: "voucherWallet",
            data: walletData,
          }),
        })

        if (response.ok) {
          console.log("[Dashboard] ✓ Voucher wallet synced to server")
        }
      } catch (err) {
        console.error("[Dashboard] Failed to sync voucher wallet:", err)
      }
    },
    [publicKey],
  )

  // Track previous user to detect user changes
  const prevUserRef = useRef(publicKey)

  // Clear voucher wallet state when user changes (logout/switch user)
  // This prevents cross-user data leakage
  useEffect(() => {
    const prevUser = prevUserRef.current

    // User has changed (including logout where publicKey becomes null/undefined)
    if (prevUser !== publicKey) {
      console.log("[Dashboard] User changed, clearing voucher wallet state")
      setVoucherWallet(null)
      setVoucherWalletBalance(null)
      setVoucherWalletUsdBalance(null)
      prevUserRef.current = publicKey
    }
  }, [publicKey])

  // Migration: Fetch missing username for voucher wallet (for wallets created before username was added)
  useEffect(() => {
    const migrateVoucherWalletUsername = async () => {
      if (!voucherWallet || !voucherWallet.apiKey || voucherWallet.username) {
        return // No wallet, no API key, or already has username
      }

      console.log("[Dashboard] Migrating voucher wallet: fetching username...")

      try {
        const response = await fetch(getApiUrl(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": voucherWallet.apiKey,
          },
          body: JSON.stringify({
            query: "{ me { username } }",
          }),
        })

        if (!response.ok) {
          console.warn(
            "[Dashboard] Failed to fetch username for voucher wallet migration",
          )
          return
        }

        const data = await response.json()
        const username = data.data?.me?.username

        if (username) {
          console.log("[Dashboard] ✓ Voucher wallet username fetched:", username)

          // Update wallet data with username
          const updatedWallet = { ...voucherWallet, username }
          setVoucherWallet(updatedWallet)

          // Save to localStorage (user-scoped)
          if (typeof window !== "undefined" && publicKey) {
            const storageKey = getVoucherWalletKey(publicKey)
            if (storageKey) {
              localStorage.setItem(storageKey, JSON.stringify(updatedWallet))
            }
          }

          // Sync to server
          syncVoucherWalletToServer(updatedWallet)
        }
      } catch (err) {
        console.error("[Dashboard] Failed to migrate voucher wallet username:", err)
      }
    }

    migrateVoucherWalletUsername()
  }, [voucherWallet?.apiKey]) // Only run when voucherWallet.apiKey changes (initial load)

  // Sync preferences to server when they change
  useEffect(() => {
    if (!publicKey) return

    const currentPrefs = {
      soundEnabled,
      soundTheme,
      tipsEnabled,
      tipPresets,
      displayCurrency,
      numberFormat,
      numpadLayout,
      voucherCurrencyMode,
      voucherExpiry,
    }

    const currentPrefsStr = JSON.stringify(currentPrefs)

    // Only sync if preferences actually changed (avoid initial sync loop)
    if (lastSyncedPrefsRef.current && lastSyncedPrefsRef.current !== currentPrefsStr) {
      syncPreferencesToServer(currentPrefs)
    }
  }, [
    publicKey,
    soundEnabled,
    soundTheme,
    tipsEnabled,
    tipPresets,
    displayCurrency,
    numberFormat,
    numpadLayout,
    voucherCurrencyMode,
    voucherExpiry,
    syncPreferencesToServer,
  ])

  // Cleanup server sync timer on unmount
  useEffect(() => {
    return () => {
      if (serverSyncTimerRef.current) {
        clearTimeout(serverSyncTimerRef.current)
      }
    }
  }, [])

  // Validate Blink username function
  const validateBlinkUsername = async (username) => {
    if (!username || username.trim() === "") {
      setUsernameValidation({ status: null, message: "", isValidating: false })
      return
    }

    // Clean username input - strip @domain.sv if user enters full Lightning Address
    let cleanedUsername = username.trim()
    // Remove any Blink domain suffix (production or staging)
    const allDomains = getAllValidDomains()
    for (const domain of allDomains) {
      if (cleanedUsername.toLowerCase().includes(`@${domain}`)) {
        cleanedUsername = cleanedUsername
          .replace(new RegExp(`@${domain}`, "i"), "")
          .trim()
        break
      }
    }
    if (cleanedUsername.includes("@")) {
      cleanedUsername = cleanedUsername.split("@")[0].trim()
    }

    setUsernameValidation({ status: null, message: "", isValidating: true })

    const query = `
      query Query($username: Username!) {
        usernameAvailable(username: $username)
      }
    `

    const variables = {
      username: cleanedUsername,
    }

    try {
      const response = await fetch(getApiUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query,
          variables: variables,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      if (data.errors) {
        const errorMessage = data.errors[0].message
        if (errorMessage.includes("Invalid value for Username")) {
          setUsernameValidation({
            status: "error",
            message: "Invalid username format",
            isValidating: false,
          })
          return
        }
        throw new Error(errorMessage)
      }

      // usernameAvailable: true means username does NOT exist
      // usernameAvailable: false means username DOES exist
      const usernameExists = !data.data.usernameAvailable

      if (usernameExists) {
        setUsernameValidation({
          status: "success",
          message: "Blink username found",
          isValidating: false,
        })
      } else {
        setUsernameValidation({
          status: "error",
          message: "This Blink username does not exist yet",
          isValidating: false,
        })
      }
    } catch (error) {
      console.error("Error checking username:", error)
      setUsernameValidation({
        status: "error",
        message: "Error checking username. Please try again.",
        isValidating: false,
      })
    }
  }

  // Debounced username validation
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      validateBlinkUsername(tipRecipient)
    }, 500) // 500ms delay

    return () => clearTimeout(timeoutId)
  }, [tipRecipient])

  // Auto-enable tipsEnabled when a valid recipient is set
  useEffect(() => {
    if (tipRecipient && usernameValidation.status === "success") {
      setTipsEnabled(true)
    }
  }, [tipRecipient, usernameValidation.status])

  // Get user's API key for direct WebSocket connection
  // Works with both legacy (API key) and Nostr (profile-based) auth
  // Re-fetches when user changes OR when active Blink account changes (after account switch in Settings)
  useEffect(() => {
    if (user) {
      fetchApiKey()
    }
  }, [user, activeBlinkAccount])

  const fetchApiKey = async () => {
    try {
      // useCombinedAuth.getApiKey() handles both auth methods:
      // - Legacy: fetches from server (/api/auth/get-api-key)
      // - Nostr: decrypts from local profile storage
      const key = await getApiKey()
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

  // Use direct Blink WebSocket connection for user account (balance updates)
  // NOTE: Only needed for non-POS payments. Currently disabled for POS-only mode.
  // To enable: pass apiKey and user?.username instead of null
  const {
    connected,
    lastPayment,
    showAnimation,
    hideAnimation,
    triggerPaymentAnimation,
    manualReconnect,
    reconnectAttempts,
  } = useBlinkWebSocket(null, null)

  // Track current invoice for NFC payments and payment hash for polling
  // Stores { paymentRequest, paymentHash, satoshis, memo } object
  const { currentInvoice, setCurrentInvoice, clearInvoice, hasInvoice } =
    useInvoiceState()

  // Payment status polling for webhook-only payment detection (SECURITY FIX)
  // Replaced client-side WebSocket with server-side webhook + client polling
  // This prevents exposing the BlinkPOS API key to the client
  const pollingIntervalRef = useRef(null)
  const pollingStartTimeRef = useRef(null)
  const POLLING_INTERVAL_MS = 1000 // Poll every 1 second
  const POLLING_TIMEOUT_MS = 15 * 60 * 1000 // Stop polling after 15 minutes

  // Poll for payment status when we have a pending invoice
  useEffect(() => {
    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }

    // Start polling if we have a payment hash to watch
    if (currentInvoice?.paymentHash) {
      console.log(
        "🔄 Starting payment status polling for:",
        currentInvoice.paymentHash.substring(0, 16) + "...",
      )
      pollingStartTimeRef.current = Date.now()

      const pollPaymentStatus = async () => {
        // Check if we've exceeded the timeout
        if (Date.now() - pollingStartTimeRef.current > POLLING_TIMEOUT_MS) {
          console.log("⏱️ Payment polling timeout reached (15 min) - stopping")
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          return
        }

        try {
          const response = await fetch(
            `/api/payment-status/${currentInvoice.paymentHash}`,
          )
          const data = await response.json()

          if (data.status === "completed") {
            console.log("✅ Payment completed detected via polling!")

            // Stop polling
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }

            // Trigger payment animation
            triggerPaymentAnimation({
              amount: currentInvoice.satoshis || currentInvoice.amount,
              currency: "BTC",
              memo: currentInvoice.memo || `Payment received`,
              isForwarded: true,
            })

            // Clear POS invoice
            if (posPaymentReceivedRef.current) {
              posPaymentReceivedRef.current()
            }

            // Refresh transaction data
            fetchData()
          } else if (data.status === "expired") {
            console.log("⏰ Payment expired")
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }
          }
          // For 'pending', 'processing', 'not_found' - keep polling
        } catch (error) {
          console.error("Payment status poll error:", error)
          // Continue polling despite errors
        }
      }

      // Poll immediately, then on interval
      pollPaymentStatus()
      pollingIntervalRef.current = setInterval(pollPaymentStatus, POLLING_INTERVAL_MS)
    }

    // Cleanup on unmount or when invoice changes
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [currentInvoice?.paymentHash])

  // Setup NFC for Boltcard payments
  const nfcState = useNFC({
    paymentRequest: currentInvoice?.paymentRequest,
    onPaymentSuccess: () => {
      console.log("🎉 NFC Boltcard payment successful")
      // Payment will be detected via webhook + polling
    },
    onPaymentError: (error) => {
      console.error("NFC payment error:", error)
    },
    soundEnabled,
    soundTheme,
  })

  // NOTE: transactions, loading, error state now provided by useTransactionState hook

  // Ref for POS payment received callback
  const posPaymentReceivedRef = useRef(null)

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

  // PWA Install prompt
  useEffect(() => {
    const handler = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      // Stash the event so it can be triggered later
      setDeferredPrompt(e)
      setShowInstallPrompt(true)
    }

    window.addEventListener("beforeinstallprompt", handler)

    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

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

  // Fetch wallet information for POS
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

  // Fetch voucher wallet balance (BTC and USD) and wallet IDs
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

  // Fetch split profiles from server
  const fetchSplitProfiles = useCallback(async () => {
    if (!publicKey) {
      console.log("[SplitProfiles] No public key available")
      return
    }

    setSplitProfilesLoading(true)
    try {
      console.log("[SplitProfiles] Fetching profiles for:", publicKey)
      // Use session-based authentication (no pubkey query param needed)
      const response = await fetch("/api/split-profiles", {
        credentials: "include", // Include session cookie
      })

      if (response.ok) {
        const data = await response.json()
        setSplitProfiles(data.splitProfiles || [])

        // Set active profile
        if (data.activeSplitProfileId && data.splitProfiles) {
          const active = data.splitProfiles.find(
            (p) => p.id === data.activeSplitProfileId,
          )
          setActiveSplitProfile(active || null)

          // If we have an active profile, enable tips and set the recipient
          if (active && active.recipients?.length > 0) {
            setTipsEnabled(true)
            setTipRecipient(active.recipients[0].username)
          }
        } else {
          setActiveSplitProfile(null)
        }

        console.log("[SplitProfiles] Loaded", data.splitProfiles?.length || 0, "profiles")
      } else if (response.status === 401) {
        // No session - this is expected for external signers without challenge auth
        console.log(
          "[SplitProfiles] No session available, split profiles require authentication",
        )
        setSplitProfiles([])
      } else {
        console.error("[SplitProfiles] Failed to fetch:", response.status)
      }
    } catch (err) {
      console.error("[SplitProfiles] Error:", err)
    } finally {
      setSplitProfilesLoading(false)
    }
  }, [publicKey])

  // Save split profile to server
  const saveSplitProfile = async (profile, setActive = false) => {
    if (!publicKey) return null

    setSplitProfileError(null)
    try {
      const response = await fetch("/api/split-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include session cookie
        body: JSON.stringify({
          profile,
          setActive,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        await fetchSplitProfiles() // Refresh the list
        return data.profile
      } else if (response.status === 401) {
        setSplitProfileError("Please sign in again to save split profiles")
        return null
      } else {
        const error = await response.json()
        setSplitProfileError(error.error || "Failed to save profile")
        return null
      }
    } catch (err) {
      console.error("[SplitProfiles] Save error:", err)
      setSplitProfileError("Failed to save profile")
      return null
    }
  }

  // Delete split profile
  const deleteSplitProfile = async (profileId) => {
    if (!publicKey) return false

    try {
      const response = await fetch("/api/split-profiles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include session cookie
        body: JSON.stringify({
          profileId,
        }),
      })

      if (response.ok) {
        await fetchSplitProfiles() // Refresh the list
        return true
      }
      return false
    } catch (err) {
      console.error("[SplitProfiles] Delete error:", err)
      return false
    }
  }

  // Set active split profile
  const setActiveSplitProfileById = async (profileId) => {
    if (!publicKey) return

    if (!profileId) {
      // Deactivate - set to None
      setActiveSplitProfile(null)
      setTipsEnabled(false)
      setTipRecipient("")

      // Save null active profile to server (if we have profiles)
      if (splitProfiles.length > 0) {
        await fetch("/api/split-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include", // Include session cookie
          body: JSON.stringify({
            profile: splitProfiles[0], // Need at least one profile to update activeSplitProfileId
            setActive: false,
          }),
        })
      }
      return
    }

    const profile = splitProfiles.find((p) => p.id === profileId)
    if (profile) {
      // Update server with new active profile
      await saveSplitProfile(profile, true)

      // Local state update will happen via fetchSplitProfiles in saveSplitProfile
    }
  }

  // Validate recipient username (Blink username or npub.cash address)
  const validateRecipientUsername = useCallback(async (username) => {
    if (!username || username.trim() === "") {
      setRecipientValidation({ status: null, message: "", isValidating: false })
      return
    }

    const input = username.trim()

    // Check if this is an npub.cash address
    if (isNpubCashAddress(input)) {
      setRecipientValidation({ status: null, message: "", isValidating: true })

      try {
        // Validate the npub.cash address format
        const validation = validateNpubCashAddress(input)
        if (!validation.valid) {
          setRecipientValidation({
            status: "error",
            message: validation.error,
            isValidating: false,
          })
          return
        }

        // Probe the endpoint to confirm it responds
        const probeResult = await probeNpubCashAddress(input)

        if (probeResult.valid) {
          setRecipientValidation({
            status: "success",
            message: `Valid npub.cash address (${probeResult.minSats}-${probeResult.maxSats?.toLocaleString()} sats)`,
            isValidating: false,
            type: "npub_cash",
            address: input,
          })
        } else {
          setRecipientValidation({
            status: "error",
            message: probeResult.error || "Could not reach npub.cash endpoint",
            isValidating: false,
          })
        }
      } catch (err) {
        console.error("npub.cash validation error:", err)
        setRecipientValidation({
          status: "error",
          message: err.message || "Failed to validate npub.cash address",
          isValidating: false,
        })
      }
      return
    }

    // Otherwise, validate as Blink username
    // Clean username input - strip @domain if user enters full Lightning Address
    let cleanedUsername = input
    // Remove any Blink domain suffix (production or staging)
    const allDomainsForRecipient = getAllValidDomains()
    for (const domain of allDomainsForRecipient) {
      if (cleanedUsername.toLowerCase().includes(`@${domain}`)) {
        cleanedUsername = cleanedUsername
          .replace(new RegExp(`@${domain}`, "i"), "")
          .trim()
        break
      }
    }
    if (cleanedUsername.includes("@")) {
      cleanedUsername = cleanedUsername.split("@")[0].trim()
    }

    setRecipientValidation({ status: null, message: "", isValidating: true })

    const query = `
      query Query($username: Username!) {
        usernameAvailable(username: $username)
      }
    `

    const variables = {
      username: cleanedUsername,
    }

    try {
      const response = await fetch(getApiUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      if (data.errors) {
        const errorMessage = data.errors[0].message
        if (errorMessage.includes("Invalid value for Username")) {
          setRecipientValidation({
            status: "error",
            message: "Invalid username format",
            isValidating: false,
          })
          return
        }
        throw new Error(errorMessage)
      }

      // usernameAvailable: true means username does NOT exist
      // usernameAvailable: false means username DOES exist
      const usernameExists = !data.data.usernameAvailable

      if (usernameExists) {
        setRecipientValidation({
          status: "success",
          message: "Blink user found",
          isValidating: false,
          type: "blink",
        })
      } else {
        setRecipientValidation({
          status: "error",
          message:
            "Blink username not found. For npub.cash, enter full address (e.g., npub1xxx@npub.cash)",
          isValidating: false,
        })
      }
    } catch (err) {
      console.error("Recipient validation error:", err)
      setRecipientValidation({
        status: "error",
        message: "Validation failed",
        isValidating: false,
      })
    }
  }, [])

  // Debounced recipient username validation for current input
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      validateRecipientUsername(newRecipientInput)
    }, 500) // 500ms delay

    return () => clearTimeout(timeoutId)
  }, [newRecipientInput, validateRecipientUsername])

  // Add a validated recipient to the list
  const addRecipientToProfile = useCallback(() => {
    if (recipientValidation.status !== "success" || !newRecipientInput.trim()) return

    // Use the address from validation for npub.cash, or cleaned username for Blink
    const recipientType = recipientValidation.type || "blink"
    let recipientAddress =
      recipientType === "npub_cash"
        ? recipientValidation.address
        : newRecipientInput.trim().toLowerCase()

    // Remove any Blink domain suffix for Blink users
    if (recipientType !== "npub_cash") {
      const domainsToRemove = getAllValidDomains()
      for (const domain of domainsToRemove) {
        recipientAddress = recipientAddress.replace(new RegExp(`@${domain}`, "i"), "")
      }
    }

    // Check if already added
    if (newSplitProfileRecipients.some((r) => r.username === recipientAddress)) {
      setSplitProfileError("This recipient is already added")
      return
    }

    setNewSplitProfileRecipients((prev) => {
      const newRecipients = [
        ...prev,
        {
          username: recipientAddress,
          validated: true,
          type: recipientType, // 'blink' or 'npub_cash'
          weight: 100 / (prev.length + 1), // Default even weight
        },
      ]
      // Redistribute weights evenly when not using custom weights
      if (!useCustomWeights) {
        const evenWeight = 100 / newRecipients.length
        return newRecipients.map((r) => ({ ...r, weight: evenWeight }))
      }
      return newRecipients
    })
    setNewRecipientInput("")
    setRecipientValidation({ status: null, message: "", isValidating: false })
    setSplitProfileError(null)
  }, [
    recipientValidation.status,
    recipientValidation.type,
    recipientValidation.address,
    newRecipientInput,
    newSplitProfileRecipients,
    useCustomWeights,
  ])

  // Remove a recipient from the list
  const removeRecipientFromProfile = useCallback(
    (username) => {
      setNewSplitProfileRecipients((prev) => {
        const filtered = prev.filter((r) => r.username !== username)
        // Redistribute weights evenly when not using custom weights
        if (!useCustomWeights && filtered.length > 0) {
          const evenWeight = 100 / filtered.length
          return filtered.map((r) => ({ ...r, weight: evenWeight }))
        }
        return filtered
      })
    },
    [useCustomWeights],
  )

  // Fetch split profiles when user is authenticated
  useEffect(() => {
    if (publicKey && authMode === "nostr") {
      fetchSplitProfiles()
    }
  }, [publicKey, authMode, fetchSplitProfiles])

  // Load more historical transactions to populate older months
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

  const handleLogout = () => {
    logout()
  }

  // PWA install handler - delegates to usePWAInstall hook
  const handleInstallApp = async () => {
    await triggerInstall()
  }

  // Handle touch events for swipe navigation
  const handleTouchStart = (e) => {
    touchStartX.current = e.targetTouches[0].clientX
    touchStartY.current = e.targetTouches[0].clientY
  }

  const handleTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX
    touchEndY.current = e.targetTouches[0].clientY
  }

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return

    const distanceX = touchStartX.current - touchEndX.current
    const distanceY = touchStartY.current - touchEndY.current
    const isLeftSwipe = distanceX > 50 && Math.abs(distanceY) < 50
    const isRightSwipe = distanceX < -50 && Math.abs(distanceY) < 50
    const isUpSwipe = distanceY > 50 && Math.abs(distanceX) < 50
    const isDownSwipe = distanceY < -50 && Math.abs(distanceX) < 50

    // Only allow swipe navigation when:
    // - On Cart screen (not showing any overlay)
    // - On POS numpad screen (not showing invoice/tips)
    // - On Voucher numpad screen (not showing voucher QR)
    // - On MultiVoucher screen
    // - On transactions screen
    // Navigation order (horizontal): Cart ← → POS ← → Transactions
    // Navigation order (vertical): POS ↕ Voucher ↔ MultiVoucher
    // Navigation order (voucher row): MultiVoucher ← → Voucher

    // Horizontal swipes (left/right) - for cart, pos, transactions, and voucher row
    // Direction convention: Swipe LEFT moves to the RIGHT item (finger drags content left, next item appears from right)
    // Top row (left to right): Cart - POS - Transactions
    // Bottom row (left to right): MultiVoucher - Voucher - VoucherManager
    // IMPORTANT: Disable swipes when showing invoice (POS checkout) or voucher QR (voucher checkout)
    if (isLeftSwipe && !showingInvoice && !showingVoucherQR && !isViewTransitioning) {
      if (currentView === "cart") {
        handleViewTransition("pos")
      } else if (currentView === "pos") {
        handleViewTransition("transactions")
      } else if (currentView === "multivoucher" && voucherWallet) {
        // Left swipe from multivoucher goes to voucher (same as cart→pos)
        handleViewTransition("voucher")
      } else if (currentView === "voucher" && voucherWallet) {
        // Left swipe from voucher goes to vouchermanager (same as pos→transactions)
        handleViewTransition("vouchermanager")
      }
    } else if (isRightSwipe && !showingVoucherQR && !isViewTransitioning) {
      if (currentView === "transactions") {
        handleViewTransition("pos")
      } else if (currentView === "pos" && !showingInvoice) {
        handleViewTransition("cart")
      } else if (currentView === "vouchermanager" && voucherWallet) {
        // Right swipe from vouchermanager goes to voucher (same as transactions→pos)
        handleViewTransition("voucher")
      } else if (currentView === "voucher" && voucherWallet) {
        // Right swipe from voucher goes to multivoucher (same as pos→cart)
        handleViewTransition("multivoucher")
      }
    }
    // Vertical swipes (up) - between POS and Single Voucher only
    // From POS: swipe up → Voucher
    // From Voucher (Single): swipe up → POS (return to POS)
    // NOTE: MultiVoucher and VoucherManager have scrollable content,
    // so swipe UP is disabled to avoid conflicts with scrolling.
    // Users can navigate horizontally to Single Voucher, then swipe up to POS.
    // IMPORTANT: Disable swipes when showing voucher QR (voucher checkout)
    else if (
      isUpSwipe &&
      !showingInvoice &&
      !showingVoucherQR &&
      !isViewTransitioning &&
      voucherWallet
    ) {
      if (currentView === "pos") {
        handleViewTransition("voucher")
      } else if (currentView === "voucher") {
        // Only Single Voucher can swipe up to POS
        handleViewTransition("pos")
      }
    }

    // Reset touch positions
    touchStartX.current = 0
    touchEndX.current = 0
    touchStartY.current = 0
    touchEndY.current = 0
  }

  // Keyboard navigation for desktop users
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if side menu is open
      if (sideMenuOpen) return

      // Skip if focused on input/textarea elements
      const activeElement = document.activeElement
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.isContentEditable)
      ) {
        return
      }

      // Check if tip dialog is open - delegate keyboard to POS
      if (currentView === "pos" && posRef.current?.isTipDialogOpen?.()) {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape"].includes(
            e.key,
          )
        ) {
          e.preventDefault()
          posRef.current.handleTipDialogKey(e.key)
          return
        }
      }

      // Check if commission dialog is open - delegate keyboard to Voucher
      if (currentView === "voucher" && voucherRef.current?.isCommissionDialogOpen?.()) {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape"].includes(
            e.key,
          )
        ) {
          e.preventDefault()
          voucherRef.current.handleCommissionDialogKey(e.key)
          return
        }
      }

      // Check if commission dialog is open on MultiVoucher - delegate keyboard
      if (
        currentView === "multivoucher" &&
        multiVoucherRef.current?.isCommissionDialogOpen?.()
      ) {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape"].includes(
            e.key,
          )
        ) {
          e.preventDefault()
          multiVoucherRef.current.handleCommissionDialogKey(e.key)
          return
        }
      }

      // Check if cart is active and can handle keyboard navigation
      if (currentView === "cart" && cartRef.current?.isCartNavActive?.()) {
        if (
          [
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Enter",
            "Escape",
            "Backspace",
            " ",
          ].includes(e.key)
        ) {
          const handled = cartRef.current.handleCartKey(e.key)
          if (handled) {
            e.preventDefault()
            return
          }
          // If not handled (e.g., ArrowUp from Search), fall through to global navigation
        }
      }

      // If cart view but exited to global nav, DOWN arrow re-enters local cart navigation
      if (
        currentView === "cart" &&
        e.key === "ArrowDown" &&
        cartRef.current?.enterLocalNav
      ) {
        if (!cartRef.current.isCartNavActive?.()) {
          e.preventDefault()
          cartRef.current.enterLocalNav()
          return
        }
      }

      // Escape key for checkout screens and success animations
      if (e.key === "Escape") {
        // Payment success animation - Done
        if (showAnimation) {
          e.preventDefault()
          hideAnimation()
          return
        }

        // Voucher success (redeemed) - Done
        if (currentView === "voucher" && voucherRef.current?.isRedeemed?.()) {
          e.preventDefault()
          voucherRef.current.handleClear()
          return
        }

        // POS checkout screen - Cancel
        if (currentView === "pos" && showingInvoice) {
          e.preventDefault()
          posRef.current?.handleClear?.()
          return
        }

        // Voucher checkout screen - Cancel (only if not redeemed)
        if (
          currentView === "voucher" &&
          showingVoucherQR &&
          !voucherRef.current?.isRedeemed?.()
        ) {
          e.preventDefault()
          voucherRef.current?.handleClear?.()
          return
        }
      }

      // Arrow key navigation between views (only when not in checkout or modal states)
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        e.preventDefault() // Prevent page scroll

        // Block navigation during checkout states
        if (showingInvoice || showingVoucherQR || isViewTransitioning) return

        if (e.key === "ArrowLeft") {
          // Navigate left: Transactions → POS → Cart, VoucherManager → Voucher → MultiVoucher
          if (currentView === "transactions") {
            handleViewTransition("pos")
          } else if (currentView === "pos") {
            handleViewTransition("cart")
          } else if (currentView === "vouchermanager" && voucherWallet) {
            handleViewTransition("voucher")
          } else if (currentView === "voucher" && voucherWallet) {
            handleViewTransition("multivoucher")
          }
        } else if (e.key === "ArrowRight") {
          // Navigate right: Cart → POS → Transactions, MultiVoucher → Voucher → VoucherManager
          if (currentView === "cart") {
            handleViewTransition("pos")
          } else if (currentView === "pos") {
            handleViewTransition("transactions")
          } else if (currentView === "multivoucher" && voucherWallet) {
            handleViewTransition("voucher")
          } else if (currentView === "voucher" && voucherWallet) {
            handleViewTransition("vouchermanager")
          }
        } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && voucherWallet) {
          // Navigate up/down: POS ↔ Voucher row
          if (currentView === "pos") {
            handleViewTransition("voucher")
          } else if (
            currentView === "voucher" ||
            currentView === "multivoucher" ||
            currentView === "vouchermanager"
          ) {
            handleViewTransition("pos")
          }
        }
        return
      }

      // Numpad input (only on POS and Voucher views, only when showing numpad)
      if (currentView === "pos" && !showingInvoice && posRef.current) {
        // Digit keys (top row and numpad)
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault()
          posRef.current.handleDigitPress(e.key)
          return
        }
        // Decimal point
        if (e.key === "." || e.key === ",") {
          e.preventDefault()
          posRef.current.handleDigitPress(".")
          return
        }
        // Backspace
        if (e.key === "Backspace") {
          e.preventDefault()
          posRef.current.handleBackspace()
          return
        }
        // Escape = Clear
        if (e.key === "Escape") {
          e.preventDefault()
          posRef.current.handleClear()
          return
        }
        // Enter = Submit (OK) - only if there's a valid amount
        if (e.key === "Enter") {
          e.preventDefault()
          if (posRef.current.hasValidAmount?.()) {
            posRef.current.handleSubmit()
          }
          return
        }
        // Plus key = add to stack
        if (e.key === "+") {
          e.preventDefault()
          posRef.current.handlePlusPress()
          return
        }
      } else if (currentView === "voucher" && !showingVoucherQR && voucherRef.current) {
        // Digit keys (top row and numpad)
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault()
          voucherRef.current.handleDigitPress(e.key)
          return
        }
        // Decimal point
        if (e.key === "." || e.key === ",") {
          e.preventDefault()
          voucherRef.current.handleDigitPress(".")
          return
        }
        // Backspace
        if (e.key === "Backspace") {
          e.preventDefault()
          voucherRef.current.handleBackspace()
          return
        }
        // Escape = Clear
        if (e.key === "Escape") {
          e.preventDefault()
          voucherRef.current.handleClear()
          return
        }
        // Enter = Submit (Create Voucher) - only if there's a valid amount
        if (e.key === "Enter") {
          e.preventDefault()
          if (voucherRef.current.hasValidAmount?.()) {
            voucherRef.current.handleSubmit()
          }
          return
        }
      } else if (currentView === "multivoucher" && multiVoucherRef.current) {
        // MultiVoucher keyboard handling - only on amount step
        const step = multiVoucherRef.current.getCurrentStep?.()
        if (step === "amount") {
          // Digit keys
          if (/^[0-9]$/.test(e.key)) {
            e.preventDefault()
            multiVoucherRef.current.handleDigitPress(e.key)
            return
          }
          // Decimal point
          if (e.key === "." || e.key === ",") {
            e.preventDefault()
            multiVoucherRef.current.handleDigitPress(".")
            return
          }
          // Backspace
          if (e.key === "Backspace") {
            e.preventDefault()
            multiVoucherRef.current.handleBackspace()
            return
          }
          // Escape = Clear
          if (e.key === "Escape") {
            e.preventDefault()
            multiVoucherRef.current.handleClear()
            return
          }
          // Enter = Submit (proceed to config)
          if (e.key === "Enter") {
            e.preventDefault()
            if (multiVoucherRef.current.hasValidAmount?.()) {
              multiVoucherRef.current.handleSubmit()
            }
            return
          }
        } else if (step === "config" || step === "preview") {
          // On config/preview, Escape goes back, Enter proceeds
          if (e.key === "Escape") {
            e.preventDefault()
            multiVoucherRef.current.handleClear()
            return
          }
          if (e.key === "Enter") {
            e.preventDefault()
            multiVoucherRef.current.handleSubmit()
            return
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    currentView,
    sideMenuOpen,
    showingInvoice,
    showingVoucherQR,
    isViewTransitioning,
    voucherWallet,
  ])

  // Group transactions by month
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

  if (loading && transactions.length === 0 && !isViewTransitioning) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blink-accent border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading transactions...</p>
        </div>
      </div>
    )
  }

  // Determine if current view should prevent scrolling (POS-style fixed views)
  const isFixedView =
    currentView === "pos" ||
    currentView === "cart" ||
    currentView === "voucher" ||
    currentView === "multivoucher" ||
    currentView === "vouchermanager"

  return (
    <div
      className={`bg-white dark:bg-black ${isFixedView ? "h-screen overflow-hidden fixed inset-0" : "min-h-screen"}`}
    >
      {/* Payment Animation Overlay */}
      <PaymentAnimation
        show={showAnimation}
        payment={lastPayment}
        onHide={hideAnimation}
        soundEnabled={soundEnabled}
        soundTheme={soundTheme}
      />

      {/* Mobile Header - Hidden when showing invoice or voucher QR */}
      {!showingInvoice && !showingVoucherQR && (
        <MobileHeader
          theme={theme}
          cycleTheme={cycleTheme}
          currentView={currentView}
          handleViewTransition={handleViewTransition}
          isViewTransitioning={isViewTransitioning}
          voucherWallet={voucherWallet}
          sideMenuOpen={sideMenuOpen}
          setSideMenuOpen={setSideMenuOpen}
        />
      )}

      {/* Full Screen Menu */}
      {sideMenuOpen && (
        <SideMenuOverlay
          authMode={authMode}
          nostrProfile={nostrProfile}
          user={user}
          activeNWC={activeNWC}
          activeNpubCashWallet={activeNpubCashWallet}
          activeBlinkAccount={activeBlinkAccount}
          voucherWallet={voucherWallet}
          theme={theme}
          displayCurrency={displayCurrency}
          numberFormat={numberFormat}
          activeSplitProfile={activeSplitProfile}
          activeTipProfile={activeTipProfile}
          soundEnabled={soundEnabled}
          soundTheme={soundTheme}
          showInstallPrompt={showInstallPrompt}
          setSideMenuOpen={setSideMenuOpen}
          setShowKeyManagement={setShowKeyManagement}
          setShowAccountSettings={setShowAccountSettings}
          setShowVoucherWalletSettings={setShowVoucherWalletSettings}
          cycleTheme={cycleTheme}
          setShowCurrencySettings={setShowCurrencySettings}
          setShowRegionalSettings={setShowRegionalSettings}
          setShowTipSettings={setShowTipSettings}
          setShowPercentSettings={setShowPercentSettings}
          setShowTipProfileSettings={setShowTipProfileSettings}
          setShowSoundThemes={setShowSoundThemes}
          setShowPaycode={setShowPaycode}
          setShowBatchPayments={setShowBatchPayments}
          setShowBoltcards={setShowBoltcards}
          setShowNetworkOverlay={setShowNetworkOverlay}
          handleInstallApp={handleInstallApp}
          handleLogout={handleLogout}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          getMenuTileClasses={getMenuTileClasses}
        />
      )}

      {/* Key Management Overlay */}
      {showKeyManagement && (
        <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-y-auto`}>
          <div className="min-h-screen">
            {/* Header */}
            <div className={`${getSubmenuHeaderClasses()} sticky top-0 z-10`}>
              <div className="max-w-md mx-auto px-4 py-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setShowKeyManagement(false)}
                    className="flex items-center text-gray-600 dark:text-gray-400 text-base"
                  >
                    <svg
                      className="w-6 h-6 mr-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    Back
                  </button>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    Key Management
                  </h2>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <KeyManagementSection />
            </div>
          </div>
        </div>
      )}

      {/* Boltcards Overlay */}
      {showBoltcards && (
        <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-y-auto`}>
          <div className="min-h-screen">
            {/* Header */}
            <div className={`${getSubmenuHeaderClasses()} sticky top-0 z-10`}>
              <div className="max-w-md mx-auto px-4 py-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setShowBoltcards(false)}
                    className="flex items-center text-gray-600 dark:text-gray-400 text-base"
                  >
                    <svg
                      className="w-6 h-6 mr-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    Back
                  </button>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    Boltcards
                  </h2>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <BoltcardSection
                voucherWallet={voucherWallet}
                voucherWalletBtcId={voucherWalletBtcId}
                voucherWalletUsdId={voucherWalletUsdId}
                voucherWalletBtcBalance={voucherWalletBalance}
                voucherWalletUsdBalance={voucherWalletUsdBalance}
                exchangeRate={exchangeRate}
                bitcoinFormat={bitcoinFormat}
              />
            </div>
          </div>
        </div>
      )}

      {/* Batch Payments Overlay (uses Voucher wallet API key with WRITE permission) */}
      {/* Batch Payments Overlay */}
      {showBatchPayments && voucherWallet?.apiKey && (
        <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-y-auto`}>
          <div
            className="min-h-screen"
            style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
          >
            {/* Header */}
            <div className={`${getSubmenuHeaderClasses()} sticky top-0 z-10`}>
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => {
                      setShowBatchPayments(false)
                      setSideMenuOpen(true)
                    }}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Batch Payments
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <BatchPayments
                apiKey={voucherWallet.apiKey}
                walletId={voucherWallet.walletId}
                darkMode={darkMode}
                onClose={() => {
                  setShowBatchPayments(false)
                  setSideMenuOpen(true)
                }}
                hideHeader={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Circular Economy Network Overlay */}
      {showNetworkOverlay && (
        <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-hidden`}>
          <div
            className="h-full flex flex-col"
            style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
          >
            {/* Header */}
            <div className={`flex-shrink-0 ${getSubmenuHeaderClasses()}`}>
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => {
                      setShowNetworkOverlay(false)
                      setSideMenuOpen(true)
                    }}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Circular Economy Network
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-hidden">
              <Network
                publicKey={publicKey}
                nostrProfile={nostrProfile}
                darkMode={darkMode}
                theme={theme}
                cycleTheme={cycleTheme}
                hideHeader={true}
                onInternalTransition={() => {
                  setTransitionColorIndex((prev) => (prev + 1) % SPINNER_COLORS.length)
                  setIsViewTransitioning(true)
                  setTimeout(() => setIsViewTransitioning(false), 120)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Paycodes Overlay */}
      {showPaycode && activeBlinkAccount?.username && (
        <PaycodesOverlay
          activeBlinkAccount={activeBlinkAccount}
          paycodeAmount={paycodeAmount}
          paycodeGeneratingPdf={paycodeGeneratingPdf}
          darkMode={darkMode}
          setShowPaycode={setShowPaycode}
          setPaycodeAmount={setPaycodeAmount}
          setPaycodeGeneratingPdf={setPaycodeGeneratingPdf}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
        />
      )}

      {/* Themes Overlay */}
      {showSoundThemes && (
        <SoundThemesOverlay
          soundEnabled={soundEnabled}
          soundTheme={soundTheme}
          setSoundEnabled={setSoundEnabled}
          setSoundTheme={setSoundTheme}
          setShowSoundThemes={setShowSoundThemes}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          getSelectionTileClasses={getSelectionTileClasses}
          getSelectionTileActiveClasses={getSelectionTileActiveClasses}
        />
      )}

      {/* % Settings Submenu Overlay (Tip % and Commission % when voucher wallet connected) */}
      {showPercentSettings && (
        <PercentSettingsOverlay
          activeTipProfile={activeTipProfile}
          commissionEnabled={commissionEnabled}
          commissionPresets={commissionPresets}
          setShowPercentSettings={setShowPercentSettings}
          setShowTipProfileSettings={setShowTipProfileSettings}
          setShowCommissionSettings={setShowCommissionSettings}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          getSelectionTileClasses={getSelectionTileClasses}
        />
      )}

      {/* Commission % Settings Overlay */}
      {showCommissionSettings && (
        <CommissionSettingsOverlay
          commissionEnabled={commissionEnabled}
          commissionPresets={commissionPresets}
          setCommissionEnabled={setCommissionEnabled}
          setCommissionPresets={setCommissionPresets}
          setShowCommissionSettings={setShowCommissionSettings}
          setShowPercentSettings={setShowPercentSettings}
          isBlinkClassic={isBlinkClassic}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          getSelectionTileClasses={getSelectionTileClasses}
        />
      )}

      {/* Tip Profile Settings Overlay */}
      {showTipProfileSettings && (
        <TipProfileSettingsOverlay
          tipPresets={tipPresets}
          activeTipProfile={activeTipProfile}
          voucherWallet={voucherWallet}
          setTipPresets={setTipPresets}
          setActiveTipProfile={setActiveTipProfile}
          setShowTipProfileSettings={setShowTipProfileSettings}
          setShowPercentSettings={setShowPercentSettings}
          TIP_PROFILES={TIP_PROFILES}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          getSelectionTileClasses={getSelectionTileClasses}
          getSelectionTileActiveClasses={getSelectionTileActiveClasses}
        />
      )}

      {/* Split Settings Overlay */}
      {showTipSettings && !showCreateSplitProfile && (
        <SplitSettingsOverlay
          authMode={authMode}
          activeSplitProfile={activeSplitProfile}
          splitProfiles={splitProfiles}
          splitProfilesLoading={splitProfilesLoading}
          isBlinkClassic={isBlinkClassic}
          isBlinkClassicDark={isBlinkClassicDark}
          isBlinkClassicLight={isBlinkClassicLight}
          setShowTipSettings={setShowTipSettings}
          setShowCreateSplitProfile={setShowCreateSplitProfile}
          setActiveSplitProfileById={setActiveSplitProfileById}
          setEditingSplitProfile={setEditingSplitProfile}
          setNewSplitProfileLabel={setNewSplitProfileLabel}
          setNewSplitProfileRecipients={setNewSplitProfileRecipients}
          setNewRecipientInput={setNewRecipientInput}
          setRecipientValidation={setRecipientValidation}
          setSplitProfileError={setSplitProfileError}
          setUseCustomWeights={setUseCustomWeights}
          deleteSplitProfile={deleteSplitProfile}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          getSubmenuOptionClasses={getSubmenuOptionClasses}
          getSubmenuOptionActiveClasses={getSubmenuOptionActiveClasses}
          getPrimaryTextClasses={getPrimaryTextClasses}
          getSecondaryTextClasses={getSecondaryTextClasses}
          getCheckmarkClasses={getCheckmarkClasses}
          getPreviewBoxClasses={getPreviewBoxClasses}
        />
      )}

      {/* Create/Edit Split Profile Overlay */}
      {showCreateSplitProfile && (
        <CreateEditSplitProfileOverlay
          darkMode={darkMode}
          editingSplitProfile={editingSplitProfile}
          newSplitProfileLabel={newSplitProfileLabel}
          newSplitProfileRecipients={newSplitProfileRecipients}
          newRecipientInput={newRecipientInput}
          recipientValidation={recipientValidation}
          splitProfileError={splitProfileError}
          useCustomWeights={useCustomWeights}
          setShowCreateSplitProfile={setShowCreateSplitProfile}
          setShowTipSettings={setShowTipSettings}
          setEditingSplitProfile={setEditingSplitProfile}
          setNewSplitProfileLabel={setNewSplitProfileLabel}
          setNewSplitProfileRecipients={setNewSplitProfileRecipients}
          setNewRecipientInput={setNewRecipientInput}
          setRecipientValidation={setRecipientValidation}
          setSplitProfileError={setSplitProfileError}
          setUseCustomWeights={setUseCustomWeights}
          addRecipientToProfile={addRecipientToProfile}
          removeRecipientFromProfile={removeRecipientFromProfile}
          saveSplitProfile={saveSplitProfile}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
        />
      )}

      {/* Currency Settings Overlay */}
      {showCurrencySettings && (
        <CurrencySettingsOverlay
          displayCurrency={displayCurrency}
          currencyFilter={currencyFilter}
          currencyFilterDebounced={currencyFilterDebounced}
          currenciesLoading={currenciesLoading}
          darkMode={darkMode}
          isBlinkClassic={isBlinkClassic}
          isBlinkClassicDark={isBlinkClassicDark}
          isBlinkClassicLight={isBlinkClassicLight}
          setDisplayCurrency={setDisplayCurrency}
          setShowCurrencySettings={setShowCurrencySettings}
          setCurrencyFilter={setCurrencyFilter}
          getAllCurrencies={getAllCurrencies}
          isPopularCurrency={isPopularCurrency}
          addToPopular={addToPopular}
          removeFromPopular={removeFromPopular}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          getSubmenuOptionClasses={getSubmenuOptionClasses}
          getSubmenuOptionActiveClasses={getSubmenuOptionActiveClasses}
          getPrimaryTextClasses={getPrimaryTextClasses}
          getSecondaryTextClasses={getSecondaryTextClasses}
          getCheckmarkClasses={getCheckmarkClasses}
        />
      )}

      {/* Regional Settings Overlay */}
      {showRegionalSettings && (
        <RegionalSettingsOverlay
          numberFormat={numberFormat}
          bitcoinFormat={bitcoinFormat}
          numpadLayout={numpadLayout}
          setNumberFormat={setNumberFormat}
          setBitcoinFormat={setBitcoinFormat}
          setNumpadLayout={setNumpadLayout}
          setShowRegionalSettings={setShowRegionalSettings}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          getSubmenuOptionClasses={getSubmenuOptionClasses}
          getSubmenuOptionActiveClasses={getSubmenuOptionActiveClasses}
          getPrimaryTextClasses={getPrimaryTextClasses}
          getSecondaryTextClasses={getSecondaryTextClasses}
          getSectionLabelClasses={getSectionLabelClasses}
          getCheckmarkClasses={getCheckmarkClasses}
          getPreviewBoxClasses={getPreviewBoxClasses}
        />
      )}

      {/* Wallets Overlay */}
      {showAccountSettings && (
        <WalletsOverlay
          showAddAccountForm={showAddAccountForm}
          newAccountType={newAccountType}
          darkMode={darkMode}
          authMode={authMode}
          newAccountLabel={newAccountLabel}
          newAccountApiKey={newAccountApiKey}
          newAccountLnAddress={newAccountLnAddress}
          newAccountNwcUri={newAccountNwcUri}
          newNpubCashAddress={newNpubCashAddress}
          addAccountError={addAccountError}
          addAccountLoading={addAccountLoading}
          lnAddressValidated={lnAddressValidated}
          lnAddressValidating={lnAddressValidating}
          nwcValidated={nwcValidated}
          nwcValidating={nwcValidating}
          npubCashValidated={npubCashValidated}
          npubCashValidating={npubCashValidating}
          blinkAccounts={blinkAccounts}
          nwcConnections={nwcConnections}
          npubCashWallets={npubCashWallets}
          activeNWC={activeNWC}
          activeBlinkAccount={activeBlinkAccount}
          editingWalletLabel={editingWalletLabel}
          editedWalletLabel={editedWalletLabel}
          isBlinkClassic={isBlinkClassic}
          isBlinkClassicDark={isBlinkClassicDark}
          isBlinkClassicLight={isBlinkClassicLight}
          setShowAccountSettings={setShowAccountSettings}
          setShowAddAccountForm={setShowAddAccountForm}
          setNewAccountApiKey={setNewAccountApiKey}
          setNewAccountLabel={setNewAccountLabel}
          setNewAccountNwcUri={setNewAccountNwcUri}
          setNewAccountLnAddress={setNewAccountLnAddress}
          setNewAccountType={setNewAccountType}
          setAddAccountError={setAddAccountError}
          setNwcValidated={setNwcValidated}
          setLnAddressValidated={setLnAddressValidated}
          setConfirmDeleteWallet={setConfirmDeleteWallet}
          setAddAccountLoading={setAddAccountLoading}
          setLnAddressValidating={setLnAddressValidating}
          setNwcValidating={setNwcValidating}
          setNpubCashValidated={setNpubCashValidated}
          setNpubCashValidating={setNpubCashValidating}
          setNewNpubCashAddress={setNewNpubCashAddress}
          setActiveBlinkAccount={setActiveBlinkAccount}
          setActiveNWC={setActiveNWC}
          setEditingWalletLabel={setEditingWalletLabel}
          setEditedWalletLabel={setEditedWalletLabel}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          getWalletCardActiveClasses={getWalletCardActiveClasses}
          getWalletCardClasses={getWalletCardClasses}
          getWalletIconClasses={getWalletIconClasses}
          getWalletActiveBadgeClasses={getWalletActiveBadgeClasses}
          getWalletUseButtonClasses={getWalletUseButtonClasses}
          getSecondaryTextClasses={getSecondaryTextClasses}
          getInputClasses={getInputClasses}
          addBlinkAccount={addBlinkAccount}
          storeBlinkAccountOnServer={storeBlinkAccountOnServer}
          addBlinkLnAddressWallet={addBlinkLnAddressWallet}
          addNWCConnection={addNWCConnection}
          addNpubCashWallet={addNpubCashWallet}
          removeBlinkAccount={removeBlinkAccount}
          removeNWCConnection={removeNWCConnection}
          updateBlinkAccount={updateBlinkAccount}
          updateNWCConnection={updateNWCConnection}
        />
      )}

      {/* Voucher Wallet Overlay */}
      {showVoucherWalletSettings && (
        <VoucherWalletOverlay
          darkMode={darkMode}
          voucherWallet={voucherWallet}
          voucherWalletBalance={voucherWalletBalance}
          voucherWalletUsdBalance={voucherWalletUsdBalance}
          voucherWalletBalanceLoading={voucherWalletBalanceLoading}
          voucherWalletApiKey={voucherWalletApiKey}
          voucherWalletLabel={voucherWalletLabel}
          voucherWalletLoading={voucherWalletLoading}
          voucherWalletValidating={voucherWalletValidating}
          voucherWalletScopes={voucherWalletScopes}
          voucherWalletError={voucherWalletError}
          editingWalletLabel={editingWalletLabel}
          editedWalletLabel={editedWalletLabel}
          numberFormat={numberFormat}
          publicKey={publicKey}
          setShowVoucherWalletSettings={setShowVoucherWalletSettings}
          setVoucherWalletApiKey={setVoucherWalletApiKey}
          setVoucherWalletLabel={setVoucherWalletLabel}
          setVoucherWalletError={setVoucherWalletError}
          setVoucherWalletScopes={setVoucherWalletScopes}
          setVoucherWallet={setVoucherWallet}
          setVoucherWalletLoading={setVoucherWalletLoading}
          setVoucherWalletValidating={setVoucherWalletValidating}
          setEditingWalletLabel={setEditingWalletLabel}
          setEditedWalletLabel={setEditedWalletLabel}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          fetchVoucherWalletBalance={fetchVoucherWalletBalance}
          getVoucherWalletKey={getVoucherWalletKey}
          syncVoucherWalletToServer={syncVoucherWalletToServer}
        />
      )}

      {/* Export Options Overlay */}
      {showExportOptions && (
        <ExportOptionsOverlay
          exportingData={exportingData}
          dateFilterActive={dateFilterActive}
          filteredTransactions={filteredTransactions}
          selectedDateRange={selectedDateRange}
          user={user}
          setShowExportOptions={setShowExportOptions}
          convertTransactionsToBasicCSV={convertTransactionsToBasicCSV}
          downloadCSV={downloadCSV}
          exportBasicTransactions={exportBasicTransactions}
          exportFullTransactions={exportFullTransactions}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
        />
      )}

      {/* Date Range Selector Modal */}
      {showDateRangeSelector && (
        <DateRangeSelectorOverlay
          customDateStart={customDateStart}
          customDateEnd={customDateEnd}
          customTimeStart={customTimeStart}
          customTimeEnd={customTimeEnd}
          showTimeInputs={showTimeInputs}
          loadingMore={loadingMore}
          setShowDateRangeSelector={setShowDateRangeSelector}
          setCustomDateStart={setCustomDateStart}
          setCustomDateEnd={setCustomDateEnd}
          setCustomTimeStart={setCustomTimeStart}
          setCustomTimeEnd={setCustomTimeEnd}
          setShowTimeInputs={setShowTimeInputs}
          getDateRangePresets={getDateRangePresets}
          loadTransactionsForDateRange={loadTransactionsForDateRange}
          handleCustomDateRange={handleCustomDateRange}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
        />
      )}

      <main
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mobile-content ${isFixedView ? "h-[calc(100vh-80px)] overflow-hidden py-2" : "py-6"}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {error && (
          <div className="mb-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Owner/Agent Display */}
        <OwnerAgentDisplay
          currentView={currentView}
          showingInvoice={showingInvoice}
          showingVoucherQR={showingVoucherQR}
          voucherWallet={voucherWallet}
          activeNWC={activeNWC}
          activeNpubCashWallet={activeNpubCashWallet}
          activeBlinkAccount={activeBlinkAccount}
          voucherExpiry={voucherExpiry}
          activeSplitProfile={activeSplitProfile}
          voucherWalletBalanceLoading={voucherWalletBalanceLoading}
          isBlinkClassic={isBlinkClassic}
          currentVoucherCurrencyMode={currentVoucherCurrencyMode}
          currentAmountInUsdCents={currentAmountInUsdCents}
          currentAmountInSats={currentAmountInSats}
          voucherWalletUsdBalance={voucherWalletUsdBalance}
          voucherWalletBalance={voucherWalletBalance}
          setShowVoucherWalletSettings={setShowVoucherWalletSettings}
          setShowAccountSettings={setShowAccountSettings}
          setVoucherExpiry={setVoucherExpiry}
          voucherRef={voucherRef}
          multiVoucherRef={multiVoucherRef}
          getCapacityColor={getCapacityColor}
        />

        {/* View Transition Loading Overlay */}
        {isViewTransitioning && (
          <div className="fixed inset-0 z-40 bg-white/80 dark:bg-black/80 flex items-center justify-center backdrop-blur-sm">
            <div
              className={`animate-spin rounded-full h-12 w-12 border-4 ${currentSpinnerColor} border-t-transparent`}
            ></div>
          </div>
        )}

        {/* Conditional Content Based on Current View */}
        {currentView === "cart" ? (
          <div className="h-[calc(100vh-180px)] min-h-[400px]">
            <ItemCart
              ref={cartRef}
              displayCurrency={displayCurrency}
              numberFormat={numberFormat}
              bitcoinFormat={bitcoinFormat}
              currencies={currencies}
              publicKey={publicKey}
              onCheckout={(checkoutData) => {
                // Store checkout data and switch to POS
                setCartCheckoutData(checkoutData)
                handleViewTransition("pos")
              }}
              soundEnabled={soundEnabled}
              darkMode={darkMode}
              theme={theme}
              cycleTheme={cycleTheme}
              isViewTransitioning={isViewTransitioning}
              exchangeRate={exchangeRate}
            />
          </div>
        ) : currentView === "pos" ? (
          <POS
            ref={posRef}
            apiKey={apiKey}
            user={user}
            displayCurrency={displayCurrency}
            numberFormat={numberFormat}
            bitcoinFormat={bitcoinFormat}
            numpadLayout={numpadLayout}
            currencies={currencies}
            wallets={wallets}
            onPaymentReceived={posPaymentReceivedRef}
            connected={connected}
            manualReconnect={manualReconnect}
            reconnectAttempts={reconnectAttempts}
            tipsEnabled={tipsEnabled}
            tipPresets={tipPresets}
            tipRecipients={activeSplitProfile?.recipients || []}
            soundEnabled={soundEnabled}
            onInvoiceStateChange={setShowingInvoice}
            onInvoiceChange={(invoiceData) => {
              // Set current invoice to trigger polling in Dashboard
              setCurrentInvoice(invoiceData)
            }}
            darkMode={darkMode}
            theme={theme}
            cycleTheme={cycleTheme}
            nfcState={nfcState}
            activeNWC={activeNWC}
            nwcClientReady={nwcClientReady}
            nwcMakeInvoice={nwcMakeInvoice}
            nwcLookupInvoice={nwcLookupInvoice}
            getActiveNWCUri={getActiveNWCUri}
            activeBlinkAccount={activeBlinkAccount}
            activeNpubCashWallet={activeNpubCashWallet}
            cartCheckoutData={cartCheckoutData}
            onCartCheckoutProcessed={() => setCartCheckoutData(null)}
            onInternalTransition={() => {
              // Rotate spinner color and show brief transition
              setTransitionColorIndex((prev) => (prev + 1) % SPINNER_COLORS.length)
              setIsViewTransitioning(true)
              setTimeout(() => setIsViewTransitioning(false), 120)
            }}
            triggerPaymentAnimation={triggerPaymentAnimation}
          />
        ) : currentView === "multivoucher" ? (
          <div className="h-[calc(100vh-180px)] min-h-[400px]">
            <MultiVoucher
              ref={multiVoucherRef}
              voucherWallet={voucherWallet}
              walletBalance={
                voucherCurrencyMode === "USD"
                  ? voucherWalletUsdBalance
                  : voucherWalletBalance
              }
              displayCurrency={displayCurrency}
              numberFormat={numberFormat}
              bitcoinFormat={bitcoinFormat}
              numpadLayout={numpadLayout}
              currencies={currencies}
              darkMode={darkMode}
              theme={theme}
              cycleTheme={cycleTheme}
              soundEnabled={soundEnabled}
              commissionEnabled={commissionEnabled}
              commissionPresets={commissionPresets}
              voucherCurrencyMode={voucherCurrencyMode}
              onVoucherCurrencyToggle={
                voucherWalletUsdId
                  ? () =>
                      setVoucherCurrencyMode((prev) => (prev === "BTC" ? "USD" : "BTC"))
                  : null
              }
              usdExchangeRate={usdExchangeRate}
              usdWalletId={voucherWalletUsdId}
              initialExpiry={voucherExpiry}
              onInternalTransition={() => {
                // Rotate spinner color and show brief transition
                setTransitionColorIndex((prev) => (prev + 1) % SPINNER_COLORS.length)
                setIsViewTransitioning(true)
                setTimeout(() => setIsViewTransitioning(false), 120)
              }}
            />
          </div>
        ) : currentView === "voucher" ? (
          <Voucher
            ref={voucherRef}
            voucherWallet={voucherWallet}
            walletBalance={
              voucherCurrencyMode === "USD"
                ? voucherWalletUsdBalance
                : voucherWalletBalance
            }
            displayCurrency={displayCurrency}
            numberFormat={numberFormat}
            bitcoinFormat={bitcoinFormat}
            numpadLayout={numpadLayout}
            currencies={currencies}
            darkMode={darkMode}
            theme={theme}
            cycleTheme={cycleTheme}
            soundEnabled={soundEnabled}
            onVoucherStateChange={setShowingVoucherQR}
            commissionEnabled={commissionEnabled}
            commissionPresets={commissionPresets}
            voucherCurrencyMode={voucherCurrencyMode}
            onVoucherCurrencyToggle={
              voucherWalletUsdId
                ? () => setVoucherCurrencyMode((prev) => (prev === "BTC" ? "USD" : "BTC"))
                : null
            }
            usdExchangeRate={usdExchangeRate}
            usdWalletId={voucherWalletUsdId}
            initialExpiry={voucherExpiry}
            onInternalTransition={() => {
              // Rotate spinner color and show brief transition
              setTransitionColorIndex((prev) => (prev + 1) % SPINNER_COLORS.length)
              setIsViewTransitioning(true)
              setTimeout(() => setIsViewTransitioning(false), 120)
            }}
          />
        ) : currentView === "vouchermanager" ? (
          <div className="h-[calc(100vh-180px)] min-h-[400px]">
            <VoucherManager
              ref={voucherManagerRef}
              voucherWallet={voucherWallet}
              displayCurrency={displayCurrency}
              currencies={currencies}
              darkMode={darkMode}
              theme={theme}
              cycleTheme={cycleTheme}
              soundEnabled={soundEnabled}
              onInternalTransition={() => {
                // Rotate spinner color and show brief transition
                setTransitionColorIndex((prev) => (prev + 1) % SPINNER_COLORS.length)
                setIsViewTransitioning(true)
                setTimeout(() => setIsViewTransitioning(false), 120)
              }}
            />
          </div>
        ) : (
          <>
            {/* Most Recent Transactions */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                Most Recent Transactions
              </h2>
              {(() => {
                // Check if current wallet type doesn't support transaction history
                const isLnAddressWallet = activeBlinkAccount?.type === "ln-address"
                const isNpubCashWallet =
                  activeNpubCashWallet?.type === "npub-cash" && !activeNWC
                const walletDoesNotSupportHistory = isLnAddressWallet || isNpubCashWallet

                if (walletDoesNotSupportHistory && transactions.length === 0) {
                  // Show informative message about wallet limitation
                  const walletType = isLnAddressWallet
                    ? "Blink Lightning Address"
                    : "npub.cash"
                  return (
                    <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6">
                      <div className="flex flex-col items-center gap-4 text-center">
                        <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <svg
                            className="w-6 h-6 text-blue-600 dark:text-blue-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                            Transaction History Not Available
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                            {walletType} wallets are designed for receiving payments only
                            and do not provide transaction history.
                            {isLnAddressWallet &&
                              " To view transaction history, please use a Blink API Key wallet."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                }

                // Show normal transaction list
                return (
                  <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black overflow-hidden sm:rounded-md">
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                      {transactions.slice(0, 5).map((tx) => (
                        <li
                          key={tx.id}
                          className="px-6 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          onClick={() => setSelectedTransaction(tx)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <div
                                className={`flex-shrink-0 w-2 h-2 rounded-full mr-3 ${
                                  tx.direction === "RECEIVE"
                                    ? "bg-green-500"
                                    : "bg-red-500"
                                }`}
                              ></div>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {tx.amount}
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {tx.memo}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <p className="text-sm text-gray-900 dark:text-gray-100">
                                  {tx.status}
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {tx.date}
                                </p>
                              </div>
                              <svg
                                className="w-4 h-4 text-gray-400"
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
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })()}
            </div>

            {/* Past Transactions - Grouped by Month or Filtered */}
            <div>
              {/* Title Row - Own line */}
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                {dateFilterActive ? "Filtered Transactions" : "Past Transactions"}
              </h2>

              {/* Date Range Tag - Own line when active */}
              {dateFilterActive && selectedDateRange && (
                <div className="mb-4">
                  <button
                    onClick={handleClearDateFilter}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                  >
                    <span>{selectedDateRange.label}</span>
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              )}

              {/* Top Action Buttons - Only visible when there are transactions */}
              {transactions.length > 0 && (
                <div className="mb-4">
                  {isSearchingTx ? (
                    /* Expanded Search Input */
                    <div className="max-w-sm h-10 bg-white dark:bg-black border-2 border-orange-500 dark:border-orange-500 rounded-lg flex items-center shadow-md">
                      {/* Cancel button */}
                      <button
                        onClick={() => {
                          setIsSearchingTx(false)
                          setTxSearchInput("")
                        }}
                        className="w-10 h-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                      <input
                        ref={txSearchInputRef}
                        type="text"
                        value={txSearchInput}
                        onChange={(e) => setTxSearchInput(e.target.value)}
                        onKeyDown={handleTxSearchKeyDown}
                        placeholder="Search memo, amount, username..."
                        className="flex-1 h-full bg-transparent text-gray-900 dark:text-white focus:outline-none text-sm"
                        autoFocus
                      />
                      {/* Submit button */}
                      <button
                        onClick={handleTxSearchSubmit}
                        disabled={!txSearchInput.trim()}
                        className="w-10 h-full flex items-center justify-center text-orange-500 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-300 disabled:text-gray-300 dark:disabled:text-gray-600 transition-colors"
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
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    /* Filter, Search, Export buttons row */
                    <div className="flex gap-2 max-w-sm">
                      {/* Filter Button */}
                      <button
                        onClick={() => setShowDateRangeSelector(true)}
                        disabled={loadingMore}
                        className="flex-1 h-10 bg-white dark:bg-black border border-blue-500 dark:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        Filter
                      </button>

                      {/* Search Button */}
                      <button
                        onClick={
                          txSearchQuery ? handleTxSearchClose : handleTxSearchClick
                        }
                        className={`flex-1 h-10 bg-white dark:bg-black border rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                          txSearchQuery
                            ? "border-orange-500 dark:border-orange-400 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300"
                            : "border-orange-500 dark:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900 text-orange-500 dark:text-orange-400"
                        }`}
                      >
                        {isSearchLoading ? (
                          /* Loading spinner */
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-orange-500 border-t-transparent"></div>
                        ) : txSearchQuery ? (
                          /* Active search - show query with X */
                          <>
                            <span className="truncate max-w-[80px]">
                              "{txSearchQuery}"
                            </span>
                            <svg
                              className="w-3 h-3 flex-shrink-0"
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
                          </>
                        ) : (
                          /* Default search icon */
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
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                              />
                            </svg>
                            Search
                          </>
                        )}
                      </button>

                      {/* Export Button */}
                      <button
                        onClick={() => setShowExportOptions(true)}
                        className="flex-1 h-10 bg-white dark:bg-black border border-yellow-500 dark:border-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900 text-yellow-600 dark:text-yellow-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        Export
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Summary Stats - Show when date filter is active */}
              {dateFilterActive &&
                filteredTransactions.length > 0 &&
                (() => {
                  const stats = getFilteredStats()
                  const currency = filteredTransactions[0]?.settlementCurrency || "BTC"
                  const formatStatAmount = (amount) => {
                    if (currency === "BTC") {
                      return `${Math.abs(amount).toLocaleString()} sats`
                    } else if (currency === "USD") {
                      return `$${(Math.abs(amount) / 100).toFixed(2)}`
                    }
                    return `${Math.abs(amount).toLocaleString()} ${currency}`
                  }

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-3 text-center">
                        <div className="text-xs text-green-600 dark:text-green-400 font-medium uppercase">
                          Received
                        </div>
                        <div className="text-lg font-bold text-green-700 dark:text-green-300">
                          {formatStatAmount(stats.totalReceived)}
                        </div>
                        <div className="text-xs text-green-500 dark:text-green-500">
                          {stats.receiveCount} transactions
                        </div>
                      </div>
                      <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-3 text-center">
                        <div className="text-xs text-red-600 dark:text-red-400 font-medium uppercase">
                          Sent
                        </div>
                        <div className="text-lg font-bold text-red-700 dark:text-red-300">
                          {formatStatAmount(stats.totalSent)}
                        </div>
                        <div className="text-xs text-red-500 dark:text-red-500">
                          {stats.sendCount} transactions
                        </div>
                      </div>
                      <div
                        className={`rounded-lg p-3 text-center ${stats.netAmount >= 0 ? "bg-blue-50 dark:bg-blue-900/30" : "bg-orange-50 dark:bg-orange-900/30"}`}
                      >
                        <div
                          className={`text-xs font-medium uppercase ${stats.netAmount >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"}`}
                        >
                          Net
                        </div>
                        <div
                          className={`text-lg font-bold ${stats.netAmount >= 0 ? "text-blue-700 dark:text-blue-300" : "text-orange-700 dark:text-orange-300"}`}
                        >
                          {stats.netAmount >= 0 ? "+" : "-"}
                          {formatStatAmount(stats.netAmount)}
                        </div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                        <div className="text-xs text-gray-600 dark:text-gray-400 font-medium uppercase">
                          Total
                        </div>
                        <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
                          {stats.transactionCount}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-500">
                          transactions
                        </div>
                      </div>
                    </div>
                  )
                })()}

              {!pastTransactionsLoaded ? (
                <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                  <div className="flex flex-col items-center gap-3">
                    <svg
                      className="w-12 h-12 text-gray-400 dark:text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <p>Click "Show" to select a date range and view transactions</p>
                  </div>
                </div>
              ) : dateFilterActive && filteredTransactions.length === 0 ? (
                <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                  <div className="flex flex-col items-center gap-3">
                    <svg
                      className="w-12 h-12 text-gray-400 dark:text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p>
                      No transactions found for{" "}
                      {selectedDateRange?.label || "selected date range"}
                    </p>
                    <button
                      onClick={() => setShowDateRangeSelector(true)}
                      className="mt-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Try Different Range
                    </button>
                  </div>
                </div>
              ) : isSearchLoading ? (
                /* Search Loading State */
                <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-8 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-3 border-orange-500 border-t-transparent"></div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      Searching...
                    </p>
                  </div>
                </div>
              ) : dateFilterActive && filteredTransactions.length > 0 ? (
                (() => {
                  const displayTxs = getDisplayTransactions()

                  if (displayTxs.length === 0 && txSearchQuery) {
                    // Search returned no results
                    return (
                      <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                        <div className="flex flex-col items-center gap-3">
                          <svg
                            className="w-12 h-12 text-gray-400 dark:text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                          </svg>
                          <p>No transactions match "{txSearchQuery}"</p>
                          <button
                            onClick={handleTxSearchClose}
                            className="mt-2 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                          >
                            Clear Search
                          </button>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg overflow-hidden">
                      {/* Search Results Count */}
                      {txSearchQuery && (
                        <div className="px-4 py-2 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800">
                          <span className="text-sm text-orange-700 dark:text-orange-300">
                            Found {displayTxs.length} result
                            {displayTxs.length !== 1 ? "s" : ""} for "{txSearchQuery}"
                          </span>
                        </div>
                      )}

                      {/* Filtered Transactions List - Mobile */}
                      <div className="block sm:hidden">
                        <div className="p-4 space-y-3">
                          {displayTxs.map((tx) => {
                            const txLabel = getTransactionLabel(tx.id)
                            return (
                              <div
                                key={tx.id}
                                className={`bg-white dark:bg-blink-dark rounded-lg p-4 border cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors ${
                                  txLabel.id !== "none"
                                    ? `${txLabel.borderLight} dark:${txLabel.borderDark}`
                                    : "border-gray-200 dark:border-gray-700"
                                }`}
                                onClick={() => setSelectedTransaction(tx)}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    {/* Label indicator dot */}
                                    {txLabel.id !== "none" && (
                                      <div
                                        className={`w-2.5 h-2.5 rounded-full ${txLabel.bgLight} dark:${txLabel.bgDark}`}
                                        style={{
                                          backgroundColor:
                                            txLabel.color === "blue"
                                              ? "#3b82f6"
                                              : txLabel.color === "purple"
                                                ? "#a855f7"
                                                : txLabel.color === "orange"
                                                  ? "#f97316"
                                                  : txLabel.color === "cyan"
                                                    ? "#06b6d4"
                                                    : txLabel.color === "green"
                                                      ? "#22c55e"
                                                      : txLabel.color === "red"
                                                        ? "#ef4444"
                                                        : txLabel.color === "pink"
                                                          ? "#ec4899"
                                                          : txLabel.color === "amber"
                                                            ? "#f59e0b"
                                                            : "#6b7280",
                                        }}
                                      />
                                    )}
                                    <span
                                      className={`text-lg font-medium ${
                                        tx.direction === "RECEIVE"
                                          ? "text-green-600 dark:text-green-400"
                                          : "text-red-600 dark:text-red-400"
                                      }`}
                                    >
                                      {tx.amount}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                      {tx.status}
                                    </span>
                                    <svg
                                      className="w-4 h-4 text-gray-400"
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
                                <div className="text-sm text-gray-900 dark:text-gray-100 mb-1">
                                  {tx.date}
                                </div>
                                {tx.memo && tx.memo !== "-" && (
                                  <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {tx.memo}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Filtered Transactions Table - Desktop */}
                      <div className="hidden sm:block">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  Amount
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  Date
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  Memo
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"></th>
                              </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-blink-dark divide-y divide-gray-200 dark:divide-gray-700">
                              {displayTxs.map((tx) => (
                                <tr
                                  key={tx.id}
                                  className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                                  onClick={() => setSelectedTransaction(tx)}
                                >
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span
                                      className={`text-sm font-medium ${
                                        tx.direction === "RECEIVE"
                                          ? "text-green-600 dark:text-green-400"
                                          : "text-red-600 dark:text-red-400"
                                      }`}
                                    >
                                      {tx.amount}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                      {tx.status}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                    {tx.date}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                    {tx.memo && tx.memo !== "-" ? tx.memo : "-"}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right">
                                    <svg
                                      className="w-4 h-4 text-gray-400"
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
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )
                })()
              ) : isSearchLoading ? (
                /* Search Loading State (for month-grouped view) */
                <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-8 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-3 border-orange-500 border-t-transparent"></div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      Searching...
                    </p>
                  </div>
                </div>
              ) : (
                (() => {
                  const monthGroups = getMonthGroups()

                  // Apply search filter to month groups if search is active
                  const filteredMonthGroups = {}
                  Object.entries(monthGroups).forEach(([monthKey, monthData]) => {
                    const filteredTxs = filterTransactionsBySearch(
                      monthData.transactions,
                      txSearchQuery,
                    )
                    if (filteredTxs.length > 0) {
                      filteredMonthGroups[monthKey] = {
                        ...monthData,
                        transactions: filteredTxs,
                      }
                    }
                  })

                  const monthKeys = Object.keys(filteredMonthGroups)

                  // Show search no results message
                  if (monthKeys.length === 0 && txSearchQuery) {
                    return (
                      <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                        <div className="flex flex-col items-center gap-3">
                          <svg
                            className="w-12 h-12 text-gray-400 dark:text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                          </svg>
                          <p>No transactions match "{txSearchQuery}"</p>
                          <button
                            onClick={handleTxSearchClose}
                            className="mt-2 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                          >
                            Clear Search
                          </button>
                        </div>
                      </div>
                    )
                  }

                  if (monthKeys.length === 0) {
                    // Check if current wallet type doesn't support transaction history
                    const isLnAddressWallet = activeBlinkAccount?.type === "ln-address"
                    const isNpubCashWallet =
                      activeNpubCashWallet?.type === "npub-cash" && !activeNWC
                    const walletDoesNotSupportHistory =
                      isLnAddressWallet || isNpubCashWallet

                    if (walletDoesNotSupportHistory) {
                      // Show informative message about wallet limitation
                      const walletType = isLnAddressWallet
                        ? "Blink Lightning Address"
                        : "npub.cash"
                      return (
                        <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6">
                          <div className="flex flex-col items-center gap-4 text-center">
                            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              <svg
                                className="w-6 h-6 text-blue-600 dark:text-blue-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            </div>
                            <div>
                              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                                Transaction History Not Available
                              </h3>
                              <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                                {walletType} wallets are designed for receiving payments
                                only and do not provide transaction history.
                                {isLnAddressWallet &&
                                  " To view transaction history, please use a Blink API Key wallet."}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                        No past transactions available
                      </div>
                    )
                  }

                  // Calculate total search results count
                  const totalSearchResults = txSearchQuery
                    ? Object.values(filteredMonthGroups).reduce(
                        (sum, m) => sum + m.transactions.length,
                        0,
                      )
                    : 0

                  return (
                    <div className="space-y-4">
                      {/* Search Results Count */}
                      {txSearchQuery && (
                        <div className="px-4 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                          <span className="text-sm text-orange-700 dark:text-orange-300">
                            Found {totalSearchResults} result
                            {totalSearchResults !== 1 ? "s" : ""} for "{txSearchQuery}"
                          </span>
                        </div>
                      )}

                      {monthKeys.map((monthKey) => {
                        const monthData = filteredMonthGroups[monthKey]
                        const isExpanded = expandedMonths.has(monthKey)
                        const transactionCount = monthData.transactions.length

                        return (
                          <div
                            key={monthKey}
                            className="bg-white dark:bg-blink-dark shadow dark:shadow-black rounded-lg overflow-hidden"
                          >
                            {/* Month Header - Clickable */}
                            <button
                              onClick={() => toggleMonth(monthKey)}
                              className="w-full px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:bg-white dark:focus:bg-gray-700 transition-colors month-group-header"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                                    {monthData.label}
                                  </h3>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {transactionCount} transaction
                                    {transactionCount !== 1 ? "s" : ""}
                                  </p>
                                </div>
                                <div className="flex items-center">
                                  <svg
                                    className={`w-5 h-5 text-gray-400 transform transition-transform ${
                                      isExpanded ? "rotate-180" : ""
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
                                </div>
                              </div>
                            </button>

                            {/* Month Transactions - Expandable */}
                            {isExpanded && (
                              <div className="border-t border-gray-200 dark:border-gray-700 month-group-content">
                                {/* Mobile-friendly card layout for small screens */}
                                <div className="block sm:hidden">
                                  <div className="p-4 space-y-3">
                                    {monthData.transactions.map((tx) => {
                                      const txLabel = getTransactionLabel(tx.id)
                                      return (
                                        <div
                                          key={tx.id}
                                          className={`bg-white dark:bg-blink-dark rounded-lg p-4 border transaction-card-mobile cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors ${
                                            txLabel.id !== "none"
                                              ? `${txLabel.borderLight} dark:${txLabel.borderDark}`
                                              : "border-gray-200 dark:border-gray-700"
                                          }`}
                                          onClick={() => setSelectedTransaction(tx)}
                                        >
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                              {/* Label indicator dot */}
                                              {txLabel.id !== "none" && (
                                                <div
                                                  className={`w-2.5 h-2.5 rounded-full`}
                                                  style={{
                                                    backgroundColor:
                                                      txLabel.color === "blue"
                                                        ? "#3b82f6"
                                                        : txLabel.color === "purple"
                                                          ? "#a855f7"
                                                          : txLabel.color === "orange"
                                                            ? "#f97316"
                                                            : txLabel.color === "cyan"
                                                              ? "#06b6d4"
                                                              : txLabel.color === "green"
                                                                ? "#22c55e"
                                                                : txLabel.color === "red"
                                                                  ? "#ef4444"
                                                                  : txLabel.color ===
                                                                      "pink"
                                                                    ? "#ec4899"
                                                                    : txLabel.color ===
                                                                        "amber"
                                                                      ? "#f59e0b"
                                                                      : "#6b7280",
                                                  }}
                                                />
                                              )}
                                              <span
                                                className={`text-lg font-medium ${
                                                  tx.direction === "RECEIVE"
                                                    ? "text-green-600 dark:text-green-400"
                                                    : "text-red-600 dark:text-red-400"
                                                }`}
                                              >
                                                {tx.amount}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                                {tx.status}
                                              </span>
                                              <svg
                                                className="w-4 h-4 text-gray-400"
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
                                          <div className="text-sm text-gray-900 dark:text-gray-100 mb-1">
                                            {tx.date}
                                          </div>
                                          {tx.memo && tx.memo !== "-" && (
                                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                              {tx.memo}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>

                                {/* Desktop table layout for larger screens */}
                                <div className="hidden sm:block">
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                      <thead className="bg-white dark:bg-blink-dark">
                                        <tr>
                                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Amount
                                          </th>
                                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Status
                                          </th>
                                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Date
                                          </th>
                                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Memo
                                          </th>
                                          <th className="px-6 py-3"></th>
                                        </tr>
                                      </thead>
                                      <tbody className="bg-white dark:bg-blink-dark divide-y divide-gray-200 dark:divide-gray-700">
                                        {monthData.transactions.map((tx) => (
                                          <tr
                                            key={tx.id}
                                            className="hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-blink-dark cursor-pointer"
                                            onClick={() => setSelectedTransaction(tx)}
                                          >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                              <span
                                                className={`text-sm font-medium ${
                                                  tx.direction === "RECEIVE"
                                                    ? "text-green-600 dark:text-green-400"
                                                    : "text-red-600 dark:text-red-400"
                                                }`}
                                              >
                                                {tx.amount}
                                              </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                                {tx.status}
                                              </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                              {tx.date}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                              {tx.memo && tx.memo !== "-" ? tx.memo : "-"}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                              <svg
                                                className="w-4 h-4 text-gray-400"
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
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()
              )}

              {/* Bottom Action Buttons - Show Filter/Export only when > 5 transactions loaded */}
              {(() => {
                const displayTxCount = dateFilterActive
                  ? filteredTransactions.length
                  : transactions.length
                const showBottomFilterExport = displayTxCount > 5
                const showMoreButton = pastTransactionsLoaded && hasMoreTransactions

                // Don't show section at all if nothing to show
                if (!showBottomFilterExport && !showMoreButton) return null

                return (
                  <div className="mt-6 px-4">
                    <div
                      className={`grid gap-3 max-w-sm mx-auto ${
                        showBottomFilterExport && showMoreButton
                          ? "grid-cols-3"
                          : showMoreButton
                            ? "grid-cols-1"
                            : "grid-cols-2"
                      }`}
                    >
                      {/* Filter Button - Only when > 5 transactions */}
                      {showBottomFilterExport && (
                        <button
                          onClick={() => setShowDateRangeSelector(true)}
                          disabled={loadingMore}
                          className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:border-gray-400 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-black rounded-lg text-lg font-normal transition-colors shadow-md"
                          style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
                        >
                          <div className="flex items-center justify-center gap-2">
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
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            Filter
                          </div>
                        </button>
                      )}

                      {/* Show More Button - Only when more data is available */}
                      {showMoreButton && (
                        <button
                          onClick={loadMoreMonths}
                          disabled={loadingMore}
                          className="h-16 bg-white dark:bg-black border-2 border-gray-400 dark:border-gray-500 hover:border-gray-500 dark:hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:border-gray-300 disabled:text-gray-300 disabled:cursor-not-allowed rounded-lg text-lg font-normal transition-colors shadow-md"
                          style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
                        >
                          {loadingMore ? (
                            <div className="flex items-center justify-center">
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2"></div>
                              Loading...
                            </div>
                          ) : (
                            "More"
                          )}
                        </button>
                      )}

                      {/* Export Button - Only when > 5 transactions */}
                      {showBottomFilterExport && (
                        <button
                          onClick={() => setShowExportOptions(true)}
                          className="h-16 bg-white dark:bg-black border-2 border-yellow-500 dark:border-yellow-400 hover:border-yellow-600 dark:hover:border-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900 text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300 rounded-lg text-lg font-normal transition-colors shadow-md"
                          style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
                        >
                          Export
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-2">
                      {dateFilterActive && selectedDateRange
                        ? `Showing: ${selectedDateRange.label}`
                        : hasMoreTransactions
                          ? `${transactions.length} transactions loaded · More available`
                          : `All ${transactions.length} transactions loaded`}
                    </p>
                  </div>
                )
              })()}
            </div>
          </>
        )}
      </main>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <TransactionDetail
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          darkMode={darkMode}
          onLabelChange={triggerLabelUpdate}
        />
      )}

      {/* Settings Modal */}
    </div>
  )
}
