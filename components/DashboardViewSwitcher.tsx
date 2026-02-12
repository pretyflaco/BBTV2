import React from "react"
import POS from "./POS"
import type { POSRef } from "./POS"
import Voucher from "./Voucher"
import type { VoucherHandle } from "./Voucher"
import MultiVoucher from "./MultiVoucher"
import type { MultiVoucherHandle } from "./MultiVoucher"
import VoucherManager from "./VoucherManager"
import type { VoucherManagerRef } from "./VoucherManager"
import ItemCart, { type ItemCartHandle } from "./ItemCart"
import TransactionsView from "./TransactionsView"
import type { TransactionRecord } from "./TransactionDetail"
import { SPINNER_COLORS } from "../lib/hooks/useViewNavigation"
import type { DashboardView, CartCheckoutData } from "../lib/hooks/useViewNavigation"
import type { FilteredStats, MonthGroup } from "../lib/hooks/useTransactionActions"
import type { DateRange } from "../lib/hooks/useTransactionState"
import type { Theme } from "../lib/hooks/useTheme"
import type {
  NumberFormatPreference,
  BitcoinFormatPreference,
  NumpadLayoutPreference,
} from "../lib/number-format"
import type { SoundThemeName } from "../lib/audio-utils"
import type { CurrencyMetadata } from "../lib/currency-utils"
import type { ExchangeRateData } from "../lib/hooks/useExchangeRate"
import type { User } from "../lib/hooks/useAuth"

// ============================================================================
// Shared local types for wallet/connection shapes
// ============================================================================

interface BlinkAccount {
  label?: string
  username?: string
  [key: string]: unknown
}

interface NWCConnection {
  label: string
  [key: string]: unknown
}

interface NpubCashWallet {
  label?: string
  lightningAddress?: string
  [key: string]: unknown
}

interface VoucherWallet {
  label?: string
  username?: string
  apiKey?: string
  walletId?: string
  [key: string]: unknown
}

interface SplitProfile {
  label: string
  recipients: Array<Record<string, unknown>>
  [key: string]: unknown
}

interface NFCState {
  isNfcSupported: boolean
  hasNFCPermission: boolean
  isProcessing: boolean
  activateNfcScan: () => Promise<void>
}

type VoucherCurrencyMode = "BTC" | "USD"

// ============================================================================
// Component Props
// ============================================================================

interface DashboardViewSwitcherProps {
  currentView: DashboardView
  // Shared display props
  displayCurrency: string
  numberFormat: NumberFormatPreference
  bitcoinFormat: BitcoinFormatPreference
  numpadLayout: NumpadLayoutPreference
  currencies: CurrencyMetadata[]
  darkMode: boolean
  theme: Theme
  cycleTheme: () => void
  soundEnabled: boolean
  exchangeRate: ExchangeRateData | null
  // View transition
  isViewTransitioning: boolean
  setTransitionColorIndex: React.Dispatch<React.SetStateAction<number>>
  setIsViewTransitioning: (transitioning: boolean) => void
  // Cart props
  cartRef: React.RefObject<ItemCartHandle>
  publicKey: string
  setCartCheckoutData: (data: CartCheckoutData | null) => void
  handleViewTransition: (view: DashboardView) => void
  // POS props
  posRef: React.RefObject<POSRef>
  apiKey: string
  user: User | null
  wallets: unknown[]
  posPaymentReceivedRef: React.MutableRefObject<(() => void) | null>
  connected: boolean
  manualReconnect: () => void
  reconnectAttempts: number
  tipsEnabled: boolean
  tipPresets: number[]
  activeSplitProfile: SplitProfile | null
  setShowingInvoice: (showing: boolean) => void
  setCurrentInvoice: (invoice: unknown) => void
  nfcState: NFCState
  activeNWC: NWCConnection | null
  nwcClientReady: boolean
  nwcMakeInvoice: (params: unknown) => Promise<unknown>
  nwcLookupInvoice: (params: unknown) => Promise<unknown>
  getActiveNWCUri: () => string | null
  activeBlinkAccount: BlinkAccount | null
  activeNpubCashWallet: NpubCashWallet | null
  cartCheckoutData: CartCheckoutData | null
  triggerPaymentAnimation: (payment: unknown) => void
  // Voucher shared props
  voucherWallet: VoucherWallet | null
  voucherCurrencyMode: VoucherCurrencyMode
  voucherWalletBalance: number
  voucherWalletUsdBalance: number
  commissionEnabled: boolean
  commissionPresets: number[]
  voucherWalletUsdId: string | null
  setVoucherCurrencyMode: React.Dispatch<React.SetStateAction<VoucherCurrencyMode>>
  usdExchangeRate: ExchangeRateData | null
  voucherExpiry: string
  // Voucher-specific
  voucherRef: React.RefObject<VoucherHandle>
  setShowingVoucherQR: (showing: boolean) => void
  // MultiVoucher-specific
  multiVoucherRef: React.RefObject<MultiVoucherHandle>
  // VoucherManager-specific
  voucherManagerRef: React.RefObject<VoucherManagerRef>
  // Transactions view
  transactions: TransactionRecord[]
  filteredTransactions: TransactionRecord[]
  dateFilterActive: boolean
  selectedDateRange: DateRange | null
  pastTransactionsLoaded: boolean
  isSearchingTx: boolean
  isSearchLoading: boolean
  txSearchQuery: string
  txSearchInput: string
  txSearchInputRef: React.RefObject<HTMLInputElement>
  loadingMore: boolean
  hasMoreTransactions: boolean
  expandedMonths: Set<string>
  setSelectedTransaction: (tx: TransactionRecord | null) => void
  setShowDateRangeSelector: (show: boolean) => void
  setShowExportOptions: (show: boolean) => void
  setIsSearchingTx: (searching: boolean) => void
  setTxSearchInput: (input: string) => void
  handleClearDateFilter: () => void
  handleTxSearchClick: () => void
  handleTxSearchClose: () => void
  handleTxSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  handleTxSearchSubmit: () => void
  loadMoreMonths: () => void
  toggleMonth: (monthKey: string) => void
  getFilteredStats: () => FilteredStats
  getDisplayTransactions: () => TransactionRecord[]
  getMonthGroups: () => Record<string, MonthGroup>
  filterTransactionsBySearch: (
    txs: TransactionRecord[],
    query: string,
  ) => TransactionRecord[]
}

