/**
 * useUIVisibility Hook
 *
 * Manages UI visibility state for modals, overlays, and settings panels
 * in the Dashboard component.
 *
 * This hook handles visibility toggles that are NOT managed by other hooks:
 * - useViewNavigation handles: currentView, sideMenuOpen, transitions
 * - usePaycodeState handles: showPaycode
 * - usePWAInstall handles: showInstallPrompt
 *
 * @module lib/hooks/useUIVisibility
 */

import { useState, useCallback } from "react"

/**
 * Hook for managing UI visibility state
 *
 * @example
 * ```jsx
 * const {
 *   showAccountSettings,
 *   setShowAccountSettings,
 *   showingInvoice,
 *   setShowingInvoice,
 *   closeAllOverlays
 * } = useUIVisibility()
 *
 * // Open account settings
 * setShowAccountSettings(true)
 *
 * // Show invoice QR
 * setShowingInvoice(true)
 *
 * // Close everything
 * closeAllOverlays()
 * ```
 */
export function useUIVisibility() {
  // Settings panels
  const [showAccountSettings, setShowAccountSettings] = useState(false)
  const [showVoucherWalletSettings, setShowVoucherWalletSettings] = useState(false)
  const [showCurrencySettings, setShowCurrencySettings] = useState(false)
  const [showRegionalSettings, setShowRegionalSettings] = useState(false)
  const [showTipSettings, setShowTipSettings] = useState(false)
  const [showTipProfileSettings, setShowTipProfileSettings] = useState(false)
  const [showPercentSettings, setShowPercentSettings] = useState(false)

  // Features
  const [showKeyManagement, setShowKeyManagement] = useState(false)
  const [showBoltcards, setShowBoltcards] = useState(false)
  const [showBatchPayments, setShowBatchPayments] = useState(false)
  const [showNetworkOverlay, setShowNetworkOverlay] = useState(false)

  // Modals and overlays
  const [showAddAccountForm, setShowAddAccountForm] = useState(false)
  const [showDateRangeSelector, setShowDateRangeSelector] = useState(false)
  const [showExportOptions, setShowExportOptions] = useState(false)
  const [showTimeInputs, setShowTimeInputs] = useState(false)

  // Payment display states
  const [showingInvoice, setShowingInvoice] = useState(false)
  const [showingVoucherQR, setShowingVoucherQR] = useState(false)

  /**
   * Close all settings panels
   */
  const closeAllSettings = useCallback(() => {
    setShowAccountSettings(false)
    setShowVoucherWalletSettings(false)
    setShowCurrencySettings(false)
    setShowRegionalSettings(false)
    setShowTipSettings(false)
    setShowTipProfileSettings(false)
    setShowPercentSettings(false)
  }, [])

  /**
   * Close all overlays, modals, and settings
   */
  const closeAllOverlays = useCallback(() => {
    // Close all settings
    closeAllSettings()

    // Close features
    setShowKeyManagement(false)
    setShowBoltcards(false)
    setShowBatchPayments(false)
    setShowNetworkOverlay(false)

    // Close modals
    setShowAddAccountForm(false)
    setShowDateRangeSelector(false)
    setShowExportOptions(false)
    setShowTimeInputs(false)

    // Close payment displays
    setShowingInvoice(false)
    setShowingVoucherQR(false)
  }, [closeAllSettings])

  return {
    // State
    showAccountSettings,
    showVoucherWalletSettings,
    showCurrencySettings,
    showRegionalSettings,
    showTipSettings,
    showTipProfileSettings,
    showPercentSettings,
    showKeyManagement,
    showBoltcards,
    showBatchPayments,
    showNetworkOverlay,
    showAddAccountForm,
    showDateRangeSelector,
    showExportOptions,
    showTimeInputs,
    showingInvoice,
    showingVoucherQR,

    // Actions
    setShowAccountSettings,
    setShowVoucherWalletSettings,
    setShowCurrencySettings,
    setShowRegionalSettings,
    setShowTipSettings,
    setShowTipProfileSettings,
    setShowPercentSettings,
    setShowKeyManagement,
    setShowBoltcards,
    setShowBatchPayments,
    setShowNetworkOverlay,
    setShowAddAccountForm,
    setShowDateRangeSelector,
    setShowExportOptions,
    setShowTimeInputs,
    setShowingInvoice,
    setShowingVoucherQR,
    closeAllOverlays,
    closeAllSettings,
  }
}

export default useUIVisibility
