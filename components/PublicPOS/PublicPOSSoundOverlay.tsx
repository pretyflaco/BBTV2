/**
 * PublicPOSSoundOverlay - Sound settings overlay for PublicPOSDashboard
 *
 * Sound theme selection: None, Success, Zelda, Free, Retro
 */

interface SoundOption {
  id: string
  label: string
  description: string
  isSelected: boolean
}

interface PublicPOSSoundOverlayProps {
  onClose: () => void
  soundEnabled: boolean
  setSoundEnabled: (enabled: boolean) => void
  soundTheme: string
  setSoundTheme: (theme: string) => void
  getSubmenuBgClasses: () => string
  getSubmenuHeaderClasses: () => string
  getSelectionTileClasses: () => string
  getSelectionTileActiveClasses: () => string
}

export default function PublicPOSSoundOverlay({
  onClose,
  soundEnabled,
  setSoundEnabled,
  soundTheme,
  setSoundTheme,
  getSubmenuBgClasses,
  getSubmenuHeaderClasses,
  getSelectionTileClasses,
  getSelectionTileActiveClasses,
}: PublicPOSSoundOverlayProps) {
  const soundOptions: SoundOption[] = [
    {
      id: "none",
      label: "None",
      description: "No payment sounds",
      isSelected: !soundEnabled,
    },
    {
      id: "success",
      label: "Success",
      description: "Classic payment sounds",
      isSelected: soundEnabled && soundTheme === "success",
    },
    {
      id: "zelda",
      label: "Zelda",
      description: "Breath of the Wild sounds",
      isSelected: soundEnabled && soundTheme === "zelda",
    },
    {
      id: "free",
      label: "Free",
      description: "Freedom sounds",
      isSelected: soundEnabled && soundTheme === "free",
    },
    {
      id: "retro",
      label: "Retro",
      description: "Classic 8-bit sounds",
      isSelected: soundEnabled && soundTheme === "retro",
    },
  ]

  const handleSelect = (optionId: string): void => {
    if (optionId === "none") {
      setSoundEnabled(false)
    } else {
      setSoundEnabled(true)
      setSoundTheme(optionId)
    }
    onClose()
  }

  return (
    <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-y-auto`}>
      <div
        className="min-h-screen"
        style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
      >
        <div className={`${getSubmenuHeaderClasses()} sticky top-0 z-10`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <button
                onClick={onClose}
                className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent"
              >
                <span className="text-2xl mr-2">‹</span>
                <span className="text-lg">Back</span>
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Sound Effects
              </h1>
              <div className="w-16"></div>
            </div>
          </div>
        </div>

        <div className="max-w-md mx-auto px-4 py-6">
          <div className="space-y-4">
            {soundOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  option.isSelected
                    ? getSelectionTileActiveClasses()
                    : getSelectionTileClasses()
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                      {option.label}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {option.description}
                    </p>
                  </div>
                  {option.isSelected && (
                    <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