export default function DashboardViewSwitcher({
  currentView,
  // Shared display props
  displayCurrency,
  numberFormat,
  bitcoinFormat,
  numpadLayout,
  currencies,
  darkMode,
  theme,
  cycleTheme,
  soundEnabled,
  exchangeRate,
  // View transition
  isViewTransitioning,
  setTransitionColorIndex,
  setIsViewTransitioning,
  // Cart props
  cartRef,
  publicKey,
  setCartCheckoutData,
  handleViewTransition,
  // POS props
  posRef,
  apiKey,
  user,
  wallets,
  posPaymentReceivedRef,
  connected,
  manualReconnect,
  reconnectAttempts,
  tipsEnabled,
  tipPresets,
  activeSplitProfile,
  setShowingInvoice,
  setCurrentInvoice,
  nfcState,
  activeNWC,
  nwcClientReady,
  nwcMakeInvoice,
  nwcLookupInvoice,
  getActiveNWCUri,
  activeBlinkAccount,
  activeNpubCashWallet,
  cartCheckoutData,
  triggerPaymentAnimation,
  // Voucher shared props
  voucherWallet,
  voucherCurrencyMode,
  voucherWalletBalance,
  voucherWalletUsdBalance,
  commissionEnabled,
  commissionPresets,
  voucherWalletUsdId,
  setVoucherCurrencyMode,
  usdExchangeRate,
  voucherExpiry,
  // Voucher-specific
  voucherRef,
  setShowingVoucherQR,
  // MultiVoucher-specific
  multiVoucherRef,
  // VoucherManager-specific
  voucherManagerRef,
  // Transactions view
  transactions,
  filteredTransactions,
  dateFilterActive,
  selectedDateRange,
  pastTransactionsLoaded,
  isSearchingTx,
  isSearchLoading,
  txSearchQuery,
  txSearchInput,
  txSearchInputRef,
  loadingMore,
  hasMoreTransactions,
  expandedMonths,
  setSelectedTransaction,
  setShowDateRangeSelector,
  setShowExportOptions,
  setIsSearchingTx,
  setTxSearchInput,
  handleClearDateFilter,
  handleTxSearchClick,
  handleTxSearchClose,
  handleTxSearchKeyDown,
  handleTxSearchSubmit,
  loadMoreMonths,
  toggleMonth,
  getFilteredStats,
  getDisplayTransactions,
  getMonthGroups,
  filterTransactionsBySearch,
}: DashboardViewSwitcherProps) {
  // Shared transition handler for views that support internal transitions
  const onInternalTransition = () => {
    setTransitionColorIndex((prev: number) => (prev + 1) % SPINNER_COLORS.length)
    setIsViewTransitioning(true)
    setTimeout(() => setIsViewTransitioning(false), 120)
  }

  const voucherCurrencyToggle = voucherWalletUsdId
    ? () =>
        setVoucherCurrencyMode((prev: VoucherCurrencyMode) =>
          prev === "BTC" ? "USD" : "BTC",
        )
    : undefined

  const walletBalance =
    voucherCurrencyMode === "USD" ? voucherWalletUsdBalance : voucherWalletBalance

  if (currentView === "cart") {
    return (
      <div className="h-[calc(100vh-180px)] min-h-[400px]">
        <ItemCart
          ref={cartRef}
          displayCurrency={displayCurrency}
          numberFormat={numberFormat}
          bitcoinFormat={bitcoinFormat}
          currencies={currencies}
          publicKey={publicKey}
          onCheckout={(checkoutData: CartCheckoutData) => {
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
    )
  }

  if (currentView === "pos") {
    return (
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
        onInvoiceChange={(invoiceData: unknown) => {
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
        onInternalTransition={onInternalTransition}
        triggerPaymentAnimation={triggerPaymentAnimation}
      />
    )
  }

  if (currentView === "multivoucher") {
    return (
      <div className="h-[calc(100vh-180px)] min-h-[400px]">
        <MultiVoucher
          ref={multiVoucherRef}
          voucherWallet={voucherWallet}
          walletBalance={walletBalance}
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
          onVoucherCurrencyToggle={voucherCurrencyToggle}
          usdExchangeRate={usdExchangeRate}
          usdWalletId={voucherWalletUsdId}
          initialExpiry={voucherExpiry}
          onInternalTransition={onInternalTransition}
        />
      </div>
    )
  }

  if (currentView === "voucher") {
    return (
      <Voucher
        ref={voucherRef}
        voucherWallet={voucherWallet}
        walletBalance={walletBalance}
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
        onVoucherCurrencyToggle={voucherCurrencyToggle}
        usdExchangeRate={usdExchangeRate}
        usdWalletId={voucherWalletUsdId}
        initialExpiry={voucherExpiry}
        onInternalTransition={onInternalTransition}
      />
    )
  }

  if (currentView === "vouchermanager") {
    return (
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
          onInternalTransition={onInternalTransition}
        />
      </div>
    )
  }

  // Default: transactions view
  return (
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
  )
}
