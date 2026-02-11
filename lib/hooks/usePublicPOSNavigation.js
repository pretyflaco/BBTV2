import { useRef, useEffect, useCallback } from "react"

/**
 * usePublicPOSNavigation - Touch swipe and keyboard navigation for PublicPOS
 *
 * Handles:
 * - Touch swipe left/right to switch between Cart and POS views
 * - Keyboard navigation: arrow keys for view switching, numpad input for POS,
 *   cart keyboard delegation, escape for cancel/clear
 *
 * @param {Object} deps
 * @param {string} deps.currentView - Current active view ('cart' or 'pos')
 * @param {boolean} deps.showingInvoice - Whether an invoice is currently displayed
 * @param {boolean} deps.paymentSuccess - Whether payment success animation is showing
 * @param {boolean} deps.sideMenuOpen - Whether side menu is open
 * @param {boolean} deps.showCurrencySettings - Whether currency overlay is open
 * @param {boolean} deps.showSoundSettings - Whether sound overlay is open
 * @param {boolean} deps.showPaycode - Whether paycode overlay is open
 * @param {Function} deps.handleViewTransition - Function to transition between views
 * @param {Function} deps.handlePaymentAnimationHide - Function to dismiss payment animation
 * @param {Object} deps.posRef - Ref to POS component (for numpad methods)
 * @param {Object} deps.cartRef - Ref to Cart component (for keyboard delegation)
 * @returns {Object} { touchStartX, touchStartY, handleTouchStart, handleTouchMove, handleTouchEnd }
 */
export function usePublicPOSNavigation({
  currentView,
  showingInvoice,
  paymentSuccess,
  sideMenuOpen,
  showCurrencySettings,
  showSoundSettings,
  showPaycode,
  handleViewTransition,
  handlePaymentAnimationHide,
  posRef,
  cartRef,
}) {
  // Touch handling refs for swipe navigation
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  // Touch handlers for swipe navigation
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = useCallback((e) => {
    // Prevent default to avoid scrolling during swipe
  }, [])

  const handleTouchEnd = useCallback(
    (e) => {
      const touchEndX = e.changedTouches[0].clientX
      const touchEndY = e.changedTouches[0].clientY

      const deltaX = touchEndX - touchStartX.current
      const deltaY = touchEndY - touchStartY.current

      // Only handle horizontal swipes (ignore if vertical movement is larger)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX > 0) {
          // Swipe right: POS → Cart
          if (currentView === "pos") {
            handleViewTransition("cart")
          }
        } else {
          // Swipe left: Cart → POS
          if (currentView === "cart") {
            handleViewTransition("pos")
          }
        }
      }
    },
    [currentView, handleViewTransition],
  )

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if menu is open or in input
      if (sideMenuOpen || showCurrencySettings || showSoundSettings || showPaycode) return
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return

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

      // POS numpad keyboard input (only when not showing invoice)
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
      }

      // Escape key for checkout screens
      if (e.key === "Escape") {
        // Payment success animation - Done
        if (paymentSuccess) {
          e.preventDefault()
          handlePaymentAnimationHide()
          return
        }

        // POS checkout screen - Cancel
        if (currentView === "pos" && showingInvoice) {
          e.preventDefault()
          posRef.current?.handleClear?.()
          return
        }
      }

      // Arrow key navigation (only when not showing invoice)
      if (!showingInvoice && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault()
        if (e.key === "ArrowLeft" && currentView === "pos") {
          handleViewTransition("cart")
        } else if (e.key === "ArrowRight" && currentView === "cart") {
          handleViewTransition("pos")
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    currentView,
    sideMenuOpen,
    showingInvoice,
    showCurrencySettings,
    showSoundSettings,
    showPaycode,
    handleViewTransition,
    paymentSuccess,
    handlePaymentAnimationHide,
    posRef,
    cartRef,
  ])

  return { handleTouchStart, handleTouchMove, handleTouchEnd }
}
