/**
 * useWalletState Hook
 * 
 * Manages the active wallet API key and wallet list state.
 * Handles fetching API keys and wallet lists for the active Blink account.
 * 
 * @module lib/hooks/useWalletState
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

// ============================================================================
// Constants
// ============================================================================

/** Default wallets API endpoint */
export const DEFAULT_WALLETS_ENDPOINT = '/api/wallets';

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing wallet API key and wallet list state
 * 
 * @param {Object} [options] - Hook configuration options
 * @param {function} [options.getApiKey] - Function to fetch API key from auth context
 * @param {string} [options.walletsEndpoint='/api/wallets'] - API endpoint for fetching wallets
 * @param {string} [options.environment='mainnet'] - Current environment (mainnet/signet)
 * @param {boolean} [options.autoFetchWallets=true] - Auto-fetch wallets when API key changes
 * @returns {Object} Wallet state and actions
 * 
 * @example
 * ```jsx
 * const { getApiKey } = useCombinedAuth();
 * 
 * const {
 *   apiKey,
 *   wallets,
 *   btcWallet,
 *   usdWallet,
 *   fetchApiKey,
 *   fetchWallets
 * } = useWalletState({
 *   getApiKey,
 *   environment: 'mainnet'
 * });
 * 
 * // Fetch API key on mount
 * useEffect(() => {
 *   fetchApiKey();
 * }, []);
 * ```
 */
