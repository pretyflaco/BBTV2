/**
 * useCombinedAuth - Unified authentication hook supporting both legacy and Nostr auth
 *
 * This hook provides a seamless interface that works with:
 * 1. Legacy authentication (API key via useAuth)
 * 2. New Nostr authentication (extension/signer via useNostrAuth + useProfile)
 *
 * Components can use this hook without worrying about which auth system is active.
 */

import { useCallback, useMemo, useEffect, useState } from "react"
import { useAuth } from "./useAuth"
import { useNostrAuth } from "./useNostrAuth"
import { useProfile } from "./useProfile"
import { useNWC } from "./useNWC"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MigrationService: any = require("../migration/MigrationService")

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Authentication mode
 * @typedef {'legacy' | 'nostr' | null} AuthMode
 */
export type AuthMode = "legacy" | "nostr" | null

/**
 * Combined user object returned by useCombinedAuth
 */
export interface CombinedUser {
  username: string | null
  preferredCurrency?: string
  publicKey?: string
  authMode: string
  [key: string]: unknown
}

/**
 * Result from storeBlinkAccountOnServer
 */
export interface StoreBlinkAccountResult {
  success: boolean
  error?: string
  blinkUsername?: string
  localOnly?: boolean
}

/**
 * Result from startMigration
 */
export interface StartMigrationResult {
  success: boolean
  error?: string
}

/**
 * Result from completeMigration
 */
export interface CompleteMigrationResult {
  success: boolean
  error?: string
  message?: string
  blinkUsername?: string
  apiKey?: string
  preferences?: { preferredCurrency?: string; [key: string]: unknown }
}

/**
 * Pending migration state
 */
export interface PendingMigration {
  legacyUsername: string
  startedAt: number
  status: string
  [key: string]: unknown
}

/**
 * Combined auth state
 * @typedef {Object} CombinedAuthState
 * @property {boolean} loading - Whether auth check is in progress
 * @property {boolean} isAuthenticated - Whether user is authenticated (either method)
 * @property {AuthMode} authMode - Which auth method is active
 * @property {Object|null} user - User info (username, etc.)
 * @property {string|null} publicKey - Nostr public key (if using Nostr auth)
 * @property {boolean} hasBlinkAccount - Whether a Blink account is configured
 * @property {boolean} needsBlinkSetup - Whether Nostr user needs to add Blink account
 */

/**
 * Return type of useCombinedAuth hook
 */
export interface UseCombinedAuthReturn {
  // State
  loading: boolean
  initialized: boolean
  isAuthenticated: boolean
  authMode: AuthMode
  user: CombinedUser | null
  needsBlinkSetup: boolean
  needsWalletSetup: boolean

  // Nostr-specific
  publicKey: string | null
  hasExtension: boolean
  isMobile: boolean
  hasServerSession: boolean
  nostrProfile: unknown

  // Profile data
  hasBlinkAccount: boolean
  hasNpubCashWallet: boolean
  npubCashWallets: unknown[]
  activeNpubCashWallet: unknown
  blinkAccounts: unknown[]
  activeBlinkAccount: unknown
  tippingSettings: unknown
  preferences: unknown

  // NWC data
  hasNWC: boolean
  nwcConnections: unknown[]
  activeNWC: unknown
  nwcClientReady: boolean

  // Legacy auth methods
  legacyLogin: (...args: unknown[]) => Promise<unknown>

  // Nostr auth methods
  signInWithExtension: (...args: unknown[]) => Promise<unknown>
  signInWithExternalSigner: (...args: unknown[]) => Promise<unknown>
  checkPendingSignerFlow: (...args: unknown[]) => unknown
  establishServerSession: (...args: unknown[]) => Promise<unknown>

