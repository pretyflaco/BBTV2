/**
 * Dashboard Hooks Index
 * 
 * Re-exports all extracted Dashboard hooks for convenient importing.
 * 
 * @example
 * // Import specific hooks
 * import { useViewNavigation, useInvoiceState } from '../lib/hooks';
 * 
 * // Import the composer hook
 * import { useDashboardState } from '../lib/hooks';
 * 
 * // Import types
 * import type { DashboardView, Transaction } from '../lib/hooks';
 */

// =============================================================================
// Core Hooks
// =============================================================================

// Theme styling utilities
export { useThemeStyles } from './useThemeStyles';
export type { ThemeStylesReturn, ThemeType } from './useThemeStyles';

// Dashboard UI visibility states
export { useDashboardUI } from './useDashboardUI';
export type { UseDashboardUIReturn } from './useDashboardUI';

// Account management
export { useAccountManagement } from './useAccountManagement';
export type {
  UseAccountManagementReturn,
  AccountType,
  NwcValidation,
  LnAddressValidation,
  NpubCashValidation,
} from './useAccountManagement';

// Transaction state
export { useTransactionState } from './useTransactionState';
export type {
  UseTransactionStateReturn,
  Transaction,
  TransactionState,
  TransactionActions,
  DateRange,
} from './useTransactionState';

// Voucher wallet state
export { useVoucherWalletState } from './useVoucherWalletState';
export type { UseVoucherWalletStateReturn } from './useVoucherWalletState';

// Split profiles
export { useSplitProfiles } from './useSplitProfiles';
export type {
  UseSplitProfilesReturn,
  SplitProfile,
  SplitRecipient,
} from './useSplitProfiles';

// Tip settings
export { useTipSettings } from './useTipSettings';
export type {
  UseTipSettingsReturn,
  TipPreset,
  TipProfile,
} from './useTipSettings';

// Commission settings
export { useCommissionSettings } from './useCommissionSettings';
export type { UseCommissionSettingsReturn } from './useCommissionSettings';

// Sound settings
export { useSoundSettings } from './useSoundSettings';
export type { UseSoundSettingsReturn } from './useSoundSettings';

// Display settings
export { useDisplaySettings } from './useDisplaySettings';
export type { UseDisplaySettingsReturn } from './useDisplaySettings';

// Paycode state
export { usePaycodeState } from './usePaycodeState';
export type { UsePaycodeStateReturn } from './usePaycodeState';

// Exchange rate
export { useExchangeRate } from './useExchangeRate';
export type {
  UseExchangeRateReturn,
  ExchangeRateData,
} from './useExchangeRate';

// PWA install
export { usePWAInstall } from './usePWAInstall';
export type { UsePWAInstallReturn } from './usePWAInstall';

// View navigation
export {
  useViewNavigation,
  SPINNER_COLORS,
  DEFAULT_TRANSITION_DELAY,
  FIXED_VIEWS,
  VOUCHER_VIEWS,
} from './useViewNavigation';
export type {
  UseViewNavigationReturn,
  DashboardView,
  CartCheckoutData,
} from './useViewNavigation';

// Invoice state
export { useInvoiceState } from './useInvoiceState';
export type {
  UseInvoiceStateReturn,
  UseInvoiceStateOptions,
  InvoiceData,
  PaymentReceivedData,
} from './useInvoiceState';

// Wallet state
export { useWalletState } from './useWalletState';
export type {
  UseWalletStateReturn,
  UseWalletStateOptions,
  WalletInfo,
} from './useWalletState';

// =============================================================================
// Composer Hook
// =============================================================================

// Combined dashboard state (imports all hooks above)
export { useDashboardState } from './useDashboardState';
export type {
  UseDashboardStateReturn,
  UseDashboardStateOptions,
} from './useDashboardState';
