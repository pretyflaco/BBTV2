import { useEffect, useRef } from "react"

import type { DashboardView } from "./useViewNavigation"
import type { VoucherWallet } from "./useVoucherWalletState"

/**
 * Imperative handle for the POS component ref.
 */
export interface PosRefHandle {
  handleDigitPress: (digit: string) => void
  handleBackspace: () => void
  handleClear: () => void
  handleSubmit: () => void
  hasValidAmount?: () => boolean
  handlePlusPress: () => void
  isTipDialogOpen?: () => boolean
  handleTipDialogKey: (key: string) => void
}

/**
 * Imperative handle for the Voucher component ref.
 */
export interface VoucherRefHandle {
  handleDigitPress: (digit: string) => void
  handleBackspace: () => void
  handleClear: () => void
  handleSubmit: () => void
  hasValidAmount?: () => boolean
  isCommissionDialogOpen?: () => boolean
  handleCommissionDialogKey: (key: string) => void
  isRedeemed?: () => boolean
}

/**
 * Imperative handle for the MultiVoucher component ref.
 */
export interface MultiVoucherRefHandle {
  handleDigitPress: (digit: string) => void
  handleBackspace: () => void
  handleClear: () => void
  handleSubmit: () => void
  hasValidAmount?: () => boolean
  isCommissionDialogOpen?: () => boolean
  handleCommissionDialogKey: (key: string) => void
  getCurrentStep?: () => string
}

/**
 * Imperative handle for the Cart component ref.
 */
export interface CartRefHandle {
  isCartNavActive?: () => boolean
  handleCartKey: (key: string) => boolean
  enterLocalNav?: () => void
  resetNavigation?: () => void
}

/**
 * Parameters for the useNavigationHandlers hook.
 */
interface UseNavigationHandlersParams {
  currentView: DashboardView | string
  handleViewTransition: (view: DashboardView) => void
  showingInvoice: boolean
  showingVoucherQR: boolean
  isViewTransitioning: boolean
  voucherWallet: VoucherWallet | null
  sideMenuOpen: boolean
  showAnimation: boolean
  hideAnimation: () => void
  posRef: React.RefObject<PosRefHandle | null>
  voucherRef: React.RefObject<VoucherRefHandle | null>
  multiVoucherRef: React.RefObject<MultiVoucherRefHandle | null>
  cartRef: React.RefObject<CartRefHandle | null>
}

/**
 * Return type for the useNavigationHandlers hook.
 */
interface UseNavigationHandlersReturn {
  handleTouchStart: (e: React.TouchEvent) => void
  handleTouchMove: (e: React.TouchEvent) => void
  handleTouchEnd: () => void
}

/**
 * useNavigationHandlers - Touch swipe and keyboard navigation for Dashboard
 *
 * Extracted from Dashboard.js to reduce file size.
 * Handles:
 * - Touch swipe gestures for mobile view transitions
 * - Keyboard shortcuts for desktop navigation (arrow keys, numpad input, Escape)
 *
 * @param {Object} params
 * @param {string} params.currentView - Current active view
 * @param {Function} params.handleViewTransition - View transition handler
 * @param {boolean} params.showingInvoice - Whether POS invoice is showing
 * @param {boolean} params.showingVoucherQR - Whether voucher QR is showing
 * @param {boolean} params.isViewTransitioning - Whether view is mid-transition
 * @param {Object|null} params.voucherWallet - Voucher wallet object (null if disabled)
 * @param {boolean} params.sideMenuOpen - Whether the side menu overlay is open
 * @param {boolean} params.showAnimation - Whether payment animation is showing
 * @param {Function} params.hideAnimation - Hide payment animation
 * @param {Object} params.posRef - Ref to POS component
 * @param {Object} params.voucherRef - Ref to Voucher component
 * @param {Object} params.multiVoucherRef - Ref to MultiVoucher component
 * @param {Object} params.cartRef - Ref to Cart component
 *
 * @returns {{ handleTouchStart: Function, handleTouchMove: Function, handleTouchEnd: Function }}
 */
