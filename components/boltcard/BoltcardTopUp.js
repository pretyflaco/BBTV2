/**
 * BoltcardTopUp - Top-up QR display component
 * 
 * Shows LNURL-pay QR code for topping up a Boltcard
 */

import { useState } from 'react';
import { useTheme } from '../../lib/hooks/useTheme';
import QRCode from 'qrcode.react';

/**
 * Format balance for display
 */
function formatBalance(balance, currency) {
  if (currency === 'USD') {
    return `$${(balance / 100).toFixed(2)}`;
  }
  if (balance >= 100000) {
    return `${(balance / 100000000).toFixed(8)} BTC`;
  }
  return `${balance.toLocaleString()} sats`;
}

/**
 * BoltcardTopUp component
 */
export default function BoltcardTopUp({
  card,
  topUpQR,
  loading = false,
}) {
  const { darkMode } = useTheme();
  const [copied, setCopied] = useState(false);

  /**
   * Copy LNURL to clipboard
   */
  const handleCopy = async () => {
    if (!topUpQR?.lnurl) return;
    
    try {
      await navigator.clipboard.writeText(topUpQR.lnurl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className={`animate-spin w-6 h-6 border-2 border-blink-accent border-t-transparent rounded-full mx-auto`} />
        <p className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Balance */}
      <div className={`text-center p-4 rounded-lg ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Current Balance</p>
        <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          {formatBalance(card.balance || 0, card.walletCurrency)}
        </p>
      </div>

      {/* QR Code */}
      {topUpQR?.lnurl ? (
        <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <div className="flex justify-center mb-3">
            <div className="p-3 bg-white rounded-lg">
              <QRCode
                value={topUpQR.lnurl.toUpperCase()}
                size={200}
                level="M"
                includeMargin={false}
              />
            </div>
          </div>
          
          <p className={`text-center text-sm mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Scan to add funds to this card
          </p>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className={`w-full py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${
              copied
                ? 'bg-green-500/20 text-green-500'
                : darkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copy LNURL
              </>
            )}
          </button>
        </div>
      ) : (
        <div className={`text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          <p className="text-sm">Top-up QR not available</p>
        </div>
      )}

      {/* Instructions */}
      <div className={`p-3 rounded-lg border ${
        darkMode ? 'bg-blue-900/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'
      }`}>
        <h5 className={`text-sm font-medium mb-2 ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>
          How to top up
        </h5>
        <ul className={`text-xs space-y-1 ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
          <li>1. Scan the QR code with any Lightning wallet</li>
          <li>2. Enter the amount you want to add</li>
          <li>3. Complete the payment</li>
          <li>4. Your card balance will update automatically</li>
        </ul>
      </div>

      {/* Limits info */}
      {(card.maxTxAmount || card.dailyLimit) && (
        <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <h5 className={`text-xs font-medium mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Spending Limits
          </h5>
          <div className="space-y-1 text-sm">
            {card.maxTxAmount && (
              <div className="flex justify-between">
                <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>Max per transaction</span>
                <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                  {formatBalance(card.maxTxAmount, card.walletCurrency)}
                </span>
              </div>
            )}
            {card.dailyLimit && (
              <div className="flex justify-between">
                <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>Daily remaining</span>
                <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                  {formatBalance(Math.max(0, card.dailyLimit - (card.dailySpent || 0)), card.walletCurrency)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
