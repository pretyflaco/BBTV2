/**
 * useWalletState Hook
 *
 * Manages raw wallet API key and wallet list state.
 * Fetch logic remains in Dashboard.js since it depends on useCombinedAuth,
 * environment config, and other Dashboard-specific concerns.
 *
 * @module lib/hooks/useWalletState
 */

import { useState, useCallback } from "react"

// ============================================================================
// Types
// ============================================================================

/** Wallet information from Blink API */
export interface WalletInfo {
  id: string
  walletCurrency: "BTC" | "USD"
  balance: number
  pendingIncomingBalance?: number
}

/** Return type for the useWalletState hook */
export interface UseWalletStateReturn {
  // Core state
  apiKey: string | null
  setApiKey: (key: string | null) => void
  wallets: WalletInfo[]
  setWallets: (wallets: WalletInfo[]) => void

  // Convenience actions
  clearApiKey: () => void
  clearWallets: () => void
  clearAll: () => void

  // Derived state
  hasApiKey: boolean
  hasWallets: boolean
}

// Keep these for backward compatibility with useDashboardState types
export type UseWalletStateOptions = Record<string, never>

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing wallet API key and wallet list state
 *
 * @returns Wallet state and setters
 *
 * @example
 * ```tsx
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
export function useWalletState(_options?: UseWalletStateOptions): UseWalletStateReturn {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [wallets, setWallets] = useState<WalletInfo[]>([])

  const clearApiKey = useCallback(() => {
    setApiKey(null)
  }, [])

  const clearWallets = useCallback(() => {
    setWallets([])
  }, [])

  const clearAll = useCallback(() => {
    setApiKey(null)
    setWallets([])
  }, [])

  const hasApiKey = apiKey !== null && apiKey.length > 0
  const hasWallets = wallets.length > 0

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
  }
}

export default useWalletState
