/**
 * ProfileSection - Display user profile information
 */

import { useState } from 'react';
import { useDarkMode } from '../../lib/hooks/useDarkMode';

export default function ProfileSection({ user, authMode, publicKey, hasServerSession }) {
  const { darkMode } = useDarkMode();
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatPubkey = (key) => {
    if (!key) return 'N/A';
    if (key.length <= 16) return key;
    return `${key.slice(0, 8)}...${key.slice(-8)}`;
  };

  const getNpub = (hexPubkey) => {
    // Simple npub display (would need bech32 encoding for real npub)
    // For now, just show hex with npub prefix indicator
    return hexPubkey ? `npub1...${hexPubkey.slice(-8)}` : 'N/A';
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Profile Overview
        </h3>
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          View your account information and authentication status.
        </p>
      </div>

      {/* Profile Card */}
      <div className={`rounded-xl p-6 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        {/* Avatar/Identity */}
        <div className="flex items-center gap-4 mb-6">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl ${
            authMode === 'nostr' 
              ? 'bg-purple-500/20 text-purple-400' 
              : 'bg-blink-accent/20 text-blink-accent'
          }`}>
            {authMode === 'nostr' ? '🔑' : '👤'}
          </div>
          <div>
            <h4 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {user?.username || 'Anonymous'}
            </h4>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {authMode === 'nostr' ? 'Nostr Identity' : 'Legacy Account'}
            </p>
          </div>
        </div>

        {/* Details Grid */}
        <div className="space-y-4">
          {/* Auth Method */}
          <div className={`flex justify-between items-center py-3 border-b ${
            darkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Authentication Method
            </span>
            <span className={`text-sm font-medium flex items-center gap-2 ${
              darkMode ? 'text-white' : 'text-gray-900'
            }`}>
              {authMode === 'nostr' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  Nostr (Extension)
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-blink-accent"></span>
                  API Key
                </>
              )}
            </span>
          </div>

          {/* Public Key (Nostr only) */}
          {authMode === 'nostr' && publicKey && (
            <div className={`flex justify-between items-center py-3 border-b ${
              darkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Public Key
              </span>
              <div className="flex items-center gap-2">
                <code className={`text-xs px-2 py-1 rounded ${
                  darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                }`}>
                  {formatPubkey(publicKey)}
                </code>
                <button
                  onClick={() => copyToClipboard(publicKey)}
                  className={`p-1.5 rounded hover:bg-gray-600/20 transition-colors ${
                    copied ? 'text-green-500' : darkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}
                  title="Copy full public key"
                >
                  {copied ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Server Session Status (Nostr only) */}
          {authMode === 'nostr' && (
            <div className={`flex justify-between items-center py-3 border-b ${
              darkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Server Session
              </span>
              <span className={`text-sm font-medium flex items-center gap-2 ${
                hasServerSession 
                  ? 'text-green-500' 
                  : darkMode ? 'text-yellow-400' : 'text-yellow-600'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  hasServerSession ? 'bg-green-500' : 'bg-yellow-500'
                }`}></span>
                {hasServerSession ? 'Active (NIP-98)' : 'Local Only'}
              </span>
            </div>
          )}

          {/* Blink Username */}
          {user?.username && (
            <div className={`flex justify-between items-center py-3 ${
              darkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Blink Username
              </span>
              <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                @{user.username}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Security Info */}
      <div className={`rounded-xl p-4 ${
        darkMode ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'
      }`}>
        <div className="flex items-start gap-3">
          <span className="text-blue-500 text-lg">🔒</span>
          <div>
            <h5 className={`text-sm font-medium ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
              Security Information
            </h5>
            <p className={`text-xs mt-1 ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>
              {authMode === 'nostr' 
                ? 'Your credentials are encrypted locally using device-specific keys. Your private key never leaves your device.'
                : 'Your API key is stored encrypted on the server. Only you can access your account data.'
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

