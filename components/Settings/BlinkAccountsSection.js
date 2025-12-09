/**
 * BlinkAccountsSection - Manage Blink accounts
 */

import { useState } from 'react';
import { useCombinedAuth } from '../../lib/hooks/useCombinedAuth';
import { useDarkMode } from '../../lib/hooks/useDarkMode';

export default function BlinkAccountsSection() {
  const { 
    authMode,
    blinkAccounts,
    addBlinkAccount,
    setActiveBlinkAccount,
    hasServerSession,
    storeBlinkAccountOnServer,
    publicKey
  } = useCombinedAuth();
  
  const { darkMode } = useDarkMode();
  const [showAddForm, setShowAddForm] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('Enter an API key');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('https://api.blink.sv/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey.trim()
        },
        body: JSON.stringify({
          query: 'query { me { id username defaultAccount { displayCurrency } } }'
        })
      });

      if (!response.ok) {
        throw new Error('Invalid API key');
      }

      const data = await response.json();
      if (data.errors || !data.data?.me?.id) {
        throw new Error('Invalid API key');
      }

      const result = await addBlinkAccount({
        label: label.trim() || 'Blink Account',
        apiKey: apiKey.trim(),
        username: data.data.me.username,
        defaultCurrency: data.data.me.defaultAccount?.displayCurrency || 'BTC'
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to add account');
      }

      // Store on server for cross-device sync
      if (authMode === 'nostr') {
        await storeBlinkAccountOnServer(
          apiKey.trim(), 
          data.data.me.defaultAccount?.displayCurrency || 'BTC',
          label || data.data.me.username
        );
      }

      setApiKey('');
      setLabel('');
      setShowAddForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetActive = (accountId) => {
    try {
      setActiveBlinkAccount(accountId);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      {authMode === 'nostr' && !showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-2 text-sm font-medium bg-blink-accent text-black rounded-md hover:bg-blink-accent/90 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Account
        </button>
      )}

      {/* Add Account Form */}
      {showAddForm && (
        <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <form onSubmit={handleAddAccount} className="space-y-3">
            <div>
              <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Label
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="My Account"
                className={`w-full px-3 py-2 rounded-md border text-sm ${
                  darkMode 
                    ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
              />
            </div>
            <div>
              <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="blink_..."
                required
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                className={`w-full px-3 py-2 rounded-md border text-sm ${
                  darkMode 
                    ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
              />
            </div>
            
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2 bg-blink-accent text-black text-sm font-medium rounded-md hover:bg-blink-accent/90 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Validating...' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setApiKey('');
                  setLabel('');
                  setError(null);
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  darkMode 
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Accounts List */}
      <div className="space-y-2">
        {blinkAccounts && blinkAccounts.length > 0 ? (
          blinkAccounts.map((account) => (
            <div
              key={account.id}
              className={`rounded-lg p-3 border transition-colors ${
                account.isActive
                  ? darkMode
                    ? 'bg-blink-accent/10 border-blink-accent'
                    : 'bg-blink-accent/5 border-blink-accent'
                  : darkMode
                    ? 'bg-gray-900 border-gray-700'
                    : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                    account.isActive 
                      ? 'bg-blink-accent/20' 
                      : darkMode ? 'bg-gray-800' : 'bg-gray-200'
                  }`}>
                    <svg className={`w-5 h-5 ${account.isActive ? 'text-blink-accent' : darkMode ? 'text-gray-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h5 className={`font-medium truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {account.label || 'Blink Account'}
                    </h5>
                    <p className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      @{account.username || 'Unknown'}
                    </p>
                  </div>
                </div>
                <div className="flex-shrink-0 ml-2">
                  {account.isActive ? (
                    <span className="px-2 py-1 text-xs font-medium bg-blink-accent/20 text-blink-accent rounded">
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSetActive(account.id)}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                        darkMode 
                          ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      Use
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className={`rounded-lg p-6 text-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <svg className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              No accounts connected
            </p>
          </div>
        )}
      </div>

      {/* Help link */}
      <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
        Get API key from{' '}
        <a 
          href="https://dashboard.blink.sv" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blink-accent hover:underline"
        >
          dashboard.blink.sv
        </a>
      </p>
    </div>
  );
}
