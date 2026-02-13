/**
 * useViewNavigation Hook
 *
 * Manages view navigation and transition state for the Dashboard.
 * Handles switching between different views (POS, cart, voucher, etc.)
 * with animated transitions.
 */

import { useState, useCallback, useMemo } from "react"

// ============================================================================
// Types
// ============================================================================

/**
 * Available views in the dashboard
 */
export type DashboardView =
  | "pos"
  | "cart"
  | "voucher"
  | "multivoucher"
  | "vouchermanager"
  | "transactions"

/**
 * Cart checkout data passed from cart to POS
 */
export interface CartCheckoutData {
  amount: number
  currency: string
  items?: Array<{
    name: string
    price: number
    quantity: number
  }>
  memo?: string
}

/**
 * State returned by useViewNavigation hook
 */
export interface ViewNavigationState {
  // Core state
  currentView: DashboardView
  isViewTransitioning: boolean
  transitionColorIndex: number
  cartCheckoutData: CartCheckoutData | null
  sideMenuOpen: boolean

  // Derived state
  isFixedView: boolean
  isVoucherRelatedView: boolean
  currentSpinnerColor: string
  canNavigateLeft: boolean
  canNavigateRight: boolean
  canNavigateUp: boolean
}

/**
 * Actions returned by useViewNavigation hook
 */
export interface ViewNavigationActions {
  // Core setters
  setCurrentView: (view: DashboardView) => void
  setIsViewTransitioning: (transitioning: boolean) => void
  setTransitionColorIndex: (index: number) => void
  setCartCheckoutData: (data: CartCheckoutData | null) => void
  setSideMenuOpen: (open: boolean) => void

  // Convenience actions
  navigateToView: (view: DashboardView, transitionDelay?: number) => void
  toggleSideMenu: () => void
  openSideMenu: () => void
  closeSideMenu: () => void
  advanceSpinnerColor: () => void
  clearCartCheckoutData: () => void

  // Navigation helpers
  navigateLeft: (hasVoucherWallet?: boolean) => void
  navigateRight: (hasVoucherWallet?: boolean) => void
  navigateUp: (hasVoucherWallet?: boolean) => void
}

/**
 * Combined return type for useViewNavigation hook
 */
export type UseViewNavigationReturn = ViewNavigationState & ViewNavigationActions

// ============================================================================
// Constants
// ============================================================================

/**
 * Spinner colors for view transitions
 */
export const SPINNER_COLORS = [
  "border-blue-600", // Digits
  "border-green-600", // OK/Continue
  "border-orange-500", // Backspace
  "border-red-600", // Clear
  "border-yellow-500", // Skip tip
  "border-purple-600", // Variety
  "border-cyan-500", // Variety
  "border-pink-500", // Variety
] as const

/**
 * Default transition delay in milliseconds
 */
export const DEFAULT_TRANSITION_DELAY = 300

/**
 * Views that have fixed layout (no scrolling)
 */
export const FIXED_VIEWS: DashboardView[] = [
  "pos",
  "cart",
  "voucher",
  "multivoucher",
  "vouchermanager",
]

/**
 * Voucher-related views
 */
export const VOUCHER_VIEWS: DashboardView[] = [
  "voucher",
  "multivoucher",
  "vouchermanager",
]

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing view navigation and transitions
 *
 * @param initialView - Initial view to display (defaults to 'pos')
 * @returns View navigation state and actions
 *
 * @example
 * ```tsx
 * const {
 *   currentView,
 *   isViewTransitioning,
 *   navigateToView,
 *   toggleSideMenu
 * } = useViewNavigation('pos');
 *
 * // Navigate to transactions with transition
 * navigateToView('transactions');
 *
 * // Toggle side menu
 * toggleSideMenu();
 * ```
 */
