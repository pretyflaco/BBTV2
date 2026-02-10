/**
 * BoltcardSection - Main settings section for Boltcard management
 * 
 * Shows:
 * - List of user's cards
 * - Add card button
 * - Empty state when no cards
 */

import { useState } from 'react';
import { useTheme } from '../../lib/hooks/useTheme';
import { useCombinedAuth } from '../../lib/hooks/useCombinedAuth';
import { useBoltcards } from './useBoltcards';
import BoltcardCard from './BoltcardCard';
import BoltcardRegister from './BoltcardRegister';
import BoltcardDetails from './BoltcardDetails';
import BoltcardRecovery from './BoltcardRecovery';
import BoltcardFundCard from './BoltcardFundCard';

/**
 * BoltcardSection component
 * @param {Object} props
 * @param {Object} props.voucherWallet - The configured sending wallet with apiKey, walletId, username, etc.
 * @param {string} props.voucherWalletBtcId - BTC wallet ID
 * @param {string} props.voucherWalletUsdId - USD wallet ID (Stablesats)
 * @param {number} props.voucherWalletBtcBalance - BTC wallet balance in sats
 * @param {number} props.voucherWalletUsdBalance - USD wallet balance in cents
 * @param {number} props.exchangeRate - BTC/USD exchange rate
 * @param {string} props.bitcoinFormat - Bitcoin format preference ('sats', 'btc', 'bits')
 */
