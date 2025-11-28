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
    activeBlinkAccount,
    addBlinkAccount,
    setActiveBlinkAccount,
    hasServerSession,
    storeBlinkAccountOnServer
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
      setError('Please enter an API key');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Validate API key with Blink
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

      // Add to local storage
      const result = await addBlinkAccount({
        label: label.trim() || 'Blink Account',
        apiKey: apiKey.trim(),
        username: data.data.me.username,
        defaultCurrency: data.data.me.defaultAccount?.displayCurrency || 'BTC'
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to add account');
      }

      // Also store on server if we have a session
      if (hasServerSession) {
        await storeBlinkAccountOnServer(apiKey.trim(), data.data.me.defaultAccount?.displayCurrency || 'BTC');
      }

      // Reset form
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
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className={`text-lg font-semibold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Blink Accounts
          </h3>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Manage your connected Blink accounts.
          </p>
        </div>
        {authMode === 'nostr' && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blink-accent text-black text-sm font-medium rounded-lg hover:bg-blink-accent/90 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Account
          </button>
        )}
      </div>

      {/* Add Account Form */}
      {showAddForm && (
        <div className={`rounded-xl p-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
          <h4 className={`font-medium mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Add New Blink Account
          </h4>
          <form onSubmit={handleAddAccount} className="space-y-4">
            <div>
              <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Account Label
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="My Blink Account"
                className={`w-full px-3 py-2 rounded-lg border ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                } focus:outline-none focus:ring-2 focus:ring-blink-accent`}
              />
            </div>
            <div>
              <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                API Key <span className="text-gray-500">(READ + RECEIVE scopes)</span>
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="blink_..."
                required
                className={`w-full px-3 py-2 rounded-lg border ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                } focus:outline-none focus:ring-2 focus:ring-blink-accent`}
              />
            </div>
            
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blink-accent text-black text-sm font-medium rounded-lg hover:bg-blink-accent/90 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Validating...' : 'Add Account'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setApiKey('');
                  setLabel('');
                  setError(null);
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  darkMode 
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
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
      <div className="space-y-3">
        {blinkAccounts && blinkAccounts.length > 0 ? (
          blinkAccounts.map((account) => (
            <div
              key={account.id}
              className={`rounded-xl p-4 border transition-colors ${
                account.isActive
                  ? darkMode
                    ? 'bg-blink-accent/10 border-blink-accent'
                    : 'bg-blink-accent/5 border-blink-accent'
                  : darkMode
                    ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    account.isActive 
                      ? 'bg-blink-accent/20 text-blink-accent' 
                      : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-600'
                  }`}>
                    💳
                  </div>
                  <div>
                    <h5 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {account.label || 'Blink Account'}
                    </h5>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      @{account.username || 'Unknown'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {account.isActive ? (
                    <span className="px-3 py-1 text-xs font-medium bg-blink-accent/20 text-blink-accent rounded-full">
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSetActive(account.id)}
                      className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                        darkMode 
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      Set Active
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className={`rounded-xl p-8 text-center ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
            <div className="text-4xl mb-3">💳</div>
            <h4 className={`font-medium mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              No Blink Accounts
            </h4>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {authMode === 'nostr' 
                ? 'Add a Blink account to start accepting payments.'
                : 'Your Blink account is connected via API key.'
              }
            </p>
          </div>
        )}
      </div>

      {/* Help Text */}
      <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
        <p>
          Get your API key from{' '}
          <a 
            href="https://dashboard.blink.sv" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blink-accent hover:underline"
          >
            Blink Dashboard
          </a>
          . Use READ and RECEIVE scopes for POS functionality.
        </p>
      </div>
    </div>
  );
}

