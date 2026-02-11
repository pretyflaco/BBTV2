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
 */

// =============================================================================
// Core Hooks
// =============================================================================

// Theme styling utilities
export { useThemeStyles } from './useThemeStyles.js';

// Dashboard UI visibility states
export { useDashboardUI } from './useDashboardUI.js';

// Account management
export { useAccountManagement } from './useAccountManagement.js';

// Transaction state
export { useTransactionState } from './useTransactionState.js';

// Voucher wallet state
export { useVoucherWalletState } from './useVoucherWalletState.js';

// Split profiles
export { useSplitProfiles } from './useSplitProfiles.js';

// Tip settings
export { useTipSettings } from './useTipSettings.js';

// Commission settings
export { useCommissionSettings } from './useCommissionSettings.js';

// Sound settings
export { useSoundSettings } from './useSoundSettings.js';

// Display settings
export { useDisplaySettings } from './useDisplaySettings.js';

// Paycode state
export { usePaycodeState } from './usePaycodeState.js';

// Exchange rate
export { useExchangeRate } from './useExchangeRate.js';

// PWA install
export { usePWAInstall } from './usePWAInstall.js';

// View navigation
export {
  useViewNavigation,
  SPINNER_COLORS,
  DEFAULT_TRANSITION_DELAY,
  FIXED_VIEWS,
  VOUCHER_VIEWS,
} from './useViewNavigation.js';

// Invoice state
export { useInvoiceState } from './useInvoiceState.js';

// Wallet state
export { useWalletState } from './useWalletState.js';

// =============================================================================
// Composer Hook
// =============================================================================

// Combined dashboard state (imports all hooks above)
export { useDashboardState } from './useDashboardState.js';
