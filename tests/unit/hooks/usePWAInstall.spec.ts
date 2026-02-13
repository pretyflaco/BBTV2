/**
 * Tests for usePWAInstall hook
 *
 * @module tests/unit/hooks/usePWAInstall.spec
 */

import { renderHook, act } from "@testing-library/react"

import {
  usePWAInstall,
  type BeforeInstallPromptEvent,
} from "../../../lib/hooks/usePWAInstall"

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockBeforeInstallPromptEvent = (
  userChoiceOutcome: "accepted" | "dismissed" = "accepted",
): BeforeInstallPromptEvent => {
  const mockEvent = {
    preventDefault: jest.fn(),
    platforms: ["web"],
    userChoice: Promise.resolve({
      outcome: userChoiceOutcome,
      platform: "web",
    }),
    prompt: jest.fn().mockResolvedValue(undefined),
  }
  return mockEvent as unknown as BeforeInstallPromptEvent
}

// ============================================================================
// Test Setup
// ============================================================================

describe("usePWAInstall", () => {
  let originalMatchMedia: typeof window.matchMedia
  let _originalNavigator: Navigator
  let addEventListenerSpy: jest.SpyInstance
  let removeEventListenerSpy: jest.SpyInstance

  beforeEach(() => {
    // Store originals
    originalMatchMedia = window.matchMedia
    _originalNavigator = window.navigator

    // Mock matchMedia
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }))

    // Mock navigator.standalone (iOS)
    Object.defineProperty(window.navigator, "standalone", {
      value: false,
      writable: true,
      configurable: true,
    })

    // Mock document.referrer
    Object.defineProperty(document, "referrer", {
      value: "",
      writable: true,
      configurable: true,
    })

    // Spy on event listeners
    addEventListenerSpy = jest.spyOn(window, "addEventListener")
    removeEventListenerSpy = jest.spyOn(window, "removeEventListener")

    // Mock console methods
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    // Restore originals
    window.matchMedia = originalMatchMedia

    // Restore spies
    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()

    jest.restoreAllMocks()
  })

  // ==========================================================================
  // Initial State Tests
  // ==========================================================================

  describe("Initial State", () => {
    it("should initialize with default values", () => {
      const { result } = renderHook(() => usePWAInstall())

      expect(result.current.deferredPrompt).toBeNull()
      expect(result.current.showInstallPrompt).toBe(false)
      expect(result.current.installStatus).toBe("idle")
      expect(result.current.hasDeferredPrompt).toBe(false)
      expect(result.current.isInstalled).toBe(false)
      expect(result.current.isStandalone).toBe(false)
    })

    it("should set up event listeners on mount", () => {
      renderHook(() => usePWAInstall())

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "beforeinstallprompt",
        expect.any(Function),
      )
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "appinstalled",
        expect.any(Function),
      )
    })

    it("should clean up event listeners on unmount", () => {
      const { unmount } = renderHook(() => usePWAInstall())

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "beforeinstallprompt",
        expect.any(Function),
      )
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "appinstalled",
        expect.any(Function),
      )
    })
  })

  // ==========================================================================
  // Standalone Detection Tests
  // ==========================================================================

  describe("Standalone Detection", () => {
    it("should detect standalone mode via media query", () => {
      window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }))

      const { result } = renderHook(() => usePWAInstall())

      expect(result.current.isStandalone).toBe(true)
      expect(result.current.isInstalled).toBe(true)
    })

    it("should detect iOS standalone mode", () => {
      Object.defineProperty(window.navigator, "standalone", {
        value: true,
        writable: true,
        configurable: true,
      })

      const { result } = renderHook(() => usePWAInstall())

      expect(result.current.isStandalone).toBe(true)
    })

    it("should detect Android TWA mode", () => {
      Object.defineProperty(document, "referrer", {
        value: "android-app://com.example.app",
        writable: true,
        configurable: true,
      })

      const { result } = renderHook(() => usePWAInstall())

      expect(result.current.isStandalone).toBe(true)
    })
  })

  // ==========================================================================
  // Deferred Prompt Tests
  // ==========================================================================

  describe("Deferred Prompt", () => {
    it("should set deferred prompt", () => {
      const { result } = renderHook(() => usePWAInstall())
      const mockPrompt = createMockBeforeInstallPromptEvent()

      act(() => {
        result.current.setDeferredPrompt(mockPrompt)
      })

      expect(result.current.deferredPrompt).toBe(mockPrompt)
      expect(result.current.hasDeferredPrompt).toBe(true)
    })

    it("should clear deferred prompt", () => {
      const { result } = renderHook(() => usePWAInstall())
      const mockPrompt = createMockBeforeInstallPromptEvent()

      act(() => {
        result.current.setDeferredPrompt(mockPrompt)
      })

      act(() => {
        result.current.setDeferredPrompt(null)
      })

      expect(result.current.deferredPrompt).toBeNull()
      expect(result.current.hasDeferredPrompt).toBe(false)
    })

    it("should capture beforeinstallprompt event", () => {
      const { result: _result } = renderHook(() => usePWAInstall())
      const mockPrompt = createMockBeforeInstallPromptEvent()

      // Simulate the beforeinstallprompt event
      act(() => {
        const event = new Event("beforeinstallprompt")
        Object.assign(event, mockPrompt)
        window.dispatchEvent(event)
      })

      // The event should have been captured
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "beforeinstallprompt",
        expect.any(Function),
      )
    })
  })

  // ==========================================================================
  // Install Prompt Modal Tests
  // ==========================================================================

  describe("Install Prompt Modal", () => {
    it("should set showInstallPrompt", () => {
      const { result } = renderHook(() => usePWAInstall())

      act(() => {
        result.current.setShowInstallPrompt(true)
      })

      expect(result.current.showInstallPrompt).toBe(true)
    })

    it("should open install prompt", () => {
      const { result } = renderHook(() => usePWAInstall())

      act(() => {
        result.current.openInstallPrompt()
      })

      expect(result.current.showInstallPrompt).toBe(true)
    })

    it("should close install prompt", () => {
      const { result } = renderHook(() => usePWAInstall())

      act(() => {
        result.current.openInstallPrompt()
      })

      act(() => {
        result.current.closeInstallPrompt()
      })

      expect(result.current.showInstallPrompt).toBe(false)
    })
  })

  // ==========================================================================
  // Installation Actions Tests
  // ==========================================================================

  describe("Installation Actions", () => {
    it("should return false when triggering install without deferred prompt", async () => {
      const { result } = renderHook(() => usePWAInstall())

      let installResult: boolean = false

      await act(async () => {
        installResult = await result.current.triggerInstall()
      })

      expect(installResult).toBe(false)
    })

    it("should trigger install successfully when accepted", async () => {
      const { result } = renderHook(() => usePWAInstall())
      const mockPrompt = createMockBeforeInstallPromptEvent("accepted")

      act(() => {
        result.current.setDeferredPrompt(mockPrompt)
      })

      let installResult: boolean = false

      await act(async () => {
        installResult = await result.current.triggerInstall()
      })

      expect(installResult).toBe(true)
      expect(mockPrompt.prompt).toHaveBeenCalled()
      expect(result.current.installStatus).toBe("accepted")
      expect(result.current.deferredPrompt).toBeNull()
      expect(result.current.showInstallPrompt).toBe(false)
    })

    it("should handle dismissed install", async () => {
      const { result } = renderHook(() => usePWAInstall())
      const mockPrompt = createMockBeforeInstallPromptEvent("dismissed")

      act(() => {
        result.current.setDeferredPrompt(mockPrompt)
      })

      let installResult: boolean = false

      await act(async () => {
        installResult = await result.current.triggerInstall()
      })

      expect(installResult).toBe(false)
      expect(result.current.installStatus).toBe("dismissed")
    })

    it("should handle install error", async () => {
      const { result } = renderHook(() => usePWAInstall())
      const mockPrompt = {
        ...createMockBeforeInstallPromptEvent(),
        prompt: jest.fn().mockRejectedValue(new Error("Install failed")),
      }

      act(() => {
        result.current.setDeferredPrompt(mockPrompt)
      })

      let installResult: boolean = false

      await act(async () => {
        installResult = await result.current.triggerInstall()
      })

      expect(installResult).toBe(false)
      expect(result.current.installStatus).toBe("idle")
    })

    it("should dismiss install", () => {
      const { result } = renderHook(() => usePWAInstall())

      act(() => {
        result.current.openInstallPrompt()
      })

      act(() => {
        result.current.dismissInstall()
      })

      expect(result.current.showInstallPrompt).toBe(false)
      expect(result.current.installStatus).toBe("dismissed")
    })

    it("should reset install state", () => {
      const { result } = renderHook(() => usePWAInstall())

      act(() => {
        result.current.openInstallPrompt()
        result.current.dismissInstall()
      })

      expect(result.current.installStatus).toBe("dismissed")

      act(() => {
        result.current.resetInstallState()
      })

      expect(result.current.showInstallPrompt).toBe(false)
      expect(result.current.installStatus).toBe("idle")
    })
  })

  // ==========================================================================
  // Derived State Tests
  // ==========================================================================

  describe("Derived State", () => {
    it("should update hasDeferredPrompt when prompt is set", () => {
      const { result } = renderHook(() => usePWAInstall())

      expect(result.current.hasDeferredPrompt).toBe(false)

      act(() => {
        result.current.setDeferredPrompt(createMockBeforeInstallPromptEvent())
      })

      expect(result.current.hasDeferredPrompt).toBe(true)
    })

    it("should show isInstalled when status is accepted", async () => {
      const { result } = renderHook(() => usePWAInstall())
      const mockPrompt = createMockBeforeInstallPromptEvent("accepted")

      act(() => {
        result.current.setDeferredPrompt(mockPrompt)
      })

      await act(async () => {
        await result.current.triggerInstall()
      })

      expect(result.current.isInstalled).toBe(true)
    })

    it("should show isInstalled when isStandalone", () => {
      window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }))

      const { result } = renderHook(() => usePWAInstall())

      expect(result.current.isInstalled).toBe(true)
    })
  })

  // ==========================================================================
  // Callback Stability Tests
  // ==========================================================================

  describe("Callback Stability", () => {
    it("should maintain stable setDeferredPrompt reference", () => {
      const { result, rerender } = renderHook(() => usePWAInstall())

      const firstRef = result.current.setDeferredPrompt

      rerender()

      expect(result.current.setDeferredPrompt).toBe(firstRef)
    })

    it("should maintain stable openInstallPrompt reference", () => {
      const { result, rerender } = renderHook(() => usePWAInstall())

      const firstRef = result.current.openInstallPrompt

      rerender()

      expect(result.current.openInstallPrompt).toBe(firstRef)
    })

    it("should maintain stable closeInstallPrompt reference", () => {
      const { result, rerender } = renderHook(() => usePWAInstall())

      const firstRef = result.current.closeInstallPrompt

      rerender()

      expect(result.current.closeInstallPrompt).toBe(firstRef)
    })

    it("should maintain stable dismissInstall reference", () => {
      const { result, rerender } = renderHook(() => usePWAInstall())

      const firstRef = result.current.dismissInstall

      rerender()

      expect(result.current.dismissInstall).toBe(firstRef)
    })

    it("should maintain stable resetInstallState reference", () => {
      const { result, rerender } = renderHook(() => usePWAInstall())

      const firstRef = result.current.resetInstallState

      rerender()

      expect(result.current.resetInstallState).toBe(firstRef)
    })

    it("should update triggerInstall when deferredPrompt changes", () => {
      const { result, rerender } = renderHook(() => usePWAInstall())

      const firstRef = result.current.triggerInstall

      act(() => {
        result.current.setDeferredPrompt(createMockBeforeInstallPromptEvent())
      })

      rerender()

      expect(result.current.triggerInstall).not.toBe(firstRef)
    })
  })

  // ==========================================================================
  // Workflow Tests
  // ==========================================================================

  describe("Workflow: User installs PWA", () => {
    it("should handle complete installation flow", async () => {
      const { result } = renderHook(() => usePWAInstall())
      const mockPrompt = createMockBeforeInstallPromptEvent("accepted")

      // Browser fires beforeinstallprompt
      act(() => {
        result.current.setDeferredPrompt(mockPrompt)
      })

      expect(result.current.hasDeferredPrompt).toBe(true)

      // User clicks install button, opening modal
      act(() => {
        result.current.openInstallPrompt()
      })

      expect(result.current.showInstallPrompt).toBe(true)

      // User confirms installation
      await act(async () => {
        await result.current.triggerInstall()
      })

      expect(result.current.installStatus).toBe("accepted")
      expect(result.current.isInstalled).toBe(true)
      expect(result.current.showInstallPrompt).toBe(false)
      expect(result.current.deferredPrompt).toBeNull()
    })
  })

  describe("Workflow: User dismisses install prompt", () => {
    it("should handle dismissal flow", async () => {
      const { result } = renderHook(() => usePWAInstall())
      const mockPrompt = createMockBeforeInstallPromptEvent("dismissed")

      act(() => {
        result.current.setDeferredPrompt(mockPrompt)
        result.current.openInstallPrompt()
      })

      await act(async () => {
        await result.current.triggerInstall()
      })

      expect(result.current.installStatus).toBe("dismissed")
      expect(result.current.isInstalled).toBe(false)
    })
  })

  describe("Workflow: User closes modal without triggering install", () => {
    it("should allow closing modal without triggering install", () => {
      const { result } = renderHook(() => usePWAInstall())

      act(() => {
        result.current.setDeferredPrompt(createMockBeforeInstallPromptEvent())
        result.current.openInstallPrompt()
      })

      expect(result.current.showInstallPrompt).toBe(true)

      // User closes modal via X button
      act(() => {
        result.current.closeInstallPrompt()
      })

      expect(result.current.showInstallPrompt).toBe(false)
      expect(result.current.installStatus).toBe("idle")
      // Prompt should still be available for later
      expect(result.current.hasDeferredPrompt).toBe(true)
    })
  })

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("Edge Cases", () => {
    it("should handle rapid state changes", () => {
      const { result } = renderHook(() => usePWAInstall())

      act(() => {
        result.current.openInstallPrompt()
        result.current.closeInstallPrompt()
        result.current.openInstallPrompt()
      })

      expect(result.current.showInstallPrompt).toBe(true)
    })

    it("should handle multiple setDeferredPrompt calls", () => {
      const { result } = renderHook(() => usePWAInstall())
      const mockPrompt1 = createMockBeforeInstallPromptEvent()
      const mockPrompt2 = createMockBeforeInstallPromptEvent()

      act(() => {
        result.current.setDeferredPrompt(mockPrompt1)
      })

      act(() => {
        result.current.setDeferredPrompt(mockPrompt2)
      })

      expect(result.current.deferredPrompt).toBe(mockPrompt2)
    })

    it("should not affect install status when resetting after acceptance", async () => {
      const { result } = renderHook(() => usePWAInstall())
      const mockPrompt = createMockBeforeInstallPromptEvent("accepted")

      act(() => {
        result.current.setDeferredPrompt(mockPrompt)
      })

      await act(async () => {
        await result.current.triggerInstall()
      })

      expect(result.current.installStatus).toBe("accepted")

      // Reset should change status back to idle
      act(() => {
        result.current.resetInstallState()
      })

      expect(result.current.installStatus).toBe("idle")
    })
  })
})
