/**
 * NWCSetup - Component for adding NWC (Nostr Wallet Connect) wallets
 * 
 * Allows users to connect their lightning wallet via NWC protocol.
 * Supports scanning QR codes or pasting connection strings.
 */

import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../lib/hooks/useTheme';
import NWCClient from '../../lib/nwc/NWCClient';

export default function NWCSetup({ onComplete, onCancel }) {
  const { darkMode } = useTheme();
  
  const [connectionString, setConnectionString] = useState('');
  const [label, setLabel] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState(null);
  const [walletInfo, setWalletInfo] = useState(null);
  const [pasting, setPasting] = useState(false);
  
  const inputRef = useRef(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handlePasteFromClipboard = async () => {
    setPasting(true);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text.trim()) {
          setConnectionString(text.trim());
          setError(null);
          // Auto-validate after paste
          await validateConnection(text.trim());
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

  const validateConnection = async (uri) => {
    if (!uri) return;
    
    setValidating(true);
    setError(null);
    setWalletInfo(null);

    try {
      const validation = await NWCClient.validate(uri);
      
      if (!validation.valid) {
        setError(validation.error || 'Invalid connection string');
        setValidating(false);
        return;
      }

      // Get additional info
      const tempClient = new NWCClient(uri);
      setWalletInfo({
        pubkey: tempClient.getWalletPubkey(),
        relays: tempClient.getRelays(),
        capabilities: validation.info?.methods || []
      });
      tempClient.close();
      
      setValidating(false);
    } catch (err) {
      console.error('Validation error:', err);
      setError(err.message || 'Failed to validate connection');
      setValidating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!connectionString.trim()) {
      setError('Please enter an NWC connection string');
      return;
    }

    if (!walletInfo) {
      // Validate first if not already validated
      await validateConnection(connectionString.trim());
      return;
    }

    // Return the connection data to parent
    onComplete({
      connectionString: connectionString.trim(),
      label: label.trim() || `NWC Wallet`,
      walletInfo
    });
  };

  const handleInputChange = (e) => {
    setConnectionString(e.target.value);
    setError(null);
    setWalletInfo(null);
  };

  const handleValidateClick = () => {
    validateConnection(connectionString.trim());
  };

  // Check if it looks like a valid NWC URI
  const looksLikeNWC = connectionString.trim().toLowerCase().startsWith('nostr+walletconnect://') ||
                       connectionString.trim().toLowerCase().startsWith('nostrnwc://');

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
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Connect Blink via NWC
        </h2>
        <p className={`mt-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Connect your Blink wallet using Nostr Wallet Connect
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Connection String Input */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            NWC Connection String
          </label>
          <div className="relative">
            <textarea
              ref={inputRef}
              value={connectionString}
              onChange={handleInputChange}
              placeholder="nostr+walletconnect://..."
              rows={3}
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              className={`w-full px-4 py-3 pr-12 rounded-xl border-2 text-sm font-mono resize-none transition-colors ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-purple-500' 
                  : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-purple-500'
              } focus:outline-none focus:ring-2 focus:ring-purple-500/20`}
            />
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              disabled={pasting}
              className={`absolute right-2 top-2 p-2 rounded-lg transition-colors ${
                darkMode 
                  ? 'text-gray-400 hover:text-white hover:bg-gray-600' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
              title="Paste from clipboard"
            >
              {pasting ? (
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              )}
            </button>
          </div>
          <p className={`mt-2 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            Get this from your Blink wallet app at blink.sv
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
            placeholder="My Lightning Wallet"
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            className={`w-full px-4 py-3 rounded-xl border-2 text-sm transition-colors ${
              darkMode 
                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-purple-500' 
                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-purple-500'
            } focus:outline-none focus:ring-2 focus:ring-purple-500/20`}
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
                Connection Valid!
              </span>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                <span className="font-medium">Wallet:</span>{' '}
                <span className="font-mono text-xs">
                  {walletInfo.pubkey.slice(0, 12)}...{walletInfo.pubkey.slice(-12)}
                </span>
              </div>
              <div className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                <span className="font-medium">Relays:</span>{' '}
                {walletInfo.relays.length} configured
              </div>
              <div className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                <span className="font-medium">Capabilities:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {walletInfo.capabilities.slice(0, 5).map((cap, i) => (
                    <span 
                      key={i}
                      className={`px-2 py-0.5 rounded text-xs ${
                        darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {cap}
                    </span>
                  ))}
                  {walletInfo.capabilities.length > 5 && (
                    <span className={`px-2 py-0.5 rounded text-xs ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>
                      +{walletInfo.capabilities.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Validate Button (shown when input present but not validated) */}
        {connectionString.trim() && !walletInfo && !validating && (
          <button
            type="button"
            onClick={handleValidateClick}
            disabled={!looksLikeNWC}
            className={`w-full py-3 px-4 rounded-xl font-medium transition-all ${
              looksLikeNWC
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : `${darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400'} cursor-not-allowed`
            }`}
          >
            Validate Connection
          </button>
        )}

        {/* Validating State */}
        {validating && (
          <div className={`flex items-center justify-center gap-3 py-3 px-4 rounded-xl ${
            darkMode ? 'bg-gray-700' : 'bg-gray-100'
          }`}>
            <svg className="w-5 h-5 animate-spin text-purple-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
              Connecting to wallet...
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
                ? 'bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white shadow-lg'
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
          Important: Blink Wallets Only
        </h3>
        <div className={`p-3 rounded-lg mb-3 ${darkMode ? 'bg-amber-900/20 border border-amber-500/30' : 'bg-amber-50 border border-amber-200'}`}>
          <p className={`text-xs ${darkMode ? 'text-amber-200' : 'text-amber-800'}`}>
            <strong>Only Blink NWC wallets are supported.</strong> This ensures zero-fee internal transfers. 
            External Lightning wallets would incur routing fees that are difficult to account for properly.
          </p>
        </div>
        <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
          Get your NWC connection string from{' '}
          <a 
            href="https://blink.sv" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-purple-500 hover:underline"
          >
            blink.sv
          </a>
          {' '}→ Settings → Nostr Wallet Connect
        </p>
      </div>
    </div>
  );
}
