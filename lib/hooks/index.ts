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
export { useThemeStyles } from "./useThemeStyles"
export type { ThemeStylesReturn, ThemeType } from "./useThemeStyles"

// Dashboard UI visibility states (full version with navigation)
export { useDashboardUI } from "./useDashboardUI"
export type { UseDashboardUIReturn } from "./useDashboardUI"

// UI visibility states (slim version without navigation)
export { useUIVisibility } from "./useUIVisibility"
export type {
  UseUIVisibilityReturn,
  UIVisibilityState,
  UIVisibilityActions,
} from "./useUIVisibility"

// Account management
export { useAccountManagement } from "./useAccountManagement"
export type {
  UseAccountManagementReturn,
  AccountType,
  NwcValidation,
  LnAddressValidation,
  NpubCashValidation,
} from "./useAccountManagement"

// Transaction state
export { useTransactionState } from "./useTransactionState"
export type {
  UseTransactionStateReturn,
  Transaction,
  TransactionState,
  TransactionActions,
  DateRange,
} from "./useTransactionState"

// Voucher wallet state
export { useVoucherWalletState } from "./useVoucherWalletState"
export type { UseVoucherWalletStateReturn } from "./useVoucherWalletState"

// Split profiles
export { useSplitProfiles } from "./useSplitProfiles"
export type {
  UseSplitProfilesReturn,
  SplitProfile,
  SplitRecipient,
} from "./useSplitProfiles"

// Tip settings
export { useTipSettings } from "./useTipSettings"
export type { UseTipSettingsReturn, TipProfile } from "./useTipSettings"

// Commission settings
export { useCommissionSettings } from "./useCommissionSettings"
export type { UseCommissionSettingsReturn } from "./useCommissionSettings"

// Sound settings
export { useSoundSettings } from "./useSoundSettings"
export type { UseSoundSettingsReturn } from "./useSoundSettings"

// Display settings
export { useDisplaySettings } from "./useDisplaySettings"
export type { UseDisplaySettingsReturn } from "./useDisplaySettings"

// Paycode state
export { usePaycodeState } from "./usePaycodeState"
export type { UsePaycodeStateReturn } from "./usePaycodeState"

// Exchange rate
export { useExchangeRate } from "./useExchangeRate"
export type { UseExchangeRateReturn, ExchangeRateData } from "./useExchangeRate"

// PWA install
export { usePWAInstall } from "./usePWAInstall"
export type { UsePWAInstallReturn } from "./usePWAInstall"

// View navigation
export {
  useViewNavigation,
  SPINNER_COLORS,
  DEFAULT_TRANSITION_DELAY,
  FIXED_VIEWS,
  VOUCHER_VIEWS,
} from "./useViewNavigation"
export type {
  UseViewNavigationReturn,
  DashboardView,
  CartCheckoutData,
} from "./useViewNavigation"

// Invoice state
export { useInvoiceState } from "./useInvoiceState"
export type {
  UseInvoiceStateReturn,
  UseInvoiceStateOptions,
  InvoiceData,
  PaymentReceivedData,
} from "./useInvoiceState"

// Wallet state
export { useWalletState } from "./useWalletState"
export type {
  UseWalletStateReturn,
  UseWalletStateOptions,
  WalletInfo,
} from "./useWalletState"

// =============================================================================
// Composer Hook
// =============================================================================

// Combined dashboard state (imports all hooks above)
export { useDashboardState } from "./useDashboardState"
export type {
  UseDashboardStateReturn,
  UseDashboardStateOptions,
} from "./useDashboardState"

// =============================================================================
// Auth & Profile Hooks (Phase 4 migrations)
// =============================================================================

// Auth context provider
export { AuthProvider, useAuth } from "./useAuth"

// Nostr authentication
export { NostrAuthProvider, useNostrAuth } from "./useNostrAuth"

// Profile management
export { ProfileProvider, useProfile } from "./useProfile"

// NWC (Nostr Wallet Connect)
export { useNWC } from "./useNWC"

// Combined auth
export { useCombinedAuth } from "./useCombinedAuth"

// =============================================================================
// Utility Hooks (Phase 4 migrations)
// =============================================================================

// WebSocket connection
export { useBlinkWebSocket } from "./useBlinkWebSocket"

// Currency management
export { useCurrencies } from "./useCurrencies"

// Dark mode
export { useDarkMode } from "./useDarkMode"

// Dashboard data fetching
export { useDashboardData } from "./useDashboardData"

// Exchange rate fetching
export { useExchangeRateFetcher } from "./useExchangeRateFetcher"

// Navigation handlers
export { useNavigationHandlers } from "./useNavigationHandlers"

// Payment polling
export { usePaymentPolling } from "./usePaymentPolling"

// Preferences
export { usePreferences } from "./usePreferences"

// Server sync
export { useServerSync } from "./useServerSync"

// Split profile actions
export { useSplitProfileActions } from "./useSplitProfileActions"

// Theme
export { useTheme } from "./useTheme"

// Tip recipient validation
export { useTipRecipientValidation } from "./useTipRecipientValidation"

// Transaction actions
export { useTransactionActions } from "./useTransactionActions"

// =============================================================================
// Public POS Hooks (Phase 4 migrations)
// =============================================================================

export { usePublicPOSExchangeRate } from "./usePublicPOSExchangeRate"
export { usePublicPOSMenuState } from "./usePublicPOSMenuState"
export { usePublicPOSNavigation } from "./usePublicPOSNavigation"
export { usePublicPOSPayment } from "./usePublicPOSPayment"
export { usePublicPOSSettings } from "./usePublicPOSSettings"
export { usePublicPOSValidation } from "./usePublicPOSValidation"
export { usePublicPOSViewState } from "./usePublicPOSViewState"
