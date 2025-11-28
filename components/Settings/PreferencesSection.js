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

  // Update local state when preferences changes
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
      } else {
        console.error('Failed to save preferences:', result?.error);
      }
    } catch (err) {
      console.error('Failed to save preferences:', err);
    } finally {
      setSaving(false);
    }
  };

  // Popular currencies to show first
  const popularCurrencies = ['USD', 'EUR', 'GBP', 'BTC', 'SAT'];
  const allCurrencies = currencies ? getAllCurrencies() : [];
  
  // Sort currencies: popular first, then alphabetically
  const sortedCurrencies = allCurrencies.sort((a, b) => {
    const aPopular = popularCurrencies.indexOf(a.code);
    const bPopular = popularCurrencies.indexOf(b.code);
    if (aPopular !== -1 && bPopular !== -1) return aPopular - bPopular;
    if (aPopular !== -1) return -1;
    if (bPopular !== -1) return 1;
    return a.code.localeCompare(b.code);
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className={`text-lg font-semibold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Preferences
        </h3>
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Customize your BlinkPOS experience.
        </p>
      </div>

      {/* Theme */}
      <div className={`rounded-xl p-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Dark Mode
            </h4>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Use dark theme for the interface
            </p>
          </div>
          <button
            onClick={toggleDarkMode}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              darkMode ? 'bg-blink-accent' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                darkMode ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Default Currency */}
      <div className={`rounded-xl p-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <h4 className={`font-medium mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Default Currency
        </h4>
        <p className={`text-sm mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Currency to display amounts in by default
        </p>
        <select
          value={defaultCurrency}
          onChange={(e) => setDefaultCurrency(e.target.value)}
          className={`w-full px-3 py-2 rounded-lg border ${
            darkMode 
              ? 'bg-gray-700 border-gray-600 text-white' 
              : 'bg-white border-gray-300 text-gray-900'
          } focus:outline-none focus:ring-2 focus:ring-blink-accent`}
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
      <div className={`rounded-xl p-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Show Sats First
            </h4>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Display satoshi amounts before fiat in transaction history
            </p>
          </div>
          <button
            onClick={() => setShowSatsFirst(!showSatsFirst)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              showSatsFirst ? 'bg-blink-accent' : darkMode ? 'bg-gray-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                showSatsFirst ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Sound Effects */}
      <div className={`rounded-xl p-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Sound Effects
            </h4>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Play sounds for payment notifications
            </p>
          </div>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              soundEnabled ? 'bg-blink-accent' : darkMode ? 'bg-gray-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                soundEnabled ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </div>
      </div>

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

      {/* App Info */}
      <div className={`pt-6 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className={`text-center text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
          <p className="mb-1">BlinkPOS v5 (Nostr Auth)</p>
          <p>
            Powered by{' '}
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
    </div>
  );
}

