import {
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react"

import type { CartCheckoutData } from "./useViewNavigation"

// Spinner colors for transitions
const SPINNER_COLORS: string[] = [
  "border-blue-600",
  "border-green-600",
  "border-orange-500",
  "border-red-600",
  "border-yellow-500",
  "border-purple-600",
  "border-cyan-500",
  "border-pink-500",
]

interface CartRef {
  resetNavigation?: () => void
}

interface UsePublicPOSViewStateParams {
  cartRef?: RefObject<CartRef | null>
}

interface UsePublicPOSViewStateReturn {
  currentView: string
  setCurrentView: Dispatch<SetStateAction<string>>
  isViewTransitioning: boolean
  setIsViewTransitioning: Dispatch<SetStateAction<boolean>>
  transitionColorIndex: number
  cartCheckoutData: CartCheckoutData | null
  setCartCheckoutData: Dispatch<SetStateAction<CartCheckoutData | null>>
  showingInvoice: boolean
  setShowingInvoice: Dispatch<SetStateAction<boolean>>
  handleViewTransition: (newView: string) => void
  handleInternalTransition: () => void
  SPINNER_COLORS: string[]
}

/**
 * usePublicPOSViewState - Manages view navigation for PublicPOSDashboard
 *
 * Handles:
 * - Current view (cart/pos only)
 * - View transition animation state
 * - Cart checkout data passing
 * - Invoice showing state
 * - View transition handler with spinner color cycling
 */
export function usePublicPOSViewState({
  cartRef,
}: UsePublicPOSViewStateParams = {}): UsePublicPOSViewStateReturn {
  const [currentView, setCurrentView] = useState("pos")
  const [isViewTransitioning, setIsViewTransitioning] = useState(false)
  const [transitionColorIndex, setTransitionColorIndex] = useState(0)
  const [cartCheckoutData, setCartCheckoutData] = useState<CartCheckoutData | null>(null)
  const [showingInvoice, setShowingInvoice] = useState(false)

  // View transition handler
  const handleViewTransition = useCallback(
    (newView: string) => {
      if (newView === currentView || isViewTransitioning) return

      setTransitionColorIndex((prev) => (prev + 1) % SPINNER_COLORS.length)
      setIsViewTransitioning(true)

      setTimeout(() => {
        setCurrentView(newView)
        setIsViewTransitioning(false)

        // Reset cart navigation when entering cart view
        if (newView === "cart" && cartRef?.current) {
          cartRef.current.resetNavigation?.()
        }
      }, 150)
    },
    [currentView, isViewTransitioning, cartRef],
  )

  // Internal transition handler (for POS component)
  const handleInternalTransition = useCallback(() => {
    setTransitionColorIndex((prev) => (prev + 1) % SPINNER_COLORS.length)
    setIsViewTransitioning(true)
    setTimeout(() => setIsViewTransitioning(false), 120)
  }, [])

  return {
    currentView,
    setCurrentView,
    isViewTransitioning,
    setIsViewTransitioning,
    transitionColorIndex,
    cartCheckoutData,
    setCartCheckoutData,
    showingInvoice,
    setShowingInvoice,
    handleViewTransition,
    handleInternalTransition,
    SPINNER_COLORS,
  }
}
