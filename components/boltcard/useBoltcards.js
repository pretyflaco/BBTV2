/**
 * useBoltcards - React hook for Boltcard management
 * 
 * Provides state management and API calls for:
 * - Listing user's cards
 * - Registering new cards
 * - Updating card settings
 * - Card actions (activate, disable, enable, etc.)
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Card status constants
 */
export const CardStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  DISABLED: 'disabled',
  WIPED: 'wiped',
};

/**
 * Card currency constants
 */
export const CardCurrency = {
  BTC: 'BTC',
  USD: 'USD',
};

/**
 * Custom hook for Boltcard management
 * @param {string} ownerPubkey - User's Nostr public key
 * @returns {Object} Boltcard state and methods
 */
export function useBoltcards(ownerPubkey) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);

  /**
   * Fetch all cards for the owner
   */
  const fetchCards = useCallback(async () => {
    if (!ownerPubkey) {
      setCards([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/boltcard/cards?ownerPubkey=${ownerPubkey}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch cards');
      }

      setCards(data.cards || []);
    } catch (err) {
      console.error('Failed to fetch boltcards:', err);
      setError(err.message);
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [ownerPubkey]);

  /**
   * Fetch a single card with details
   */
  const fetchCardDetails = useCallback(async (cardId, includeTopUpQR = true) => {
    try {
      const response = await fetch(
        `/api/boltcard/cards/${cardId}?includeTopUpQR=${includeTopUpQR}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch card details');
      }

      return {
        success: true,
        card: data.card,
        transactions: data.transactions || [],
        topUpQR: data.topUpQR,
      };
    } catch (err) {
      console.error('Failed to fetch card details:', err);
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Register a new Boltcard
   */
  const registerCard = useCallback(async ({
    cardUid,
    walletId,
    apiKey,
    name,
    walletCurrency = 'BTC',
    maxTxAmount,
    dailyLimit,
    initialBalance = 0,
    environment = 'production',
  }) => {
    if (!ownerPubkey) {
      return { success: false, error: 'Not authenticated' };
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/boltcard/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardUid,
          ownerPubkey,
          walletId,
          apiKey,
          name,
          walletCurrency,
          maxTxAmount,
          dailyLimit,
          initialBalance,
          environment,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register card');
      }

      // Refresh cards list (for direct flow where card is created)
      if (data.flow === 'direct') {
        await fetchCards();
      }

      // Return the full API response - supports both deeplink and direct flows
      return {
        success: true,
        flow: data.flow,
        // Direct flow fields
        card: data.card,
        keys: data.keys,
        qrCodes: data.qrCodes,
        // Deeplink flow fields
        pendingRegistration: data.pendingRegistration,
        deeplink: data.deeplink,
        qrPayload: data.qrPayload,
        keysRequestUrl: data.keysRequestUrl,
      };
    } catch (err) {
      console.error('Failed to register boltcard:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [ownerPubkey, fetchCards]);

  /**
   * Update card settings
   */
  const updateCard = useCallback(async (cardId, updates) => {
    try {
      const response = await fetch(`/api/boltcard/cards/${cardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update card');
      }

      // Update local state
      setCards(prev => prev.map(card => 
        card.id === cardId ? { ...card, ...data.card } : card
      ));

      return { success: true, card: data.card };
    } catch (err) {
      console.error('Failed to update card:', err);
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Perform a card action (activate, disable, enable, adjust, resetDaily)
   */
  const cardAction = useCallback(async (cardId, action, params = {}) => {
    try {
      const response = await fetch(`/api/boltcard/cards/${cardId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} card`);
      }

      // Update local state
      setCards(prev => prev.map(card => 
        card.id === cardId ? { ...card, ...data.card } : card
      ));

      return { success: true, message: data.message, card: data.card };
    } catch (err) {
      console.error(`Failed to ${action} card:`, err);
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Activate a card
   */
  const activateCard = useCallback(async (cardId) => {
    return cardAction(cardId, 'activate');
  }, [cardAction]);

  /**
   * Disable a card
   */
  const disableCard = useCallback(async (cardId) => {
    return cardAction(cardId, 'disable');
  }, [cardAction]);

  /**
   * Enable a disabled card
   */
  const enableCard = useCallback(async (cardId) => {
    return cardAction(cardId, 'enable');
  }, [cardAction]);

  /**
   * Reset daily spending limit
   */
  const resetDailySpent = useCallback(async (cardId) => {
    return cardAction(cardId, 'resetDaily');
  }, [cardAction]);

  /**
   * Adjust card balance
   */
  const adjustBalance = useCallback(async (cardId, amount, description) => {
    return cardAction(cardId, 'adjust', { amount, description });
  }, [cardAction]);

  /**
   * Wipe/delete a card
   */
  const wipeCard = useCallback(async (cardId) => {
    try {
      const response = await fetch(`/api/boltcard/cards/${cardId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to wipe card');
      }

      // Remove from local state
      setCards(prev => prev.filter(card => card.id !== cardId));

      return { success: true, message: data.message };
    } catch (err) {
      console.error('Failed to wipe card:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Fetch cards on mount and when ownerPubkey changes
  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  return {
    // State
    cards,
    loading,
    error,
    selectedCard,
    setSelectedCard,

    // Methods
    fetchCards,
    fetchCardDetails,
    registerCard,
    updateCard,
    activateCard,
    disableCard,
    enableCard,
    resetDailySpent,
    adjustBalance,
    wipeCard,

    // Helpers
    hasCards: cards.length > 0,
    activeCards: cards.filter(c => c.status === CardStatus.ACTIVE),
    pendingCards: cards.filter(c => c.status === CardStatus.PENDING),
  };
}

export default useBoltcards;
