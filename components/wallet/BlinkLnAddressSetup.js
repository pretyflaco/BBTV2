/**
 * BlinkLnAddressSetup - Connect via Blink Lightning Address
 * 
 * Allows users to connect their Blink wallet using just their
 * username/lightning address, without needing an API key.
 * 
 * Limitations compared to API key:
 * - Cannot fetch transaction history
 * - Less visibility into wallet details
 * 
 * Benefits:
 * - Simpler setup (no need to generate API key)
 * - Works with just a username
 */

import { useState, useEffect, useRef } from 'react';
import { useDarkMode } from '../../lib/hooks/useDarkMode';

export default function BlinkLnAddressSetup({ onComplete, onCancel }) {
  const { darkMode } = useDarkMode();
  
  const [lnAddress, setLnAddress] = useState('');
  const [label, setLabel] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState(null);
  const [walletInfo, setWalletInfo] = useState(null);
  
  const inputRef = useRef(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const validateLnAddress = async (address) => {
    if (!address) return;
    
    setValidating(true);
    setError(null);
    setWalletInfo(null);

    try {
      const response = await fetch('/api/blink/validate-ln-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lnAddress: address.trim() })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to validate lightning address');
        setValidating(false);
        return;
      }

      setWalletInfo({
        username: data.username,
        walletId: data.walletId,
        walletCurrency: data.walletCurrency,
        lightningAddress: data.lightningAddress
      });
      
      setValidating(false);
    } catch (err) {
      console.error('Validation error:', err);
      setError(err.message || 'Failed to validate lightning address');
      setValidating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!lnAddress.trim()) {
      setError('Please enter a Blink username or lightning address');
      return;
    }

    if (!walletInfo) {
      await validateLnAddress(lnAddress.trim());
      return;
    }

    // Return the connection data to parent
    onComplete({
      type: 'blink-ln-address',
      username: walletInfo.username,
      walletId: walletInfo.walletId,
      walletCurrency: walletInfo.walletCurrency,
      lightningAddress: walletInfo.lightningAddress,
      label: label.trim() || `${walletInfo.username}@blink.sv`
    });
  };

  const handleInputChange = (e) => {
    setLnAddress(e.target.value);
    setError(null);
    setWalletInfo(null);
  };

  const handleValidateClick = () => {
    validateLnAddress(lnAddress.trim());
  };

  // Check if input looks valid
  const hasInput = lnAddress.trim().length >= 3;

  return (
    <div className={`rounded-2xl p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-xl max-w-md mx-auto`}>
      {/* Back button */}
      <button
        onClick={onCancel}
        className={`mb-4 p-2 rounded-lg transition-colors ${
          darkMode 
            ? 'text-gray-400 hover:text-white hover:bg-gray-700' 
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        }`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </button>

      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-4">
          <span className="text-3xl">⚡</span>
        </div>
        <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Connect via Lightning Address
        </h2>
        <p className={`mt-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Enter your Blink username to connect your wallet
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Lightning Address Input */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Blink Username or Lightning Address
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={lnAddress}
              onChange={handleInputChange}
              placeholder="username or username@blink.sv"
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              className={`w-full px-4 py-3 pr-12 rounded-xl border-2 text-sm transition-colors ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-amber-500' 
                  : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-amber-500'
              } focus:outline-none focus:ring-2 focus:ring-amber-500/20`}
            />
            <div className={`absolute right-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              @blink.sv
            </div>
          </div>
          <p className={`mt-2 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            Your Blink wallet username (same as your lightning address)
          </p>
        </div>

        {/* Label Input */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Wallet Name (optional)
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="My Blink Wallet"
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            className={`w-full px-4 py-3 rounded-xl border-2 text-sm transition-colors ${
              darkMode 
                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-amber-500' 
                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-amber-500'
            } focus:outline-none focus:ring-2 focus:ring-amber-500/20`}
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {/* Wallet Info Display */}
        {walletInfo && (
          <div className={`p-4 rounded-xl ${darkMode ? 'bg-green-900/20 border-green-500/30' : 'bg-green-50 border-green-200'} border`}>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span className={`font-medium ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
                Blink Account Found!
              </span>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                <span className="font-medium">Lightning Address:</span>{' '}
                <span className="font-mono">{walletInfo.lightningAddress}</span>
              </div>
              <div className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                <span className="font-medium">Default Wallet:</span>{' '}
                {walletInfo.walletCurrency === 'BTC' ? 'Bitcoin (BTC)' : 'US Dollar (USD)'}
              </div>
            </div>

            {/* Limitation notice */}
            <div className={`mt-3 pt-3 border-t ${darkMode ? 'border-gray-700' : 'border-green-200'}`}>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                💡 Transaction history is not available with Lightning Address connection. 
                Use API key connection for full features.
              </p>
            </div>
          </div>
        )}

        {/* Validate Button (shown when input present but not validated) */}
        {hasInput && !walletInfo && !validating && (
          <button
            type="button"
            onClick={handleValidateClick}
            className="w-full py-3 px-4 rounded-xl font-medium transition-all bg-amber-500 hover:bg-amber-600 text-black"
          >
            Validate Address
          </button>
        )}

        {/* Validating State */}
        {validating && (
          <div className={`flex items-center justify-center gap-3 py-3 px-4 rounded-xl ${
            darkMode ? 'bg-gray-700' : 'bg-gray-100'
          }`}>
            <svg className="w-5 h-5 animate-spin text-amber-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
              Validating...
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className={`flex-1 py-3 px-4 rounded-xl font-medium border-2 transition-colors ${
              darkMode 
                ? 'border-gray-600 text-gray-300 hover:bg-gray-700' 
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Back
          </button>
          <button
            type="submit"
            disabled={!walletInfo || validating}
            className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
              walletInfo
                ? 'bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-black shadow-lg'
                : `${darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400'} cursor-not-allowed`
            }`}
          >
            Connect Wallet
          </button>
        </div>
      </form>

      {/* Info Section */}
      <div className={`mt-6 pt-6 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <h3 className={`text-sm font-medium mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Why use Lightning Address?
        </h3>
        <ul className={`space-y-2 text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>Quick and easy setup - no API key needed</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>Receive payments directly to your Blink wallet</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Transaction history not available (use API key for this)</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

