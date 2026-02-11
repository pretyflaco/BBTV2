/**
 * Tests for useDashboardUI hook
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react"
import {
  useDashboardUI,
  type DashboardView,
  type SettingsPanel,
} from "@/lib/hooks/useDashboardUI"

describe("useDashboardUI", () => {
  describe("initial state", () => {
    it("initializes with default view as 'pos'", () => {
      const { result } = renderHook(() => useDashboardUI())
      expect(result.current.currentView).toBe("pos")
    })

    it("initializes with view not transitioning", () => {
      const { result } = renderHook(() => useDashboardUI())
      expect(result.current.isViewTransitioning).toBe(false)
    })

    it("initializes with transition color index as 0", () => {
      const { result } = renderHook(() => useDashboardUI())
      expect(result.current.transitionColorIndex).toBe(0)
    })

    it("initializes with side menu closed", () => {
      const { result } = renderHook(() => useDashboardUI())
      expect(result.current.sideMenuOpen).toBe(false)
    })

    it("initializes with all settings panels closed", () => {
      const { result } = renderHook(() => useDashboardUI())
      expect(result.current.showAccountSettings).toBe(false)
      expect(result.current.showVoucherWalletSettings).toBe(false)
      expect(result.current.showCurrencySettings).toBe(false)
      expect(result.current.showRegionalSettings).toBe(false)
      expect(result.current.showTipSettings).toBe(false)
      expect(result.current.showTipProfileSettings).toBe(false)
      expect(result.current.showPercentSettings).toBe(false)
      expect(result.current.showCommissionSettings).toBe(false)
      expect(result.current.showSoundThemes).toBe(false)
    })

    it("initializes with all feature panels closed", () => {
      const { result } = renderHook(() => useDashboardUI())
      expect(result.current.showKeyManagement).toBe(false)
      expect(result.current.showBoltcards).toBe(false)
      expect(result.current.showBatchPayments).toBe(false)
      expect(result.current.showNetworkOverlay).toBe(false)
      expect(result.current.showPaycode).toBe(false)
    })

    it("initializes with all modals and overlays closed", () => {
      const { result } = renderHook(() => useDashboardUI())
      expect(result.current.showAddAccountForm).toBe(false)
      expect(result.current.showCreateSplitProfile).toBe(false)
      expect(result.current.showDateRangeSelector).toBe(false)
      expect(result.current.showExportOptions).toBe(false)
      expect(result.current.showInstallPrompt).toBe(false)
      expect(result.current.showTimeInputs).toBe(false)
    })

    it("initializes with payment states as not showing", () => {
      const { result } = renderHook(() => useDashboardUI())
      expect(result.current.showingInvoice).toBe(false)
      expect(result.current.showingVoucherQR).toBe(false)
    })
  })

  describe("navigation actions", () => {
    it("setCurrentView changes the current view", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setCurrentView("transactions")
      })

      expect(result.current.currentView).toBe("transactions")
    })

    it("supports all valid view types", () => {
      const { result } = renderHook(() => useDashboardUI())
      const views: DashboardView[] = [
        "pos",
        "cart",
        "voucher",
        "multivoucher",
        "vouchermanager",
        "transactions",
      ]

      views.forEach((view) => {
        act(() => {
          result.current.setCurrentView(view)
        })
        expect(result.current.currentView).toBe(view)
      })
    })

    it("setIsViewTransitioning updates transitioning state", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setIsViewTransitioning(true)
      })

      expect(result.current.isViewTransitioning).toBe(true)

      act(() => {
        result.current.setIsViewTransitioning(false)
      })

      expect(result.current.isViewTransitioning).toBe(false)
    })

    it("setTransitionColorIndex updates the color index", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setTransitionColorIndex(3)
      })

      expect(result.current.transitionColorIndex).toBe(3)
    })

    it("setSideMenuOpen opens and closes side menu", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setSideMenuOpen(true)
      })

      expect(result.current.sideMenuOpen).toBe(true)

      act(() => {
        result.current.setSideMenuOpen(false)
      })

      expect(result.current.sideMenuOpen).toBe(false)
    })

    it("toggleSideMenu toggles side menu state", () => {
      const { result } = renderHook(() => useDashboardUI())

      expect(result.current.sideMenuOpen).toBe(false)

      act(() => {
        result.current.toggleSideMenu()
      })

      expect(result.current.sideMenuOpen).toBe(true)

      act(() => {
        result.current.toggleSideMenu()
      })

      expect(result.current.sideMenuOpen).toBe(false)
    })
  })

  describe("settings panel actions", () => {
    it("setShowAccountSettings toggles account settings", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowAccountSettings(true)
      })

      expect(result.current.showAccountSettings).toBe(true)
    })

    it("setShowVoucherWalletSettings toggles voucher wallet settings", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowVoucherWalletSettings(true)
      })

      expect(result.current.showVoucherWalletSettings).toBe(true)
    })

    it("setShowCurrencySettings toggles currency settings", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowCurrencySettings(true)
      })

      expect(result.current.showCurrencySettings).toBe(true)
    })

    it("setShowRegionalSettings toggles regional settings", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowRegionalSettings(true)
      })

      expect(result.current.showRegionalSettings).toBe(true)
    })

    it("setShowTipSettings toggles tip settings", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowTipSettings(true)
      })

      expect(result.current.showTipSettings).toBe(true)
    })

    it("setShowTipProfileSettings toggles tip profile settings", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowTipProfileSettings(true)
      })

      expect(result.current.showTipProfileSettings).toBe(true)
    })

    it("setShowPercentSettings toggles percent settings", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowPercentSettings(true)
      })

      expect(result.current.showPercentSettings).toBe(true)
    })

    it("setShowCommissionSettings toggles commission settings", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowCommissionSettings(true)
      })

      expect(result.current.showCommissionSettings).toBe(true)
    })

    it("setShowSoundThemes toggles sound themes", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowSoundThemes(true)
      })

      expect(result.current.showSoundThemes).toBe(true)
    })
  })

  describe("feature panel actions", () => {
    it("setShowKeyManagement toggles key management", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowKeyManagement(true)
      })

      expect(result.current.showKeyManagement).toBe(true)
    })

    it("setShowBoltcards toggles boltcards", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowBoltcards(true)
      })

      expect(result.current.showBoltcards).toBe(true)
    })

    it("setShowBatchPayments toggles batch payments", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowBatchPayments(true)
      })

      expect(result.current.showBatchPayments).toBe(true)
    })

    it("setShowNetworkOverlay toggles network overlay", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowNetworkOverlay(true)
      })

      expect(result.current.showNetworkOverlay).toBe(true)
    })

    it("setShowPaycode toggles paycode", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowPaycode(true)
      })

      expect(result.current.showPaycode).toBe(true)
    })
  })

  describe("modal and overlay actions", () => {
    it("setShowAddAccountForm toggles add account form", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowAddAccountForm(true)
      })

      expect(result.current.showAddAccountForm).toBe(true)
    })

    it("setShowCreateSplitProfile toggles create split profile", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowCreateSplitProfile(true)
      })

      expect(result.current.showCreateSplitProfile).toBe(true)
    })

    it("setShowDateRangeSelector toggles date range selector", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowDateRangeSelector(true)
      })

      expect(result.current.showDateRangeSelector).toBe(true)
    })

    it("setShowExportOptions toggles export options", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowExportOptions(true)
      })

      expect(result.current.showExportOptions).toBe(true)
    })

    it("setShowInstallPrompt toggles install prompt", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowInstallPrompt(true)
      })

      expect(result.current.showInstallPrompt).toBe(true)
    })

    it("setShowTimeInputs toggles time inputs", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowTimeInputs(true)
      })

      expect(result.current.showTimeInputs).toBe(true)
    })
  })

  describe("payment state actions", () => {
    it("setShowingInvoice toggles invoice display", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowingInvoice(true)
      })

      expect(result.current.showingInvoice).toBe(true)
    })

    it("setShowingVoucherQR toggles voucher QR display", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowingVoucherQR(true)
      })

      expect(result.current.showingVoucherQR).toBe(true)
    })
  })

  describe("closeAllOverlays", () => {
    it("closes all overlays and panels when called", () => {
      const { result } = renderHook(() => useDashboardUI())

      // Open multiple overlays
      act(() => {
        result.current.setSideMenuOpen(true)
        result.current.setShowAccountSettings(true)
        result.current.setShowCurrencySettings(true)
        result.current.setShowKeyManagement(true)
        result.current.setShowBoltcards(true)
        result.current.setShowAddAccountForm(true)
        result.current.setShowExportOptions(true)
      })

      // Verify they are open
      expect(result.current.sideMenuOpen).toBe(true)
      expect(result.current.showAccountSettings).toBe(true)
      expect(result.current.showCurrencySettings).toBe(true)
      expect(result.current.showKeyManagement).toBe(true)
      expect(result.current.showBoltcards).toBe(true)
      expect(result.current.showAddAccountForm).toBe(true)
      expect(result.current.showExportOptions).toBe(true)

      // Close all overlays
      act(() => {
        result.current.closeAllOverlays()
      })

      // Verify all are closed
      expect(result.current.sideMenuOpen).toBe(false)
      expect(result.current.showAccountSettings).toBe(false)
      expect(result.current.showVoucherWalletSettings).toBe(false)
      expect(result.current.showCurrencySettings).toBe(false)
      expect(result.current.showRegionalSettings).toBe(false)
      expect(result.current.showTipSettings).toBe(false)
      expect(result.current.showTipProfileSettings).toBe(false)
      expect(result.current.showPercentSettings).toBe(false)
      expect(result.current.showCommissionSettings).toBe(false)
      expect(result.current.showSoundThemes).toBe(false)
      expect(result.current.showKeyManagement).toBe(false)
      expect(result.current.showBoltcards).toBe(false)
      expect(result.current.showBatchPayments).toBe(false)
      expect(result.current.showNetworkOverlay).toBe(false)
      expect(result.current.showPaycode).toBe(false)
      expect(result.current.showAddAccountForm).toBe(false)
      expect(result.current.showCreateSplitProfile).toBe(false)
      expect(result.current.showDateRangeSelector).toBe(false)
      expect(result.current.showExportOptions).toBe(false)
      expect(result.current.showTimeInputs).toBe(false)
    })

    it("does not affect showInstallPrompt", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowInstallPrompt(true)
      })

      act(() => {
        result.current.closeAllOverlays()
      })

      // Install prompt should remain open (it's a special case)
      expect(result.current.showInstallPrompt).toBe(true)
    })

    it("does not affect payment display states", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setShowingInvoice(true)
        result.current.setShowingVoucherQR(true)
      })

      act(() => {
        result.current.closeAllOverlays()
      })

      // Payment states should remain (they have their own lifecycle)
      expect(result.current.showingInvoice).toBe(true)
      expect(result.current.showingVoucherQR).toBe(true)
    })

    it("does not affect currentView", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.setCurrentView("transactions")
      })

      act(() => {
        result.current.closeAllOverlays()
      })

      expect(result.current.currentView).toBe("transactions")
    })
  })

  describe("openSettingsPanel", () => {
    it("opens account settings panel and closes others", () => {
      const { result } = renderHook(() => useDashboardUI())

      // Open currency settings first
      act(() => {
        result.current.setShowCurrencySettings(true)
      })

      // Now open account settings
      act(() => {
        result.current.openSettingsPanel("account")
      })

      expect(result.current.showAccountSettings).toBe(true)
      expect(result.current.showCurrencySettings).toBe(false)
    })

    it("opens voucherWallet settings panel", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.openSettingsPanel("voucherWallet")
      })

      expect(result.current.showVoucherWalletSettings).toBe(true)
    })

    it("opens currency settings panel", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.openSettingsPanel("currency")
      })

      expect(result.current.showCurrencySettings).toBe(true)
    })

    it("opens regional settings panel", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.openSettingsPanel("regional")
      })

      expect(result.current.showRegionalSettings).toBe(true)
    })

    it("opens tip settings panel", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.openSettingsPanel("tip")
      })

      expect(result.current.showTipSettings).toBe(true)
    })

    it("opens tipProfile settings panel", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.openSettingsPanel("tipProfile")
      })

      expect(result.current.showTipProfileSettings).toBe(true)
    })

    it("opens percent settings panel", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.openSettingsPanel("percent")
      })

      expect(result.current.showPercentSettings).toBe(true)
    })

    it("opens commission settings panel", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.openSettingsPanel("commission")
      })

      expect(result.current.showCommissionSettings).toBe(true)
    })

    it("opens sound settings panel", () => {
      const { result } = renderHook(() => useDashboardUI())

      act(() => {
        result.current.openSettingsPanel("sound")
      })

      expect(result.current.showSoundThemes).toBe(true)
    })

    it("closes all other settings panels when opening one", () => {
      const { result } = renderHook(() => useDashboardUI())

      // Open multiple settings panels directly
      act(() => {
        result.current.setShowAccountSettings(true)
        result.current.setShowCurrencySettings(true)
        result.current.setShowTipSettings(true)
      })

      // Open regional settings via openSettingsPanel
      act(() => {
        result.current.openSettingsPanel("regional")
      })

      // Only regional should be open
      expect(result.current.showRegionalSettings).toBe(true)
      expect(result.current.showAccountSettings).toBe(false)
      expect(result.current.showCurrencySettings).toBe(false)
      expect(result.current.showTipSettings).toBe(false)
      expect(result.current.showVoucherWalletSettings).toBe(false)
      expect(result.current.showTipProfileSettings).toBe(false)
      expect(result.current.showPercentSettings).toBe(false)
      expect(result.current.showCommissionSettings).toBe(false)
      expect(result.current.showSoundThemes).toBe(false)
    })

    it("does not affect non-settings panels", () => {
      const { result } = renderHook(() => useDashboardUI())

      // Open feature panels
      act(() => {
        result.current.setShowKeyManagement(true)
        result.current.setShowBoltcards(true)
      })

      // Open a settings panel
      act(() => {
        result.current.openSettingsPanel("account")
      })

      // Feature panels should remain open
      expect(result.current.showKeyManagement).toBe(true)
      expect(result.current.showBoltcards).toBe(true)
    })

    it("works with all valid settings panel types", () => {
      const { result } = renderHook(() => useDashboardUI())
      const panels: SettingsPanel[] = [
        "account",
        "voucherWallet",
        "currency",
        "regional",
        "tip",
        "tipProfile",
        "percent",
        "commission",
        "sound",
      ]

      panels.forEach((panel) => {
        act(() => {
          result.current.openSettingsPanel(panel)
        })

        // Verify the correct panel is open
        switch (panel) {
          case "account":
            expect(result.current.showAccountSettings).toBe(true)
            break
          case "voucherWallet":
            expect(result.current.showVoucherWalletSettings).toBe(true)
            break
          case "currency":
            expect(result.current.showCurrencySettings).toBe(true)
            break
          case "regional":
            expect(result.current.showRegionalSettings).toBe(true)
            break
          case "tip":
            expect(result.current.showTipSettings).toBe(true)
            break
          case "tipProfile":
            expect(result.current.showTipProfileSettings).toBe(true)
            break
          case "percent":
            expect(result.current.showPercentSettings).toBe(true)
            break
          case "commission":
            expect(result.current.showCommissionSettings).toBe(true)
            break
          case "sound":
            expect(result.current.showSoundThemes).toBe(true)
            break
        }
      })
    })
  })

  describe("callback stability", () => {
    it("toggleSideMenu maintains referential equality", () => {
      const { result, rerender } = renderHook(() => useDashboardUI())

      const firstToggle = result.current.toggleSideMenu
      rerender()
      const secondToggle = result.current.toggleSideMenu

      expect(firstToggle).toBe(secondToggle)
    })

    it("closeAllOverlays maintains referential equality", () => {
      const { result, rerender } = renderHook(() => useDashboardUI())

      const firstClose = result.current.closeAllOverlays
      rerender()
      const secondClose = result.current.closeAllOverlays

      expect(firstClose).toBe(secondClose)
    })

    it("openSettingsPanel maintains referential equality", () => {
      const { result, rerender } = renderHook(() => useDashboardUI())

      const firstOpen = result.current.openSettingsPanel
      rerender()
      const secondOpen = result.current.openSettingsPanel

      expect(firstOpen).toBe(secondOpen)
    })
  })
})
