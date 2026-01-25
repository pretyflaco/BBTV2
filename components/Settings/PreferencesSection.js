/**
 * PreferencesSection - User preferences (theme, currency, etc.)
 */

import { useState, useEffect } from 'react';
import { useCombinedAuth } from '../../lib/hooks/useCombinedAuth';
import { useTheme, THEMES } from '../../lib/hooks/useTheme';
import { useCurrencies } from '../../lib/hooks/useCurrencies';

export default function PreferencesSection() {
  const { preferences, updatePreferences } = useCombinedAuth();
  const { theme, setTheme, darkMode } = useTheme();
  const { currencies, getAllCurrencies } = useCurrencies();
  
  const [defaultCurrency, setDefaultCurrency] = useState(preferences?.defaultCurrency ?? 'USD');
  const [showSatsFirst, setShowSatsFirst] = useState(preferences?.showSatsFirst ?? false);
  const [soundEnabled, setSoundEnabled] = useState(preferences?.soundEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (preferences) {
      setDefaultCurrency(preferences.defaultCurrency ?? 'USD');
      setShowSatsFirst(preferences.showSatsFirst ?? false);
      setSoundEnabled(preferences.soundEnabled ?? true);
    }
  }, [preferences]);

  const handleSave = () => {
    setSaving(true);
    try {
      const result = updatePreferences({
        defaultCurrency,
        showSatsFirst,
        soundEnabled
      });
      
      if (result?.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const popularCurrencies = ['USD', 'EUR', 'GBP', 'BTC'];
  const allCurrencies = currencies ? getAllCurrencies() : [];
  
  const sortedCurrencies = allCurrencies.sort((a, b) => {
    const aCode = a.id || a.code;
    const bCode = b.id || b.code;
    const aPopular = popularCurrencies.indexOf(aCode);
    const bPopular = popularCurrencies.indexOf(bCode);
    if (aPopular !== -1 && bPopular !== -1) return aPopular - bPopular;
    if (aPopular !== -1) return -1;
    if (bPopular !== -1) return 1;
    return aCode.localeCompare(bCode);
  });

  // Toggle switch component matching Dashboard style
  const Toggle = ({ value, onChange }) => (
    <button
      onClick={onChange}
      className="inline-flex gap-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:ring-offset-2 rounded"
    >
      <span className={`w-5 h-5 transition-colors ${
        value ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
      }`} />
      <span className={`w-5 h-5 transition-colors ${
        value ? 'bg-gray-300 dark:bg-gray-600' : 'bg-blink-accent'
      }`} />
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Theme Selector */}
      <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <h4 className={`font-medium text-sm mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Theme
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setTheme(THEMES.DARK)}
            className={`py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              theme === THEMES.DARK
                ? 'bg-blink-accent text-black'
                : darkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Dark
          </button>
          <button
            onClick={() => setTheme(THEMES.BLINK_CLASSIC_DARK)}
            className={`py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              theme === THEMES.BLINK_CLASSIC_DARK
                ? 'bg-blink-accent text-black'
                : darkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            BC Dark
          </button>
          <button
            onClick={() => setTheme(THEMES.LIGHT)}
            className={`py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              theme === THEMES.LIGHT
                ? 'bg-blink-accent text-black'
                : darkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Light
          </button>
          <button
            onClick={() => setTheme(THEMES.BLINK_CLASSIC_LIGHT)}
            className={`py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              theme === THEMES.BLINK_CLASSIC_LIGHT
                ? 'bg-blink-accent text-black'
                : darkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            BC Light
          </button>
        </div>
        <p className={`text-xs mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
          Tip: Tap the Blink logo to quickly cycle through themes
        </p>
      </div>

      {/* Default Currency */}
      <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <h4 className={`font-medium text-sm mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Default Currency
        </h4>
        <select
          value={defaultCurrency}
          onChange={(e) => setDefaultCurrency(e.target.value)}
          className={`w-full px-3 py-2 rounded-md border text-sm ${
            darkMode 
              ? 'bg-gray-800 border-gray-600 text-white' 
              : 'bg-white border-gray-300 text-gray-900'
          } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
        >
          {sortedCurrencies.length > 0 ? (
            sortedCurrencies.map((currency) => {
              const code = currency.id || currency.code;
              const displayCode = currency.displayId || code;
              return (
                <option key={code} value={code}>
                  {displayCode} - {currency.name || code}
                </option>
              );
            })
          ) : (
            <>
              <option value="USD">USD - US Dollar</option>
              <option value="EUR">EUR - Euro</option>
              <option value="GBP">GBP - British Pound</option>
              <option value="BTC">BTC - Bitcoin</option>
              <option value="SAT">SAT - Satoshis</option>
            </>
          )}
        </select>
      </div>

      {/* Show Sats First */}
      <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-between">
          <h4 className={`font-medium text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Show Sats First
          </h4>
          <div className="flex items-center gap-2">
            <Toggle value={showSatsFirst} onChange={() => setShowSatsFirst(!showSatsFirst)} />
            <span className={`text-sm ${darkMode ? 'text-white' : 'text-gray-700'}`}>
              {showSatsFirst ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* Sound Effects */}
      <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-between">
          <h4 className={`font-medium text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Sound Effects
          </h4>
          <div className="flex items-center gap-2">
            <Toggle value={soundEnabled} onChange={() => setSoundEnabled(!soundEnabled)} />
            <span className={`text-sm ${darkMode ? 'text-white' : 'text-gray-700'}`}>
              {soundEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full py-2 rounded-md text-sm font-medium transition-colors ${
          saved
            ? 'bg-green-500 text-white'
            : 'bg-blink-accent text-black hover:bg-blink-accent/90'
        } disabled:opacity-50`}
      >
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
      </button>

      {/* App Info */}
      <div className={`pt-4 border-t text-center ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
          BlinkPOS v5 &middot; Powered by{' '}
          <a 
            href="https://blink.sv" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blink-accent hover:underline"
          >
            Blink
          </a>
        </p>
      </div>
    </div>
  );
}
