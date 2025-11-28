/**
 * BlinkAccountSetup - Component to add Blink API key after Nostr sign-in
 * 
 * This component is shown when a user has signed in with Nostr
 * but hasn't yet added a Blink account.
 * 
 * The API key is stored:
 * 1. Locally (encrypted) for offline access
 * 2. On server (if NIP-98 session established) for secure API calls
 */

import { useState } from 'react';
import { useProfile } from '../../lib/hooks/useProfile';
import { useNostrAuth } from '../../lib/hooks/useNostrAuth';
import { useCombinedAuth } from '../../lib/hooks/useCombinedAuth';

export default function BlinkAccountSetup({ onComplete, onSkip }) {
  const { addBlinkAccount, loading, refreshProfile } = useProfile();
  const { refreshProfile: refreshAuthProfile, hasServerSession } = useNostrAuth();
  const { storeBlinkAccountOnServer } = useCombinedAuth();
  
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('My Blink Account');
  const [error, setError] = useState(null);
  const [validating, setValidating] = useState(false);
  const [pasting, setPasting] = useState(false);

  const handlePasteFromClipboard = async () => {
    setPasting(true);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text.trim()) {
          setApiKey(text.trim());
          setError(null);
        } else {
          setError('Clipboard is empty');
        }
      } else {
        setError('Clipboard access not supported');
      }
    } catch (err) {
      console.error('Paste error:', err);
      setError('Failed to read from clipboard. Please paste manually.');
    } finally {
      setPasting(false);
    }
  };

  const validateApiKey = async (key) => {
    try {
      const response = await fetch('https://api.blink.sv/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': key
        },
        body: JSON.stringify({
          query: 'query { me { id username defaultAccount { displayCurrency } } }'
        })
      });

      // Check HTTP status before parsing JSON
      if (!response.ok) {
        console.error('API request failed with status:', response.status);
        return { 
          valid: false, 
          error: response.status === 401 ? 'Invalid API key' : `API request failed (${response.status})`
        };
      }

      const data = await response.json();
      
      if (data.errors || !data.data?.me?.id) {
        return { valid: false, error: 'Invalid API key' };
      }

      return {
        valid: true,
        username: data.data.me.username,
        defaultCurrency: data.data.me.defaultAccount?.displayCurrency || 'BTC'
      };
    } catch (err) {
      console.error('API validation error:', err);
      return { valid: false, error: 'Failed to validate API key' };
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!apiKey.trim()) {
      setError('Please enter your Blink API key');
      return;
    }

    setValidating(true);
    setError(null);

    // Validate API key with Blink
    const validation = await validateApiKey(apiKey);

    if (!validation.valid) {
      setError(validation.error || 'Invalid API key');
      setValidating(false);
      return;
    }

    // Add the Blink account to local storage (encrypted)
    const result = await addBlinkAccount({
      label: label.trim() || 'My Blink Account',
      apiKey: apiKey.trim(),
      username: validation.username,
      defaultCurrency: validation.defaultCurrency
    });

    // Also store on server for cross-device sync
    // This enables secure server-side API calls and syncing across devices
    if (result.success) {
      console.log('[BlinkAccountSetup] Has server session:', hasServerSession);
      
      if (hasServerSession) {
        try {
          console.log('[BlinkAccountSetup] Storing Blink account on server...');
          const serverResult = await storeBlinkAccountOnServer(
            apiKey.trim(), 
            validation.defaultCurrency,
            label  // Pass user-defined label for cross-device sync
          );
          if (serverResult.success) {
            console.log('[BlinkAccountSetup] ✓ Blink account stored on server for cross-device sync');
          } else {
            console.warn('[BlinkAccountSetup] Failed to store on server:', serverResult.error);
          }
        } catch (serverError) {
          console.warn('[BlinkAccountSetup] Server storage error:', serverError);
        }
      } else {
        console.warn('[BlinkAccountSetup] ⚠ No server session - Blink account saved locally only');
        console.warn('[BlinkAccountSetup] Cross-device sync will not work without server session');
      }
    }

    setValidating(false);

    if (result.success) {
      // Refresh profile data to trigger re-render in parent components
      refreshProfile();
      refreshAuthProfile();
      onComplete?.(result.account);
    } else {
      setError(result.error || 'Failed to save account');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
      <div className="max-w-md w-full space-y-8 p-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Signed in with Nostr!
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Now connect your Blink account to start accepting payments
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-6" autoComplete="off">
          {/* Account Label */}
          <div>
            <label htmlFor="label" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Account Label
            </label>
            <input
              id="label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My Blink Account"
              className="block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent"
            />
          </div>

          {/* API Key */}
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Blink API Key
              <span className="text-gray-500 font-normal ml-1">(READ + RECEIVE scopes)</span>
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="blink_..."
              required
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              className="block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent"
            />
          </div>

          {/* Paste Button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              disabled={pasting}
              className="inline-flex items-center px-4 py-2 rounded-full bg-gray-700 text-white text-sm font-medium hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
            >
              {pasting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Pasting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                  </svg>
                  Paste from Clipboard
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || validating}
            className="w-full flex justify-center py-4 px-6 border border-transparent text-xl font-bold rounded-full text-black bg-[#FFAD0D] hover:bg-[#D9930B] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FFAD0D] disabled:opacity-50 shadow-lg transition-colors"
          >
            {validating ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Connecting...
              </>
            ) : (
              'Connect Blink Account'
            )}
          </button>

          {/* Skip Link */}
          {onSkip && (
            <div className="text-center">
              <button
                type="button"
                onClick={onSkip}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 underline"
              >
                Skip for now
              </button>
            </div>
          )}
        </form>

        {/* Help Section */}
        <div className="mt-8 text-center text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p>🔐 Your API key is encrypted and stored securely</p>
          {hasServerSession && (
            <p>✓ Server session established for secure API calls</p>
          )}
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
          </p>
        </div>
      </div>
    </div>
  );
}

