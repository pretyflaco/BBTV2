/**
 * CardholderBalance - Public balance display for card holders
 * 
 * Shows:
 * - Card balance (formatted for currency)
 * - Daily limit progress bar
 * - Top-up QR code
 * - Last 5 transactions
 * 
 * No login required - authenticated via card tap (p/c params)
 */

import { QRCodeSVG } from 'qrcode.react';

/**
 * Format a timestamp for display
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Get transaction icon and color
 */
function getTransactionStyle(type) {
  switch (type?.toUpperCase()) {
    case 'TOPUP':
      return { 
        icon: '↑', 
        bgColor: 'bg-green-500/20', 
        textColor: 'text-green-400',
        sign: '+' 
      };
    case 'WITHDRAW':
      return { 
        icon: '↓', 
        bgColor: 'bg-red-500/20', 
        textColor: 'text-red-400',
        sign: '-' 
      };
    case 'ADJUST':
      return { 
        icon: '~', 
        bgColor: 'bg-blue-500/20', 
        textColor: 'text-blue-400',
        sign: '' 
      };
    default:
      return { 
        icon: '•', 
        bgColor: 'bg-gray-500/20', 
        textColor: 'text-gray-400',
        sign: '' 
      };
  }
}

/**
 * Format transaction amount for display
 */
function formatTxAmount(amount, currency, type) {
  const style = getTransactionStyle(type);
  if (currency === 'USD') {
    return `${style.sign}$${(Math.abs(amount) / 100).toFixed(2)}`;
  }
  return `${style.sign}${Math.abs(amount).toLocaleString()} sats`;
}

/**
 * CardholderBalance component
 */
export default function CardholderBalance({ data, error, loading }) {
  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading card balance...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">!</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Unable to Load Balance</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <p className="text-gray-500 text-sm">Tap your card again to retry</p>
        </div>
      </div>
    );
  }

  // No data state
  if (!data?.card) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">?</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Card Not Found</h1>
          <p className="text-gray-400">This card could not be loaded. Please tap again.</p>
        </div>
      </div>
    );
  }

  const { card, transactions, topUp } = data;
  const isUSD = card.currency === 'USD';
  const unit = isUSD ? '' : ' sats';

  // Calculate daily limit percentage
  const dailyPercentUsed = card.dailyLimit 
    ? Math.min(100, Math.round((card.dailySpent / card.dailyLimit) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="bg-gradient-to-b from-gray-900 to-black px-4 pt-8 pb-6">
        <div className="max-w-md mx-auto">
          {/* Card Name */}
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-medium text-gray-300">{card.name}</h1>
            <span className={`px-2 py-1 text-xs rounded-full ${
              card.status === 'ACTIVE' 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-yellow-500/20 text-yellow-400'
            }`}>
              {card.status}
            </span>
          </div>

          {/* Balance */}
          <div className="text-center py-6">
            <p className="text-gray-400 text-sm mb-1">Available Balance</p>
            <p className="text-5xl font-bold text-white font-inter-tight">
              {card.displayBalance}
            </p>
          </div>

          {/* Daily Limit Progress */}
          {card.dailyLimit && (
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Daily Limit</span>
                <span className="text-gray-300">
                  {isUSD 
                    ? `$${(card.dailySpent / 100).toFixed(2)} / $${(card.dailyLimit / 100).toFixed(2)}`
                    : `${card.dailySpent.toLocaleString()} / ${card.dailyLimit.toLocaleString()}${unit}`
                  }
                </span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${
                    dailyPercentUsed > 90 ? 'bg-red-500' : 
                    dailyPercentUsed > 70 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${dailyPercentUsed}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1 text-right">
                {isUSD 
                  ? `$${(card.dailyRemaining / 100).toFixed(2)} remaining`
                  : `${card.dailyRemaining?.toLocaleString() || 0}${unit} remaining`
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Top-Up Section */}
      <div className="px-4 py-6 border-b border-gray-800">
        <div className="max-w-md mx-auto">
          <h2 className="text-lg font-semibold mb-4 text-center">Top Up Card</h2>
          
          {topUp?.lnurl ? (
            <div className="flex flex-col items-center">
              <div className="bg-white p-4 rounded-xl mb-4">
                <QRCodeSVG
                  value={topUp.lnurl}
                  size={180}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-gray-400 text-sm text-center mb-2">
                Scan with any Lightning wallet to add funds
              </p>
              <p className="text-gray-600 text-xs font-mono truncate max-w-full px-4">
                {topUp.lnurl.substring(0, 30)}...
              </p>
            </div>
          ) : (
            <p className="text-gray-500 text-center">Top-up not available</p>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="px-4 py-6">
        <div className="max-w-md mx-auto">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          
          {transactions && transactions.length > 0 ? (
            <div className="space-y-3">
              {transactions.map((tx, index) => {
                const style = getTransactionStyle(tx.type);
                return (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-900 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${style.bgColor}`}>
                        <span className={`text-lg ${style.textColor}`}>{style.icon}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {tx.type === 'TOPUP' ? 'Top Up' : 
                           tx.type === 'WITHDRAW' ? 'Payment' : 
                           tx.type || 'Transaction'}
                        </p>
                        <p className="text-xs text-gray-500">{formatTimestamp(tx.createdAt)}</p>
                      </div>
                    </div>
                    <p className={`font-medium ${style.textColor}`}>
                      {formatTxAmount(tx.amount, card.currency, tx.type)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No transactions yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-8 text-center">
        <p className="text-gray-600 text-xs">
          Tap your card again to refresh balance
        </p>
        <p className="text-gray-700 text-xs mt-2">
          Powered by Blink
        </p>
      </div>
    </div>
  );
}
