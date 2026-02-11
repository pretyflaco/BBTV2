import POS from "./POS"
import Voucher from "./Voucher"
import MultiVoucher from "./MultiVoucher"
import VoucherManager from "./VoucherManager"
import ItemCart from "./ItemCart"
import TransactionsView from "./TransactionsView"
import { SPINNER_COLORS } from "../lib/hooks/useViewNavigation"

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
}) {
  // Shared transition handler for views that support internal transitions
  const onInternalTransition = () => {
    setTransitionColorIndex((prev) => (prev + 1) % SPINNER_COLORS.length)
    setIsViewTransitioning(true)
    setTimeout(() => setIsViewTransitioning(false), 120)
  }

  const voucherCurrencyToggle = voucherWalletUsdId
    ? () => setVoucherCurrencyMode((prev) => (prev === "BTC" ? "USD" : "BTC"))
    : null

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
          onCheckout={(checkoutData) => {
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
        onInvoiceChange={(invoiceData) => {
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