export default function BoltcardSection({ 
  voucherWallet, 
  voucherWalletBtcId, 
  voucherWalletUsdId,
  voucherWalletBtcBalance,
  voucherWalletUsdBalance,
  exchangeRate,
  bitcoinFormat = 'sats',
}) {
  const { darkMode } = useTheme();
  const { publicKey } = useCombinedAuth();
  
  // Check if we have a configured wallet
  const hasWallet = voucherWallet?.apiKey && (voucherWalletBtcId || voucherWalletUsdId);
  
  // Boltcard state
  const {
    cards,
    loading,
    error,
    registerCard,
    updateCard,
    fetchCardDetails,
    disableCard,
    enableCard,
    wipeCard,
    resetDailySpent,
    fundCard,
  } = useBoltcards(publicKey);

  // UI state
  const [showRegister, setShowRegister] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const [fundingCard, setFundingCard] = useState(null); // Card being funded

  /**
   * Handle card registration
   */
  const handleRegister = async (cardData) => {
    const result = await registerCard(cardData);
    return result;
  };

  /**
   * Handle view card details
   */
  const handleViewDetails = (card) => {
    setSelectedCard(card);
  };

  /**
   * Handle disable card
   */
  const handleDisable = async (cardId) => {
    const result = await disableCard(cardId);
    if (result.success && selectedCard?.id === cardId) {
      // Use status from API response (uppercase: 'DISABLED')
      setSelectedCard(prev => ({ ...prev, status: result.card.status }));
    }
    return result;
  };

  /**
   * Handle enable card
   */
  const handleEnable = async (cardId) => {
    const result = await enableCard(cardId);
    if (result.success && selectedCard?.id === cardId) {
      // Use status from API response (uppercase: 'ACTIVE')
      setSelectedCard(prev => ({ ...prev, status: result.card.status }));
    }
    return result;
  };

  /**
   * Handle update card
   */
  const handleUpdate = async (cardId, updates) => {
    const result = await updateCard(cardId, updates);
    if (result.success && selectedCard?.id === cardId) {
      setSelectedCard(prev => ({ ...prev, ...result.card }));
    }
    return result;
  };

  /**
   * Handle wipe card
   */
  const handleWipe = async (cardId) => {
    const result = await wipeCard(cardId);
    if (result.success) {
      setSelectedCard(null);
    }
    return result;
  };

  /**
   * Handle reset daily spent
   */
  const handleResetDaily = async (cardId) => {
    const result = await resetDailySpent(cardId);
    if (result.success && selectedCard?.id === cardId) {
      setSelectedCard(prev => ({ ...prev, dailySpent: 0 }));
    }
    return result;
  };

  /**
   * Handle fund card
   */
  const handleFund = async (cardId, amount) => {
    const result = await fundCard(cardId, amount);
    if (result.success) {
      // Update selected card balance if it's the same card
      if (selectedCard?.id === cardId) {
        setSelectedCard(prev => ({ ...prev, balance: result.card.balance }));
      }
    }
    return result;
  };

  /**
   * Get wallet balance for a card's currency
   */
  const getWalletBalanceForCard = (card) => {
    if (card.walletCurrency === 'USD') {
      return voucherWalletUsdBalance || 0;
    }
    return voucherWalletBtcBalance || 0;
  };

  // Show warning if no wallet configured
  if (!hasWallet) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Boltcards
          </h3>
        </div>
        
        <div className={`rounded-lg p-4 border ${
          darkMode ? 'bg-yellow-900/10 border-yellow-500/30' : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-start gap-3">
            <svg className={`w-5 h-5 flex-shrink-0 ${darkMode ? 'text-yellow-500' : 'text-yellow-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h4 className={`text-sm font-medium ${darkMode ? 'text-yellow-400' : 'text-yellow-700'}`}>
                Sending Wallet Required
              </h4>
              <p className={`text-xs mt-1 ${darkMode ? 'text-yellow-300' : 'text-yellow-600'}`}>
                Configure a Sending Wallet in Settings first. Boltcards use this wallet to fund withdrawals.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Boltcards
        </h3>
        {!showRegister && (
          <button
            onClick={() => setShowRegister(true)}
            className="px-3 py-1.5 text-sm font-medium bg-blink-accent text-black rounded-md hover:bg-blink-accent/90 transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Card
          </button>
        )}
      </div>

      {/* Register Form */}
      {showRegister && (
        <BoltcardRegister
          onRegister={handleRegister}
          onCancel={() => setShowRegister(false)}
          loading={loading}
          voucherWallet={voucherWallet}
          voucherWalletBtcId={voucherWalletBtcId}
          voucherWalletUsdId={voucherWalletUsdId}
        />
      )}

      {/* Error Message */}
      {error && (
        <div className={`p-3 rounded-lg ${darkMode ? 'bg-red-900/20' : 'bg-red-50'}`}>
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && cards.length === 0 && !showRegister && (
        <div className="text-center py-8">
          <div className={`animate-spin w-6 h-6 border-2 border-blink-accent border-t-transparent rounded-full mx-auto`} />
          <p className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Loading cards...
          </p>
        </div>
      )}

      {/* Cards List */}
      {!showRegister && cards.length > 0 && (
        <div className="space-y-2">
          {cards.map((card) => (
            <BoltcardCard
              key={card.id}
              card={card}
              compact
              onViewDetails={() => handleViewDetails(card)}
              onDisable={() => handleDisable(card.id)}
              onEnable={() => handleEnable(card.id)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!showRegister && !loading && cards.length === 0 && (
        <div className={`rounded-lg p-6 text-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
            darkMode ? 'bg-gray-800' : 'bg-gray-200'
          }`}>
            <svg className={`w-6 h-6 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h4 className={`font-medium mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            No Boltcards Yet
          </h4>
          <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Add an NTAG424DNA card to enable tap-to-pay with Lightning
          </p>
          <button
            onClick={() => setShowRegister(true)}
            className="px-4 py-2 text-sm font-medium bg-blink-accent text-black rounded-md hover:bg-blink-accent/90 transition-colors"
          >
            Add Your First Card
          </button>
          <p className={`text-xs mt-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Have a card that needs resetting?{' '}
            <button
              onClick={() => setShowRecovery(true)}
              className="text-blink-accent hover:underline"
            >
              Recover card keys
            </button>
          </p>
        </div>
      )}

      {/* Info Link */}
      {!showRegister && (
        <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          <p>
            Need a card?{' '}
            <a
              href="https://www.lasereyes.cards/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blink-accent hover:underline"
            >
              Get NTAG424DNA cards
            </a>
          </p>
          <p className="mt-1">
            <a
              href="https://github.com/boltcard/boltcard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blink-accent hover:underline"
            >
              Learn more about Boltcards
            </a>
          </p>
          <p className="mt-1">
            <button
              onClick={() => setShowRecovery(true)}
              className="text-blink-accent hover:underline"
            >
              Recover keys for an orphaned card
            </button>
          </p>
        </div>
      )}

      {/* Card Details Modal */}
      {selectedCard && (
        <BoltcardDetails
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleUpdate}
          onDisable={handleDisable}
          onEnable={handleEnable}
          onWipe={handleWipe}
          onResetDaily={handleResetDaily}
          onFund={(card) => setFundingCard(card)}
          onFundCard={fundCard}
          fetchDetails={fetchCardDetails}
          walletBalance={getWalletBalanceForCard(selectedCard)}
          exchangeRate={exchangeRate}
          bitcoinFormat={bitcoinFormat}
        />
      )}

      {/* Fund Card Modal */}
      {fundingCard && (
        <BoltcardFundCard
          card={fundingCard}
          walletBalance={getWalletBalanceForCard(fundingCard)}
          onFund={handleFund}
          onClose={() => setFundingCard(null)}
          loading={loading}
          exchangeRate={exchangeRate}
          bitcoinFormat={bitcoinFormat}
        />
      )}

      {/* Recovery Modal */}
      {showRecovery && (
        <BoltcardRecovery onClose={() => setShowRecovery(false)} />
      )}
    </div>
  );
}
