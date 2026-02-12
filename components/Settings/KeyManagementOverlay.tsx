import KeyManagementSection from "./KeyManagementSection"

interface KeyManagementOverlayProps {
  setShowKeyManagement: (show: boolean) => void
  getSubmenuBgClasses: () => string
  getSubmenuHeaderClasses: () => string
}

export default function KeyManagementOverlay({
  setShowKeyManagement,
  getSubmenuBgClasses,
  getSubmenuHeaderClasses,
}: KeyManagementOverlayProps) {
  return (
    <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-y-auto`}>
      <div className="min-h-screen">
        {/* Header */}
        <div className={`${getSubmenuHeaderClasses()} sticky top-0 z-10`}>
          <div className="max-w-md mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowKeyManagement(false)}
                className="flex items-center text-gray-600 dark:text-gray-400 text-base"
              >
                <svg
                  className="w-6 h-6 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back
              </button>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Key Management
              </h2>
              <div className="w-16"></div>
            </div>
          </div>
        </div>
        {/* Content */}
        <div className="max-w-md mx-auto px-4 py-6">
          <KeyManagementSection />
        </div>
      </div>
    </div>
  )
}
