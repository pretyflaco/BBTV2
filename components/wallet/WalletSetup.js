/**
 * WalletSetup - Unified wallet setup component
 * 
 * Allows users to choose between:
 * - Blink API key (existing functionality)
 * - NWC connection (new)
 */

import { useState } from 'react';
import { useDarkMode } from '../../lib/hooks/useDarkMode';
import { useCombinedAuth } from '../../lib/hooks/useCombinedAuth';
import NWCSetup from './NWCSetup';
import BlinkAccountSetup from '../auth/BlinkAccountSetup';

export default function WalletSetup({ onComplete, onSkip }) {
  const { darkMode } = useDarkMode();
  const { addNWCConnection: addConnection } = useCombinedAuth();
  
  const [walletType, setWalletType] = useState(null); // null | 'blink' | 'nwc'
  const [error, setError] = useState(null);

  const handleNWCComplete = async (nwcData) => {
    setError(null);
    
    try {
      const result = await addConnection(nwcData.connectionString, nwcData.label);
      
      if (!result.success) {
        setError(result.error || 'Failed to add NWC connection');
        return;
      }

      // Success!
      onComplete?.({
        type: 'nwc',
        connection: result.connection,
        walletInfo: nwcData.walletInfo
      });
    } catch (err) {
      console.error('NWC setup error:', err);
      setError(err.message || 'Failed to setup NWC wallet');
    }
  };

  const handleBlinkComplete = () => {
    onComplete?.({ type: 'blink' });
  };

  // Show specific setup form if selected
  if (walletType === 'nwc') {
    return (
      <NWCSetup 
        onComplete={handleNWCComplete}
        onCancel={() => setWalletType(null)}
      />
    );
  }

  if (walletType === 'blink') {
    return (
      <div className="relative">
        <button
          onClick={() => setWalletType(null)}
          className={`absolute top-4 left-4 p-2 rounded-lg transition-colors ${
            darkMode 
              ? 'text-gray-400 hover:text-white hover:bg-gray-700' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <BlinkAccountSetup 
          onComplete={handleBlinkComplete}
          onSkip={onSkip}
        />
      </div>
    );
  }

  // Main selection screen
  return (
    <div className={`rounded-2xl p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-xl max-w-md mx-auto`}>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Connect a Wallet
        </h2>
        <p className={`mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Choose how you want to connect your Lightning wallet
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        {/* NWC Option */}
        <button
          onClick={() => setWalletType('nwc')}
          className={`w-full p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${
            darkMode 
              ? 'border-purple-500/30 bg-purple-900/20 hover:border-purple-500/50 hover:bg-purple-900/30' 
              : 'border-purple-200 bg-purple-50 hover:border-purple-300 hover:bg-purple-100'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Nostr Wallet Connect
                </h3>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500 text-white">
                  Recommended
                </span>
              </div>
              <p className={`mt-1 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Connect any NWC-compatible wallet (Alby, Phoenix, Zeus, etc.)
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {['pay_invoice', 'get_balance', 'make_invoice'].map((cap) => (
                  <span 
                    key={cap}
                    className={`px-2 py-0.5 rounded text-xs ${
                      darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
            <svg className={`w-5 h-5 flex-shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        {/* Blink Option */}
        <button
          onClick={() => setWalletType('blink')}
          className={`w-full p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${
            darkMode 
              ? 'border-amber-500/30 bg-amber-900/20 hover:border-amber-500/50 hover:bg-amber-900/30' 
              : 'border-amber-200 bg-amber-50 hover:border-amber-300 hover:bg-amber-100'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <span className="text-xl">⚡</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Blink Wallet
              </h3>
              <p className={`mt-1 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Connect using your Blink API key for full POS features
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {['USD Wallet', 'BTC Wallet', 'Real-time'].map((feature) => (
                  <span 
                    key={feature}
                    className={`px-2 py-0.5 rounded text-xs ${
                      darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </div>
            <svg className={`w-5 h-5 flex-shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>

      {/* Skip Option */}
      {onSkip && (
        <div className="mt-6 text-center">
          <button
            onClick={onSkip}
            className={`text-sm ${darkMode ? 'text-gray-500 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Skip for now
          </button>
        </div>
      )}

      {/* Info Section */}
      <div className={`mt-8 pt-6 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <h3 className={`text-sm font-medium mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Why connect a wallet?
        </h3>
        <ul className={`space-y-2 text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>Create invoices and receive payments</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>Check your balance in real-time</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>Forward tips to employees</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