  // Profile methods
  addBlinkAccount: (...args: unknown[]) => unknown
  addBlinkLnAddressWallet: (...args: unknown[]) => unknown
  addNpubCashWallet: (...args: unknown[]) => unknown
  removeBlinkAccount: (...args: unknown[]) => unknown
  updateBlinkAccount: (...args: unknown[]) => unknown
  getActiveBlinkApiKey: () => Promise<string | null>
  setActiveBlinkAccount: (...args: unknown[]) => unknown
  updateTippingSettings: (...args: unknown[]) => unknown
  updatePreferences: (...args: unknown[]) => unknown
  storeBlinkAccountOnServer: (
    apiKey: string,
    preferredCurrency?: string,
    label?: string | null,
  ) => Promise<StoreBlinkAccountResult>

  // NWC methods
  addNWCConnection: (...args: unknown[]) => unknown
  removeNWCConnection: (...args: unknown[]) => unknown
  updateNWCConnection: (...args: unknown[]) => unknown
  setActiveNWC: (...args: unknown[]) => unknown
  nwcMakeInvoice: (...args: unknown[]) => Promise<unknown>
  nwcPayInvoice: (...args: unknown[]) => Promise<unknown>
  nwcGetBalance: (...args: unknown[]) => Promise<unknown>
  nwcLookupInvoice: (...args: unknown[]) => Promise<unknown>
  nwcListTransactions: (...args: unknown[]) => Promise<unknown>
  nwcHasCapability: (capability: string) => boolean
  nwcLoading: boolean
  getActiveNWCUri: (...args: unknown[]) => unknown

  // Unified methods
  logout: () => Promise<void>
  getApiKey: () => Promise<string | null>

  // Migration
  canMigrateToNostr: boolean
  pendingMigration: PendingMigration | null
  startMigration: () => StartMigrationResult
  completeMigration: (
    nostrPublicKey: string,
    signInMethod?: string,
  ) => Promise<CompleteMigrationResult>
  clearMigration: () => void

  // Raw access to individual hooks (for advanced usage)
  _legacy: any
  _nostr: any
  _profile: any
  _nwc: any
}

