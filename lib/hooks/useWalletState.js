/**
 * useWalletState Hook
 *
 * Manages raw wallet API key and wallet list state.
 * Fetch logic remains in Dashboard.js since it depends on useCombinedAuth,
 * environment config, and other Dashboard-specific concerns.
 *
 * @module lib/hooks/useWalletState
 */

import { useState, useCallback } from 'react';

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing wallet API key and wallet list state
 *
 * @returns {Object} Wallet state and setters
 * @returns {string|null} returns.apiKey - Current API key
 * @returns {function} returns.setApiKey - Set API key
 * @returns {Array} returns.wallets - Current wallet list
 * @returns {function} returns.setWallets - Set wallet list
 * @returns {function} returns.clearApiKey - Clear API key
 * @returns {function} returns.clearWallets - Clear wallet list
 * @returns {function} returns.clearAll - Clear all state
 * @returns {boolean} returns.hasApiKey - Whether API key is set
 * @returns {boolean} returns.hasWallets - Whether wallets are loaded
 *
 * @example
 * ```jsx
 * const { apiKey, setApiKey, wallets, setWallets } = useWalletState();
 *
 * // Dashboard fetches API key and sets it
 * const key = await getApiKey();
 * setApiKey(key);
 *
 * // Dashboard fetches wallets and sets them
 * const data = await fetchWallets(apiKey);
 * setWallets(data.wallets);
 * ```
 */
export function useWalletState() {
  const [apiKey, setApiKey] = useState(null);
  const [wallets, setWallets] = useState([]);

  const clearApiKey = useCallback(() => {
    setApiKey(null);
  }, []);

  const clearWallets = useCallback(() => {
    setWallets([]);
  }, []);

  const clearAll = useCallback(() => {
    setApiKey(null);
    setWallets([]);
  }, []);

  const hasApiKey = apiKey !== null && apiKey.length > 0;
  const hasWallets = wallets.length > 0;

  return {
    apiKey,
    setApiKey,
    wallets,
    setWallets,
    clearApiKey,
    clearWallets,
    clearAll,
    hasApiKey,
    hasWallets,
  };
}

export default useWalletState;
