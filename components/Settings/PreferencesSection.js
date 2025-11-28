/**
 * PreferencesSection - User preferences (theme, currency, etc.)
 */

import { useState, useEffect } from 'react';
import { useCombinedAuth } from '../../lib/hooks/useCombinedAuth';
import { useDarkMode } from '../../lib/hooks/useDarkMode';
import { useCurrencies } from '../../lib/hooks/useCurrencies';

export default function PreferencesSection() {
  const { preferences, updatePreferences } = useCombinedAuth();
  const { darkMode, toggleDarkMode } = useDarkMode();
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

  const popularCurrencies = ['USD', 'EUR', 'GBP', 'BTC', 'SAT'];
  const allCurrencies = currencies ? getAllCurrencies() : [];
  
  const sortedCurrencies = allCurrencies.sort((a, b) => {
    const aPopular = popularCurrencies.indexOf(a.code);
    const bPopular = popularCurrencies.indexOf(b.code);
    if (aPopular !== -1 && bPopular !== -1) return aPopular - bPopular;
    if (aPopular !== -1) return -1;
    if (bPopular !== -1) return 1;
    return a.code.localeCompare(b.code);
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
      {/* Dark Mode */}
      <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-between">
          <h4 className={`font-medium text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Dark Mode
          </h4>
          <div className="flex items-center gap-2">
            <Toggle value={darkMode} onChange={toggleDarkMode} />
            <span className={`text-sm ${darkMode ? 'text-white' : 'text-gray-700'}`}>
              {darkMode ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
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
            sortedCurrencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} - {currency.name || currency.code}
              </option>
            ))
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
