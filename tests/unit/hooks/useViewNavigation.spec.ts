/**
 * Tests for useViewNavigation hook
 */

import { renderHook, act } from "@testing-library/react"

import {
  useViewNavigation,
  SPINNER_COLORS,
  DEFAULT_TRANSITION_DELAY,
  FIXED_VIEWS,
  VOUCHER_VIEWS,
  type DashboardView,
  type CartCheckoutData,
} from "../../../lib/hooks/useViewNavigation"

// Mock timers for transition delays
jest.useFakeTimers()

describe("useViewNavigation", () => {
  beforeEach(() => {
    jest.clearAllTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
  })

  // ===========================================================================
  // Constants Tests
  // ===========================================================================

  describe("Constants", () => {
    it("should export SPINNER_COLORS with 8 colors", () => {
      expect(SPINNER_COLORS).toHaveLength(8)
      expect(SPINNER_COLORS[0]).toBe("border-blue-600")
      expect(SPINNER_COLORS[7]).toBe("border-pink-500")
    })

    it("should export DEFAULT_TRANSITION_DELAY of 300ms", () => {
      expect(DEFAULT_TRANSITION_DELAY).toBe(300)
    })

    it("should export FIXED_VIEWS", () => {
      expect(FIXED_VIEWS).toContain("pos")
      expect(FIXED_VIEWS).toContain("cart")
      expect(FIXED_VIEWS).toContain("voucher")
      expect(FIXED_VIEWS).toContain("multivoucher")
      expect(FIXED_VIEWS).toContain("vouchermanager")
    })

    it("should export VOUCHER_VIEWS", () => {
      expect(VOUCHER_VIEWS).toContain("voucher")
      expect(VOUCHER_VIEWS).toContain("multivoucher")
      expect(VOUCHER_VIEWS).toContain("vouchermanager")
    })
  })

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================

  describe("Initial State", () => {
    it("should initialize with default values", () => {
      const { result } = renderHook(() => useViewNavigation())

      expect(result.current.currentView).toBe("pos")
      expect(result.current.isViewTransitioning).toBe(false)
      expect(result.current.transitionColorIndex).toBe(0)
      expect(result.current.cartCheckoutData).toBeNull()
      expect(result.current.sideMenuOpen).toBe(false)
    })

    it("should accept custom initial view", () => {
      const { result } = renderHook(() => useViewNavigation("transactions"))

      expect(result.current.currentView).toBe("transactions")
    })

    it("should initialize with cart view", () => {
      const { result } = renderHook(() => useViewNavigation("cart"))

      expect(result.current.currentView).toBe("cart")
    })

    it("should initialize with voucher view", () => {
      const { result } = renderHook(() => useViewNavigation("voucher"))

      expect(result.current.currentView).toBe("voucher")
    })
  })

  // ===========================================================================
  // Derived State Tests
  // ===========================================================================

  describe("Derived State", () => {
    it("should compute isFixedView correctly for pos", () => {
      const { result } = renderHook(() => useViewNavigation("pos"))
      expect(result.current.isFixedView).toBe(true)
    })

    it("should compute isFixedView correctly for cart", () => {
      const { result } = renderHook(() => useViewNavigation("cart"))
      expect(result.current.isFixedView).toBe(true)
    })

    it("should compute isFixedView correctly for transactions", () => {
      const { result } = renderHook(() => useViewNavigation("transactions"))
      expect(result.current.isFixedView).toBe(false)
    })

    it("should compute isVoucherRelatedView correctly for voucher", () => {
      const { result } = renderHook(() => useViewNavigation("voucher"))
      expect(result.current.isVoucherRelatedView).toBe(true)
    })

    it("should compute isVoucherRelatedView correctly for multivoucher", () => {
      const { result } = renderHook(() => useViewNavigation("multivoucher"))
      expect(result.current.isVoucherRelatedView).toBe(true)
    })

    it("should compute isVoucherRelatedView correctly for pos", () => {
      const { result } = renderHook(() => useViewNavigation("pos"))
      expect(result.current.isVoucherRelatedView).toBe(false)
    })

    it("should compute currentSpinnerColor correctly", () => {
      const { result } = renderHook(() => useViewNavigation())
      expect(result.current.currentSpinnerColor).toBe("border-blue-600")
    })

    it("should update currentSpinnerColor when index changes", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.setTransitionColorIndex(3)
      })

      expect(result.current.currentSpinnerColor).toBe("border-red-600")
    })
  })

  // ===========================================================================
  // Navigation Availability Tests
  // ===========================================================================

  describe("Navigation Availability", () => {
    it("should allow left navigation from cart", () => {
      const { result } = renderHook(() => useViewNavigation("cart"))
      expect(result.current.canNavigateLeft).toBe(true)
    })

    it("should allow left navigation from pos", () => {
      const { result } = renderHook(() => useViewNavigation("pos"))
      expect(result.current.canNavigateLeft).toBe(true)
    })

    it("should not allow left navigation from transactions", () => {
      const { result } = renderHook(() => useViewNavigation("transactions"))
      expect(result.current.canNavigateLeft).toBe(false)
    })

    it("should allow right navigation from transactions", () => {
      const { result } = renderHook(() => useViewNavigation("transactions"))
      expect(result.current.canNavigateRight).toBe(true)
    })

    it("should allow right navigation from pos", () => {
      const { result } = renderHook(() => useViewNavigation("pos"))
      expect(result.current.canNavigateRight).toBe(true)
    })

    it("should not allow right navigation from cart", () => {
      const { result } = renderHook(() => useViewNavigation("cart"))
      expect(result.current.canNavigateRight).toBe(false)
    })

    it("should allow up navigation from pos", () => {
      const { result } = renderHook(() => useViewNavigation("pos"))
      expect(result.current.canNavigateUp).toBe(true)
    })

    it("should allow up navigation from voucher", () => {
      const { result } = renderHook(() => useViewNavigation("voucher"))
      expect(result.current.canNavigateUp).toBe(true)
    })

    it("should not allow up navigation from cart", () => {
      const { result } = renderHook(() => useViewNavigation("cart"))
      expect(result.current.canNavigateUp).toBe(false)
    })
  })

  // ===========================================================================
  // Core Setters Tests
  // ===========================================================================

  describe("Core Setters", () => {
    it("should set current view directly", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.setCurrentView("transactions")
      })

      expect(result.current.currentView).toBe("transactions")
    })

    it("should set isViewTransitioning", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.setIsViewTransitioning(true)
      })

      expect(result.current.isViewTransitioning).toBe(true)
    })

    it("should set transitionColorIndex", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.setTransitionColorIndex(5)
      })

      expect(result.current.transitionColorIndex).toBe(5)
    })

    it("should set cartCheckoutData", () => {
      const { result } = renderHook(() => useViewNavigation())
      const checkoutData: CartCheckoutData = {
        amount: 1000,
        currency: "USD",
        items: [{ name: "Coffee", price: 500, quantity: 2 }],
        memo: "Test order",
      }

      act(() => {
        result.current.setCartCheckoutData(checkoutData)
      })

      expect(result.current.cartCheckoutData).toEqual(checkoutData)
    })

    it("should set sideMenuOpen", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.setSideMenuOpen(true)
      })

      expect(result.current.sideMenuOpen).toBe(true)
    })
  })

  // ===========================================================================
  // navigateToView Tests
  // ===========================================================================

  describe("navigateToView", () => {
    it("should not navigate if already on the same view", () => {
      const { result } = renderHook(() => useViewNavigation("pos"))

      act(() => {
        result.current.navigateToView("pos")
      })

      expect(result.current.isViewTransitioning).toBe(false)
      expect(result.current.currentView).toBe("pos")
    })

    it("should start transition when navigating to different view", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.navigateToView("transactions")
      })

      expect(result.current.isViewTransitioning).toBe(true)
      expect(result.current.transitionColorIndex).toBe(1) // Advanced by 1
    })

    it("should complete navigation after transition delay", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.navigateToView("transactions")
      })

      expect(result.current.currentView).toBe("pos") // Still old view during transition

      act(() => {
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("transactions")
      expect(result.current.isViewTransitioning).toBe(false)
    })

    it("should use custom transition delay", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.navigateToView("transactions", 500)
      })

      act(() => {
        jest.advanceTimersByTime(300)
      })

      expect(result.current.isViewTransitioning).toBe(true)

      act(() => {
        jest.advanceTimersByTime(200)
      })

      expect(result.current.isViewTransitioning).toBe(false)
      expect(result.current.currentView).toBe("transactions")
    })

    it("should advance spinner color on each navigation", () => {
      const { result } = renderHook(() => useViewNavigation())

      expect(result.current.transitionColorIndex).toBe(0)

      act(() => {
        result.current.navigateToView("transactions")
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.transitionColorIndex).toBe(1)

      act(() => {
        result.current.navigateToView("pos")
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.transitionColorIndex).toBe(2)
    })

    it("should wrap spinner color index", () => {
      const { result } = renderHook(() => useViewNavigation())

      // Set to last color
      act(() => {
        result.current.setTransitionColorIndex(7)
      })

      act(() => {
        result.current.navigateToView("transactions")
      })

      expect(result.current.transitionColorIndex).toBe(0) // Wrapped around
    })
  })

  // ===========================================================================
  // Side Menu Tests
  // ===========================================================================

  describe("Side Menu Actions", () => {
    it("should toggle side menu", () => {
      const { result } = renderHook(() => useViewNavigation())

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

    it("should open side menu", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.openSideMenu()
      })

      expect(result.current.sideMenuOpen).toBe(true)

      // Opening again should keep it open
      act(() => {
        result.current.openSideMenu()
      })

      expect(result.current.sideMenuOpen).toBe(true)
    })

    it("should close side menu", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.openSideMenu()
      })

      act(() => {
        result.current.closeSideMenu()
      })

      expect(result.current.sideMenuOpen).toBe(false)
    })
  })

  // ===========================================================================
  // Cart Checkout Data Tests
  // ===========================================================================

  describe("Cart Checkout Data", () => {
    it("should clear cart checkout data", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.setCartCheckoutData({ amount: 100, currency: "USD" })
      })

      expect(result.current.cartCheckoutData).not.toBeNull()

      act(() => {
        result.current.clearCartCheckoutData()
      })

      expect(result.current.cartCheckoutData).toBeNull()
    })
  })

  // ===========================================================================
  // advanceSpinnerColor Tests
  // ===========================================================================

  describe("advanceSpinnerColor", () => {
    it("should advance spinner color by 1", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.advanceSpinnerColor()
      })

      expect(result.current.transitionColorIndex).toBe(1)
    })

    it("should wrap around at end of colors array", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.setTransitionColorIndex(7)
      })

      act(() => {
        result.current.advanceSpinnerColor()
      })

      expect(result.current.transitionColorIndex).toBe(0)
    })
  })

  // ===========================================================================
  // navigateLeft Tests
  // ===========================================================================

  describe("navigateLeft", () => {
    it("should navigate from cart to pos", () => {
      const { result } = renderHook(() => useViewNavigation("cart"))

      act(() => {
        result.current.navigateLeft()
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("pos")
    })

    it("should navigate from pos to transactions", () => {
      const { result } = renderHook(() => useViewNavigation("pos"))

      act(() => {
        result.current.navigateLeft()
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("transactions")
    })

    it("should navigate from multivoucher to vouchermanager with voucher wallet", () => {
      const { result } = renderHook(() => useViewNavigation("multivoucher"))

      act(() => {
        result.current.navigateLeft(true)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("vouchermanager")
    })

    it("should not navigate from multivoucher without voucher wallet", () => {
      const { result } = renderHook(() => useViewNavigation("multivoucher"))

      act(() => {
        result.current.navigateLeft(false)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("multivoucher")
    })

    it("should navigate from voucher to multivoucher with voucher wallet", () => {
      const { result } = renderHook(() => useViewNavigation("voucher"))

      act(() => {
        result.current.navigateLeft(true)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("multivoucher")
    })

    it("should not navigate from transactions (end of left navigation)", () => {
      const { result } = renderHook(() => useViewNavigation("transactions"))

      act(() => {
        result.current.navigateLeft()
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("transactions")
    })
  })

  // ===========================================================================
  // navigateRight Tests
  // ===========================================================================

  describe("navigateRight", () => {
    it("should navigate from transactions to pos", () => {
      const { result } = renderHook(() => useViewNavigation("transactions"))

      act(() => {
        result.current.navigateRight()
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("pos")
    })

    it("should navigate from pos to cart", () => {
      const { result } = renderHook(() => useViewNavigation("pos"))

      act(() => {
        result.current.navigateRight()
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("cart")
    })

    it("should navigate from vouchermanager to multivoucher with voucher wallet", () => {
      const { result } = renderHook(() => useViewNavigation("vouchermanager"))

      act(() => {
        result.current.navigateRight(true)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("multivoucher")
    })

    it("should not navigate from vouchermanager without voucher wallet", () => {
      const { result } = renderHook(() => useViewNavigation("vouchermanager"))

      act(() => {
        result.current.navigateRight(false)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("vouchermanager")
    })

    it("should navigate from voucher to pos with voucher wallet", () => {
      const { result } = renderHook(() => useViewNavigation("voucher"))

      act(() => {
        result.current.navigateRight(true)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("pos")
    })

    it("should not navigate from cart (end of right navigation)", () => {
      const { result } = renderHook(() => useViewNavigation("cart"))

      act(() => {
        result.current.navigateRight()
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("cart")
    })
  })

  // ===========================================================================
  // navigateUp Tests
  // ===========================================================================

  describe("navigateUp", () => {
    it("should navigate from pos to voucher with voucher wallet", () => {
      const { result } = renderHook(() => useViewNavigation("pos"))

      act(() => {
        result.current.navigateUp(true)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("voucher")
    })

    it("should navigate from voucher to pos with voucher wallet", () => {
      const { result } = renderHook(() => useViewNavigation("voucher"))

      act(() => {
        result.current.navigateUp(true)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("pos")
    })

    it("should not navigate without voucher wallet", () => {
      const { result } = renderHook(() => useViewNavigation("pos"))

      act(() => {
        result.current.navigateUp(false)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("pos")
    })

    it("should not navigate from cart even with voucher wallet", () => {
      const { result } = renderHook(() => useViewNavigation("cart"))

      act(() => {
        result.current.navigateUp(true)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("cart")
    })

    it("should not navigate from transactions even with voucher wallet", () => {
      const { result } = renderHook(() => useViewNavigation("transactions"))

      act(() => {
        result.current.navigateUp(true)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("transactions")
    })
  })

  // ===========================================================================
  // Callback Stability Tests
  // ===========================================================================

  describe("Callback Stability", () => {
    it("should maintain stable setCurrentView reference", () => {
      const { result, rerender } = renderHook(() => useViewNavigation())
      const initial = result.current.setCurrentView

      rerender()

      expect(result.current.setCurrentView).toBe(initial)
    })

    it("should maintain stable setIsViewTransitioning reference", () => {
      const { result, rerender } = renderHook(() => useViewNavigation())
      const initial = result.current.setIsViewTransitioning

      rerender()

      expect(result.current.setIsViewTransitioning).toBe(initial)
    })

    it("should maintain stable toggleSideMenu reference", () => {
      const { result, rerender } = renderHook(() => useViewNavigation())
      const initial = result.current.toggleSideMenu

      rerender()

      expect(result.current.toggleSideMenu).toBe(initial)
    })

    it("should maintain stable openSideMenu reference", () => {
      const { result, rerender } = renderHook(() => useViewNavigation())
      const initial = result.current.openSideMenu

      rerender()

      expect(result.current.openSideMenu).toBe(initial)
    })

    it("should maintain stable closeSideMenu reference", () => {
      const { result, rerender } = renderHook(() => useViewNavigation())
      const initial = result.current.closeSideMenu

      rerender()

      expect(result.current.closeSideMenu).toBe(initial)
    })

    it("should maintain stable advanceSpinnerColor reference", () => {
      const { result, rerender } = renderHook(() => useViewNavigation())
      const initial = result.current.advanceSpinnerColor

      rerender()

      expect(result.current.advanceSpinnerColor).toBe(initial)
    })

    it("should maintain stable clearCartCheckoutData reference", () => {
      const { result, rerender } = renderHook(() => useViewNavigation())
      const initial = result.current.clearCartCheckoutData

      rerender()

      expect(result.current.clearCartCheckoutData).toBe(initial)
    })

    it("should update navigateToView when currentView changes", () => {
      const { result } = renderHook(() => useViewNavigation())
      const initial = result.current.navigateToView

      act(() => {
        result.current.setCurrentView("transactions")
      })

      expect(result.current.navigateToView).not.toBe(initial)
    })

    it("should update navigateLeft when currentView changes", () => {
      const { result } = renderHook(() => useViewNavigation())
      const initial = result.current.navigateLeft

      act(() => {
        result.current.setCurrentView("cart")
      })

      expect(result.current.navigateLeft).not.toBe(initial)
    })

    it("should update navigateRight when currentView changes", () => {
      const { result } = renderHook(() => useViewNavigation())
      const initial = result.current.navigateRight

      act(() => {
        result.current.setCurrentView("transactions")
      })

      expect(result.current.navigateRight).not.toBe(initial)
    })

    it("should update navigateUp when currentView changes", () => {
      const { result } = renderHook(() => useViewNavigation())
      const initial = result.current.navigateUp

      act(() => {
        result.current.setCurrentView("voucher")
      })

      expect(result.current.navigateUp).not.toBe(initial)
    })
  })

  // ===========================================================================
  // Workflow Tests
  // ===========================================================================

  describe("Workflow: Cart checkout flow", () => {
    it("should handle cart to POS checkout", () => {
      const { result } = renderHook(() => useViewNavigation("cart"))

      // Set checkout data from cart
      const checkoutData: CartCheckoutData = {
        amount: 2500,
        currency: "USD",
        items: [
          { name: "Item 1", price: 1000, quantity: 1 },
          { name: "Item 2", price: 1500, quantity: 1 },
        ],
        memo: "Cart checkout",
      }

      act(() => {
        result.current.setCartCheckoutData(checkoutData)
      })

      // Navigate to POS
      act(() => {
        result.current.navigateToView("pos")
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      expect(result.current.currentView).toBe("pos")
      expect(result.current.cartCheckoutData).toEqual(checkoutData)

      // After payment, clear checkout data
      act(() => {
        result.current.clearCartCheckoutData()
      })

      expect(result.current.cartCheckoutData).toBeNull()
    })
  })

  describe("Workflow: Swipe navigation", () => {
    it("should handle complete left swipe sequence", () => {
      const { result } = renderHook(() => useViewNavigation("cart"))

      // Cart -> POS
      act(() => {
        result.current.navigateLeft()
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })
      expect(result.current.currentView).toBe("pos")

      // POS -> Transactions
      act(() => {
        result.current.navigateLeft()
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })
      expect(result.current.currentView).toBe("transactions")

      // Transactions has no left navigation
      act(() => {
        result.current.navigateLeft()
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })
      expect(result.current.currentView).toBe("transactions")
    })

    it("should handle complete right swipe sequence", () => {
      const { result } = renderHook(() => useViewNavigation("transactions"))

      // Transactions -> POS
      act(() => {
        result.current.navigateRight()
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })
      expect(result.current.currentView).toBe("pos")

      // POS -> Cart
      act(() => {
        result.current.navigateRight()
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })
      expect(result.current.currentView).toBe("cart")

      // Cart has no right navigation
      act(() => {
        result.current.navigateRight()
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })
      expect(result.current.currentView).toBe("cart")
    })
  })

  describe("Workflow: Voucher navigation with wallet", () => {
    it("should navigate through voucher views with wallet", () => {
      const { result } = renderHook(() => useViewNavigation("pos"))

      // POS -> Voucher (up)
      act(() => {
        result.current.navigateUp(true)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })
      expect(result.current.currentView).toBe("voucher")

      // Voucher -> MultiVoucher (left)
      act(() => {
        result.current.navigateLeft(true)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })
      expect(result.current.currentView).toBe("multivoucher")

      // MultiVoucher -> VoucherManager (left)
      act(() => {
        result.current.navigateLeft(true)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })
      expect(result.current.currentView).toBe("vouchermanager")

      // VoucherManager -> MultiVoucher (right)
      act(() => {
        result.current.navigateRight(true)
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })
      expect(result.current.currentView).toBe("multivoucher")
    })
  })

  describe("Workflow: Side menu interaction", () => {
    it("should handle opening menu during navigation", () => {
      const { result } = renderHook(() => useViewNavigation())

      // Open side menu
      act(() => {
        result.current.openSideMenu()
      })
      expect(result.current.sideMenuOpen).toBe(true)

      // Navigate to different view
      act(() => {
        result.current.navigateToView("transactions")
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      // Side menu should still be open (component handles closing)
      expect(result.current.sideMenuOpen).toBe(true)
      expect(result.current.currentView).toBe("transactions")

      // Close side menu
      act(() => {
        result.current.closeSideMenu()
      })
      expect(result.current.sideMenuOpen).toBe(false)
    })
  })

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    it("should handle rapid navigation attempts", () => {
      const { result } = renderHook(() => useViewNavigation())

      // Start first navigation
      act(() => {
        result.current.navigateToView("transactions")
      })

      expect(result.current.isViewTransitioning).toBe(true)

      // Try another navigation during transition
      // The hook doesn't prevent this - component logic would
      act(() => {
        result.current.navigateToView("cart")
      })

      // Both timeouts will fire, last one wins
      act(() => {
        jest.advanceTimersByTime(DEFAULT_TRANSITION_DELAY)
      })

      // Last navigation request completes
      expect(result.current.currentView).toBe("cart")
    })

    it("should handle manual transition state manipulation", () => {
      const { result } = renderHook(() => useViewNavigation())

      act(() => {
        result.current.setIsViewTransitioning(true)
      })

      expect(result.current.isViewTransitioning).toBe(true)

      // Can still change view directly
      act(() => {
        result.current.setCurrentView("transactions")
      })

      expect(result.current.currentView).toBe("transactions")
      expect(result.current.isViewTransitioning).toBe(true)

      // Must manually end transition
      act(() => {
        result.current.setIsViewTransitioning(false)
      })

      expect(result.current.isViewTransitioning).toBe(false)
    })

    it("should handle all views in sequence", () => {
      const views: DashboardView[] = [
        "pos",
        "cart",
        "voucher",
        "multivoucher",
        "vouchermanager",
        "transactions",
      ]
      const { result } = renderHook(() => useViewNavigation())

      views.forEach((view) => {
        act(() => {
          result.current.setCurrentView(view)
        })
        expect(result.current.currentView).toBe(view)
      })
    })

    it("should update derived state when view changes", () => {
      const { result } = renderHook(() => useViewNavigation("pos"))

      expect(result.current.isFixedView).toBe(true)
      expect(result.current.isVoucherRelatedView).toBe(false)

      act(() => {
        result.current.setCurrentView("voucher")
      })

      expect(result.current.isFixedView).toBe(true)
      expect(result.current.isVoucherRelatedView).toBe(true)

      act(() => {
        result.current.setCurrentView("transactions")
      })

      expect(result.current.isFixedView).toBe(false)
      expect(result.current.isVoucherRelatedView).toBe(false)
    })
  })
})