export function useViewNavigation(
  initialView: DashboardView = "pos",
): UseViewNavigationReturn {
  // ===========================================================================
  // Core State
  // ===========================================================================

  const [currentView, setCurrentViewState] = useState<DashboardView>(initialView)
  const [isViewTransitioning, setIsViewTransitioning] = useState(false)
  const [transitionColorIndex, setTransitionColorIndex] = useState(0)
  const [cartCheckoutData, setCartCheckoutData] = useState<CartCheckoutData | null>(null)
  const [sideMenuOpen, setSideMenuOpen] = useState(false)

  // ===========================================================================
  // Derived State
  // ===========================================================================

  const isFixedView = useMemo(() => FIXED_VIEWS.includes(currentView), [currentView])

  const isVoucherRelatedView = useMemo(
    () => VOUCHER_VIEWS.includes(currentView),
    [currentView],
  )

  const currentSpinnerColor = useMemo(
    () => SPINNER_COLORS[transitionColorIndex],
    [transitionColorIndex],
  )

  // Navigation availability based on current view
  const canNavigateLeft = useMemo(() => {
    return (
      currentView === "cart" ||
      currentView === "pos" ||
      currentView === "multivoucher" ||
      currentView === "voucher"
    )
  }, [currentView])

  const canNavigateRight = useMemo(() => {
    return (
      currentView === "transactions" ||
      currentView === "pos" ||
      currentView === "vouchermanager" ||
      currentView === "voucher"
    )
  }, [currentView])

  const canNavigateUp = useMemo(() => {
    return currentView === "pos" || currentView === "voucher"
  }, [currentView])

  // ===========================================================================
  // Core Setters
  // ===========================================================================

  const setCurrentView = useCallback((view: DashboardView) => {
    setCurrentViewState(view)
  }, [])

  // ===========================================================================
  // Convenience Actions
  // ===========================================================================

  /**
   * Advance spinner color to next in sequence
   */
  const advanceSpinnerColor = useCallback(() => {
    setTransitionColorIndex((prev) => (prev + 1) % SPINNER_COLORS.length)
  }, [])

  /**
   * Navigate to a view with transition animation
   */
  const navigateToView = useCallback(
    (view: DashboardView, transitionDelay = DEFAULT_TRANSITION_DELAY) => {
      if (view === currentView) return

      // Advance spinner color
      advanceSpinnerColor()

      // Start transition
      setIsViewTransitioning(true)

      // After delay, switch view and end transition
      setTimeout(() => {
        setCurrentViewState(view)
        setIsViewTransitioning(false)
      }, transitionDelay)
    },
    [currentView, advanceSpinnerColor],
  )

  /**
   * Toggle side menu open/closed
   */
  const toggleSideMenu = useCallback(() => {
    setSideMenuOpen((prev) => !prev)
  }, [])

  /**
   * Open side menu
   */
  const openSideMenu = useCallback(() => {
    setSideMenuOpen(true)
  }, [])

  /**
   * Close side menu
   */
  const closeSideMenu = useCallback(() => {
    setSideMenuOpen(false)
  }, [])

  /**
   * Clear cart checkout data
   */
  const clearCartCheckoutData = useCallback(() => {
    setCartCheckoutData(null)
  }, [])

  /**
   * Navigate left (swipe left gesture)
   * cart <- pos <- voucher <- multivoucher <- vouchermanager <- transactions
   */
  const navigateLeft = useCallback(
    (hasVoucherWallet = false) => {
      if (currentView === "cart") {
        navigateToView("pos")
      } else if (currentView === "pos") {
        navigateToView("transactions")
      } else if (currentView === "multivoucher" && hasVoucherWallet) {
        navigateToView("vouchermanager")
      } else if (currentView === "voucher" && hasVoucherWallet) {
        navigateToView("multivoucher")
      }
    },
    [currentView, navigateToView],
  )

  /**
   * Navigate right (swipe right gesture)
   * cart -> pos -> voucher -> multivoucher -> vouchermanager -> transactions
   */
  const navigateRight = useCallback(
    (hasVoucherWallet = false) => {
      if (currentView === "transactions") {
        navigateToView("pos")
      } else if (currentView === "pos") {
        navigateToView("cart")
      } else if (currentView === "vouchermanager" && hasVoucherWallet) {
        navigateToView("multivoucher")
      } else if (currentView === "voucher" && hasVoucherWallet) {
        navigateToView("pos")
      }
    },
    [currentView, navigateToView],
  )

  /**
   * Navigate up (swipe up gesture) - for voucher views
   */
  const navigateUp = useCallback(
    (hasVoucherWallet = false) => {
      if (!hasVoucherWallet) return

      if (currentView === "pos") {
        navigateToView("voucher")
      } else if (currentView === "voucher") {
        navigateToView("pos")
      }
    },
    [currentView, navigateToView],
  )

  // ===========================================================================
  // Return
  // ===========================================================================

  return {
    // Core state
    currentView,
    isViewTransitioning,
    transitionColorIndex,
    cartCheckoutData,
    sideMenuOpen,

    // Derived state
    isFixedView,
    isVoucherRelatedView,
    currentSpinnerColor,
    canNavigateLeft,
    canNavigateRight,
    canNavigateUp,

    // Core setters
    setCurrentView,
    setIsViewTransitioning,
    setTransitionColorIndex,
    setCartCheckoutData,
    setSideMenuOpen,

    // Convenience actions
    navigateToView,
    toggleSideMenu,
    openSideMenu,
    closeSideMenu,
    advanceSpinnerColor,
    clearCartCheckoutData,
    navigateLeft,
    navigateRight,
    navigateUp,
  }
}

export default useViewNavigation
