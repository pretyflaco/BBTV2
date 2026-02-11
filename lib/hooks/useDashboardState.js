/**
 * useDashboardState Hook
 * 
 * A composer hook that combines all extracted Dashboard state hooks into a single,
 * cohesive interface. This hook provides a convenient way to access all Dashboard
 * state and actions without having to import and call each individual hook.
 * 
 * This hook is designed to be a drop-in replacement for the scattered useState
 * calls in Dashboard.js, making the component cleaner and more maintainable.
 * 
 * @module lib/hooks/useDashboardState
 */

import { useMemo } from 'react';

// Import all individual hooks
import { useThemeStyles } from './useThemeStyles';
import { useDashboardUI } from './useDashboardUI';
import { useAccountManagement } from './useAccountManagement';
import { useTransactionState } from './useTransactionState';
import { useVoucherWalletState } from './useVoucherWalletState';
import { useSplitProfiles } from './useSplitProfiles';
import { useTipSettings } from './useTipSettings';
import { useCommissionSettings } from './useCommissionSettings';
import { useSoundSettings } from './useSoundSettings';
import { useDisplaySettings } from './useDisplaySettings';
import { usePaycodeState } from './usePaycodeState';
import { useExchangeRate } from './useExchangeRate';
import { usePWAInstall } from './usePWAInstall';
import { useViewNavigation } from './useViewNavigation';
import { useInvoiceState } from './useInvoiceState';
import { useWalletState } from './useWalletState';

/**
 * @typedef {import('./useViewNavigation').DashboardView} DashboardView
 * @typedef {import('./useInvoiceState').UseInvoiceStateOptions} UseInvoiceStateOptions
 * @typedef {import('./useWalletState').UseWalletStateOptions} UseWalletStateOptions
 */

/**
 * @typedef {Object} UseDashboardStateOptions
 * @property {DashboardView} [initialView='pos'] - Initial view to display
 * @property {UseInvoiceStateOptions} [invoice] - Invoice state options
 * @property {UseWalletStateOptions} [wallet] - Wallet state options
 */

/**
 * @typedef {Object} UseDashboardStateReturn
 * @property {import('./useThemeStyles').ThemeStylesReturn} themeStyles - Theme styling utilities
 * @property {import('./useDashboardUI').UseDashboardUIReturn} ui - UI visibility states
 * @property {import('./useAccountManagement').UseAccountManagementReturn} accountManagement - Account management state
 * @property {import('./useTransactionState').UseTransactionStateReturn} transactions - Transaction history state
 * @property {import('./useVoucherWalletState').UseVoucherWalletStateReturn} voucherWallet - Voucher wallet state
 * @property {import('./useSplitProfiles').UseSplitProfilesReturn} splitProfiles - Split profiles state
 * @property {import('./useTipSettings').UseTipSettingsReturn} tipSettings - Tip settings state
 * @property {import('./useCommissionSettings').UseCommissionSettingsReturn} commissionSettings - Commission settings state
 * @property {import('./useSoundSettings').UseSoundSettingsReturn} soundSettings - Sound settings state
 * @property {import('./useDisplaySettings').UseDisplaySettingsReturn} displaySettings - Display settings state
 * @property {import('./usePaycodeState').UsePaycodeStateReturn} paycode - Paycode state
 * @property {import('./useExchangeRate').UseExchangeRateReturn} exchangeRate - Exchange rate state
 * @property {import('./usePWAInstall').UsePWAInstallReturn} pwaInstall - PWA install state
 * @property {import('./useViewNavigation').UseViewNavigationReturn} navigation - View navigation state
 * @property {import('./useInvoiceState').UseInvoiceStateReturn} invoice - Invoice state
 * @property {import('./useWalletState').UseWalletStateReturn} wallet - Wallet state
 */

/**
 * Composer hook that combines all Dashboard state hooks
 * 
 * @param {UseDashboardStateOptions} [options={}] - Configuration options
 * @returns {UseDashboardStateReturn} Combined state and actions from all hooks
 * 
 * @example
 * const {
 *   themeStyles,
 *   ui,
 *   navigation,
 *   invoice,
 *   wallet,
 *   displaySettings,
 *   soundSettings,
 *   // ... other states
 * } = useDashboardState({
 *   initialView: 'pos',
 *   wallet: {
 *     getApiKey: authContext.getApiKey,
 *     environment: 'mainnet'
 *   }
 * });
 * 
 * // Access theme styling
 * const menuClasses = themeStyles.getMenuTileClasses();
 * 
 * // Navigate to a view
 * navigation.navigateToView('transactions');
 * 
 * // Create an invoice
 * invoice.createInvoice({
 *   paymentRequest: 'lnbc...',
 *   paymentHash: 'abc123',
 *   satoshis: 1000
 * });
 */
export function useDashboardState(options = {}) {
  const {
    initialView = 'pos',
    invoice: invoiceOptions,
    wallet: walletOptions,
  } = options;

  // ===========================================================================
  // Initialize all hooks
  // ===========================================================================
  
  // Theme styling utilities (gets theme from useTheme internally)
  const themeStyles = useThemeStyles();
  
  // UI visibility states
  const ui = useDashboardUI();
  
  // Account management (add/edit forms)
  const accountManagement = useAccountManagement();
  
  // Transaction history
  const transactions = useTransactionState();
  
  // Voucher wallet state
  const voucherWallet = useVoucherWalletState();
  
  // Split profiles
  const splitProfiles = useSplitProfiles();
  
  // Tip settings
  const tipSettings = useTipSettings();
  
  // Commission settings
  const commissionSettings = useCommissionSettings();
  
  // Sound settings
  const soundSettings = useSoundSettings();
  
  // Display settings
  const displaySettings = useDisplaySettings();
  
  // Paycode state
  const paycode = usePaycodeState();
  
  // Exchange rate (no options, uses internal state)
  const exchangeRate = useExchangeRate();
  
  // PWA install
  const pwaInstall = usePWAInstall();
  
  // View navigation
  const navigation = useViewNavigation(initialView);
  
  // Invoice state
  const invoice = useInvoiceState(invoiceOptions);
  
  // Wallet state
  const wallet = useWalletState(walletOptions);

  // ===========================================================================
  // Memoized return object
  // ===========================================================================
  
  return useMemo(() => ({
    themeStyles,
    ui,
    accountManagement,
    transactions,
    voucherWallet,
    splitProfiles,
    tipSettings,
    commissionSettings,
    soundSettings,
    displaySettings,
    paycode,
    exchangeRate,
    pwaInstall,
    navigation,
    invoice,
    wallet,
  }), [
    themeStyles,
    ui,
    accountManagement,
    transactions,
    voucherWallet,
    splitProfiles,
    tipSettings,
    commissionSettings,
    soundSettings,
    displaySettings,
    paycode,
    exchangeRate,
    pwaInstall,
    navigation,
    invoice,
    wallet,
  ]);
}

export default useDashboardState;
