import { useEffect, useRef } from "react"
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
import { useNavigationHandlers } from "../lib/hooks/useNavigationHandlers"
import { useExchangeRate } from "../lib/hooks/useExchangeRate"
import { useWalletState } from "../lib/hooks/useWalletState"
import { useInvoiceState } from "../lib/hooks/useInvoiceState"
import PaymentAnimation from "./PaymentAnimation"
import DashboardViewSwitcher from "./DashboardViewSwitcher"
import KeyManagementOverlay from "./Settings/KeyManagementOverlay"
import BoltcardsOverlay from "./Settings/BoltcardsOverlay"
import BatchPaymentsOverlay from "./Settings/BatchPaymentsOverlay"
import NetworkOverlay from "./Settings/NetworkOverlay"

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

// Predefined Tip Profiles for different regions
interface TipProfile {
  id: string
  name: string
  tipOptions: number[]
}

const TIP_PROFILES: TipProfile[] = [
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
  } as any)

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
  } as any)

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
  } as any)

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
  } as any)

  // Transaction search ref (state is in useTransactionState hook)
  const txSearchInputRef = useRef<HTMLInputElement>(null)

  // Refs for keyboard navigation
  const posRef = useRef<any>(null)
  const voucherRef = useRef<any>(null)
  const multiVoucherRef = useRef<any>(null)
  const voucherManagerRef = useRef<any>(null)
  const cartRef = useRef<any>(null)

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
  const posPaymentReceivedRef = useRef<(() => void) | null>(null)

  // Dashboard data fetching - extracted to useDashboardData hook
  const { fetchData, fetchVoucherWalletBalance, getCapacityColor } = useDashboardData({
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
  } as any)

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
  } as any)

  // PWA Install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      // Stash the event so it can be triggered later
      setDeferredPrompt(e as any)
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
  } as any)

  // Navigation handlers (touch swipe + keyboard) - extracted to useNavigationHandlers hook
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useNavigationHandlers({
    currentView,
    handleViewTransition,
    showingInvoice,
    showingVoucherQR,
    isViewTransitioning,
    voucherWallet,
    sideMenuOpen,
    showAnimation,
    hideAnimation,
    posRef,
    voucherRef,
    multiVoucherRef,
    cartRef,
  } as any)

  const handleLogout = () => {
    logout()
  }

  // PWA install handler - delegates to usePWAInstall hook
  const handleInstallApp = async () => {
    await triggerInstall()
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
          authMode={authMode as any}
          nostrProfile={nostrProfile as any}
          user={user as any}
          activeNWC={activeNWC as any}
          activeNpubCashWallet={activeNpubCashWallet as any}
          activeBlinkAccount={activeBlinkAccount as any}
          voucherWallet={voucherWallet}
          theme={theme}
          displayCurrency={displayCurrency}
          numberFormat={numberFormat as any}
          activeSplitProfile={activeSplitProfile as any}
          activeTipProfile={activeTipProfile as any}
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
        <KeyManagementOverlay
          setShowKeyManagement={setShowKeyManagement}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
        />
      )}

      {/* Boltcards Overlay */}
      {showBoltcards && (
        <BoltcardsOverlay
          voucherWallet={voucherWallet as any}
          voucherWalletBtcId={voucherWalletBtcId as any}
          voucherWalletUsdId={voucherWalletUsdId as any}
          voucherWalletBalance={voucherWalletBalance as any}
          voucherWalletUsdBalance={voucherWalletUsdBalance as any}
          exchangeRate={exchangeRate as any}
          bitcoinFormat={bitcoinFormat as any}
          setShowBoltcards={setShowBoltcards}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
        />
      )}

      {/* Batch Payments Overlay */}
      {showBatchPayments && voucherWallet?.apiKey && (
        <BatchPaymentsOverlay
          voucherWallet={voucherWallet as any}
          darkMode={darkMode}
          setShowBatchPayments={setShowBatchPayments}
          setSideMenuOpen={setSideMenuOpen}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
        />
      )}

      {/* Circular Economy Network Overlay */}
      {showNetworkOverlay && (
        <NetworkOverlay
          publicKey={publicKey}
          nostrProfile={nostrProfile}
          darkMode={darkMode}
          theme={theme}
          cycleTheme={cycleTheme}
          setShowNetworkOverlay={setShowNetworkOverlay}
          setSideMenuOpen={setSideMenuOpen}
          setTransitionColorIndex={setTransitionColorIndex as any}
          setIsViewTransitioning={setIsViewTransitioning}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
        />
      )}

      {/* Paycodes Overlay */}
      {showPaycode && (activeBlinkAccount as any)?.username && (
        <PaycodesOverlay
          activeBlinkAccount={activeBlinkAccount as any}
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
          setSoundTheme={setSoundTheme as any}
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
          authMode={authMode as any}
          activeSplitProfile={activeSplitProfile}
          splitProfiles={splitProfiles}
          splitProfilesLoading={splitProfilesLoading}
          isBlinkClassic={isBlinkClassic}
          isBlinkClassicDark={isBlinkClassicDark}
          isBlinkClassicLight={isBlinkClassicLight}
          setShowTipSettings={setShowTipSettings}
          setShowCreateSplitProfile={setShowCreateSplitProfile}
          setActiveSplitProfileById={setActiveSplitProfileById}
          setEditingSplitProfile={setEditingSplitProfile as any}
          setNewSplitProfileLabel={setNewSplitProfileLabel}
          setNewSplitProfileRecipients={setNewSplitProfileRecipients as any}
          setNewRecipientInput={setNewRecipientInput}
          setRecipientValidation={setRecipientValidation as any}
          setSplitProfileError={setSplitProfileError}
          setUseCustomWeights={setUseCustomWeights}
          deleteSplitProfile={deleteSplitProfile as any}
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
          setEditingSplitProfile={setEditingSplitProfile as any}
          setNewSplitProfileLabel={setNewSplitProfileLabel}
          setNewSplitProfileRecipients={setNewSplitProfileRecipients as any}
          setNewRecipientInput={setNewRecipientInput}
          setRecipientValidation={setRecipientValidation as any}
          setSplitProfileError={setSplitProfileError}
          setUseCustomWeights={setUseCustomWeights}
          addRecipientToProfile={addRecipientToProfile}
          removeRecipientFromProfile={removeRecipientFromProfile}
          saveSplitProfile={saveSplitProfile as any}
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
          setDisplayCurrency={setDisplayCurrency as any}
          setShowCurrencySettings={setShowCurrencySettings}
          setCurrencyFilter={setCurrencyFilter}
          getAllCurrencies={getAllCurrencies as any}
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
          numberFormat={numberFormat as any}
          bitcoinFormat={bitcoinFormat as any}
          numpadLayout={numpadLayout as any}
          setNumberFormat={setNumberFormat as any}
          setBitcoinFormat={setBitcoinFormat as any}
          setNumpadLayout={setNumpadLayout as any}
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
          authMode={authMode as any}
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
          blinkAccounts={blinkAccounts as any}
          nwcConnections={nwcConnections as any}
          npubCashWallets={npubCashWallets as any}
          activeNWC={activeNWC as any}
          activeBlinkAccount={activeBlinkAccount as any}
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
          setNewAccountType={setNewAccountType as any}
          setAddAccountError={setAddAccountError}
          setNwcValidated={setNwcValidated}
          setLnAddressValidated={setLnAddressValidated}
          setConfirmDeleteWallet={setConfirmDeleteWallet as any}
          setAddAccountLoading={setAddAccountLoading}
          setLnAddressValidating={setLnAddressValidating}
          setNwcValidating={setNwcValidating}
          setNpubCashValidated={setNpubCashValidated as any}
          setNpubCashValidating={setNpubCashValidating}
          setNewNpubCashAddress={setNewNpubCashAddress}
          setActiveBlinkAccount={setActiveBlinkAccount as any}
          setActiveNWC={setActiveNWC as any}
          setEditingWalletLabel={setEditingWalletLabel as any}
          setEditedWalletLabel={setEditedWalletLabel}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          getWalletCardActiveClasses={getWalletCardActiveClasses as any}
          getWalletCardClasses={getWalletCardClasses}
          getWalletIconClasses={getWalletIconClasses as any}
          getWalletActiveBadgeClasses={getWalletActiveBadgeClasses as any}
          getWalletUseButtonClasses={getWalletUseButtonClasses as any}
          getSecondaryTextClasses={getSecondaryTextClasses}
          getInputClasses={getInputClasses}
          addBlinkAccount={addBlinkAccount as any}
          storeBlinkAccountOnServer={storeBlinkAccountOnServer as any}
          addBlinkLnAddressWallet={addBlinkLnAddressWallet as any}
          addNWCConnection={addNWCConnection as any}
          addNpubCashWallet={addNpubCashWallet as any}
          removeBlinkAccount={removeBlinkAccount}
          removeNWCConnection={removeNWCConnection}
          updateBlinkAccount={updateBlinkAccount as any}
          updateNWCConnection={updateNWCConnection as any}
        />
      )}

      {/* Voucher Wallet Overlay */}
      {showVoucherWalletSettings && (
        <VoucherWalletOverlay
          darkMode={darkMode}
          voucherWallet={voucherWallet as any}
          voucherWalletBalance={voucherWalletBalance}
          voucherWalletUsdBalance={voucherWalletUsdBalance}
          voucherWalletBalanceLoading={voucherWalletBalanceLoading}
          voucherWalletApiKey={voucherWalletApiKey}
          voucherWalletLabel={voucherWalletLabel}
          voucherWalletLoading={voucherWalletLoading}
          voucherWalletValidating={voucherWalletValidating}
          voucherWalletScopes={voucherWalletScopes as any}
          voucherWalletError={voucherWalletError}
          editingWalletLabel={editingWalletLabel}
          editedWalletLabel={editedWalletLabel}
          numberFormat={numberFormat as any}
          publicKey={publicKey}
          setShowVoucherWalletSettings={setShowVoucherWalletSettings}
          setVoucherWalletApiKey={setVoucherWalletApiKey}
          setVoucherWalletLabel={setVoucherWalletLabel}
          setVoucherWalletError={setVoucherWalletError}
          setVoucherWalletScopes={setVoucherWalletScopes as any}
          setVoucherWallet={setVoucherWallet as any}
          setVoucherWalletLoading={setVoucherWalletLoading}
          setVoucherWalletValidating={setVoucherWalletValidating}
          setEditingWalletLabel={setEditingWalletLabel as any}
          setEditedWalletLabel={setEditedWalletLabel}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          fetchVoucherWalletBalance={fetchVoucherWalletBalance}
          getVoucherWalletKey={getVoucherWalletKey}
          syncVoucherWalletToServer={syncVoucherWalletToServer as any}
        />
      )}

      {/* Export Options Overlay */}
      {showExportOptions && (
        <ExportOptionsOverlay
          exportingData={exportingData}
          dateFilterActive={dateFilterActive}
          filteredTransactions={filteredTransactions}
          selectedDateRange={selectedDateRange}
          user={user as any}
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
          activeNWC={activeNWC as any}
          activeNpubCashWallet={activeNpubCashWallet as any}
          activeBlinkAccount={activeBlinkAccount as any}
          voucherExpiry={voucherExpiry}
          activeSplitProfile={activeSplitProfile as any}
          voucherWalletBalanceLoading={voucherWalletBalanceLoading}
          isBlinkClassic={isBlinkClassic}
          currentVoucherCurrencyMode={currentVoucherCurrencyMode}
          currentAmountInUsdCents={currentAmountInUsdCents}
          currentAmountInSats={currentAmountInSats}
          voucherWalletUsdBalance={voucherWalletUsdBalance as any}
          voucherWalletBalance={voucherWalletBalance as any}
          setShowVoucherWalletSettings={setShowVoucherWalletSettings}
          setShowAccountSettings={setShowAccountSettings}
          setVoucherExpiry={setVoucherExpiry as any}
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
        <DashboardViewSwitcher
          currentView={currentView}
          displayCurrency={displayCurrency}
          numberFormat={numberFormat as any}
          bitcoinFormat={bitcoinFormat as any}
          numpadLayout={numpadLayout as any}
          currencies={currencies as any}
          darkMode={darkMode}
          theme={theme}
          cycleTheme={cycleTheme}
          soundEnabled={soundEnabled}
          exchangeRate={exchangeRate as any}
          isViewTransitioning={isViewTransitioning}
          setTransitionColorIndex={setTransitionColorIndex as any}
          setIsViewTransitioning={setIsViewTransitioning}
          cartRef={cartRef}
          publicKey={publicKey as any}
          setCartCheckoutData={setCartCheckoutData}
          handleViewTransition={handleViewTransition}
          posRef={posRef}
          apiKey={apiKey as any}
          user={user as any}
          wallets={wallets}
          posPaymentReceivedRef={posPaymentReceivedRef}
          connected={connected}
          manualReconnect={manualReconnect}
          reconnectAttempts={reconnectAttempts}
          tipsEnabled={tipsEnabled}
          tipPresets={tipPresets}
          activeSplitProfile={activeSplitProfile as any}
          setShowingInvoice={setShowingInvoice}
          setCurrentInvoice={setCurrentInvoice as any}
          nfcState={nfcState as any}
          activeNWC={activeNWC as any}
          nwcClientReady={nwcClientReady}
          nwcMakeInvoice={nwcMakeInvoice}
          nwcLookupInvoice={nwcLookupInvoice}
          getActiveNWCUri={getActiveNWCUri as any}
          activeBlinkAccount={activeBlinkAccount as any}
          activeNpubCashWallet={activeNpubCashWallet as any}
          cartCheckoutData={cartCheckoutData}
          triggerPaymentAnimation={triggerPaymentAnimation as any}
          voucherWallet={voucherWallet}
          voucherCurrencyMode={voucherCurrencyMode}
          voucherWalletBalance={voucherWalletBalance as any}
          voucherWalletUsdBalance={voucherWalletUsdBalance as any}
          commissionEnabled={commissionEnabled}
          commissionPresets={commissionPresets}
          voucherWalletUsdId={voucherWalletUsdId}
          setVoucherCurrencyMode={setVoucherCurrencyMode as any}
          usdExchangeRate={usdExchangeRate as any}
          voucherExpiry={voucherExpiry}
          voucherRef={voucherRef}
          setShowingVoucherQR={setShowingVoucherQR}
          multiVoucherRef={multiVoucherRef}
          voucherManagerRef={voucherManagerRef}
          transactions={transactions}
          filteredTransactions={filteredTransactions}
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
          setSelectedTransaction={setSelectedTransaction as any}
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
          getFilteredStats={getFilteredStats as any}
          getDisplayTransactions={getDisplayTransactions}
          getMonthGroups={getMonthGroups as any}
          filterTransactionsBySearch={filterTransactionsBySearch as any}
        />
      </main>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <TransactionDetail
          transaction={selectedTransaction as any}
          onClose={() => setSelectedTransaction(null)}
          darkMode={darkMode}
          onLabelChange={triggerLabelUpdate}
        />
      )}

      {/* Settings Modal */}
    </div>
  )
}
