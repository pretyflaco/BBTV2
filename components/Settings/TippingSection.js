/**
 * TippingSection - Configure tipping settings
 */

import { useState, useEffect } from 'react';
import { useCombinedAuth } from '../../lib/hooks/useCombinedAuth';
import { useDarkMode } from '../../lib/hooks/useDarkMode';

const PRESET_PERCENTAGES = [0, 5, 10, 15, 20, 25];

export default function TippingSection() {
  const { tippingSettings, updateTippingSettings } = useCombinedAuth();
  const { darkMode } = useDarkMode();
  
  const [enabled, setEnabled] = useState(tippingSettings?.enabled ?? true);
  const [defaultPercentage, setDefaultPercentage] = useState(tippingSettings?.defaultPercentage ?? 15);
  const [customPercentages, setCustomPercentages] = useState(
    tippingSettings?.customPercentages ?? [10, 15, 20]
  );
  const [allowCustomAmount, setAllowCustomAmount] = useState(tippingSettings?.allowCustomAmount ?? true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Update local state when tippingSettings changes
  useEffect(() => {
    if (tippingSettings) {
      setEnabled(tippingSettings.enabled ?? true);
      setDefaultPercentage(tippingSettings.defaultPercentage ?? 15);
      setCustomPercentages(tippingSettings.customPercentages ?? [10, 15, 20]);
      setAllowCustomAmount(tippingSettings.allowCustomAmount ?? true);
    }
  }, [tippingSettings]);

  const handleSave = () => {
    setSaving(true);
    try {
      const result = updateTippingSettings({
        enabled,
        defaultPercentage,
        customPercentages,
        allowCustomAmount
      });
      
      if (result?.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        console.error('Failed to save tipping settings:', result?.error);
      }
    } catch (err) {
      console.error('Failed to save tipping settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePercentageToggle = (percentage) => {
    if (customPercentages.includes(percentage)) {
      setCustomPercentages(customPercentages.filter(p => p !== percentage));
    } else {
      setCustomPercentages([...customPercentages, percentage].sort((a, b) => a - b));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className={`text-lg font-semibold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Tipping Settings
        </h3>
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Configure how tips are handled in the POS.
        </p>
      </div>

      {/* Enable Tipping Toggle */}
      <div className={`rounded-xl p-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Enable Tipping
            </h4>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Show tip options during checkout
            </p>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              enabled ? 'bg-blink-accent' : darkMode ? 'bg-gray-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                enabled ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>
      </div>

      {enabled && (
        <>
          {/* Default Tip Percentage */}
          <div className={`rounded-xl p-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
            <h4 className={`font-medium mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Default Tip Percentage
            </h4>
            <div className="flex flex-wrap gap-2">
              {PRESET_PERCENTAGES.map((percentage) => (
                <button
                  key={percentage}
                  onClick={() => setDefaultPercentage(percentage)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    defaultPercentage === percentage
                      ? 'bg-blink-accent text-black'
                      : darkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {percentage === 0 ? 'No tip' : `${percentage}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Tip Options */}
          <div className={`rounded-xl p-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
            <h4 className={`font-medium mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Quick Tip Options
            </h4>
            <p className={`text-sm mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Select which percentages to show as quick options
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_PERCENTAGES.filter(p => p > 0).map((percentage) => (
                <button
                  key={percentage}
                  onClick={() => handlePercentageToggle(percentage)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    customPercentages.includes(percentage)
                      ? 'bg-blink-accent text-black'
                      : darkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {percentage}%
                </button>
              ))}
            </div>
          </div>

          {/* Allow Custom Amount */}
          <div className={`rounded-xl p-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Allow Custom Tip Amount
                </h4>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Let customers enter a custom tip amount
                </p>
              </div>
              <button
                onClick={() => setAllowCustomAmount(!allowCustomAmount)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  allowCustomAmount ? 'bg-blink-accent' : darkMode ? 'bg-gray-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    allowCustomAmount ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-blink-accent text-black hover:bg-blink-accent/90'
          } disabled:opacity-50`}
        >
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

