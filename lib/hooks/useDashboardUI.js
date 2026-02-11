/**
 * useDashboardUI Hook
 *
 * Manages UI visibility state for the Dashboard component.
 * Controls which overlays, modals, and panels are visible.
 *
 * This hook extracts all `show*` state variables from Dashboard.js
 * to reduce the component's state complexity.
 */

import { useState, useCallback } from "react"

/**
 * Hook for managing Dashboard UI visibility state
 *
 * @example
 * ```jsx
 * const {
 *   currentView,
 *   setCurrentView,
 *   showAccountSettings,
 *   setShowAccountSettings,
 *   closeAllOverlays
 * } = useDashboardUI()
 *
 * // Navigate to transactions
 * setCurrentView('transactions')
 *
 * // Open account settings
 * setShowAccountSettings(true)
 *
 * // Close everything
 * closeAllOverlays()
 * ```
 *
 * @returns {Object} UI state and actions
 */
export function useDashboardUI() {
  // Main navigation
  const [currentView, setCurrentView] = useState("pos")
  const [isViewTransitioning, setIsViewTransitioning] = useState(false)
  const [transitionColorIndex, setTransitionColorIndex] = useState(0)
  const [sideMenuOpen, setSideMenuOpen] = useState(false)

  // Settings panels
  const [showAccountSettings, setShowAccountSettings] = useState(false)
  const [showVoucherWalletSettings, setShowVoucherWalletSettings] =
    useState(false)
  const [showCurrencySettings, setShowCurrencySettings] = useState(false)
  const [showRegionalSettings, setShowRegionalSettings] = useState(false)
  const [showTipSettings, setShowTipSettings] = useState(false)
  const [showTipProfileSettings, setShowTipProfileSettings] = useState(false)
  const [showPercentSettings, setShowPercentSettings] = useState(false)
  const [showCommissionSettings, setShowCommissionSettings] = useState(false)
  const [showSoundThemes, setShowSoundThemes] = useState(false)

  // Features
  const [showKeyManagement, setShowKeyManagement] = useState(false)
  const [showBoltcards, setShowBoltcards] = useState(false)
  const [showBatchPayments, setShowBatchPayments] = useState(false)
  const [showNetworkOverlay, setShowNetworkOverlay] = useState(false)
  const [showPaycode, setShowPaycode] = useState(false)

  // Modals and overlays
  const [showAddAccountForm, setShowAddAccountForm] = useState(false)
  const [showCreateSplitProfile, setShowCreateSplitProfile] = useState(false)
  const [showDateRangeSelector, setShowDateRangeSelector] = useState(false)
  const [showExportOptions, setShowExportOptions] = useState(false)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [showTimeInputs, setShowTimeInputs] = useState(false)

  // Payment states
  const [showingInvoice, setShowingInvoice] = useState(false)
  const [showingVoucherQR, setShowingVoucherQR] = useState(false)

  // Utility: Toggle side menu
  const toggleSideMenu = useCallback(() => {
    setSideMenuOpen((prev) => !prev)
  }, [])

  // Utility: Close all overlays at once
  const closeAllOverlays = useCallback(() => {
    setSideMenuOpen(false)
    setShowAccountSettings(false)
    setShowVoucherWalletSettings(false)
    setShowCurrencySettings(false)
    setShowRegionalSettings(false)
    setShowTipSettings(false)
    setShowTipProfileSettings(false)
    setShowPercentSettings(false)
    setShowCommissionSettings(false)
    setShowSoundThemes(false)
    setShowKeyManagement(false)
    setShowBoltcards(false)
    setShowBatchPayments(false)
    setShowNetworkOverlay(false)
    setShowPaycode(false)
    setShowAddAccountForm(false)
    setShowCreateSplitProfile(false)
    setShowDateRangeSelector(false)
    setShowExportOptions(false)
    setShowTimeInputs(false)
  }, [])

  /**
   * Open a specific settings panel (closes others first)
   * @param {'account' | 'voucherWallet' | 'currency' | 'regional' | 'tip' | 'tipProfile' | 'percent' | 'commission' | 'sound'} panel
   */
  const openSettingsPanel = useCallback((panel) => {
    // Close all settings panels first
    setShowAccountSettings(false)
    setShowVoucherWalletSettings(false)
    setShowCurrencySettings(false)
    setShowRegionalSettings(false)
    setShowTipSettings(false)
    setShowTipProfileSettings(false)
    setShowPercentSettings(false)
    setShowCommissionSettings(false)
    setShowSoundThemes(false)

    // Open the requested panel
    switch (panel) {
      case "account":
        setShowAccountSettings(true)
        break
      case "voucherWallet":
        setShowVoucherWalletSettings(true)
        break
      case "currency":
        setShowCurrencySettings(true)
        break
      case "regional":
        setShowRegionalSettings(true)
        break
      case "tip":
        setShowTipSettings(true)
        break
      case "tipProfile":
        setShowTipProfileSettings(true)
        break
      case "percent":
        setShowPercentSettings(true)
        break
      case "commission":
        setShowCommissionSettings(true)
        break
      case "sound":
        setShowSoundThemes(true)
        break
    }
  }, [])

  return {
    // State
    currentView,
    isViewTransitioning,
    transitionColorIndex,
    sideMenuOpen,
    showAccountSettings,
    showVoucherWalletSettings,
    showCurrencySettings,
    showRegionalSettings,
    showTipSettings,
    showTipProfileSettings,
    showPercentSettings,
    showCommissionSettings,
    showSoundThemes,
    showKeyManagement,
    showBoltcards,
    showBatchPayments,
    showNetworkOverlay,
    showPaycode,
    showAddAccountForm,
    showCreateSplitProfile,
    showDateRangeSelector,
    showExportOptions,
    showInstallPrompt,
    showTimeInputs,
    showingInvoice,
    showingVoucherQR,

    // Actions
    setCurrentView,
    setIsViewTransitioning,
    setTransitionColorIndex,
    setSideMenuOpen,
    toggleSideMenu,
    setShowAccountSettings,
    setShowVoucherWalletSettings,
    setShowCurrencySettings,
    setShowRegionalSettings,
    setShowTipSettings,
    setShowTipProfileSettings,
    setShowPercentSettings,
    setShowCommissionSettings,
    setShowSoundThemes,
    setShowKeyManagement,
    setShowBoltcards,
    setShowBatchPayments,
    setShowNetworkOverlay,
    setShowPaycode,
    setShowAddAccountForm,
    setShowCreateSplitProfile,
    setShowDateRangeSelector,
    setShowExportOptions,
    setShowInstallPrompt,
    setShowTimeInputs,
    setShowingInvoice,
    setShowingVoucherQR,
    closeAllOverlays,
    openSettingsPanel,
  }
}

export default useDashboardUI
