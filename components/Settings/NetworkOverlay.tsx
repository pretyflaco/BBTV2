import Network from "../Network"
import { SPINNER_COLORS } from "../../lib/hooks/useViewNavigation"

// Network is a JS forwardRef component — TS strips its props.
// Cast to a typed component to avoid TS2322.
const NetworkComponent = Network as React.ComponentType<{
  publicKey: string | null
  nostrProfile: unknown
  darkMode: boolean
  theme: string
  cycleTheme: () => void
  hideHeader?: boolean
  onInternalTransition?: () => void
}>

interface NetworkOverlayProps {
  publicKey: string | null
  nostrProfile: unknown
  darkMode: boolean
  theme: string
  cycleTheme: () => void
  setShowNetworkOverlay: (show: boolean) => void
  setSideMenuOpen: (open: boolean) => void
  setTransitionColorIndex: (updater: (prev: number) => number) => void
  setIsViewTransitioning: (transitioning: boolean) => void
  getSubmenuBgClasses: () => string
  getSubmenuHeaderClasses: () => string
}

export default function NetworkOverlay({
  publicKey,
  nostrProfile,
  darkMode,
  theme,
  cycleTheme,
  setShowNetworkOverlay,
  setSideMenuOpen,
  setTransitionColorIndex,
  setIsViewTransitioning,
  getSubmenuBgClasses,
  getSubmenuHeaderClasses,
}: NetworkOverlayProps) {
  return (
    <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-hidden`}>
      <div
        className="h-full flex flex-col"
        style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
      >
        {/* Header */}
        <div className={`flex-shrink-0 ${getSubmenuHeaderClasses()}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <button
                onClick={() => {
                  setShowNetworkOverlay(false)
                  setSideMenuOpen(true)
                }}
                className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
              >
                <span className="text-2xl mr-2">‹</span>
                <span className="text-lg">Back</span>
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Circular Economy Network
              </h1>
              <div className="w-16"></div>
            </div>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <NetworkComponent
            publicKey={publicKey}
            nostrProfile={nostrProfile}
            darkMode={darkMode}
            theme={theme}
            cycleTheme={cycleTheme}
            hideHeader={true}
            onInternalTransition={() => {
              setTransitionColorIndex(
                (prev: number) => (prev + 1) % SPINNER_COLORS.length,
              )
              setIsViewTransitioning(true)
              setTimeout(() => setIsViewTransitioning(false), 120)
            }}
          />
        </div>
      </div>
    </div>
  )
}
