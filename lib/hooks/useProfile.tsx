/**
 * useProfile - React hook for profile and credential management
 *
 * Provides:
 * - Blink account management
 * - NWC connection management
 * - Settings management
 * - Profile switching
 * - Cross-device sync via server storage
 *
 * IMPORTANT: ProfileProvider MUST be nested inside NostrAuthProvider.
 * Example in _app.js:
 *   <NostrAuthProvider>
 *     <ProfileProvider>
 *       <Component {...pageProps} />
 *     </ProfileProvider>
 *   </NostrAuthProvider>
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
  useRef,
} from "react"
import ProfileStorage from "../storage/ProfileStorage"
import type {
  StoredBlinkAccount,
  StoredNWCConnection,
  StoredTippingSettings,
  StoredPreferences,
  StoredProfile,
  ProfileExportData,
} from "../storage/ProfileStorage"
import CryptoUtils from "../storage/CryptoUtils"
import type { EncryptedData } from "../storage/CryptoUtils"
import { useNostrAuth } from "./useNostrAuth"

// ============= Server Response Types =============

interface ServerBlinkApiAccount {
  id: string
  label: string
  username?: string
  apiKey?: string
  defaultCurrency?: string
  isActive: boolean
  createdAt: string
  lastUsed?: string
}

interface ServerLnAddressWallet {
  id: string
  label: string
  username?: string
  lightningAddress?: string
  walletId?: string
  isActive: boolean
  createdAt: string
  lastUsed?: string
}

interface ServerNpubCashWallet {
  id: string
  label: string
  address?: string
  lightningAddress?: string
  localpart?: string
  isNpub?: boolean
  pubkey?: string
  isActive: boolean
  createdAt?: string
  lastUsed?: string
}

// ============= Local Type Definitions =============

/**
 * Local account shape — different from the global BlinkAccount in nostr.d.ts
 * because the local version may carry extra fields from different wallet types
 * (ln-address, npub-cash, API-key).
 */
export interface LocalBlinkAccount {
  id: string
  label: string
  apiKey?: EncryptedData // Encrypted blob from CryptoUtils
  username?: string
  defaultCurrency?: string
  isActive: boolean
  createdAt?: number | string
  lastUsed?: number | null
  type?: string // 'ln-address' | 'npub-cash' | undefined (for API key accounts)
  lightningAddress?: string
  walletId?: string
  walletCurrency?: string
  localpart?: string
  isNpub?: boolean
  pubkey?: string
  address?: string
  source?: string
  addedAt?: string
}

interface ProfileState {
  loading: boolean
  error: string | null
  blinkAccounts: LocalBlinkAccount[]
  nwcConnections: StoredNWCConnection[]
  tippingSettings: StoredTippingSettings | null
  preferences: StoredPreferences | null
  serverSynced: boolean
}

interface ProfileProviderProps {
  children: React.ReactNode
}

export interface ProfileContextValue {
  // State
  loading: boolean
  error: string | null

  // Profile data
  blinkAccounts: LocalBlinkAccount[]
  nwcConnections: StoredNWCConnection[]
  tippingSettings: StoredTippingSettings | null
  preferences: StoredPreferences | null

  // Computed
  activeBlinkAccount: LocalBlinkAccount | null
  activeNWCConnection: StoredNWCConnection | null
  hasBlinkAccount: boolean
  hasNWCConnection: boolean
  hasNpubCashWallet: boolean
  npubCashWallets: LocalBlinkAccount[]
  activeNpubCashWallet: LocalBlinkAccount | null

  // Blink account actions
  addBlinkAccount: (params: {
    label: string
    apiKey: string
    username: string
    defaultCurrency?: string
  }) => Promise<{ success: boolean; account?: StoredBlinkAccount; error?: string }>
  addBlinkLnAddressAccount: (params: {
    label: string
    username: string
    walletId: string
    walletCurrency?: string
    lightningAddress: string
  }) => Promise<{ success: boolean; account?: StoredBlinkAccount; error?: string }>
  addNpubCashAccount: (params: {
    lightningAddress: string
    label?: string
  }) => Promise<{ success: boolean; wallet?: StoredBlinkAccount; error?: string }>
  getBlinkApiKey: (accountId: string) => Promise<string | null>
  getActiveBlinkApiKey: () => Promise<string | null>
  setActiveBlinkAccount: (accountId: string) => void
  updateBlinkAccount: (
    accountId: string,
    updates: Partial<LocalBlinkAccount>,
  ) => Promise<{ success: boolean; error?: string }>
  removeBlinkAccount: (accountId: string) => Promise<{ success: boolean; error?: string }>

  // NWC connection actions
  addNWCConnection: (params: {
    label: string
    uri: string
    capabilities?: string[]
  }) => Promise<{ success: boolean; connection?: StoredNWCConnection; error?: string }>
  getNWCUri: (connectionId: string) => Promise<string>
  getActiveNWCUri: () => Promise<string | null>
  setActiveNWCConnection: (connectionId: string) => void
  removeNWCConnection: (connectionId: string) => { success: boolean; error?: string }

  // Settings actions
  updateTippingSettings: (settings: Partial<StoredTippingSettings>) => {
    success: boolean
    error?: string
  }
  updatePreferences: (preferences: Partial<StoredPreferences>) => {
    success: boolean
    error?: string
  }

  // Export/Import
  exportProfile: () => ProfileExportData
  exportAllProfiles: () => ProfileExportData
  importProfiles: (
    data: ProfileExportData,
    merge?: boolean,
  ) => { success: boolean; error?: string }

  // Refresh
  refreshProfile: () => Promise<void>
}

// Server sync debounce
const SERVER_SYNC_DEBOUNCE_MS = 1000

const ProfileContext = createContext<ProfileContextValue | null>(null)

/**
 * ProfileProvider - Provides profile management context
 *
 * NOTE: This provider requires NostrAuthProvider as an ancestor.
 * Ensure the provider hierarchy is: NostrAuthProvider > ProfileProvider
 */
