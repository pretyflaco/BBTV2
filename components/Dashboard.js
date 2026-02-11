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
import { useTipRecipientValidation } from "../lib/hooks/useTipRecipientValidation"
import { useExchangeRateFetcher } from "../lib/hooks/useExchangeRateFetcher"
import { useServerSync, getVoucherWalletKey } from "../lib/hooks/useServerSync"
import { usePaymentPolling } from "../lib/hooks/usePaymentPolling"
import { useSplitProfileActions } from "../lib/hooks/useSplitProfileActions"
import { useDashboardData } from "../lib/hooks/useDashboardData"
import { useTransactionActions } from "../lib/hooks/useTransactionActions"
import { useExchangeRate } from "../lib/hooks/useExchangeRate"
import { useWalletState } from "../lib/hooks/useWalletState"
import { useInvoiceState } from "../lib/hooks/useInvoiceState"
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

import TransactionDetail from "./TransactionDetail"
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
import TransactionsView from "./TransactionsView"

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

  // Tip recipient validation - extracted to useTipRecipientValidation hook
  const { validateBlinkUsername } = useTipRecipientValidation({
    tipRecipient,
    setUsernameValidation,
    setTipsEnabled,
    usernameValidation,
  })

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

  // Exchange rate fetching & tip sync - extracted to useExchangeRateFetcher hook
  useExchangeRateFetcher({
    displayCurrency,
    apiKey,
    setExchangeRate,
    setLoadingRate,
    voucherWallet,
    setUsdExchangeRate,
    activeTipProfile,
    setTipPresets,
    resetTipRecipient,
    user,
  })

  // Server sync for preferences & voucher wallet - extracted to useServerSync hook
  const { syncVoucherWalletToServer } = useServerSync({
    publicKey,
    soundEnabled,
    setSoundEnabled,
    soundTheme,
    setSoundTheme,
    tipsEnabled,
    setTipsEnabled,
    tipPresets,
    setTipPresets,
    displayCurrency,
    setDisplayCurrency,
    numberFormat,
    setNumberFormat,
    numpadLayout,
    setNumpadLayout,
    voucherCurrencyMode,
    setVoucherCurrencyMode,
    voucherExpiry,
    setVoucherExpiry,
    voucherWallet,
    setVoucherWallet,
    setVoucherWalletBalance,
    setVoucherWalletUsdBalance,
  })

  // Split profile CRUD & recipient validation - extracted to useSplitProfileActions hook
  const {
    fetchSplitProfiles,
    saveSplitProfile,
    deleteSplitProfile,
    setActiveSplitProfileById,
    validateRecipientUsername,
    addRecipientToProfile,
    removeRecipientFromProfile,
  } = useSplitProfileActions({
    publicKey,
    authMode,
    splitProfiles,
    setSplitProfiles,
    setActiveSplitProfile,
    setSplitProfilesLoading,
    setSplitProfileError,
    setTipsEnabled,
    setTipRecipient,
    setRecipientValidation,
    recipientValidation,
    newRecipientInput,
    setNewRecipientInput,
    newSplitProfileRecipients,
    setNewSplitProfileRecipients,
    useCustomWeights,
  })

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

  // NOTE: transactions, loading, error state now provided by useTransactionState hook

  // Ref for POS payment received callback
  const posPaymentReceivedRef = useRef(null)

  // Dashboard data fetching - extracted to useDashboardData hook
  const {
    fetchData,
    fetchVoucherWalletBalance,
    getCapacityColor,
  } = useDashboardData({
    // From useCombinedAuth
    user,
    getApiKey,
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
    // Refs
    posPaymentReceivedRef,
    voucherRef,
    multiVoucherRef,
  })

  // Transaction operations - extracted to useTransactionActions hook
  const {
    handleViewTransition,
    loadMoreMonths,
    loadPastTransactions,
    getDateRangePresets,
    loadTransactionsForDateRange,
    handleCustomDateRange,
    handleClearDateFilter,
    getFilteredStats,
    getDisplayTransactions,
    filterTransactionsBySearch,
    handleTxSearchClick,
    handleTxSearchSubmit,
    handleTxSearchKeyDown,
    handleTxSearchClose,
    convertTransactionsToBasicCSV,
    downloadCSV,
    exportBasicTransactions,
    exportFullTransactions,
    groupTransactionsByMonth,
    getMonthGroups,
    toggleMonth,
    loadMoreTransactionsForMonth,
    handleRefresh,
  } = useTransactionActions({
    apiKey,
    wallets,
    user,
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
    showTimeInputs,
    setShowTimeInputs,
    setShowDateRangeSelector,
    setShowExportOptions,
    currentView,
    setCurrentView,
    setTransitionColorIndex,
    setIsViewTransitioning,
    customDateStart,
    customDateEnd,
    customTimeStart,
    customTimeEnd,
    fetchData,
    txSearchInputRef,
    cartRef,
  })

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

  // Payment status polling & NFC - extracted to usePaymentPolling hook
  const { nfcState } = usePaymentPolling({
    currentInvoice,
    triggerPaymentAnimation,
    posPaymentReceivedRef,
    fetchData,
    soundEnabled,
    soundTheme,
  })


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
          <TransactionsView
            transactions={transactions}
            filteredTransactions={filteredTransactions}
            activeBlinkAccount={activeBlinkAccount}
            activeNpubCashWallet={activeNpubCashWallet}
            activeNWC={activeNWC}
            dateFilterActive={dateFilterActive}
            selectedDateRange={selectedDateRange}
            pastTransactionsLoaded={pastTransactionsLoaded}
            isSearchingTx={isSearchingTx}
            isSearchLoading={isSearchLoading}
            txSearchQuery={txSearchQuery}
            txSearchInput={txSearchInput}
            txSearchInputRef={txSearchInputRef}
            loadingMore={loadingMore}
            hasMoreTransactions={hasMoreTransactions}
            expandedMonths={expandedMonths}
            setSelectedTransaction={setSelectedTransaction}
            setShowDateRangeSelector={setShowDateRangeSelector}
            setShowExportOptions={setShowExportOptions}
            setIsSearchingTx={setIsSearchingTx}
            setTxSearchInput={setTxSearchInput}
            handleClearDateFilter={handleClearDateFilter}
            handleTxSearchClick={handleTxSearchClick}
            handleTxSearchClose={handleTxSearchClose}
            handleTxSearchKeyDown={handleTxSearchKeyDown}
            handleTxSearchSubmit={handleTxSearchSubmit}
            loadMoreMonths={loadMoreMonths}
            toggleMonth={toggleMonth}
            getFilteredStats={getFilteredStats}
            getDisplayTransactions={getDisplayTransactions}
            getMonthGroups={getMonthGroups}
            filterTransactionsBySearch={filterTransactionsBySearch}
          />
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
