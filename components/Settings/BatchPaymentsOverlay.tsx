import BatchPayments from "../BatchPayments"
import type { VoucherWallet } from "../../lib/hooks/useVoucherWalletState"

interface BatchPaymentsOverlayProps {
  voucherWallet: VoucherWallet
  darkMode: boolean
  setShowBatchPayments: (show: boolean) => void
  setSideMenuOpen: (open: boolean) => void
  getSubmenuBgClasses: () => string
  getSubmenuHeaderClasses: () => string
}

export default function BatchPaymentsOverlay({
  voucherWallet,
  darkMode,
  setShowBatchPayments,
  setSideMenuOpen,
  getSubmenuBgClasses,
  getSubmenuHeaderClasses,
}: BatchPaymentsOverlayProps) {
  return (
    <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-y-auto`}>
      <div
        className="min-h-screen"
        style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
      >
        {/* Header */}
        <div className={`${getSubmenuHeaderClasses()} sticky top-0 z-10`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <button
                onClick={() => {
                  setShowBatchPayments(false)
                  setSideMenuOpen(true)
                }}
                className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
              >
                <span className="text-2xl mr-2">‹</span>
                <span className="text-lg">Back</span>
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Batch Payments
              </h1>
              <div className="w-16"></div>
            </div>
          </div>
        </div>
        {/* Content */}
        <div className="max-w-md mx-auto px-4 py-6">
          <BatchPayments
            apiKey={voucherWallet.apiKey}
            walletId={String(
              voucherWallet.walletId ?? voucherWallet.btcWalletId ?? voucherWallet.id,
            )}
            darkMode={darkMode}
            onClose={() => {
              setShowBatchPayments(false)
              setSideMenuOpen(true)
            }}
            hideHeader={true}
          />
        </div>
      </div>
    </div>
  )
}
