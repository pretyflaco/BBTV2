/**
 * useWalletState Hook
 * 
 * Manages the active wallet API key and wallet list state.
 * Handles fetching API keys and wallet lists for the active Blink account.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

/**
 * Wallet information from Blink API
 */
export interface WalletInfo {
  id: string;
  walletCurrency: 'BTC' | 'USD';
  balance: number;
  pendingIncomingBalance?: number;
}

/**
 * Function to fetch API key from auth context
 */
export type GetApiKeyFn = () => Promise<string | null>;

/**
 * State returned by useWalletState hook
 */
export interface WalletState {
  // Core state
  apiKey: string | null;
  wallets: WalletInfo[];
  
  // Loading states
  isLoadingApiKey: boolean;
  isLoadingWallets: boolean;
  
  // Error states
  apiKeyError: string | null;
  walletsError: string | null;
  
  // Derived state
  hasApiKey: boolean;
  hasWallets: boolean;
  btcWallet: WalletInfo | null;
  usdWallet: WalletInfo | null;
  btcWalletId: string | null;
  usdWalletId: string | null;
  btcBalance: number | null;
  usdBalance: number | null;
}

/**
 * Actions returned by useWalletState hook
 */
export interface WalletActions {
  // Core setters
  setApiKey: (key: string | null) => void;
  setWallets: (wallets: WalletInfo[]) => void;
  
  // Fetch actions
  fetchApiKey: () => Promise<string | null>;
  fetchWallets: (overrideApiKey?: string) => Promise<void>;
  
  // Convenience actions
  clearApiKey: () => void;
  clearWallets: () => void;
  clearAll: () => void;
  refreshAll: () => Promise<void>;
}

/**
 * Combined return type for useWalletState hook
 */
export type UseWalletStateReturn = WalletState & WalletActions;

/**
 * Hook options
 */
export interface UseWalletStateOptions {
  /** Function to fetch API key (from auth context) */
  getApiKey?: GetApiKeyFn;
  /** API endpoint for fetching wallets */
  walletsEndpoint?: string;
  /** Current environment (mainnet/signet) */
  environment?: string;
  /** Auto-fetch wallets when API key changes */
  autoFetchWallets?: boolean;
}

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
 * @param options - Hook configuration options
 * @returns Wallet state and actions
 * 
 * @example
 * ```tsx
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
export function useWalletState(options: UseWalletStateOptions = {}): UseWalletStateReturn {
  const {
    getApiKey: getApiKeyFn,
    walletsEndpoint = DEFAULT_WALLETS_ENDPOINT,
    environment = 'mainnet',
    autoFetchWallets = true,
  } = options;

  // ===========================================================================
  // Core State
  // ===========================================================================
  
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [wallets, setWalletsState] = useState<WalletInfo[]>([]);
  
  // Loading states
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(false);
  const [isLoadingWallets, setIsLoadingWallets] = useState(false);
  
  // Error states
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [walletsError, setWalletsError] = useState<string | null>(null);

  // Track previous API key to detect changes
  const prevApiKeyRef = useRef<string | null>(null);

  // ===========================================================================
  // Derived State
  // ===========================================================================
  
  const hasApiKey = useMemo(() => apiKey !== null && apiKey.length > 0, [apiKey]);
  
  const hasWallets = useMemo(() => wallets.length > 0, [wallets]);
  
  const btcWallet = useMemo(() => 
    wallets.find(w => w.walletCurrency === 'BTC') || null,
    [wallets]
  );
  
  const usdWallet = useMemo(() => 
    wallets.find(w => w.walletCurrency === 'USD') || null,
    [wallets]
  );
  
  const btcWalletId = useMemo(() => btcWallet?.id || null, [btcWallet]);
  
  const usdWalletId = useMemo(() => usdWallet?.id || null, [usdWallet]);
  
  const btcBalance = useMemo(() => btcWallet?.balance ?? null, [btcWallet]);
  
  const usdBalance = useMemo(() => usdWallet?.balance ?? null, [usdWallet]);

  // ===========================================================================
  // Core Setters
  // ===========================================================================
  
  const setApiKey = useCallback((key: string | null) => {
    setApiKeyState(key);
    setApiKeyError(null);
  }, []);
  
  const setWallets = useCallback((newWallets: WalletInfo[]) => {
    setWalletsState(newWallets);
    setWalletsError(null);
  }, []);

  // ===========================================================================
  // Fetch Actions
  // ===========================================================================
  
  /**
   * Fetch API key using the provided getApiKey function
   */
  const fetchApiKey = useCallback(async (): Promise<string | null> => {
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
   */
  const fetchWallets = useCallback(async (overrideApiKey?: string): Promise<void> => {
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
  
  const clearApiKey = useCallback(() => {
    setApiKeyState(null);
    setApiKeyError(null);
  }, []);
  
  const clearWallets = useCallback(() => {
    setWalletsState([]);
    setWalletsError(null);
  }, []);
  
  const clearAll = useCallback(() => {
    setApiKeyState(null);
    setWalletsState([]);
    setApiKeyError(null);
    setWalletsError(null);
  }, []);
  
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
