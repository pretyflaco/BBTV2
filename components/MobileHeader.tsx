import type { Theme } from "../lib/hooks/useTheme"
import type { DashboardView } from "../lib/hooks/useViewNavigation"

interface VoucherWallet {
  label?: string
  username?: string
  apiKey?: string
  [key: string]: unknown
}

interface MobileHeaderProps {
  theme: Theme
  cycleTheme: () => void
  currentView: DashboardView
  handleViewTransition: (view: DashboardView) => void
  isViewTransitioning: boolean
  voucherWallet: VoucherWallet | null
  sideMenuOpen: boolean
  setSideMenuOpen: (open: boolean) => void
}

export default function MobileHeader({
  theme,
  cycleTheme,
  currentView,
  handleViewTransition,
  isViewTransitioning,
  voucherWallet,
  sideMenuOpen,
  setSideMenuOpen,
}: MobileHeaderProps) {
  return (
    <header
      className={`${theme === "blink-classic-dark" ? "bg-black" : "bg-gray-50 dark:bg-blink-dark"} shadow dark:shadow-black sticky top-0 z-40`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          {/* Blink Logo - Left (tap to cycle theme) */}
          <button
            onClick={cycleTheme}
            className="flex items-center focus:outline-none"
            aria-label="Cycle theme"
          >
            {/* Light logo for light themes (light header bg) */}
            <img
              src="/logos/blink-icon-light.svg"
              alt="Blink"
              className={`h-12 w-12 ${theme === "light" || theme === "blink-classic-light" ? "block" : "hidden"}`}
            />
            {/* Dark logo for dark themes (dark header bg) */}
            <img
              src="/logos/blink-icon-dark.svg"
              alt="Blink"
              className={`h-12 w-12 ${theme === "light" || theme === "blink-classic-light" ? "hidden" : "block"}`}
            />
          </button>

          {/* Navigation Dots - Center - Two rows layout */}
          <div className="flex flex-col items-center gap-1">
            {/* Upper row: Cart - POS - History */}
            <div className="flex gap-2">
              <button
                onClick={() => handleViewTransition("cart")}
                disabled={isViewTransitioning}
                className={`w-2 h-2 rounded-full transition-colors ${
                  currentView === "cart"
                    ? "bg-blink-accent"
                    : "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
                }`}
                aria-label="Cart"
              />
              <button
                onClick={() => handleViewTransition("pos")}
                disabled={isViewTransitioning}
                className={`w-2 h-2 rounded-full transition-colors ${
                  currentView === "pos"
                    ? "bg-blink-accent"
                    : "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
                }`}
                aria-label="POS"
              />
              <button
                onClick={() => handleViewTransition("transactions")}
                disabled={isViewTransitioning}
                className={`w-2 h-2 rounded-full transition-colors ${
                  currentView === "transactions"
                    ? "bg-blink-accent"
                    : "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
                }`}
                aria-label="History"
              />
            </div>
            {/* Lower row: MultiVoucher - Voucher - VoucherManager (below POS) */}
            {voucherWallet && (
              <div className="flex gap-2 justify-center">
                {/* MultiVoucher dot - left */}
                <button
                  onClick={() => {
                    // Allow navigation from POS, voucher, multivoucher, or vouchermanager
                    if (
                      currentView === "pos" ||
                      currentView === "voucher" ||
                      currentView === "multivoucher" ||
                      currentView === "vouchermanager"
                    ) {
                      handleViewTransition("multivoucher")
                    }
                  }}
                  disabled={
                    isViewTransitioning ||
                    (currentView !== "pos" &&
                      currentView !== "voucher" &&
                      currentView !== "multivoucher" &&
                      currentView !== "vouchermanager")
                  }
                  className={`w-2 h-2 rounded-full transition-colors ${
                    currentView === "multivoucher"
                      ? "bg-purple-600 dark:bg-purple-400"
                      : currentView === "pos" ||
                          currentView === "voucher" ||
                          currentView === "vouchermanager"
                        ? "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
                        : "bg-gray-200 dark:bg-gray-700 opacity-50 cursor-not-allowed"
                  }`}
                  aria-label="Multi-Voucher"
                  title="Multi-Voucher (batch create)"
                />
                {/* Voucher dot - center */}
                <button
                  onClick={() => {
                    // Allow navigation from POS, voucher, multivoucher, or vouchermanager
                    if (
                      currentView === "pos" ||
                      currentView === "voucher" ||
                      currentView === "multivoucher" ||
                      currentView === "vouchermanager"
                    ) {
                      handleViewTransition("voucher")
                    }
                  }}
                  disabled={
                    isViewTransitioning ||
                    (currentView !== "pos" &&
                      currentView !== "voucher" &&
                      currentView !== "multivoucher" &&
                      currentView !== "vouchermanager")
                  }
                  className={`w-2 h-2 rounded-full transition-colors ${
                    currentView === "voucher"
                      ? "bg-purple-600 dark:bg-purple-400"
                      : currentView === "pos" ||
                          currentView === "multivoucher" ||
                          currentView === "vouchermanager"
                        ? "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
                        : "bg-gray-200 dark:bg-gray-700 opacity-50 cursor-not-allowed"
                  }`}
                  aria-label="Voucher"
                  title="Single Voucher"
                />
                {/* VoucherManager dot - right */}
                <button
                  onClick={() => {
                    // Allow navigation from POS, voucher, multivoucher, or vouchermanager
                    if (
                      currentView === "pos" ||
                      currentView === "voucher" ||
                      currentView === "multivoucher" ||
                      currentView === "vouchermanager"
                    ) {
                      handleViewTransition("vouchermanager")
                    }
                  }}
                  disabled={
                    isViewTransitioning ||
                    (currentView !== "pos" &&
                      currentView !== "voucher" &&
                      currentView !== "multivoucher" &&
                      currentView !== "vouchermanager")
                  }
                  className={`w-2 h-2 rounded-full transition-colors ${
                    currentView === "vouchermanager"
                      ? "bg-purple-600 dark:bg-purple-400"
                      : currentView === "pos" ||
                          currentView === "voucher" ||
                          currentView === "multivoucher"
                        ? "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
                        : "bg-gray-200 dark:bg-gray-700 opacity-50 cursor-not-allowed"
                  }`}
                  aria-label="Voucher Manager"
                  title="Voucher Manager"
                />
              </div>
            )}
          </div>

          {/* Right Side: Menu Button */}
          <button
            onClick={() => setSideMenuOpen(!sideMenuOpen)}
            className="p-2 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-blink-dark focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            aria-label="Open menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