export function useNavigationHandlers({
  currentView,
  handleViewTransition,
  showingInvoice,
  showingVoucherQR,
  isViewTransitioning,
  voucherWallet,
  sideMenuOpen,
  showAnimation,
  hideAnimation,
  posRef,
  voucherRef,
  multiVoucherRef,
  cartRef,
}: UseNavigationHandlersParams): UseNavigationHandlersReturn {
  // Touch refs - only used by swipe handlers
  const touchStartX = useRef<number>(0)
  const touchEndX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const touchEndY = useRef<number>(0)

  // Handle touch events for swipe navigation
  const handleTouchStart = (e: React.TouchEvent): void => {
    touchStartX.current = e.targetTouches[0].clientX
    touchStartY.current = e.targetTouches[0].clientY
  }

  const handleTouchMove = (e: React.TouchEvent): void => {
    touchEndX.current = e.targetTouches[0].clientX
    touchEndY.current = e.targetTouches[0].clientY
  }

  const handleTouchEnd = (): void => {
    if (!touchStartX.current || !touchEndX.current) return

    const distanceX = touchStartX.current - touchEndX.current
    const distanceY = touchStartY.current - touchEndY.current
    const isLeftSwipe = distanceX > 50 && Math.abs(distanceY) < 50
    const isRightSwipe = distanceX < -50 && Math.abs(distanceY) < 50
    const isUpSwipe = distanceY > 50 && Math.abs(distanceX) < 50
    const _isDownSwipe = distanceY < -50 && Math.abs(distanceX) < 50

    // Only allow swipe navigation when:
    // - On Cart screen (not showing any overlay)
    // - On POS numpad screen (not showing invoice/tips)
    // - On Voucher numpad screen (not showing voucher QR)
    // - On MultiVoucher screen
    // - On transactions screen
    // Navigation order (horizontal): Cart ← → POS ← → Transactions
    // Navigation order (vertical): POS ↕ Voucher ↔ MultiVoucher
    // Navigation order (voucher row): MultiVoucher ← → Voucher

    // Horizontal swipes (left/right) - for cart, pos, transactions, and voucher row
    // Direction convention: Swipe LEFT moves to the RIGHT item (finger drags content left, next item appears from right)
    // Top row (left to right): Cart - POS - Transactions
    // Bottom row (left to right): MultiVoucher - Voucher - VoucherManager
    // IMPORTANT: Disable swipes when showing invoice (POS checkout) or voucher QR (voucher checkout)
    if (isLeftSwipe && !showingInvoice && !showingVoucherQR && !isViewTransitioning) {
      if (currentView === "cart") {
        handleViewTransition("pos")
      } else if (currentView === "pos") {
        handleViewTransition("transactions")
      } else if (currentView === "multivoucher" && voucherWallet) {
        // Left swipe from multivoucher goes to voucher (same as cart→pos)
        handleViewTransition("voucher")
      } else if (currentView === "voucher" && voucherWallet) {
        // Left swipe from voucher goes to vouchermanager (same as pos→transactions)
        handleViewTransition("vouchermanager")
      }
    } else if (isRightSwipe && !showingVoucherQR && !isViewTransitioning) {
      if (currentView === "transactions") {
        handleViewTransition("pos")
      } else if (currentView === "pos" && !showingInvoice) {
        handleViewTransition("cart")
      } else if (currentView === "vouchermanager" && voucherWallet) {
        // Right swipe from vouchermanager goes to voucher (same as transactions→pos)
        handleViewTransition("voucher")
      } else if (currentView === "voucher" && voucherWallet) {
        // Right swipe from voucher goes to multivoucher (same as pos→cart)
        handleViewTransition("multivoucher")
      }
    }
    // Vertical swipes (up) - between POS and Single Voucher only
    // From POS: swipe up → Voucher
    // From Voucher (Single): swipe up → POS (return to POS)
    // NOTE: MultiVoucher and VoucherManager have scrollable content,
    // so swipe UP is disabled to avoid conflicts with scrolling.
    // Users can navigate horizontally to Single Voucher, then swipe up to POS.
    // IMPORTANT: Disable swipes when showing voucher QR (voucher checkout)
    else if (
      isUpSwipe &&
      !showingInvoice &&
      !showingVoucherQR &&
      !isViewTransitioning &&
      voucherWallet
    ) {
      if (currentView === "pos") {
        handleViewTransition("voucher")
      } else if (currentView === "voucher") {
        // Only Single Voucher can swipe up to POS
        handleViewTransition("pos")
      }
    }

    // Reset touch positions
    touchStartX.current = 0
    touchEndX.current = 0
    touchStartY.current = 0
    touchEndY.current = 0
  }

  // Keyboard navigation for desktop users
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Skip if side menu is open
      if (sideMenuOpen) return

      // Skip if focused on input/textarea elements
      const activeElement = document.activeElement
      if (
        activeElement &&
        ((activeElement as HTMLElement).tagName === "INPUT" ||
          (activeElement as HTMLElement).tagName === "TEXTAREA" ||
          (activeElement as HTMLElement).isContentEditable)
      ) {
        return
      }

      // Check if tip dialog is open - delegate keyboard to POS
      if (currentView === "pos" && posRef.current?.isTipDialogOpen?.()) {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape"].includes(
            e.key,
          )
        ) {
          e.preventDefault()
          posRef.current.handleTipDialogKey(e.key)
          return
        }
      }

      // Check if commission dialog is open - delegate keyboard to Voucher
      if (currentView === "voucher" && voucherRef.current?.isCommissionDialogOpen?.()) {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape"].includes(
            e.key,
          )
        ) {
          e.preventDefault()
          voucherRef.current.handleCommissionDialogKey(e.key)
          return
        }
      }

      // Check if commission dialog is open on MultiVoucher - delegate keyboard
      if (
        currentView === "multivoucher" &&
        multiVoucherRef.current?.isCommissionDialogOpen?.()
      ) {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape"].includes(
            e.key,
          )
        ) {
          e.preventDefault()
          multiVoucherRef.current.handleCommissionDialogKey(e.key)
          return
        }
      }

      // Check if cart is active and can handle keyboard navigation
      if (currentView === "cart" && cartRef.current?.isCartNavActive?.()) {
        if (
          [
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Enter",
            "Escape",
            "Backspace",
            " ",
          ].includes(e.key)
        ) {
          const handled = cartRef.current.handleCartKey(e.key)
          if (handled) {
            e.preventDefault()
            return
          }
          // If not handled (e.g., ArrowUp from Search), fall through to global navigation
        }
      }

      // If cart view but exited to global nav, DOWN arrow re-enters local cart navigation
      if (
        currentView === "cart" &&
        e.key === "ArrowDown" &&
        cartRef.current?.enterLocalNav
      ) {
        if (!cartRef.current.isCartNavActive?.()) {
          e.preventDefault()
          cartRef.current.enterLocalNav()
          return
        }
      }

      // Escape key for checkout screens and success animations
      if (e.key === "Escape") {
        // Payment success animation - Done
        if (showAnimation) {
          e.preventDefault()
          hideAnimation()
          return
        }

        // Voucher success (redeemed) - Done
        if (currentView === "voucher" && voucherRef.current?.isRedeemed?.()) {
          e.preventDefault()
          voucherRef.current.handleClear()
          return
        }

        // POS checkout screen - Cancel
        if (currentView === "pos" && showingInvoice) {
          e.preventDefault()
          posRef.current?.handleClear?.()
          return
        }

        // Voucher checkout screen - Cancel (only if not redeemed)
        if (
          currentView === "voucher" &&
          showingVoucherQR &&
          !voucherRef.current?.isRedeemed?.()
        ) {
          e.preventDefault()
          voucherRef.current?.handleClear?.()
          return
        }
      }

      // Arrow key navigation between views (only when not in checkout or modal states)
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        e.preventDefault() // Prevent page scroll

        // Block navigation during checkout states
        if (showingInvoice || showingVoucherQR || isViewTransitioning) return

        if (e.key === "ArrowLeft") {
          // Navigate left: Transactions → POS → Cart, VoucherManager → Voucher → MultiVoucher
          if (currentView === "transactions") {
            handleViewTransition("pos")
          } else if (currentView === "pos") {
            handleViewTransition("cart")
          } else if (currentView === "vouchermanager" && voucherWallet) {
            handleViewTransition("voucher")
          } else if (currentView === "voucher" && voucherWallet) {
            handleViewTransition("multivoucher")
          }
        } else if (e.key === "ArrowRight") {
          // Navigate right: Cart → POS → Transactions, MultiVoucher → Voucher → VoucherManager
          if (currentView === "cart") {
            handleViewTransition("pos")
          } else if (currentView === "pos") {
            handleViewTransition("transactions")
          } else if (currentView === "multivoucher" && voucherWallet) {
            handleViewTransition("voucher")
          } else if (currentView === "voucher" && voucherWallet) {
            handleViewTransition("vouchermanager")
          }
        } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && voucherWallet) {
          // Navigate up/down: POS ↔ Voucher row
          if (currentView === "pos") {
            handleViewTransition("voucher")
          } else if (
            currentView === "voucher" ||
            currentView === "multivoucher" ||
            currentView === "vouchermanager"
          ) {
            handleViewTransition("pos")
          }
        }
        return
      }

      // Numpad input (only on POS and Voucher views, only when showing numpad)
      if (currentView === "pos" && !showingInvoice && posRef.current) {
        // Digit keys (top row and numpad)
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault()
          posRef.current.handleDigitPress(e.key)
          return
        }
        // Decimal point
        if (e.key === "." || e.key === ",") {
          e.preventDefault()
          posRef.current.handleDigitPress(".")
          return
        }
        // Backspace
        if (e.key === "Backspace") {
          e.preventDefault()
          posRef.current.handleBackspace()
          return
        }
        // Escape = Clear
        if (e.key === "Escape") {
          e.preventDefault()
          posRef.current.handleClear()
          return
        }
        // Enter = Submit (OK) - only if there's a valid amount
        if (e.key === "Enter") {
          e.preventDefault()
          if (posRef.current.hasValidAmount?.()) {
            posRef.current.handleSubmit()
          }
          return
        }
        // Plus key = add to stack
        if (e.key === "+") {
          e.preventDefault()
          posRef.current.handlePlusPress()
          return
        }
      } else if (currentView === "voucher" && !showingVoucherQR && voucherRef.current) {
        // Digit keys (top row and numpad)
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault()
          voucherRef.current.handleDigitPress(e.key)
          return
        }
        // Decimal point
        if (e.key === "." || e.key === ",") {
          e.preventDefault()
          voucherRef.current.handleDigitPress(".")
          return
        }
        // Backspace
        if (e.key === "Backspace") {
          e.preventDefault()
          voucherRef.current.handleBackspace()
          return
        }
        // Escape = Clear
        if (e.key === "Escape") {
          e.preventDefault()
          voucherRef.current.handleClear()
          return
        }
        // Enter = Submit (Create Voucher) - only if there's a valid amount
        if (e.key === "Enter") {
          e.preventDefault()
          if (voucherRef.current.hasValidAmount?.()) {
            voucherRef.current.handleSubmit()
          }
          return
        }
      } else if (currentView === "multivoucher" && multiVoucherRef.current) {
        // MultiVoucher keyboard handling - only on amount step
        const step = multiVoucherRef.current.getCurrentStep?.()
        if (step === "amount") {
          // Digit keys
          if (/^[0-9]$/.test(e.key)) {
            e.preventDefault()
            multiVoucherRef.current.handleDigitPress(e.key)
            return
          }
          // Decimal point
          if (e.key === "." || e.key === ",") {
            e.preventDefault()
            multiVoucherRef.current.handleDigitPress(".")
            return
          }
          // Backspace
          if (e.key === "Backspace") {
            e.preventDefault()
            multiVoucherRef.current.handleBackspace()
            return
          }
          // Escape = Clear
          if (e.key === "Escape") {
            e.preventDefault()
            multiVoucherRef.current.handleClear()
            return
          }
          // Enter = Submit (proceed to config)
          if (e.key === "Enter") {
            e.preventDefault()
            if (multiVoucherRef.current.hasValidAmount?.()) {
              multiVoucherRef.current.handleSubmit()
            }
            return
          }
        } else if (step === "config" || step === "preview") {
          // On config/preview, Escape goes back, Enter proceeds
          if (e.key === "Escape") {
            e.preventDefault()
            multiVoucherRef.current.handleClear()
            return
          }
          if (e.key === "Enter") {
            e.preventDefault()
            multiVoucherRef.current.handleSubmit()
            return
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    currentView,
    sideMenuOpen,
    showingInvoice,
    showingVoucherQR,
    isViewTransitioning,
    voucherWallet,
  ])

  return { handleTouchStart, handleTouchMove, handleTouchEnd }
}
