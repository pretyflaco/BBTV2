/**
 * TipProfileSettingsOverlay - Tip percentage profile selection
 * Extracted from Dashboard.js
 */

export default function TipProfileSettingsOverlay({
  tipPresets,
  activeTipProfile,
  voucherWallet,
  setTipPresets,
  setActiveTipProfile,
  setShowTipProfileSettings,
  setShowPercentSettings,
  TIP_PROFILES,
  getSubmenuBgClasses,
  getSubmenuHeaderClasses,
  getSelectionTileClasses,
  getSelectionTileActiveClasses,
}) {
  return (
    <div className={`fixed inset-0 ${getSubmenuBgClasses()} z-50 overflow-y-auto`}>
      <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Header */}
        <div className={`${getSubmenuHeaderClasses()} sticky top-0 z-10`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <button
                onClick={() => {
                  setShowTipProfileSettings(false);
                  // If voucher wallet is connected, go back to % Settings menu
                  if (voucherWallet) {
                    setShowPercentSettings(true);
                  }
                }}
                className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
              >
                <span className="text-2xl mr-2">‹</span>
                <span className="text-lg">Back</span>
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Tip % Settings
              </h1>
              <div className="w-16"></div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select a tip profile based on your region. This determines the tip percentages shown to customers.
            </p>

            {/* Custom Option (No Profile) */}
            <div
              className={`w-full p-4 rounded-lg border-2 transition-all ${
                !activeTipProfile
                  ? getSelectionTileActiveClasses()
                  : getSelectionTileClasses()
              }`}
            >
              <button
                onClick={() => {
                  setActiveTipProfile(null);
                }}
                className="w-full"
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                      Custom
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Set your own tip percentages
                    </p>
                  </div>
                  {!activeTipProfile && (
                    <div className="text-blink-accent text-2xl">✓</div>
                  )}
                </div>
              </button>

              {/* Custom Tip Percentages Editor (only visible when Custom is selected) */}
              {!activeTipProfile && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Custom Tip Percentages
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {tipPresets.map((preset, index) => (
                      <div key={index} className="flex items-center">
                        <input
                          type="number"
                          value={preset}
                          onChange={(e) => {
                            const newPresets = [...tipPresets];
                            newPresets[index] = parseFloat(e.target.value) || 0;
                            setTipPresets(newPresets);
                          }}
                          className="w-16 px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-center"
                          min="0"
                          max="100"
                          step="0.5"
                        />
                        <span className="ml-1 text-gray-500 dark:text-gray-400">%</span>
                        {tipPresets.length > 1 && (
                          <button
                            onClick={() => setTipPresets(tipPresets.filter((_, i) => i !== index))}
                            className="ml-2 text-red-500 hover:text-red-700"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setTipPresets([...tipPresets, 5])}
                    className="mt-3 px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded transition-colors"
                  >
                    Add Option
                  </button>
                </div>
              )}
            </div>

            {/* Predefined Profiles */}
            {TIP_PROFILES.map((profile) => (
              <button
                key={profile.id}
                onClick={() => {
                  setActiveTipProfile(profile);
                  setShowTipProfileSettings(false);
                }}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  activeTipProfile?.id === profile.id
                    ? getSelectionTileActiveClasses()
                    : getSelectionTileClasses()
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                      {profile.name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {profile.tipOptions.join('%, ')}%
                    </p>
                  </div>
                  {activeTipProfile?.id === profile.id && (
                    <div className="text-blink-accent text-2xl">✓</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
