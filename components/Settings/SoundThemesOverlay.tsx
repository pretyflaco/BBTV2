/**
 * SoundThemesOverlay - Sound theme selection overlay
 * Extracted from Dashboard.js
 */

interface SoundTheme {
  id: string
  name: string
  description: string
}

interface SoundThemesOverlayProps {
  soundEnabled: boolean
  soundTheme: string
  setSoundEnabled: (enabled: boolean) => void
  setSoundTheme: (theme: string) => void
  setShowSoundThemes: (show: boolean) => void
  getSubmenuBgClasses: () => string
  getSubmenuHeaderClasses: () => string
  getSelectionTileClasses: () => string
  getSelectionTileActiveClasses: () => string
}

export default function SoundThemesOverlay({
  soundEnabled,
  soundTheme,
  setSoundEnabled,
  setSoundTheme,
  setShowSoundThemes,
  getSubmenuBgClasses,
  getSubmenuHeaderClasses,
  getSelectionTileClasses,
  getSelectionTileActiveClasses,
}: SoundThemesOverlayProps) {
  const THEMES: SoundTheme[] = [
    { id: "success", name: "Success", description: "Classic payment sounds" },
    { id: "zelda", name: "Zelda", description: "Breath of the Wild sounds" },
    { id: "free", name: "Free", description: "Freedom sounds" },
    { id: "retro", name: "Retro", description: "Classic 8-bit sounds" },
  ]

  return (
    <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-y-auto`}>
      <div className="min-h-screen">
        {/* Header */}
        <div className={`${getSubmenuHeaderClasses()} sticky top-0 z-10`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <button
                onClick={() => setShowSoundThemes(false)}
                className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
              >
                <span className="text-2xl mr-2">‹</span>
                <span className="text-lg">Back</span>
              </button>
              <h1
                className="text-xl font-bold text-gray-900 dark:text-white"
                style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
              >
                Themes
              </h1>
              <div className="w-16"></div>
            </div>
          </div>
        </div>

        {/* Themes List */}
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="space-y-3">
            {/* None Option */}
            <button
              onClick={() => {
                setSoundEnabled(false)
                setShowSoundThemes(false)
              }}
              className={`w-full p-4 rounded-lg border-2 transition-all ${
                !soundEnabled
                  ? getSelectionTileActiveClasses()
                  : getSelectionTileClasses()
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <h3
                    className="text-lg font-semibold text-gray-900 dark:text-white mb-1"
                    style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
                  >
                    None
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Sound effects disabled
                  </p>
                </div>
                {!soundEnabled && (
                  <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                )}
              </div>
            </button>

            {/* Theme Options */}
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => {
                  setSoundEnabled(true)
                  setSoundTheme(theme.id)
                  setShowSoundThemes(false)
                }}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  soundEnabled && soundTheme === theme.id
                    ? getSelectionTileActiveClasses()
                    : getSelectionTileClasses()
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <h3
                      className="text-lg font-semibold text-gray-900 dark:text-white mb-1"
                      style={{ fontFamily: "'Source Sans Pro', sans-serif" }}
                    >
                      {theme.name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {theme.description}
                    </p>
                  </div>
                  {soundEnabled && soundTheme === theme.id && (
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
