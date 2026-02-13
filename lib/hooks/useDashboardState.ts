/**
 * useDashboardState Hook
 *
 * A composer hook that combines all extracted Dashboard state hooks into a single,
 * cohesive interface. This hook provides a convenient way to access all Dashboard
 * state and actions without having to import and call each individual hook.
 *
 * This hook is designed to be a drop-in replacement for the scattered useState
 * calls in Dashboard.js, making the component cleaner and more maintainable.
 */

import { useMemo } from "react"

// Import all individual hooks
import {
  useAccountManagement,
  type UseAccountManagementReturn,
} from "./useAccountManagement"
import {
  useCommissionSettings,
  type UseCommissionSettingsReturn,
} from "./useCommissionSettings"
import { useDashboardUI, type UseDashboardUIReturn } from "./useDashboardUI"
import { useDisplaySettings, type UseDisplaySettingsReturn } from "./useDisplaySettings"
import { useExchangeRate, type UseExchangeRateReturn } from "./useExchangeRate"
import {
  useInvoiceState,
  type UseInvoiceStateReturn,
  type UseInvoiceStateOptions,
} from "./useInvoiceState"
import { usePaycodeState, type UsePaycodeStateReturn } from "./usePaycodeState"
import { usePWAInstall, type UsePWAInstallReturn } from "./usePWAInstall"
import { useSoundSettings, type UseSoundSettingsReturn } from "./useSoundSettings"
import { useSplitProfiles, type UseSplitProfilesReturn } from "./useSplitProfiles"
import { useThemeStyles, type ThemeStylesReturn } from "./useThemeStyles"
import { useTipSettings, type UseTipSettingsReturn } from "./useTipSettings"
import {
  useTransactionState,
  type UseTransactionStateReturn,
} from "./useTransactionState"
import {
  useViewNavigation,
  type UseViewNavigationReturn,
  type DashboardView,
} from "./useViewNavigation"
import {
  useVoucherWalletState,
  type UseVoucherWalletStateReturn,
} from "./useVoucherWalletState"
import {
  useWalletState,
  type UseWalletStateReturn,
  type UseWalletStateOptions,
} from "./useWalletState"

// ============================================================================
// Types
// ============================================================================

/**
 * Options for useDashboardState hook
 */
export interface UseDashboardStateOptions {
  /** Initial view to display */
  initialView?: DashboardView
  /** Invoice state options */
  invoice?: UseInvoiceStateOptions
  /** Wallet state options */
  wallet?: UseWalletStateOptions
}

/**
 * Combined return type for useDashboardState hook
 */
export interface UseDashboardStateReturn {
  // Theme styling utilities
  themeStyles: ThemeStylesReturn

  // UI visibility states
  ui: UseDashboardUIReturn

  // Account management (add/edit forms)
  accountManagement: UseAccountManagementReturn

  // Transaction history
  transactions: UseTransactionStateReturn

  // Voucher wallet state
  voucherWallet: UseVoucherWalletStateReturn

  // Split profiles
  splitProfiles: UseSplitProfilesReturn

  // Tip settings
  tipSettings: UseTipSettingsReturn

  // Commission settings
  commissionSettings: UseCommissionSettingsReturn

  // Sound settings
  soundSettings: UseSoundSettingsReturn

  // Display settings
  displaySettings: UseDisplaySettingsReturn

  // Paycode state
  paycode: UsePaycodeStateReturn

  // Exchange rate
  exchangeRate: UseExchangeRateReturn

  // PWA install
  pwaInstall: UsePWAInstallReturn

  // View navigation
  navigation: UseViewNavigationReturn

  // Invoice state
  invoice: UseInvoiceStateReturn

  // Wallet state
  wallet: UseWalletStateReturn
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Composer hook that combines all Dashboard state hooks
 *
 * @param options - Configuration options
 * @returns Combined state and actions from all hooks
 *
 * @example
 * ```tsx
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
 *   theme: 'dark',
 *   darkMode: true,
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
 * // Set an invoice
 * invoice.setCurrentInvoice({
 *   paymentRequest: 'lnbc...',
 *   paymentHash: 'abc123',
 *   satoshis: 1000
 * });
 * ```
 */
export function useDashboardState(
  options: UseDashboardStateOptions = {},
): UseDashboardStateReturn {
  const { initialView = "pos", invoice: invoiceOptions, wallet: walletOptions } = options

  // ===========================================================================
  // Initialize all hooks
  // ===========================================================================

  // Theme styling utilities (gets theme from useTheme internally)
  const themeStyles = useThemeStyles()

  // UI visibility states
  const ui = useDashboardUI()

  // Account management (add/edit forms)
  const accountManagement = useAccountManagement()

  // Transaction history
  const transactions = useTransactionState()

  // Voucher wallet state
  const voucherWallet = useVoucherWalletState()

  // Split profiles
  const splitProfiles = useSplitProfiles()

  // Tip settings
  const tipSettings = useTipSettings()

  // Commission settings
  const commissionSettings = useCommissionSettings()

  // Sound settings
  const soundSettings = useSoundSettings()

  // Display settings
  const displaySettings = useDisplaySettings()

  // Paycode state
  const paycode = usePaycodeState()

  // Exchange rate (no options, uses internal state)
  const exchangeRate = useExchangeRate()

  // PWA install
  const pwaInstall = usePWAInstall()

  // View navigation
  const navigation = useViewNavigation(initialView)

  // Invoice state
  const invoice = useInvoiceState(invoiceOptions)

  // Wallet state
  const wallet = useWalletState(walletOptions)

  // ===========================================================================
  // Memoized return object
  // ===========================================================================

  return useMemo(
    () => ({
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
    }),
    [
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
    ],
  )
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

// Re-export all hook types
export type {
  ThemeStylesReturn,
  UseDashboardUIReturn,
  UseAccountManagementReturn,
  UseTransactionStateReturn,
  UseVoucherWalletStateReturn,
  UseSplitProfilesReturn,
  UseTipSettingsReturn,
  UseCommissionSettingsReturn,
  UseSoundSettingsReturn,
  UseDisplaySettingsReturn,
  UsePaycodeStateReturn,
  UseExchangeRateReturn,
  UsePWAInstallReturn,
  UseViewNavigationReturn,
  UseInvoiceStateReturn,
  UseWalletStateReturn,
}

// Re-export specific types that might be needed
export type { DashboardView } from "./useViewNavigation"
export type { InvoiceData, PaymentReceivedData } from "./useInvoiceState"
export type { WalletInfo } from "./useWalletState"
export type {
  AccountType,
  NwcValidation,
  LnAddressValidation,
  NpubCashValidation,
} from "./useAccountManagement"
export type {
  Transaction,
  TransactionState,
  TransactionActions,
  DateRange,
} from "./useTransactionState"
export type { TipProfile } from "./useTipSettings"
export type { SplitProfile, SplitRecipient } from "./useSplitProfiles"

export default useDashboardState