export function useWalletState(options = {}) {
  const {
    getApiKey: getApiKeyFn,
    walletsEndpoint = DEFAULT_WALLETS_ENDPOINT,
    environment = 'mainnet',
    autoFetchWallets = true,
  } = options;

  // ===========================================================================
  // Core State
  // ===========================================================================
  
  /** @type {[string|null, function]} */
  const [apiKey, setApiKeyState] = useState(null);
  
  /** @type {[Array, function]} */
  const [wallets, setWalletsState] = useState([]);
  
  // Loading states
  /** @type {[boolean, function]} */
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(false);
  
  /** @type {[boolean, function]} */
  const [isLoadingWallets, setIsLoadingWallets] = useState(false);
  
  // Error states
  /** @type {[string|null, function]} */
  const [apiKeyError, setApiKeyError] = useState(null);
  
  /** @type {[string|null, function]} */
  const [walletsError, setWalletsError] = useState(null);

  // Track previous API key to detect changes
  /** @type {React.MutableRefObject<string|null>} */
  const prevApiKeyRef = useRef(null);

  // ===========================================================================
  // Derived State
  // ===========================================================================
  
  /** @type {boolean} */
  const hasApiKey = useMemo(() => apiKey !== null && apiKey.length > 0, [apiKey]);
  
  /** @type {boolean} */
  const hasWallets = useMemo(() => wallets.length > 0, [wallets]);
  
  /** @type {Object|null} */
  const btcWallet = useMemo(() => 
    wallets.find(w => w.walletCurrency === 'BTC') || null,
    [wallets]
  );
  
  /** @type {Object|null} */
  const usdWallet = useMemo(() => 
    wallets.find(w => w.walletCurrency === 'USD') || null,
    [wallets]
  );
  
  /** @type {string|null} */
  const btcWalletId = useMemo(() => btcWallet?.id || null, [btcWallet]);
  
  /** @type {string|null} */
  const usdWalletId = useMemo(() => usdWallet?.id || null, [usdWallet]);
  
  /** @type {number|null} */
  const btcBalance = useMemo(() => btcWallet?.balance ?? null, [btcWallet]);
  
  /** @type {number|null} */
  const usdBalance = useMemo(() => usdWallet?.balance ?? null, [usdWallet]);

  // ===========================================================================
  // Core Setters
  // ===========================================================================
  
  /**
   * Set the API key
   * @param {string|null} key - API key or null to clear
   */
  const setApiKey = useCallback((key) => {
    setApiKeyState(key);
    setApiKeyError(null);
  }, []);
  
  /**
   * Set the wallets list
   * @param {Array} newWallets - Array of wallet objects
   */
  const setWallets = useCallback((newWallets) => {
    setWalletsState(newWallets);
    setWalletsError(null);
  }, []);

  // ===========================================================================
  // Fetch Actions
  // ===========================================================================
  
  /**
   * Fetch API key using the provided getApiKey function
   * @returns {Promise<string|null>} The API key or null
   */
  const fetchApiKey = useCallback(async () => {
    if (!getApiKeyFn) {
      console.warn('useWalletState: No getApiKey function provided');
      return null;
    }

    setIsLoadingApiKey(true);
    setApiKeyError(null);

    try {
      const key = await getApiKeyFn();
      if (key) {
        setApiKeyState(key);
        return key;
      }
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch API key';
      setApiKeyError(message);
      console.error('Failed to get API key:', error);
      return null;
    } finally {
      setIsLoadingApiKey(false);
    }
  }, [getApiKeyFn]);
  
  /**
   * Fetch wallets list from the API
   * @param {string} [overrideApiKey] - Optional API key to use instead of state
   */
  const fetchWallets = useCallback(async (overrideApiKey) => {
    const effectiveApiKey = overrideApiKey || apiKey;
    
    if (!effectiveApiKey) {
      console.warn('useWalletState: No API key available to fetch wallets');
      return;
    }

    setIsLoadingWallets(true);
    setWalletsError(null);

    try {
      const response = await fetch(walletsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          apiKey: effectiveApiKey, 
          environment 
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.wallets) {
        setWalletsState(data.wallets);
      } else if (Array.isArray(data)) {
        setWalletsState(data);
      } else {
        setWalletsState([]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch wallets';
      setWalletsError(message);
      console.error('Failed to fetch wallets:', error);
    } finally {
      setIsLoadingWallets(false);
    }
  }, [apiKey, walletsEndpoint, environment]);

  // ===========================================================================
  // Auto-fetch wallets when API key changes
  // ===========================================================================
  
  useEffect(() => {
    if (autoFetchWallets && apiKey && apiKey !== prevApiKeyRef.current) {
      prevApiKeyRef.current = apiKey;
      fetchWallets(apiKey);
    }
  }, [apiKey, autoFetchWallets, fetchWallets]);

  // ===========================================================================
  // Convenience Actions
  // ===========================================================================
  
  /**
   * Clear the API key
   */
  const clearApiKey = useCallback(() => {
    setApiKeyState(null);
    setApiKeyError(null);
  }, []);
  
  /**
   * Clear the wallets list
   */
  const clearWallets = useCallback(() => {
    setWalletsState([]);
    setWalletsError(null);
  }, []);
  
  /**
   * Clear all state
   */
  const clearAll = useCallback(() => {
    setApiKeyState(null);
    setWalletsState([]);
    setApiKeyError(null);
    setWalletsError(null);
  }, []);
  
  /**
   * Refresh API key and wallets
   */
  const refreshAll = useCallback(async () => {
    const key = await fetchApiKey();
    if (key) {
      await fetchWallets(key);
    }
  }, [fetchApiKey, fetchWallets]);

  // ===========================================================================
  // Return
  // ===========================================================================
  
  return {
    // Core state
    apiKey,
    wallets,
    
    // Loading states
    isLoadingApiKey,
    isLoadingWallets,
    
    // Error states
    apiKeyError,
    walletsError,
    
    // Derived state
    hasApiKey,
    hasWallets,
    btcWallet,
    usdWallet,
    btcWalletId,
    usdWalletId,
    btcBalance,
    usdBalance,
    
    // Core setters
    setApiKey,
    setWallets,
    
    // Fetch actions
    fetchApiKey,
    fetchWallets,
    
    // Convenience actions
    clearApiKey,
    clearWallets,
    clearAll,
    refreshAll,
  };
}

export default useWalletState;