export function ProfileProvider({ children }: ProfileProviderProps): React.JSX.Element {
  // This hook requires NostrAuthProvider - will throw if not wrapped correctly
  const {
    isAuthenticated,
    publicKey,
    profile: authProfile,
    refreshProfile: refreshAuthProfile,
    hasServerSession,
  } = useNostrAuth() as {
    isAuthenticated: boolean
    publicKey: string | null
    profile: StoredProfile | null
    refreshProfile: () => void
    hasServerSession: boolean
  }

  const [state, setState] = useState<ProfileState>({
    loading: false,
    error: null,
    blinkAccounts: [],
    nwcConnections: [],
    tippingSettings: null,
    preferences: null,
    serverSynced: false,
  })

  // Server sync debounce timer
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Update state helper
   */
  const updateState = useCallback((updates: Partial<ProfileState>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }, [])

  /**
   * Sync Blink API accounts to server (debounced)
   */
  const syncBlinkApiAccountsToServer = useCallback(
    async (accounts: LocalBlinkAccount[]) => {
      if (!publicKey) return

      // Clear existing timer
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
      }

      // Debounce the sync
      syncTimerRef.current = setTimeout(async () => {
        try {
          // Filter only API key accounts (not ln-address type)
          const apiAccounts = accounts.filter(
            (a: LocalBlinkAccount) => a.type !== "ln-address" && a.apiKey,
          )

          if (apiAccounts.length === 0) {
            console.log("[useProfile] No Blink API accounts to sync")
            return
          }

          console.log(
            "[useProfile] Syncing",
            apiAccounts.length,
            "Blink API accounts to server...",
          )

          // Decrypt API keys before sending to server (server will re-encrypt)
          const accountsWithDecryptedKeys = await Promise.all(
            apiAccounts.map(async (account: LocalBlinkAccount) => {
              let apiKey: string | null = null
              try {
                // API key is stored encrypted locally - decrypt it
                apiKey = await CryptoUtils.decryptWithDeviceKey(account.apiKey!)
              } catch (err: unknown) {
                console.error(
                  "[useProfile] Failed to decrypt API key for account:",
                  account.id,
                  err,
                )
              }

              return {
                id: account.id,
                label: account.label,
                username: account.username,
                apiKey,
                defaultCurrency: account.defaultCurrency || "BTC",
                isActive: account.isActive,
                createdAt: new Date(account.createdAt || Date.now()).toISOString(),
                lastUsed: account.lastUsed
                  ? new Date(account.lastUsed).toISOString()
                  : undefined,
              }
            }),
          )

          // Filter out accounts where decryption failed
          const validAccounts = accountsWithDecryptedKeys.filter((a) => a.apiKey)

          if (validAccounts.length === 0) {
            console.log("[useProfile] No valid Blink API accounts after decryption")
            return
          }

          const response = await fetch("/api/user/sync", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pubkey: publicKey,
              field: "blinkApiAccounts",
              data: validAccounts,
            }),
          })

          if (response.ok) {
            console.log("[useProfile] ✓ Blink API accounts synced to server")
            updateState({ serverSynced: true })
          } else {
            console.error("[useProfile] Server sync failed:", response.status)
          }
        } catch (err: unknown) {
          console.error("[useProfile] Server sync error:", err)
        }
      }, SERVER_SYNC_DEBOUNCE_MS)
    },
    [publicKey, updateState],
  )

  /**
   * Sync npub.cash wallets to server (debounced)
   */
  const syncNpubCashWalletsToServer = useCallback(
    async (accounts: LocalBlinkAccount[]) => {
      if (!publicKey) return

      // Clear existing timer
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
      }

      // Debounce the sync
      syncTimerRef.current = setTimeout(async () => {
        try {
          // Filter only npub.cash wallets
          const npubCashWallets = accounts.filter(
            (a: LocalBlinkAccount) => a.type === "npub-cash",
          )

          if (npubCashWallets.length === 0) {
            console.log("[useProfile] No npub.cash wallets to sync")
            return
          }

          console.log(
            "[useProfile] Syncing",
            npubCashWallets.length,
            "npub.cash wallets to server...",
          )

          const walletsToSync = npubCashWallets.map((wallet: LocalBlinkAccount) => ({
            id: wallet.id,
            label: wallet.label,
            address: wallet.lightningAddress || wallet.address,
            lightningAddress: wallet.lightningAddress || wallet.address,
            localpart: wallet.localpart,
            isNpub: wallet.isNpub,
            pubkey: wallet.pubkey,
            isActive: wallet.isActive,
            createdAt: new Date(wallet.createdAt || Date.now()).toISOString(),
            lastUsed: wallet.lastUsed
              ? new Date(wallet.lastUsed).toISOString()
              : undefined,
          }))

          const response = await fetch("/api/user/sync", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pubkey: publicKey,
              field: "npubCashWallets",
              data: walletsToSync,
            }),
          })

          if (response.ok) {
            console.log("[useProfile] ✓ npub.cash wallets synced to server")
            updateState({ serverSynced: true })
          } else {
            console.error("[useProfile] Server sync failed:", response.status)
          }
        } catch (err: unknown) {
          console.error("[useProfile] Server sync error:", err)
        }
      }, SERVER_SYNC_DEBOUNCE_MS)
    },
    [publicKey, updateState],
  )

  /**
   * Sync LN Address wallets to server (debounced)
   */
  const syncLnAddressWalletsToServer = useCallback(
    async (wallets: LocalBlinkAccount[]) => {
      if (!publicKey) return

      // Clear existing timer
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
      }

      // Debounce the sync
      syncTimerRef.current = setTimeout(async () => {
        try {
          // Filter only LN Address wallets
          const lnAddressWallets = wallets.filter(
            (w: LocalBlinkAccount) => w.type === "ln-address",
          )

          if (lnAddressWallets.length === 0) return

          console.log(
            "[useProfile] Syncing",
            lnAddressWallets.length,
            "LN Address wallets to server...",
          )

          const response = await fetch("/api/user/sync", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pubkey: publicKey,
              field: "blinkLnAddressWallets",
              data: lnAddressWallets.map((w: LocalBlinkAccount) => ({
                id: w.id,
                label: w.label,
                username: w.username,
                lightningAddress: w.lightningAddress,
                walletId: w.walletId,
                isActive: w.isActive,
                createdAt: new Date(w.createdAt as string | number).toISOString(),
                lastUsed: w.lastUsed ? new Date(w.lastUsed).toISOString() : undefined,
              })),
            }),
          })

          if (response.ok) {
            console.log("[useProfile] ✓ LN Address wallets synced to server")
            updateState({ serverSynced: true })
          } else {
            console.error("[useProfile] Server sync failed:", response.status)
          }
        } catch (err: unknown) {
          console.error("[useProfile] Server sync error:", err)
        }
      }, SERVER_SYNC_DEBOUNCE_MS)
    },
    [publicKey, updateState],
  )

  /**
   * Sync npub.cash wallets to server IMMEDIATELY (no debounce, for deletions)
   */
  const syncNpubCashWalletsToServerImmediate = useCallback(
    async (accounts: LocalBlinkAccount[]) => {
      if (!publicKey) return

      try {
        const npubCashWallets = accounts.filter(
          (a: LocalBlinkAccount) => a.type === "npub-cash",
        )

        console.log(
          "[useProfile] IMMEDIATE sync:",
          npubCashWallets.length,
          "npub.cash wallets to server",
        )

        const walletsToSync = npubCashWallets.map((wallet: LocalBlinkAccount) => ({
          id: wallet.id,
          label: wallet.label,
          address: wallet.lightningAddress || wallet.address,
          lightningAddress: wallet.lightningAddress || wallet.address,
          localpart: wallet.localpart,
          isNpub: wallet.isNpub,
          pubkey: wallet.pubkey,
          isActive: wallet.isActive,
          createdAt: new Date(wallet.createdAt || Date.now()).toISOString(),
          lastUsed: wallet.lastUsed ? new Date(wallet.lastUsed).toISOString() : undefined,
        }))

        const response = await fetch("/api/user/sync", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pubkey: publicKey,
            field: "npubCashWallets",
            data: walletsToSync,
          }),
        })

        if (response.ok) {
          console.log("[useProfile] ✓ npub.cash wallets synced immediately")
          updateState({ serverSynced: true })
        } else {
          console.error("[useProfile] Immediate sync failed:", response.status)
        }
      } catch (err: unknown) {
        console.error("[useProfile] Immediate sync error:", err)
      }
    },
    [publicKey, updateState],
  )

  /**
   * Sync LN Address wallets to server IMMEDIATELY (no debounce, for deletions)
   */
  const syncLnAddressWalletsToServerImmediate = useCallback(
    async (wallets: LocalBlinkAccount[]) => {
      if (!publicKey) return

      try {
        const lnAddressWallets = wallets.filter(
          (w: LocalBlinkAccount) => w.type === "ln-address",
        )

        console.log(
          "[useProfile] IMMEDIATE sync:",
          lnAddressWallets.length,
          "LN Address wallets to server",
        )

        const response = await fetch("/api/user/sync", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pubkey: publicKey,
            field: "blinkLnAddressWallets",
            data: lnAddressWallets.map((w: LocalBlinkAccount) => ({
              id: w.id,
              label: w.label,
              username: w.username,
              lightningAddress: w.lightningAddress,
              walletId: w.walletId,
              isActive: w.isActive,
              createdAt: new Date(w.createdAt || Date.now()).toISOString(),
              lastUsed: w.lastUsed ? new Date(w.lastUsed).toISOString() : undefined,
            })),
          }),
        })

        if (response.ok) {
          console.log("[useProfile] ✓ LN Address wallets synced immediately")
          updateState({ serverSynced: true })
        }
      } catch (err: unknown) {
        console.error("[useProfile] Immediate sync error:", err)
      }
    },
    [publicKey, updateState],
  )

  /**
   * Sync Blink API accounts to server IMMEDIATELY (no debounce, for deletions)
   */
  const syncBlinkApiAccountsToServerImmediate = useCallback(
    async (accounts: LocalBlinkAccount[]) => {
      if (!publicKey) return

      try {
        const apiAccounts = accounts.filter(
          (a: LocalBlinkAccount) =>
            a.type !== "ln-address" && a.type !== "npub-cash" && a.apiKey,
        )

        console.log(
          "[useProfile] IMMEDIATE sync:",
          apiAccounts.length,
          "Blink API accounts to server",
        )

        const accountsWithDecryptedKeys = await Promise.all(
          apiAccounts.map(async (account: LocalBlinkAccount) => {
            let apiKey: string | null = null
            try {
              apiKey = await CryptoUtils.decryptWithDeviceKey(account.apiKey!)
            } catch (decryptErr: unknown) {
              console.warn("[useProfile] Could not decrypt API key for", account.username)
            }
            return {
              id: account.id,
              label: account.label,
              username: account.username,
              apiKey,
              defaultCurrency: account.defaultCurrency || "BTC",
              isActive: account.isActive,
              createdAt: new Date(account.createdAt || Date.now()).toISOString(),
              lastUsed: account.lastUsed
                ? new Date(account.lastUsed).toISOString()
                : undefined,
            }
          }),
        )

        const validAccounts = accountsWithDecryptedKeys.filter((a) => a.apiKey)

        const response = await fetch("/api/user/sync", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pubkey: publicKey,
            field: "blinkApiAccounts",
            data: validAccounts,
          }),
        })

        if (response.ok) {
          console.log("[useProfile] ✓ Blink API accounts synced immediately")
          updateState({ serverSynced: true })
        }
      } catch (err: unknown) {
        console.error("[useProfile] Immediate sync error:", err)
      }
    },
    [publicKey, updateState],
  )

  /**
   * Fetch all Blink data from server (API accounts + LN Address wallets)
   * NOTE: This requires hasServerSession to be true - caller must check
   */
  const fetchBlinkDataFromServer = useCallback(async (): Promise<{
    blinkApiAccounts: ServerBlinkApiAccount[]
    blinkLnAddressWallets: ServerLnAddressWallet[]
    npubCashWallets: ServerNpubCashWallet[]
  }> => {
    if (!publicKey)
      return { blinkApiAccounts: [], blinkLnAddressWallets: [], npubCashWallets: [] }

    // IMPORTANT: Don't fetch from server if session isn't established yet
    // This prevents 401 errors during the auth race condition
    if (!hasServerSession) {
      console.log(
        "[useProfile] Skipping server fetch - no session yet (hasServerSession:",
        hasServerSession,
        ")",
      )
      return { blinkApiAccounts: [], blinkLnAddressWallets: [], npubCashWallets: [] }
    }

    try {
      console.log("[useProfile] Fetching Blink data from server (session established)...")
      const response = await fetch(`/api/user/sync?pubkey=${publicKey}`)

      if (!response.ok) {
        console.error("[useProfile] Server fetch failed:", response.status)
        return { blinkApiAccounts: [], blinkLnAddressWallets: [], npubCashWallets: [] }
      }

      const data = await response.json()
      console.log("[useProfile] Server returned:", {
        blinkApiAccounts: data.blinkApiAccounts?.length || 0,
        blinkLnAddressWallets: data.blinkLnAddressWallets?.length || 0,
        npubCashWallets: data.npubCashWallets?.length || 0,
      })

      return {
        blinkApiAccounts: data.blinkApiAccounts || [],
        blinkLnAddressWallets: data.blinkLnAddressWallets || [],
        npubCashWallets: data.npubCashWallets || [],
      }
    } catch (err: unknown) {
      console.error("[useProfile] Server fetch error:", err)
      return { blinkApiAccounts: [], blinkLnAddressWallets: [], npubCashWallets: [] }
    }
  }, [publicKey, hasServerSession])

  /**
   * Fetch LN Address wallets from server (backwards compatibility)
   */
  const fetchLnAddressWalletsFromServer = useCallback(async (): Promise<
    ServerLnAddressWallet[]
  > => {
    const data = await fetchBlinkDataFromServer()
    return data.blinkLnAddressWallets
  }, [fetchBlinkDataFromServer])

  /**
   * Load profile data (with server sync for all Blink wallets)
   */
  const loadProfileData = useCallback(async (): Promise<void> => {
    if (!isAuthenticated || !authProfile) {
      updateState({
        blinkAccounts: [],
        nwcConnections: [],
        tippingSettings: null,
        preferences: null,
      })
      return
    }

    // Load from localStorage first
    const localAccounts: LocalBlinkAccount[] = authProfile.blinkAccounts || []

    updateState({
      blinkAccounts: localAccounts,
      nwcConnections: authProfile.nwcConnections || [],
      tippingSettings: authProfile.tippingSettings || null,
      preferences: authProfile.preferences || null,
    })

    // Fetch all Blink data from server for cross-device sync
    const serverData = await fetchBlinkDataFromServer()
    const serverApiAccounts: ServerBlinkApiAccount[] = serverData.blinkApiAccounts || []
    const serverLnAddressWallets: ServerLnAddressWallet[] =
      serverData.blinkLnAddressWallets || []
    const serverNpubCashWallets: ServerNpubCashWallet[] = serverData.npubCashWallets || []

    // Separate local accounts by type
    const localApiKeyAccounts = localAccounts.filter(
      (a: LocalBlinkAccount) =>
        a.type !== "ln-address" && a.type !== "npub-cash" && a.apiKey,
    )
    const localLnAddressWallets = localAccounts.filter(
      (a: LocalBlinkAccount) => a.type === "ln-address",
    )
    const localNpubCashWallets = localAccounts.filter(
      (a: LocalBlinkAccount) => a.type === "npub-cash",
    )

    let mergedAccounts: LocalBlinkAccount[] = [...localAccounts]
    let needsLocalUpdate = false
    let needsServerSyncApi = false
    let needsServerSyncLnAddr = false
    let needsServerSyncNpubCash = false

    // === Merge Blink API accounts ===
    if (serverApiAccounts.length > 0) {
      const mergedApiAccounts: LocalBlinkAccount[] = []

      // Add all server API accounts, checking against local
      for (const serverAccount of serverApiAccounts) {
        const localAccount = localApiKeyAccounts.find(
          (l: LocalBlinkAccount) =>
            l.id === serverAccount.id || l.username === serverAccount.username,
        )

        if (localAccount) {
          // Keep local version (has encrypted API key for this device)
          mergedApiAccounts.push(localAccount)
        } else if (serverAccount.apiKey) {
          // New account from server - encrypt API key for local storage
          console.log(
            "[useProfile] Adding server API account to local:",
            serverAccount.username,
          )
          try {
            const encryptedApiKey = await CryptoUtils.encryptWithDeviceKey(
              serverAccount.apiKey,
            )
            mergedApiAccounts.push({
              id: serverAccount.id,
              label: serverAccount.label,
              username: serverAccount.username,
              apiKey: encryptedApiKey,
              defaultCurrency: serverAccount.defaultCurrency || "BTC",
              isActive: localAccounts.length === 0 && mergedApiAccounts.length === 0, // First account is active
              createdAt: new Date(serverAccount.createdAt).getTime(),
              lastUsed: serverAccount.lastUsed
                ? new Date(serverAccount.lastUsed).getTime()
                : undefined,
              source: "server",
            })
            needsLocalUpdate = true
          } catch (err: unknown) {
            console.error("[useProfile] Failed to encrypt server API key:", err)
          }
        }
      }

      // Add any local-only API accounts
      for (const localAccount of localApiKeyAccounts) {
        const existsOnServer = serverApiAccounts.find(
          (s: ServerBlinkApiAccount) =>
            s.id === localAccount.id || s.username === localAccount.username,
        )
        if (!existsOnServer) {
          mergedApiAccounts.push(localAccount)
          needsServerSyncApi = true
        }
      }

      // Replace local API accounts with merged (preserve npub.cash wallets)
      mergedAccounts = [
        ...mergedApiAccounts,
        ...localLnAddressWallets,
        ...localNpubCashWallets,
      ]
    } else if (localApiKeyAccounts.length > 0) {
      // No server API accounts but we have local - sync to server
      console.log(
        "[useProfile] No server API accounts, syncing",
        localApiKeyAccounts.length,
        "local accounts to server",
      )
      needsServerSyncApi = true
    }

    // === Merge LN Address wallets ===
    if (serverLnAddressWallets.length > 0) {
      const currentApiAccounts = mergedAccounts.filter(
        (a: LocalBlinkAccount) => a.type !== "ln-address" && a.type !== "npub-cash",
      )
      const currentNpubCashWallets = mergedAccounts.filter(
        (a: LocalBlinkAccount) => a.type === "npub-cash",
      )
      const mergedLnAddressWallets: LocalBlinkAccount[] = []

      // Add all server LN Address wallets, checking against local
      for (const serverWallet of serverLnAddressWallets) {
        const localWallet = localLnAddressWallets.find(
          (l: LocalBlinkAccount) => l.id === serverWallet.id,
        )

        if (localWallet) {
          mergedLnAddressWallets.push(localWallet)
        } else {
          // Add from server (new wallet from another device)
          console.log(
            "[useProfile] Adding server LN Address wallet to local:",
            serverWallet.username,
          )
          mergedLnAddressWallets.push({
            id: serverWallet.id,
            type: "ln-address",
            label: serverWallet.label,
            username: serverWallet.username,
            lightningAddress: serverWallet.lightningAddress,
            walletId: serverWallet.walletId,
            isActive: mergedAccounts.length === 0 && mergedLnAddressWallets.length === 0,
            createdAt: new Date(serverWallet.createdAt).getTime(),
            lastUsed: serverWallet.lastUsed
              ? new Date(serverWallet.lastUsed).getTime()
              : undefined,
            source: "server",
          })
          needsLocalUpdate = true
        }
      }

      // Add any local-only LN Address wallets
      for (const localWallet of localLnAddressWallets) {
        if (
          !serverLnAddressWallets.find(
            (s: ServerLnAddressWallet) => s.id === localWallet.id,
          )
        ) {
          mergedLnAddressWallets.push(localWallet)
          needsServerSyncLnAddr = true
        }
      }

      mergedAccounts = [
        ...currentApiAccounts,
        ...mergedLnAddressWallets,
        ...currentNpubCashWallets,
      ]
    } else if (localLnAddressWallets.length > 0) {
      // No server LN Address wallets but we have local - sync to server
      console.log(
        "[useProfile] No server LN Address wallets, syncing",
        localLnAddressWallets.length,
        "local wallets to server",
      )
      needsServerSyncLnAddr = true
    }

    // === Merge npub.cash wallets ===
    if (serverNpubCashWallets.length > 0) {
      const currentApiAccounts = mergedAccounts.filter(
        (a: LocalBlinkAccount) => a.type !== "ln-address" && a.type !== "npub-cash",
      )
      const currentLnAddressWallets = mergedAccounts.filter(
        (a: LocalBlinkAccount) => a.type === "ln-address",
      )
      const mergedNpubCashWallets: LocalBlinkAccount[] = []

      // Add all server npub.cash wallets, checking against local
      for (const serverWallet of serverNpubCashWallets) {
        const localWallet = localNpubCashWallets.find(
          (l: LocalBlinkAccount) => l.id === serverWallet.id,
        )

        if (localWallet) {
          mergedNpubCashWallets.push(localWallet)
        } else {
          // Add from server (new wallet from another device)
          console.log(
            "[useProfile] Adding server npub.cash wallet to local:",
            serverWallet.address || serverWallet.lightningAddress,
          )
          mergedNpubCashWallets.push({
            id: serverWallet.id,
            type: "npub-cash",
            label: serverWallet.label,
            lightningAddress: serverWallet.lightningAddress || serverWallet.address,
            localpart: serverWallet.localpart,
            isNpub: serverWallet.isNpub,
            pubkey: serverWallet.pubkey,
            isActive: mergedAccounts.length === 0 && mergedNpubCashWallets.length === 0,
            createdAt: serverWallet.createdAt
              ? new Date(serverWallet.createdAt).getTime()
              : Date.now(),
            lastUsed: serverWallet.lastUsed
              ? new Date(serverWallet.lastUsed).getTime()
              : undefined,
            source: "server",
          })
          needsLocalUpdate = true
        }
      }

      // Add any local-only npub.cash wallets
      for (const localWallet of localNpubCashWallets) {
        if (
          !serverNpubCashWallets.find(
            (s: ServerNpubCashWallet) => s.id === localWallet.id,
          )
        ) {
          mergedNpubCashWallets.push(localWallet)
          needsServerSyncNpubCash = true
        }
      }

      mergedAccounts = [
        ...currentApiAccounts,
        ...currentLnAddressWallets,
        ...mergedNpubCashWallets,
      ]
    } else if (localNpubCashWallets.length > 0) {
      // No server npub.cash wallets but we have local - sync to server
      console.log(
        "[useProfile] No server npub.cash wallets, syncing",
        localNpubCashWallets.length,
        "local wallets to server",
      )
      needsServerSyncNpubCash = true
    }

    // Update localStorage with merged data if needed
    if (needsLocalUpdate && authProfile.id) {
      console.log("[useProfile] Updating localStorage with merged accounts")
      const profile = ProfileStorage.getProfileById(authProfile.id)
      if (profile) {
        profile.blinkAccounts = mergedAccounts as StoredBlinkAccount[]
        ProfileStorage.updateProfile(profile)
      }
    }

    updateState({
      blinkAccounts: mergedAccounts,
      serverSynced: true,
    })

    // Sync local-only accounts to server
    if (needsServerSyncApi) {
      syncBlinkApiAccountsToServer(mergedAccounts)
    }
    if (needsServerSyncLnAddr) {
      syncLnAddressWalletsToServer(mergedAccounts)
    }
    if (needsServerSyncNpubCash) {
      syncNpubCashWalletsToServer(mergedAccounts)
    }
  }, [
    isAuthenticated,
    authProfile,
    updateState,
    fetchBlinkDataFromServer,
    syncBlinkApiAccountsToServer,
    syncLnAddressWalletsToServer,
    syncNpubCashWalletsToServer,
  ])

  // Load profile data when auth changes
  useEffect(() => {
    loadProfileData()
  }, [loadProfileData])

  // Cleanup sync timer on unmount
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
      }
    }
  }, [])

  // ============= Blink Account Management =============

  /**
   * Add a new Blink account (via API key)
   */
  const addBlinkAccount = useCallback(
    async ({
      label,
      apiKey,
      username,
      defaultCurrency,
    }: {
      label: string
      apiKey: string
      username: string
      defaultCurrency?: string
    }): Promise<{ success: boolean; account?: StoredBlinkAccount; error?: string }> => {
      if (!authProfile) throw new Error("Not authenticated")

      const profileId: string = authProfile.id
      updateState({ loading: true, error: null })

      try {
        const account = await ProfileStorage.addBlinkAccount(
          profileId,
          label,
          apiKey,
          username,
          defaultCurrency,
        )

        // Refresh auth profile state
        refreshAuthProfile()

        // Load data directly from storage to avoid stale closure issues
        const freshProfile = ProfileStorage.getProfileById(profileId)
        if (freshProfile) {
          const activeAccount: StoredBlinkAccount | null =
            freshProfile.blinkAccounts.find((a: StoredBlinkAccount) => a.isActive) || null
          updateState({
            loading: false,
            blinkAccounts: freshProfile.blinkAccounts,
          })

          // Sync Blink API accounts to server for cross-device sync
          syncBlinkApiAccountsToServer(freshProfile.blinkAccounts)
        } else {
          updateState({ loading: false })
        }

        return { success: true, account }
      } catch (error: unknown) {
        const err = error as Error
        console.error("Failed to add Blink account:", error)
        updateState({ loading: false, error: err.message })
        return { success: false, error: err.message }
      }
    },
    [authProfile, refreshAuthProfile, updateState, syncBlinkApiAccountsToServer],
  )

  /**
   * Add a new Blink account via Lightning Address (no API key)
   */
  const addBlinkLnAddressAccount = useCallback(
    async ({
      label,
      username,
      walletId,
      walletCurrency,
      lightningAddress,
    }: {
      label: string
      username: string
      walletId: string
      walletCurrency?: string
      lightningAddress: string
    }): Promise<{ success: boolean; account?: StoredBlinkAccount; error?: string }> => {
      if (!authProfile) throw new Error("Not authenticated")

      const profileId: string = authProfile.id
      updateState({ loading: true, error: null })

      try {
        const account = await ProfileStorage.addBlinkLnAddressAccount(profileId, {
          label,
          username,
          walletId,
          walletCurrency: walletCurrency as string,
          lightningAddress,
        })

        // Refresh auth profile state
        refreshAuthProfile()

        // Load data directly from storage to avoid stale closure issues
        const freshProfile = ProfileStorage.getProfileById(profileId)
        if (freshProfile) {
          const activeAccount: StoredBlinkAccount | null =
            freshProfile.blinkAccounts.find((a: StoredBlinkAccount) => a.isActive) || null
          updateState({
            loading: false,
            blinkAccounts: freshProfile.blinkAccounts,
          })

          // Sync LN Address wallets to server
          syncLnAddressWalletsToServer(freshProfile.blinkAccounts)
        } else {
          updateState({ loading: false })
        }

        return { success: true, account }
      } catch (error: unknown) {
        const err = error as Error
        console.error("Failed to add Blink LN Address account:", error)
        updateState({ loading: false, error: err.message })
        return { success: false, error: err.message }
      }
    },
    [authProfile, refreshAuthProfile, updateState, syncLnAddressWalletsToServer],
  )

  /**
   * Add npub.cash wallet
   * npub.cash wallets receive payments as Cashu ecash tokens
   */
  const addNpubCashAccount = useCallback(
    async ({
      lightningAddress,
      label,
    }: {
      lightningAddress: string
      label?: string
    }): Promise<{ success: boolean; wallet?: StoredBlinkAccount; error?: string }> => {
      if (!authProfile) throw new Error("Not authenticated")

      const profileId: string = authProfile.id
      updateState({ loading: true, error: null })

      try {
        const wallet = await ProfileStorage.addNpubCashAccount(profileId, {
          lightningAddress,
          label: label as string,
        })

        // Refresh auth profile state
        refreshAuthProfile()

        // Load data directly from storage to avoid stale closure issues
        const freshProfile = ProfileStorage.getProfileById(profileId)
        if (freshProfile) {
          const activeAccount: StoredBlinkAccount | null =
            freshProfile.blinkAccounts.find((a: StoredBlinkAccount) => a.isActive) || null
          updateState({
            loading: false,
            blinkAccounts: freshProfile.blinkAccounts,
          })

          // Sync npub.cash wallets to server
          syncNpubCashWalletsToServer(freshProfile.blinkAccounts)
        } else {
          updateState({ loading: false })
        }

        return { success: true, wallet }
      } catch (error: unknown) {
        const err = error as Error
        console.error("Failed to add npub.cash wallet:", error)
        updateState({ loading: false, error: err.message })
        return { success: false, error: err.message }
      }
    },
    [authProfile, refreshAuthProfile, updateState, syncNpubCashWalletsToServer],
  )

  /**
   * Get decrypted API key for an account
   */
  const getBlinkApiKey = useCallback(
    async (accountId: string): Promise<string | null> => {
      if (!authProfile) throw new Error("Not authenticated")

      try {
        return await ProfileStorage.getBlinkApiKey(authProfile.id, accountId)
      } catch (error: unknown) {
        console.error("Failed to get API key:", error)
        throw error
      }
    },
    [authProfile],
  )

  /**
   * Get API key for active Blink account
   */
  const getActiveBlinkApiKey = useCallback(async (): Promise<string | null> => {
    if (!authProfile) return null

    try {
      return await ProfileStorage.getActiveBlinkApiKey(authProfile.id)
    } catch (error: unknown) {
      console.error("Failed to get active API key:", error)
      return null
    }
  }, [authProfile])

  /**
   * Set active Blink account
   */
  const setActiveBlinkAccount = useCallback(
    (accountId: string): void => {
      if (!authProfile) throw new Error("Not authenticated")

      const profileId: string = authProfile.id

      try {
        ProfileStorage.setActiveBlinkAccount(profileId, accountId)

        // Refresh auth profile state
        refreshAuthProfile()

        // Load data directly from storage to avoid stale closure issues
        const freshProfile = ProfileStorage.getProfileById(profileId)
        if (freshProfile) {
          const activeAccount: StoredBlinkAccount | null =
            freshProfile.blinkAccounts.find((a: StoredBlinkAccount) => a.isActive) || null
          updateState({
            blinkAccounts: freshProfile.blinkAccounts,
          })
        }
      } catch (error: unknown) {
        console.error("Failed to set active account:", error)
        throw error
      }
    },
    [authProfile, refreshAuthProfile, updateState],
  )

  /**
   * Update a Blink account
   */
  const updateBlinkAccount = useCallback(
    async (
      accountId: string,
      updates: Partial<LocalBlinkAccount>,
    ): Promise<{ success: boolean; error?: string }> => {
      if (!authProfile) throw new Error("Not authenticated")

      const profileId: string = authProfile.id
      updateState({ loading: true, error: null })

      try {
        await ProfileStorage.updateBlinkAccount(
          profileId,
          accountId,
          updates as Partial<StoredBlinkAccount>,
        )

        // Refresh auth profile state
        refreshAuthProfile()

        // Load data directly from storage to avoid stale closure issues
        const freshProfile = ProfileStorage.getProfileById(profileId)
        if (freshProfile) {
          const activeAccount: StoredBlinkAccount | null =
            freshProfile.blinkAccounts.find((a: StoredBlinkAccount) => a.isActive) || null
          updateState({
            loading: false,
            blinkAccounts: freshProfile.blinkAccounts,
          })
        } else {
          updateState({ loading: false })
        }

        return { success: true }
      } catch (error: unknown) {
        const err = error as Error
        console.error("Failed to update account:", error)
        updateState({ loading: false, error: err.message })
        return { success: false, error: err.message }
      }
    },
    [authProfile, refreshAuthProfile, updateState],
  )

  /**
   * Remove a Blink account
   */
  const removeBlinkAccount = useCallback(
    async (accountId: string): Promise<{ success: boolean; error?: string }> => {
      if (!authProfile) throw new Error("Not authenticated")

      try {
        // Get the account type before removing
        const account: LocalBlinkAccount | undefined = authProfile.blinkAccounts.find(
          (a: LocalBlinkAccount) => a.id === accountId,
        )
        const accountType: string | undefined = account?.type

        ProfileStorage.removeBlinkAccount(authProfile.id, accountId)
        refreshAuthProfile()

        // Get the updated profile and sync to server IMMEDIATELY to persist the deletion
        const freshProfile = ProfileStorage.getProfileById(authProfile.id)
        if (freshProfile) {
          // Sync the appropriate wallet type to server IMMEDIATELY (not debounced)
          // This prevents the deleted wallet from being re-added on next load
          if (accountType === "npub-cash") {
            await syncNpubCashWalletsToServerImmediate(freshProfile.blinkAccounts)
          } else if (accountType === "ln-address") {
            await syncLnAddressWalletsToServerImmediate(freshProfile.blinkAccounts)
          } else {
            await syncBlinkApiAccountsToServerImmediate(freshProfile.blinkAccounts)
          }
        }

        // Update local state without reloading from server (which would re-add the deleted wallet)
        updateState({
          blinkAccounts: freshProfile?.blinkAccounts || [],
          serverSynced: true, // Already synced
        })

        return { success: true }
      } catch (error: unknown) {
        const err = error as Error
        console.error("Failed to remove account:", error)
        return { success: false, error: err.message }
      }
    },
    [
      authProfile,
      refreshAuthProfile,
      updateState,
      syncBlinkApiAccountsToServerImmediate,
      syncLnAddressWalletsToServerImmediate,
      syncNpubCashWalletsToServerImmediate,
    ],
  )

  // ============= NWC Connection Management =============

  /**
   * Add an NWC connection
   */
  const addNWCConnection = useCallback(
    async ({
      label,
      uri,
      capabilities,
    }: {
      label: string
      uri: string
      capabilities?: string[]
    }): Promise<{
      success: boolean
      connection?: StoredNWCConnection
      error?: string
    }> => {
      if (!authProfile) throw new Error("Not authenticated")

      updateState({ loading: true, error: null })

      try {
        const connection = await ProfileStorage.addNWCConnection(
          authProfile.id,
          label,
          uri,
          capabilities,
        )

        refreshAuthProfile()
        loadProfileData()
        updateState({ loading: false })

        return { success: true, connection }
      } catch (error: unknown) {
        const err = error as Error
        console.error("Failed to add NWC connection:", error)
        updateState({ loading: false, error: err.message })
        return { success: false, error: err.message }
      }
    },
    [authProfile, refreshAuthProfile, loadProfileData, updateState],
  )

  /**
   * Get decrypted NWC URI
   */
  const getNWCUri = useCallback(
    async (connectionId: string): Promise<string> => {
      if (!authProfile) throw new Error("Not authenticated")

      try {
        return await ProfileStorage.getNWCUri(authProfile.id, connectionId)
      } catch (error: unknown) {
        console.error("Failed to get NWC URI:", error)
        throw error
      }
    },
    [authProfile],
  )

  /**
   * Get active NWC URI
   */
  const getActiveNWCUri = useCallback(async (): Promise<string | null> => {
    if (!authProfile) return null

    try {
      return await ProfileStorage.getActiveNWCUri(authProfile.id)
    } catch (error: unknown) {
      console.error("Failed to get active NWC URI:", error)
      return null
    }
  }, [authProfile])

  /**
   * Set active NWC connection
   */
  const setActiveNWCConnection = useCallback(
    (connectionId: string): void => {
      if (!authProfile) throw new Error("Not authenticated")

      try {
        ProfileStorage.setActiveNWCConnection(authProfile.id, connectionId)
        refreshAuthProfile()
        loadProfileData()
      } catch (error: unknown) {
        console.error("Failed to set active NWC connection:", error)
        throw error
      }
    },
    [authProfile, refreshAuthProfile, loadProfileData],
  )

  /**
   * Remove an NWC connection
   */
  const removeNWCConnection = useCallback(
    (connectionId: string): { success: boolean; error?: string } => {
      if (!authProfile) throw new Error("Not authenticated")

      try {
        ProfileStorage.removeNWCConnection(authProfile.id, connectionId)
        refreshAuthProfile()
        loadProfileData()
        return { success: true }
      } catch (error: unknown) {
        const err = error as Error
        console.error("Failed to remove NWC connection:", error)
        return { success: false, error: err.message }
      }
    },
    [authProfile, refreshAuthProfile, loadProfileData],
  )

  // ============= Settings Management =============

  /**
   * Update tipping settings
   */
  const updateTippingSettings = useCallback(
    (settings: Partial<StoredTippingSettings>): { success: boolean; error?: string } => {
      if (!authProfile) throw new Error("Not authenticated")

      try {
        ProfileStorage.updateTippingSettings(authProfile.id, settings)
        refreshAuthProfile()
        loadProfileData()
        return { success: true }
      } catch (error: unknown) {
        const err = error as Error
        console.error("Failed to update tipping settings:", error)
        return { success: false, error: err.message }
      }
    },
    [authProfile, refreshAuthProfile, loadProfileData],
  )

  /**
   * Update preferences
   */
  const updatePreferences = useCallback(
    (preferences: Partial<StoredPreferences>): { success: boolean; error?: string } => {
      if (!authProfile) throw new Error("Not authenticated")

      try {
        ProfileStorage.updatePreferences(authProfile.id, preferences)
        refreshAuthProfile()
        loadProfileData()
        return { success: true }
      } catch (error: unknown) {
        const err = error as Error
        console.error("Failed to update preferences:", error)
        return { success: false, error: err.message }
      }
    },
    [authProfile, refreshAuthProfile, loadProfileData],
  )

  // ============= Export/Import =============

  /**
   * Export profile data
   */
  const exportProfile = useCallback((): ProfileExportData => {
    if (!authProfile) throw new Error("Not authenticated")

    try {
      return ProfileStorage.exportProfile(authProfile.id)
    } catch (error: unknown) {
      console.error("Failed to export profile:", error)
      throw error
    }
  }, [authProfile])

  /**
   * Export all profiles
   */
  const exportAllProfiles = useCallback((): ProfileExportData => {
    return ProfileStorage.exportAllProfiles()
  }, [])

  /**
   * Import profiles
   */
  const importProfiles = useCallback(
    (
      data: ProfileExportData,
      merge: boolean = true,
    ): { success: boolean; error?: string } => {
      try {
        ProfileStorage.importProfiles(data, merge)
        refreshAuthProfile()
        loadProfileData()
        return { success: true }
      } catch (error: unknown) {
        const err = error as Error
        console.error("Failed to import profiles:", error)
        return { success: false, error: err.message }
      }
    },
    [refreshAuthProfile, loadProfileData],
  )

  // Compute derived state with memoization to prevent unnecessary re-renders
  // Without useMemo, these would create new object references on every render,
  // causing downstream useEffect hooks (like in Dashboard) to fire unnecessarily
  // Note: activeBlinkAccount excludes npub.cash wallets (those are handled by activeNpubCashWallet)
  const activeBlinkAccount = useMemo(
    (): LocalBlinkAccount | null =>
      state.blinkAccounts.find(
        (a: LocalBlinkAccount) => a.isActive && a.type !== "npub-cash",
      ) || null,
    [state.blinkAccounts],
  )
  const activeNWCConnection = useMemo(
    (): StoredNWCConnection | null =>
      state.nwcConnections.find((c: StoredNWCConnection) => c.isActive) || null,
    [state.nwcConnections],
  )
  const hasBlinkAccount: boolean = state.blinkAccounts.length > 0
  const hasNWCConnection: boolean = state.nwcConnections.length > 0
  const npubCashWallets = useMemo(
    (): LocalBlinkAccount[] =>
      state.blinkAccounts.filter((a: LocalBlinkAccount) => a.type === "npub-cash"),
    [state.blinkAccounts],
  )
  const hasNpubCashWallet: boolean = npubCashWallets.length > 0
  const activeNpubCashWallet = useMemo(
    (): LocalBlinkAccount | null =>
      npubCashWallets.find((w: LocalBlinkAccount) => w.isActive) || null,
    [npubCashWallets],
  )

  const value: ProfileContextValue = {
    // State
    loading: state.loading,
    error: state.error,

    // Profile data
    blinkAccounts: state.blinkAccounts,
    nwcConnections: state.nwcConnections,
    tippingSettings: state.tippingSettings,
    preferences: state.preferences,

    // Computed
    activeBlinkAccount,
    activeNWCConnection,
    hasBlinkAccount,
    hasNWCConnection,
    hasNpubCashWallet,
    npubCashWallets,
    activeNpubCashWallet,

    // Blink account actions
    addBlinkAccount,
    addBlinkLnAddressAccount,
    addNpubCashAccount,
    getBlinkApiKey,
    getActiveBlinkApiKey,
    setActiveBlinkAccount,
    updateBlinkAccount,
    removeBlinkAccount,

    // NWC connection actions
    addNWCConnection,
    getNWCUri,
    getActiveNWCUri,
    setActiveNWCConnection,
    removeNWCConnection,

    // Settings actions
    updateTippingSettings,
    updatePreferences,

    // Export/Import
    exportProfile,
    exportAllProfiles,
    importProfiles,

    // Refresh
    refreshProfile: loadProfileData,
  }

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

/**
 * useProfile hook - Access profile management context
 */
export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext)

  if (!context) {
    throw new Error("useProfile must be used within a ProfileProvider")
  }

  return context
}

export default useProfile
