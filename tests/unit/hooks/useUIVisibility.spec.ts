/**
 * Tests for useUIVisibility hook
 */
import { renderHook, act } from '@testing-library/react';
import { useUIVisibility } from '../../../lib/hooks/useUIVisibility';

describe('useUIVisibility', () => {
  describe('initial state', () => {
    it('should initialize all visibility states to false', () => {
      const { result } = renderHook(() => useUIVisibility())

      // Settings panels
      expect(result.current.showAccountSettings).toBe(false)
      expect(result.current.showVoucherWalletSettings).toBe(false)
      expect(result.current.showCurrencySettings).toBe(false)
      expect(result.current.showRegionalSettings).toBe(false)
      expect(result.current.showTipSettings).toBe(false)
      expect(result.current.showTipProfileSettings).toBe(false)
      expect(result.current.showPercentSettings).toBe(false)

      // Features
      expect(result.current.showKeyManagement).toBe(false)
      expect(result.current.showBoltcards).toBe(false)
      expect(result.current.showBatchPayments).toBe(false)
      expect(result.current.showNetworkOverlay).toBe(false)

      // Modals
      expect(result.current.showAddAccountForm).toBe(false)
      expect(result.current.showDateRangeSelector).toBe(false)
      expect(result.current.showExportOptions).toBe(false)
      expect(result.current.showTimeInputs).toBe(false)

      // Payment states
      expect(result.current.showingInvoice).toBe(false)
      expect(result.current.showingVoucherQR).toBe(false)
    })
  })

  describe('settings panel toggles', () => {
    it('should toggle showAccountSettings', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowAccountSettings(true)
      })
      expect(result.current.showAccountSettings).toBe(true)

      act(() => {
        result.current.setShowAccountSettings(false)
      })
      expect(result.current.showAccountSettings).toBe(false)
    })

    it('should toggle showVoucherWalletSettings', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowVoucherWalletSettings(true)
      })
      expect(result.current.showVoucherWalletSettings).toBe(true)
    })

    it('should toggle showCurrencySettings', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowCurrencySettings(true)
      })
      expect(result.current.showCurrencySettings).toBe(true)
    })

    it('should toggle showRegionalSettings', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowRegionalSettings(true)
      })
      expect(result.current.showRegionalSettings).toBe(true)
    })

    it('should toggle showTipSettings', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowTipSettings(true)
      })
      expect(result.current.showTipSettings).toBe(true)
    })

    it('should toggle showTipProfileSettings', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowTipProfileSettings(true)
      })
      expect(result.current.showTipProfileSettings).toBe(true)
    })

    it('should toggle showPercentSettings', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowPercentSettings(true)
      })
      expect(result.current.showPercentSettings).toBe(true)
    })
  })

  describe('feature toggles', () => {
    it('should toggle showKeyManagement', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowKeyManagement(true)
      })
      expect(result.current.showKeyManagement).toBe(true)
    })

    it('should toggle showBoltcards', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowBoltcards(true)
      })
      expect(result.current.showBoltcards).toBe(true)
    })

    it('should toggle showBatchPayments', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowBatchPayments(true)
      })
      expect(result.current.showBatchPayments).toBe(true)
    })

    it('should toggle showNetworkOverlay', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowNetworkOverlay(true)
      })
      expect(result.current.showNetworkOverlay).toBe(true)
    })
  })

  describe('modal toggles', () => {
    it('should toggle showAddAccountForm', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowAddAccountForm(true)
      })
      expect(result.current.showAddAccountForm).toBe(true)
    })

    it('should toggle showDateRangeSelector', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowDateRangeSelector(true)
      })
      expect(result.current.showDateRangeSelector).toBe(true)
    })

    it('should toggle showExportOptions', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowExportOptions(true)
      })
      expect(result.current.showExportOptions).toBe(true)
    })

    it('should toggle showTimeInputs', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowTimeInputs(true)
      })
      expect(result.current.showTimeInputs).toBe(true)
    })
  })

  describe('payment state toggles', () => {
    it('should toggle showingInvoice', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowingInvoice(true)
      })
      expect(result.current.showingInvoice).toBe(true)

      act(() => {
        result.current.setShowingInvoice(false)
      })
      expect(result.current.showingInvoice).toBe(false)
    })

    it('should toggle showingVoucherQR', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowingVoucherQR(true)
      })
      expect(result.current.showingVoucherQR).toBe(true)
    })
  })

  describe('closeAllSettings', () => {
    it('should close all settings panels', () => {
      const { result } = renderHook(() => useUIVisibility())

      // Open all settings
      act(() => {
        result.current.setShowAccountSettings(true)
        result.current.setShowVoucherWalletSettings(true)
        result.current.setShowCurrencySettings(true)
        result.current.setShowRegionalSettings(true)
        result.current.setShowTipSettings(true)
        result.current.setShowTipProfileSettings(true)
        result.current.setShowPercentSettings(true)
      })

      // Verify they're open
      expect(result.current.showAccountSettings).toBe(true)
      expect(result.current.showVoucherWalletSettings).toBe(true)
      expect(result.current.showCurrencySettings).toBe(true)

      // Close all settings
      act(() => {
        result.current.closeAllSettings()
      })

      // Verify all closed
      expect(result.current.showAccountSettings).toBe(false)
      expect(result.current.showVoucherWalletSettings).toBe(false)
      expect(result.current.showCurrencySettings).toBe(false)
      expect(result.current.showRegionalSettings).toBe(false)
      expect(result.current.showTipSettings).toBe(false)
      expect(result.current.showTipProfileSettings).toBe(false)
      expect(result.current.showPercentSettings).toBe(false)
    })

    it('should not affect non-settings states', () => {
      const { result } = renderHook(() => useUIVisibility())

      // Open a feature and modal
      act(() => {
        result.current.setShowAccountSettings(true)
        result.current.setShowKeyManagement(true)
        result.current.setShowingInvoice(true)
      })

      // Close all settings
      act(() => {
        result.current.closeAllSettings()
      })

      // Settings should be closed
      expect(result.current.showAccountSettings).toBe(false)

      // Features and payment states should remain open
      expect(result.current.showKeyManagement).toBe(true)
      expect(result.current.showingInvoice).toBe(true)
    })
  })

  describe('closeAllOverlays', () => {
    it('should close all visibility states', () => {
      const { result } = renderHook(() => useUIVisibility())

      // Open everything
      act(() => {
        // Settings
        result.current.setShowAccountSettings(true)
        result.current.setShowVoucherWalletSettings(true)
        result.current.setShowCurrencySettings(true)
        result.current.setShowRegionalSettings(true)
        result.current.setShowTipSettings(true)
        result.current.setShowTipProfileSettings(true)
        result.current.setShowPercentSettings(true)

        // Features
        result.current.setShowKeyManagement(true)
        result.current.setShowBoltcards(true)
        result.current.setShowBatchPayments(true)
        result.current.setShowNetworkOverlay(true)

        // Modals
        result.current.setShowAddAccountForm(true)
        result.current.setShowDateRangeSelector(true)
        result.current.setShowExportOptions(true)
        result.current.setShowTimeInputs(true)

        // Payment states
        result.current.setShowingInvoice(true)
        result.current.setShowingVoucherQR(true)
      })

      // Verify some are open
      expect(result.current.showAccountSettings).toBe(true)
      expect(result.current.showKeyManagement).toBe(true)
      expect(result.current.showingInvoice).toBe(true)

      // Close all
      act(() => {
        result.current.closeAllOverlays()
      })

      // Verify everything is closed
      expect(result.current.showAccountSettings).toBe(false)
      expect(result.current.showVoucherWalletSettings).toBe(false)
      expect(result.current.showCurrencySettings).toBe(false)
      expect(result.current.showRegionalSettings).toBe(false)
      expect(result.current.showTipSettings).toBe(false)
      expect(result.current.showTipProfileSettings).toBe(false)
      expect(result.current.showPercentSettings).toBe(false)
      expect(result.current.showKeyManagement).toBe(false)
      expect(result.current.showBoltcards).toBe(false)
      expect(result.current.showBatchPayments).toBe(false)
      expect(result.current.showNetworkOverlay).toBe(false)
      expect(result.current.showAddAccountForm).toBe(false)
      expect(result.current.showDateRangeSelector).toBe(false)
      expect(result.current.showExportOptions).toBe(false)
      expect(result.current.showTimeInputs).toBe(false)
      expect(result.current.showingInvoice).toBe(false)
      expect(result.current.showingVoucherQR).toBe(false)
    })
  })

  describe('state independence', () => {
    it('should allow multiple states to be open simultaneously', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowAccountSettings(true)
        result.current.setShowKeyManagement(true)
        result.current.setShowingInvoice(true)
      })

      expect(result.current.showAccountSettings).toBe(true)
      expect(result.current.showKeyManagement).toBe(true)
      expect(result.current.showingInvoice).toBe(true)
    })

    it('should allow toggling individual states without affecting others', () => {
      const { result } = renderHook(() => useUIVisibility())

      act(() => {
        result.current.setShowAccountSettings(true)
        result.current.setShowKeyManagement(true)
      })

      act(() => {
        result.current.setShowAccountSettings(false)
      })

      expect(result.current.showAccountSettings).toBe(false)
      expect(result.current.showKeyManagement).toBe(true)
    })
  })
})
