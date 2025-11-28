/**
 * ProfileSection - Display user profile information
 */

import { useState } from 'react';
import { useCombinedAuth } from '../../lib/hooks/useCombinedAuth';
import { useDarkMode } from '../../lib/hooks/useDarkMode';

export default function ProfileSection() {
  const { user, authMode, publicKey, hasServerSession } = useCombinedAuth();
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

  return (
    <div className="space-y-4">
      {/* Profile Card */}
      <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            authMode === 'nostr' 
              ? 'bg-purple-500/20' 
              : 'bg-blink-accent/20'
          }`}>
            <svg className={`w-6 h-6 ${authMode === 'nostr' ? 'text-purple-400' : 'text-blink-accent'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {user?.username || 'Anonymous'}
            </h4>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {authMode === 'nostr' ? 'Nostr Identity' : 'Legacy Account'}
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-3">
          <div className={`flex justify-between items-center py-2 border-b ${
            darkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Auth Method
            </span>
            <span className={`text-sm font-medium flex items-center gap-2 ${
              darkMode ? 'text-white' : 'text-gray-900'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                authMode === 'nostr' ? 'bg-purple-500' : 'bg-blink-accent'
              }`}></span>
              {authMode === 'nostr' ? 'Nostr' : 'API Key'}
            </span>
          </div>

          {authMode === 'nostr' && publicKey && (
            <div className={`flex justify-between items-center py-2 border-b ${
              darkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Public Key
              </span>
              <div className="flex items-center gap-2">
                <code className={`text-xs px-2 py-1 rounded ${
                  darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-200 text-gray-700'
                }`}>
                  {formatPubkey(publicKey)}
                </code>
                <button
                  onClick={() => copyToClipboard(publicKey)}
                  className={`p-1 rounded ${
                    copied ? 'text-green-500' : darkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}
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

          {authMode === 'nostr' && (
            <div className={`flex justify-between items-center py-2 border-b ${
              darkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Server Sync
              </span>
              <span className={`text-sm font-medium flex items-center gap-2 ${
                hasServerSession ? 'text-green-500' : darkMode ? 'text-yellow-400' : 'text-yellow-600'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  hasServerSession ? 'bg-green-500' : 'bg-yellow-500'
                }`}></span>
                {hasServerSession ? 'Active' : 'Local Only'}
              </span>
            </div>
          )}

          {user?.username && (
            <div className={`flex justify-between items-center py-2`}>
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
    </div>
  );
}