export function useCombinedAuth(): UseCombinedAuthReturn {
  // Legacy auth (API key based)
  const legacyAuth: any = useAuth()

  // Nostr auth (extension/signer based)
  const nostrAuth: any = useNostrAuth()

  // Profile management (Blink accounts, settings)
  const profile: any = useProfile()

  // NWC wallet connections - IMPORTANT: Pass user's public key for user-scoped storage
  // This prevents NWC connections from one user being accessible by another user
  // Also pass hasServerSession to prevent 401 errors during auth race condition
  const nwc: any = useNWC(nostrAuth.publicKey, nostrAuth.hasServerSession)

  // Track initialization state
  const [initialized, setInitialized] = useState<boolean>(false)

  // Determine loading state
  const loading = useMemo<boolean>(() => {
    return legacyAuth.loading || nostrAuth.loading
  }, [legacyAuth.loading, nostrAuth.loading])

  // Determine which auth mode is active
  // Prioritize Nostr auth if user has a local Nostr profile
  // This prevents NIP-98 server sessions from being detected as "legacy"
  const authMode = useMemo<AuthMode>(() => {
    // Check Nostr first - if user has local Nostr profile, they're a Nostr user
    if (nostrAuth.isAuthenticated) return "nostr"
    // Check if legacy user (API key only, not Nostr with server session)
    if (legacyAuth.user && !(legacyAuth.user as any).authMethod?.startsWith("nostr"))
      return "legacy"
    // If user has authMethod === 'nostr' from verify, they're Nostr but profile not loaded yet
    if ((legacyAuth.user as any)?.authMethod === "nostr") return "nostr"
    return null
  }, [legacyAuth.user, nostrAuth.isAuthenticated])

  // Check if authenticated via either method
  const isAuthenticated = useMemo<boolean>(() => {
    return !!legacyAuth.user || nostrAuth.isAuthenticated
  }, [legacyAuth.user, nostrAuth.isAuthenticated])

  // Get unified user info
  // Check Nostr first to prevent NIP-98 sessions from showing as legacy
  const user = useMemo<CombinedUser | null>(() => {
    // Nostr with Blink account - show Blink username
    if (nostrAuth.isAuthenticated && profile.activeBlinkAccount) {
      return {
        username: (profile.activeBlinkAccount as any).username,
        preferredCurrency: (profile.preferences as any)?.defaultCurrency || "BTC",
        publicKey: nostrAuth.publicKey as string | undefined,
        authMode: "nostr",
      }
    }

    // Nostr without Blink account yet
    if (nostrAuth.isAuthenticated) {
      return {
        username: null,
        preferredCurrency: (profile.preferences as any)?.defaultCurrency || "BTC",
        publicKey: nostrAuth.publicKey as string | undefined,
        authMode: "nostr",
      }
    }

    // Legacy user (API key auth, not Nostr)
    // Only treat as legacy if authMethod is not 'nostr'
    if (legacyAuth.user && (legacyAuth.user as any).authMethod !== "nostr") {
      return {
        ...(legacyAuth.user as any),
        authMode: "legacy",
      }
    }

    return null
  }, [
    legacyAuth.user,
    nostrAuth.isAuthenticated,
    nostrAuth.publicKey,
    profile.activeBlinkAccount,
    profile.preferences,
  ])

  // Check if Nostr user needs to set up a wallet (Blink OR NWC)
  const needsWalletSetup = useMemo<boolean>(() => {
    // User needs wallet setup if authenticated but has neither Blink nor NWC
    return nostrAuth.isAuthenticated && !profile.hasBlinkAccount && !nwc.hasNWC
  }, [nostrAuth.isAuthenticated, profile.hasBlinkAccount, nwc.hasNWC])

  // Legacy alias for backwards compatibility
  const needsBlinkSetup = needsWalletSetup

  // Unified logout function
  // IMPORTANT: Always clear BOTH auth systems to prevent stale state
  // The legacyAuth.user can persist from NIP-98 server sessions even for Nostr users
  const logout = useCallback(async (): Promise<void> => {
    // Always clear both to ensure clean logout
    // Order matters: clear Nostr first (calls server logout), then legacy state
    await nostrAuth.signOut()
    await legacyAuth.logout()
  }, [legacyAuth, nostrAuth])

  // Get API key (works for both auth methods)
  const getApiKey = useCallback(async (): Promise<string | null> => {
    if (authMode === "legacy") {
      // Legacy: Fetch from server
      try {
        const response = await fetch("/api/auth/get-api-key")
        if (response.ok) {
          const data = await response.json()
          return data.apiKey
        }
      } catch (error: unknown) {
        console.error("Failed to get API key (legacy):", error)
      }
      return null
    } else if (authMode === "nostr") {
      // For Nostr users, ALWAYS use the local profile's active account key
      // This supports multiple Blink accounts with different API keys
      // The server only stores one key (for initial setup/recovery), but local profile has all
      const localKey = await profile.getActiveBlinkApiKey()
      if (localKey) {
        return localKey
      }

      // Fallback to server if no local key (e.g., first login on new device)
      if (nostrAuth.hasServerSession) {
        try {
          const response = await fetch("/api/auth/get-api-key")
          if (response.ok) {
            const data = await response.json()
            return data.apiKey
          }
        } catch (error: unknown) {
          console.error("Failed to get API key (nostr server):", error)
        }
      }
      return null
    }
    return null
  }, [authMode, profile, nostrAuth.hasServerSession])

  // Store Blink account on server (for Nostr users)
  // SECURITY: Now requires NIP-98 session - pubkey-only auth has been removed
  // For external signers without NIP-98 session, server storage is skipped but
  // local storage still works. This is a trade-off: less cross-device sync
  // but better security (API keys can't be stolen by knowing a pubkey).
  const storeBlinkAccountOnServer = useCallback(
    async (
      apiKey: string,
      preferredCurrency: string = "BTC",
      label: string | null = null,
    ): Promise<StoreBlinkAccountResult> => {
      console.log(
        "[storeBlinkAccountOnServer] Called with authMode:",
        authMode,
        "hasServerSession:",
        nostrAuth.hasServerSession,
      )

      if (authMode !== "nostr") {
        console.log("[storeBlinkAccountOnServer] Skipping - not Nostr auth")
        return { success: false, error: "Not authenticated with Nostr" }
      }

      // SECURITY: Require NIP-98 server session - pubkey-only auth is disabled
      if (!nostrAuth.hasServerSession) {
        console.log(
          "[storeBlinkAccountOnServer] Skipping server storage - no NIP-98 session (external signer)",
        )
        console.log("[storeBlinkAccountOnServer] API key will be stored locally only")
        // Return success:false but not an error - this is expected for external signers
        return {
          success: false,
          error: "Server storage requires NIP-98 session",
          localOnly: true,
        }
      }

      try {
        console.log(
          "[storeBlinkAccountOnServer] Making POST request with NIP-98 session...",
        )

        const body: { apiKey: string; preferredCurrency: string; label: string | null } =
          { apiKey, preferredCurrency, label }
        // No longer sending pubkey in body - session authentication only

        const response = await fetch("/api/auth/nostr-blink-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        })

        console.log("[storeBlinkAccountOnServer] Response status:", response.status)
        const data = await response.json()
        console.log("[storeBlinkAccountOnServer] Response data:", data)

        if (response.ok) {
          return { success: true, blinkUsername: data.blinkUsername }
        } else {
          return { success: false, error: data.error }
        }
      } catch (error: unknown) {
        console.error("[storeBlinkAccountOnServer] Failed:", error)
        return { success: false, error: (error as Error).message }
      }
    },
    [authMode, nostrAuth.hasServerSession],
  )

  // Mark as initialized once loading is complete
  useEffect(() => {
    if (!loading && !initialized) {
      setInitialized(true)
    }
  }, [loading, initialized])

  // Check if legacy user can migrate to Nostr
  const canMigrateToNostr = useMemo<boolean>(() => {
    return authMode === "legacy" && typeof window !== "undefined"
  }, [authMode])

  // Check for pending migration (for completing after Nostr sign-in)
  const pendingMigration = useMemo<PendingMigration | null>(() => {
    if (typeof window === "undefined") return null
    return MigrationService.getPendingMigration()
  }, [])

  // Start migration process
  const startMigration = useCallback((): StartMigrationResult => {
    if (authMode !== "legacy" || !legacyAuth.user) {
      return { success: false, error: "Must be logged in with legacy auth" }
    }
    const started: boolean = MigrationService.startMigration(
      (legacyAuth.user as any).username,
    )
    return { success: started }
  }, [authMode, legacyAuth.user])

  // Complete migration (call after Nostr sign-in)
  const completeMigration = useCallback(
    async (
      nostrPublicKey: string,
      signInMethod: string = "extension",
    ): Promise<CompleteMigrationResult> => {
      const result: CompleteMigrationResult =
        await MigrationService.completeMigration(nostrPublicKey)

      if (result.success) {
        // Add the Blink account to the new Nostr profile
        try {
          const ProfileStorage: any = (await import("../storage/ProfileStorage.js"))
            .default

          // Ensure profile exists - use getProfileByPublicKey and createProfile with signInMethod
          let profileData: any = ProfileStorage.getProfileByPublicKey(nostrPublicKey)
          if (!profileData) {
            profileData = ProfileStorage.createProfile(nostrPublicKey, signInMethod)
          }

          // Add the migrated Blink account using correct method signature:
          // addBlinkAccount(profileId, label, apiKey, username, defaultCurrency)
          await ProfileStorage.addBlinkAccount(
            profileData.id,
            `Migrated from ${result.blinkUsername}`,
            result.apiKey,
            result.blinkUsername,
            result.preferences?.preferredCurrency || "BTC",
          )

          // Update preferences using profile.id, not nostrPublicKey
          if (result.preferences) {
            ProfileStorage.updatePreferences(profileData.id, result.preferences)
          }

          return { success: true, message: "Migration complete" }
        } catch (error: unknown) {
          console.error("Failed to save migrated account:", error)
          return { success: false, error: (error as Error).message }
        }
      }

      return result
    },
    [],
  )

  // Clear pending migration
  const clearMigration = useCallback((): void => {
    MigrationService.clearMigration()
  }, [])

  return {
    // State
    loading,
    initialized,
    isAuthenticated,
    authMode,
    user,
    needsBlinkSetup,
    needsWalletSetup,

    // Nostr-specific
    publicKey: nostrAuth.publicKey,
    hasExtension: nostrAuth.hasExtension,
    isMobile: nostrAuth.isMobile,
    hasServerSession: nostrAuth.hasServerSession,
    nostrProfile: nostrAuth.nostrProfile,

    // Profile data
    hasBlinkAccount: profile.hasBlinkAccount,
    hasNpubCashWallet: profile.hasNpubCashWallet,
    npubCashWallets: profile.npubCashWallets,
    activeNpubCashWallet: profile.activeNpubCashWallet,
    blinkAccounts: profile.blinkAccounts,
    activeBlinkAccount: profile.activeBlinkAccount,
    tippingSettings: profile.tippingSettings,
    preferences: profile.preferences,

    // NWC data
    hasNWC: nwc.hasNWC,
    nwcConnections: nwc.connections,
    activeNWC: nwc.activeConnection,
    nwcClientReady: nwc.clientReady,

    // Legacy auth methods
    legacyLogin: legacyAuth.login,

    // Nostr auth methods
    signInWithExtension: nostrAuth.signInWithExtension,
    signInWithExternalSigner: nostrAuth.signInWithExternalSigner,
    checkPendingSignerFlow: nostrAuth.checkPendingSignerFlow,
    establishServerSession: nostrAuth.establishServerSession,

    // Profile methods
    addBlinkAccount: profile.addBlinkAccount,
    addBlinkLnAddressWallet: profile.addBlinkLnAddressAccount,
    addNpubCashWallet: profile.addNpubCashAccount,
    removeBlinkAccount: profile.removeBlinkAccount,
    updateBlinkAccount: profile.updateBlinkAccount,
    getActiveBlinkApiKey: profile.getActiveBlinkApiKey,
    setActiveBlinkAccount: profile.setActiveBlinkAccount,
    updateTippingSettings: profile.updateTippingSettings,
    updatePreferences: profile.updatePreferences,
    storeBlinkAccountOnServer,

    // NWC methods
    addNWCConnection: nwc.addConnection,
    removeNWCConnection: nwc.removeConnection,
    updateNWCConnection: nwc.updateConnection,
    setActiveNWC: nwc.setActiveConnection,
    nwcMakeInvoice: nwc.makeInvoice,
    nwcPayInvoice: nwc.payInvoice,
    nwcGetBalance: nwc.getBalance,
    nwcLookupInvoice: nwc.lookupInvoice,
    nwcListTransactions: nwc.listTransactions,
    nwcHasCapability: nwc.hasCapability,
    nwcLoading: nwc.loading,
    getActiveNWCUri: nwc.getActiveConnectionUri, // For server-side NWC forwarding

    // Unified methods
    logout,
    getApiKey,

    // Migration
    canMigrateToNostr,
    pendingMigration,
    startMigration,
    completeMigration,
    clearMigration,

    // Raw access to individual hooks (for advanced usage)
    _legacy: legacyAuth,
    _nostr: nostrAuth,
    _profile: profile,
    _nwc: nwc,
  }
}

export default useCombinedAuth
