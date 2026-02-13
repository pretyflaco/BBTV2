/**
 * useNWC - React hook for managing NWC (Nostr Wallet Connect) connections
 *
 * Provides:
 * - NWC connection management (add, remove, set active)
 * - Wallet operations (getBalance, payInvoice, makeInvoice)
 * - Connection validation and info fetching
 * - Cross-device sync via server storage
 *
 * IMPORTANT: NWC connections are scoped to the user's public key to prevent
 * cross-user data leakage.
 *
 * STORAGE STRATEGY:
 * - Primary: Server storage (encrypted) for cross-device sync
 * - Fallback: localStorage for offline access
 * - URIs are encrypted on both client and server
 */

import { useState, useCallback, useEffect, useRef } from "react"

import NWCClient, {
  type NWCResponse,
  type GetBalanceResult,
  type PayInvoiceResult,
  type MakeInvoiceResult,
  type ListTransactionsParams,
} from "../nwc/NWCClient"
import CryptoUtils, { type EncryptedData } from "../storage/CryptoUtils"

// ============= Local Interfaces =============

/**
 * Local NWC connection shape used within this hook.
 * NOTE: This differs from the global NWCConnection type (which uses `uri: EncryptedField`).
 * The local shape stores `encryptedUri` (encrypted by CryptoUtils), `walletPubkey`, and `relays`.
 */
export interface LocalNWCConnection {
  id: string
  label: string
  encryptedUri: EncryptedData
  capabilities: string[]
  walletPubkey: string
  relays: string[]
  isActive: boolean
  createdAt: number
  lastUsed?: number
}

/**
 * Server-side connection shape returned from/sent to the sync API.
 */
interface ServerNWCConnection {
  id: string
  label: string
  uri: string
  capabilities: string[]
  walletPubkey: string
  relays: string[]
  isActive: boolean
  createdAt: string
  lastUsed?: string
}

export interface NWCOperationResult {
  success: boolean
  error?: string
}

export interface NWCBalanceResult extends NWCOperationResult {
  balance?: number
}

export interface NWCPayResult extends NWCOperationResult {
  preimage?: string
  fees_paid?: number
}

export interface NWCInvoiceResult extends NWCOperationResult {
  invoice?: string
  payment_hash?: string
}

export interface NWCConnectionResult extends NWCOperationResult {
  connection?: LocalNWCConnection
}

export interface NWCHookReturn {
  // State
  connections: LocalNWCConnection[]
  activeConnection: LocalNWCConnection | null
  loading: boolean
  error: string | null
  hasNWC: boolean
  clientReady: boolean
  serverSynced: boolean

  // Connection management
  addConnection: (connectionUri: string, label: string) => Promise<NWCConnectionResult>
  removeConnection: (connectionId: string) => NWCOperationResult
  updateConnection: (
    connectionId: string,
    updates: Partial<LocalNWCConnection>,
  ) => NWCOperationResult
  setActiveConnection: (
    connectionId: string | null,
    connectionsOverride?: LocalNWCConnection[],
  ) => Promise<NWCOperationResult>

  // Wallet operations
  getBalance: () => Promise<NWCBalanceResult>
  payInvoice: (invoice: string) => Promise<NWCPayResult>
  makeInvoice: (params: {
    amount: number
    description?: string
    expiry?: number
  }) => Promise<NWCInvoiceResult>
  lookupInvoice: (
    paymentHash: string,
  ) => Promise<NWCOperationResult & { invoice?: Record<string, unknown> }>
  listTransactions: (
    params?: ListTransactionsParams,
  ) => Promise<NWCOperationResult & { transactions?: Record<string, unknown>[] }>

  // Helpers
  hasCapability: (method: string) => boolean
  getActiveConnectionUri: () => Promise<string | null>

  // Server sync
  syncToServer: () => Promise<void>
  fetchFromServer: () => Promise<ServerNWCConnection[] | null>
}

interface MakeInvoiceParams {
  amount: number
  description?: string
  expiry?: number
}

// ============= Constants =============

// Storage key prefix - actual keys are scoped to user pubkey
const NWC_STORAGE_PREFIX = "blinkpos_nwc"

// Old global storage keys (pre-fix, for migration/cleanup)
const OLD_NWC_CONNECTIONS_KEY = "blinkpos_nwc_connections"
const OLD_NWC_ACTIVE_KEY = "blinkpos_nwc_active"

// Server sync debounce
const SERVER_SYNC_DEBOUNCE_MS = 1000

/**
 * Get user-scoped storage keys
 */
const getStorageKeys = (userPubkey: string): { connections: string; active: string } => ({
  connections: `${NWC_STORAGE_PREFIX}_connections_${userPubkey}`,
  active: `${NWC_STORAGE_PREFIX}_active_${userPubkey}`,
})

/**
 * Clean up old global NWC storage keys
 * This prevents cross-user data leakage from old versions
 */
const cleanupOldGlobalStorage = (): void => {
  try {
    if (localStorage.getItem(OLD_NWC_CONNECTIONS_KEY)) {
      console.log("[useNWC] Removing old global NWC connections storage (security fix)")
      localStorage.removeItem(OLD_NWC_CONNECTIONS_KEY)
    }
    if (localStorage.getItem(OLD_NWC_ACTIVE_KEY)) {
      console.log("[useNWC] Removing old global NWC active storage (security fix)")
      localStorage.removeItem(OLD_NWC_ACTIVE_KEY)
    }
  } catch (err: unknown) {
    console.error("[useNWC] Failed to cleanup old storage:", err)
  }
}

/**
 * Hook for NWC wallet management
 * @param userPubkey - The current user's public key (required for user-scoped storage)
 * @param hasServerSession - Whether the server session is established (prevents 401 errors)
 */
export function useNWC(
  userPubkey: string,
  hasServerSession: boolean = false,
): NWCHookReturn {
  const [connections, setConnections] = useState<LocalNWCConnection[]>([])
  const [activeConnection, setActiveConnectionState] =
    useState<LocalNWCConnection | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [clientReady, setClientReady] = useState<boolean>(false)
  const [serverSynced, setServerSynced] = useState<boolean>(false)

  // Keep NWC client in ref to persist across renders
  const clientRef = useRef<NWCClient | null>(null)

  // Track current user to detect user changes
  const currentUserRef = useRef<string>(userPubkey)

  // Server sync debounce timer
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Fetch NWC connections from server
   * NOTE: Requires hasServerSession to be true to avoid 401 errors
   */
  const fetchFromServer = useCallback(async (): Promise<ServerNWCConnection[] | null> => {
    if (!userPubkey) return null

    // IMPORTANT: Don't fetch from server if session isn't established yet
    // This prevents 401 errors during the auth race condition
    if (!hasServerSession) {
      console.log(
        "[useNWC] Skipping server fetch - no session yet (hasServerSession:",
        hasServerSession,
        ")",
      )
      return null
    }

    try {
      console.log("[useNWC] Fetching connections from server (session established)...")
      const response = await fetch(`/api/user/sync?pubkey=${userPubkey}`)

      if (!response.ok) {
        console.error("[useNWC] Server fetch failed:", response.status)
        return null
      }

      const data: { nwcConnections?: ServerNWCConnection[] } = await response.json()
      console.log(
        "[useNWC] Server returned",
        data.nwcConnections?.length || 0,
        "connections",
      )
      return data.nwcConnections || []
    } catch (err: unknown) {
      console.error("[useNWC] Server fetch error:", err)
      return null
    }
  }, [userPubkey, hasServerSession])

  /**
   * Sync connections to server (debounced)
   */
  const syncToServer = useCallback(
    async (connectionsToSync: LocalNWCConnection[]): Promise<void> => {
      if (!userPubkey) return

      // Clear existing timer
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
      }

      // Debounce the sync
      syncTimerRef.current = setTimeout(async () => {
        try {
          console.log(
            "[useNWC] Syncing",
            connectionsToSync.length,
            "connections to server...",
          )

          // Prepare connections for server (decrypt for re-encryption on server)
          const serverConnections: ServerNWCConnection[] = await Promise.all(
            connectionsToSync.map(
              async (conn: LocalNWCConnection): Promise<ServerNWCConnection> => {
                // Decrypt locally encrypted URI
                const uri: string = await CryptoUtils.decryptWithDerivedKey(
                  conn.encryptedUri,
                  conn.walletPubkey,
                )

                return {
                  id: conn.id,
                  label: conn.label,
                  uri, // Server will encrypt this
                  capabilities: conn.capabilities,
                  walletPubkey: conn.walletPubkey,
                  relays: conn.relays,
                  isActive: conn.isActive,
                  createdAt: new Date(conn.createdAt).toISOString(),
                  lastUsed: conn.lastUsed
                    ? new Date(conn.lastUsed).toISOString()
                    : undefined,
                }
              },
            ),
          )

          const response = await fetch("/api/user/sync", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pubkey: userPubkey,
              field: "nwcConnections",
              data: serverConnections,
            }),
          })

          if (response.ok) {
            console.log("[useNWC] \u2713 Synced to server")
            setServerSynced(true)
          } else {
            console.error("[useNWC] Server sync failed:", response.status)
          }
        } catch (err: unknown) {
          console.error("[useNWC] Server sync error:", err)
        }
      }, SERVER_SYNC_DEBOUNCE_MS)
    },
    [userPubkey],
  )

  /**
   * Load connections from localStorage and server (user-scoped)
   */
  const loadConnections = useCallback(async (): Promise<void> => {
    // SECURITY: Clean up old global storage keys to prevent cross-user data leakage
    cleanupOldGlobalStorage()

    // Don't load if no user is authenticated
    if (!userPubkey) {
      console.log("[useNWC] No user pubkey, skipping connection load")
      setConnections([])
      setActiveConnectionState(null)
      setClientReady(false)
      setLoading(false)
      return
    }

    try {
      const keys = getStorageKeys(userPubkey)
      const stored: string | null = localStorage.getItem(keys.connections)
      const activeId: string | null = localStorage.getItem(keys.active)

      console.log(
        "[useNWC] Loading connections for user:",
        userPubkey?.substring(0, 8) + "...",
      )

      // Load from localStorage first (fast)
      let localConnections: LocalNWCConnection[] = []
      if (stored) {
        localConnections = JSON.parse(stored) as LocalNWCConnection[]
        setConnections(localConnections)
        console.log(
          "[useNWC] Loaded",
          localConnections.length,
          "connections from localStorage",
        )

        if (activeId) {
          const active: LocalNWCConnection | undefined = localConnections.find(
            (c: LocalNWCConnection) => c.id === activeId,
          )
          if (active) {
            setActiveConnectionState(active)
          }
        }
      } else {
        console.log("[useNWC] No stored connections in localStorage for this user")
      }

      // Then fetch from server (for cross-device sync)
      const serverConnections: ServerNWCConnection[] | null = await fetchFromServer()

      if (serverConnections && serverConnections.length > 0) {
        // Server has connections - merge with local
        // Server is source of truth, but we need to re-encrypt URIs locally
        const mergedConnections: LocalNWCConnection[] = await Promise.all(
          serverConnections.map(
            async (serverConn: ServerNWCConnection): Promise<LocalNWCConnection> => {
              // Check if we have this connection locally
              const localConn: LocalNWCConnection | undefined = localConnections.find(
                (l: LocalNWCConnection) => l.id === serverConn.id,
              )

              if (localConn) {
                // Keep local encrypted URI (already encrypted for this device)
                return localConn
              } else {
                // New connection from server - encrypt URI locally
                const encryptedUri: EncryptedData =
                  await CryptoUtils.encryptWithDerivedKey(
                    serverConn.uri,
                    serverConn.walletPubkey,
                  )

                return {
                  id: serverConn.id,
                  label: serverConn.label,
                  encryptedUri,
                  capabilities: serverConn.capabilities || [],
                  walletPubkey: serverConn.walletPubkey,
                  relays: serverConn.relays || [],
                  isActive: serverConn.isActive,
                  createdAt: new Date(serverConn.createdAt).getTime(),
                  lastUsed: serverConn.lastUsed
                    ? new Date(serverConn.lastUsed).getTime()
                    : undefined,
                }
              }
            },
          ),
        )

        // Add any local connections not on server
        for (const localConn of localConnections) {
          if (
            !serverConnections.find((s: ServerNWCConnection) => s.id === localConn.id)
          ) {
            mergedConnections.push(localConn)
          }
        }

        // Save merged to localStorage
        localStorage.setItem(keys.connections, JSON.stringify(mergedConnections))
        setConnections(mergedConnections)

        // Find active connection
        if (activeId) {
          const active: LocalNWCConnection | undefined = mergedConnections.find(
            (c: LocalNWCConnection) => c.id === activeId,
          )
          if (active) {
            setActiveConnectionState(active)
          }
        }

        console.log("[useNWC] Merged connections:", mergedConnections.length)
        setServerSynced(true)

        // Sync local-only connections to server
        const localOnlyConnections: LocalNWCConnection[] = localConnections.filter(
          (l: LocalNWCConnection) =>
            !serverConnections.find((s: ServerNWCConnection) => s.id === l.id),
        )
        if (localOnlyConnections.length > 0) {
          console.log(
            "[useNWC] Syncing",
            localOnlyConnections.length,
            "local-only connections to server",
          )
          syncToServer(mergedConnections)
        }
      } else if (localConnections.length > 0) {
        // No server connections but we have local - sync to server
        console.log("[useNWC] No server connections, syncing local to server")
        syncToServer(localConnections)
      } else {
        setConnections([])
        setActiveConnectionState(null)
      }
    } catch (err: unknown) {
      console.error("[useNWC] Failed to load connections:", err)
      setConnections([])
    } finally {
      setLoading(false)
    }
  }, [userPubkey, fetchFromServer, syncToServer])

  // Load connections when user changes
  useEffect(() => {
    // Detect user change and clear state
    if (currentUserRef.current !== userPubkey) {
      console.log(
        "[useNWC] User changed from",
        currentUserRef.current?.substring(0, 8),
        "to",
        userPubkey?.substring(0, 8),
      )
      currentUserRef.current = userPubkey

      // Close existing client when user changes
      if (clientRef.current) {
        clientRef.current.close()
        clientRef.current = null
      }
      setClientReady(false)
      setActiveConnectionState(null)
      setConnections([])
    }

    loadConnections()
  }, [userPubkey, loadConnections])

  /**
   * Save connections to localStorage and server (user-scoped)
   */
  const saveConnections = useCallback(
    (newConnections: LocalNWCConnection[]): void => {
      if (!userPubkey) {
        console.error("[useNWC] Cannot save connections without user pubkey")
        return
      }

      try {
        const keys = getStorageKeys(userPubkey)
        localStorage.setItem(keys.connections, JSON.stringify(newConnections))
        setConnections(newConnections)

        // Sync to server (debounced)
        syncToServer(newConnections)
      } catch (err: unknown) {
        console.error("[useNWC] Failed to save connections:", err)
      }
    },
    [userPubkey, syncToServer],
  )

  /**
   * Validate and add a new NWC connection
   */
  const addConnection = useCallback(
    async (connectionUri: string, label: string): Promise<NWCConnectionResult> => {
      setError(null)

      try {
        // Validate the connection
        const validation: {
          valid: boolean
          error?: string
          info?: { methods: string[] }
        } = await NWCClient.validate(connectionUri)

        if (!validation.valid) {
          return {
            success: false,
            error: validation.error || "Invalid connection string",
          }
        }

        // Parse URI to get pubkey and relays
        const tempClient: NWCClient = new NWCClient(connectionUri)

        // Encrypt the URI for storage
        // For simplicity, we use a derived key from the wallet pubkey
        // In production, you might want user password encryption
        const encryptedUri: EncryptedData = await CryptoUtils.encryptWithDerivedKey(
          connectionUri,
          tempClient.getWalletPubkey(),
        )

        const connection: LocalNWCConnection = {
          id: `nwc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          label: label || `Wallet ${tempClient.getDisplayName()}`,
          encryptedUri,
          capabilities: validation.info?.methods || [],
          walletPubkey: tempClient.getWalletPubkey(),
          relays: tempClient.getRelays(),
          isActive: false,
          createdAt: Date.now(),
        }

        tempClient.close()

        const newConnections: LocalNWCConnection[] = [...connections, connection]
        saveConnections(newConnections)

        // If this is the first connection, make it active
        if (connections.length === 0) {
          await setActiveConnection(connection.id, newConnections)
        }

        return { success: true, connection }
      } catch (err: unknown) {
        const error = err as Error
        console.error("[useNWC] Failed to add connection:", error)
        return { success: false, error: error.message || "Failed to add connection" }
      }
    },
    [connections, saveConnections],
  )

  /**
   * Clear the active NWC connection (deactivate NWC)
   */
  const clearActiveConnection = useCallback((): NWCOperationResult => {
    console.log("[useNWC] Clearing active connection")

    if (userPubkey) {
      const keys = getStorageKeys(userPubkey)
      localStorage.removeItem(keys.active)
    }

    setActiveConnectionState(null)
    setClientReady(false)

    if (clientRef.current) {
      clientRef.current.close()
      clientRef.current = null
    }

    // Update all connections to not be active
    const updatedConnections: LocalNWCConnection[] = connections.map(
      (c: LocalNWCConnection) => ({
        ...c,
        isActive: false,
      }),
    )
    saveConnections(updatedConnections)

    return { success: true }
  }, [connections, saveConnections, userPubkey])

  /**
   * Set the active NWC connection
   * @param connectionId - Pass null to clear active connection
   * @param connectionsOverride - Optional connections array to use
   */
  const setActiveConnection = useCallback(
    async (
      connectionId: string | null,
      connectionsOverride?: LocalNWCConnection[],
    ): Promise<NWCOperationResult> => {
      // Handle null/undefined to clear active connection
      if (!connectionId) {
        return clearActiveConnection()
      }

      if (!userPubkey) {
        return { success: false, error: "No user authenticated" }
      }

      const conns: LocalNWCConnection[] = connectionsOverride || connections
      const connection: LocalNWCConnection | undefined = conns.find(
        (c: LocalNWCConnection) => c.id === connectionId,
      )

      if (!connection) {
        return { success: false, error: "Connection not found" }
      }

      try {
        setClientReady(false)

        // Decrypt the URI
        const uri: string = await CryptoUtils.decryptWithDerivedKey(
          connection.encryptedUri,
          connection.walletPubkey,
        )

        // Close existing client
        if (clientRef.current) {
          clientRef.current.close()
        }

        // Create new client
        clientRef.current = new NWCClient(uri)

        // Update storage (user-scoped)
        const keys = getStorageKeys(userPubkey)
        localStorage.setItem(keys.active, connectionId)

        // Update connection's lastUsed
        const updatedConnections: LocalNWCConnection[] = conns.map(
          (c: LocalNWCConnection) => ({
            ...c,
            isActive: c.id === connectionId,
            lastUsed: c.id === connectionId ? Date.now() : c.lastUsed,
          }),
        )

        saveConnections(updatedConnections)
        setActiveConnectionState(connection)
        setClientReady(true)

        return { success: true }
      } catch (err: unknown) {
        const error = err as Error
        console.error("[useNWC] Failed to set active connection:", error)
        setClientReady(false)
        return { success: false, error: error.message }
      }
    },
    [connections, saveConnections, clearActiveConnection, userPubkey],
  )

  /**
   * Remove an NWC connection
   */
  const removeConnection = useCallback(
    (connectionId: string): NWCOperationResult => {
      const newConnections: LocalNWCConnection[] = connections.filter(
        (c: LocalNWCConnection) => c.id !== connectionId,
      )
      saveConnections(newConnections)

      // If we removed the active connection, clear it
      if (activeConnection?.id === connectionId) {
        if (userPubkey) {
          const keys = getStorageKeys(userPubkey)
          localStorage.removeItem(keys.active)
        }
        setActiveConnectionState(null)
        setClientReady(false)
        if (clientRef.current) {
          clientRef.current.close()
          clientRef.current = null
        }
      }

      return { success: true }
    },
    [connections, activeConnection, saveConnections, userPubkey],
  )

  /**
   * Update an NWC connection's properties (e.g., label)
   */
  const updateConnection = useCallback(
    (connectionId: string, updates: Partial<LocalNWCConnection>): NWCOperationResult => {
      const newConnections: LocalNWCConnection[] = connections.map(
        (c: LocalNWCConnection) => (c.id === connectionId ? { ...c, ...updates } : c),
      )
      saveConnections(newConnections)

      // If we updated the active connection, update the active state
      if (activeConnection?.id === connectionId) {
        setActiveConnectionState({ ...activeConnection, ...updates })
      }

      return { success: true }
    },
    [connections, activeConnection, saveConnections],
  )

  /**
   * Get wallet balance (in millisats)
   */
  const getBalance = useCallback(async (): Promise<NWCBalanceResult> => {
    if (!clientRef.current) {
      return { success: false, error: "No active NWC connection" }
    }

    try {
      const response: NWCResponse<GetBalanceResult> = await clientRef.current.getBalance()

      if (response.error) {
        return { success: false, error: response.error.message }
      }

      return { success: true, balance: response.result?.balance || 0 }
    } catch (err: unknown) {
      const error = err as Error
      return { success: false, error: error.message }
    }
  }, [])

  /**
   * Pay a lightning invoice
   */
  const payInvoice = useCallback(async (invoice: string): Promise<NWCPayResult> => {
    if (!clientRef.current) {
      return { success: false, error: "No active NWC connection" }
    }

    try {
      const response: NWCResponse<PayInvoiceResult> =
        await clientRef.current.payInvoice(invoice)

      if (response.error) {
        return { success: false, error: response.error.message }
      }

      return {
        success: true,
        preimage: response.result?.preimage,
        fees_paid: response.result?.fees_paid,
      }
    } catch (err: unknown) {
      const error = err as Error
      return { success: false, error: error.message }
    }
  }, [])

  /**
   * Create a lightning invoice
   */
  const makeInvoice = useCallback(
    async ({
      amount,
      description,
      expiry,
    }: MakeInvoiceParams): Promise<NWCInvoiceResult> => {
      console.log("[useNWC] makeInvoice called:", { amount, description, expiry })
      console.log("[useNWC] Active connection:", activeConnection?.label)
      console.log("[useNWC] Connection capabilities:", activeConnection?.capabilities)
      console.log("[useNWC] Client ready:", !!clientRef.current)

      if (!clientRef.current) {
        return { success: false, error: "No active NWC connection" }
      }

      // Check if make_invoice capability is supported
      if (activeConnection && !activeConnection.capabilities?.includes("make_invoice")) {
        console.error("[useNWC] Wallet does not support make_invoice capability")
        return {
          success: false,
          error: `This wallet does not support invoice creation. Supported capabilities: ${activeConnection.capabilities?.join(", ") || "none"}`,
        }
      }

      try {
        const response: NWCResponse<MakeInvoiceResult> =
          await clientRef.current.makeInvoice({
            amount,
            description,
            expiry,
          })

        if (response.error) {
          return { success: false, error: response.error.message }
        }

        return {
          success: true,
          invoice: response.result?.invoice,
          payment_hash: response.result?.payment_hash,
        }
      } catch (err: unknown) {
        const error = err as Error
        return { success: false, error: error.message }
      }
    },
    [activeConnection],
  )

  /**
   * Look up invoice status
   */
  const lookupInvoice = useCallback(
    async (
      paymentHash: string,
    ): Promise<NWCOperationResult & { invoice?: Record<string, unknown> }> => {
      if (!clientRef.current) {
        return { success: false, error: "No active NWC connection" }
      }

      try {
        const response: NWCResponse = await clientRef.current.lookupInvoice(paymentHash)

        if (response.error) {
          return { success: false, error: response.error.message }
        }

        return { success: true, invoice: response.result ?? undefined }
      } catch (err: unknown) {
        const error = err as Error
        return { success: false, error: error.message }
      }
    },
    [],
  )

  /**
   * List transactions from NWC wallet
   */
  const listTransactions = useCallback(
    async (
      params: ListTransactionsParams = {},
    ): Promise<NWCOperationResult & { transactions?: Record<string, unknown>[] }> => {
      if (!clientRef.current) {
        return { success: false, error: "No active NWC connection" }
      }

      // Check if list_transactions capability is supported
      if (
        activeConnection &&
        !activeConnection.capabilities?.includes("list_transactions")
      ) {
        return {
          success: false,
          error: "This wallet does not support transaction history",
        }
      }

      try {
        const response: NWCResponse<{ transactions?: Record<string, unknown>[] }> =
          (await clientRef.current.listTransactions(params)) as NWCResponse<{
            transactions?: Record<string, unknown>[]
          }>

        if (response.error) {
          return { success: false, error: response.error.message }
        }

        return {
          success: true,
          transactions: response.result?.transactions || [],
        }
      } catch (err: unknown) {
        const error = err as Error
        return { success: false, error: error.message }
      }
    },
    [activeConnection],
  )

  /**
   * Check if a specific capability is supported
   */
  const hasCapability = useCallback(
    (method: string): boolean => {
      if (!activeConnection) return false
      return activeConnection.capabilities?.includes(method) || false
    },
    [activeConnection],
  )

  /**
   * Get the decrypted connection URI for the active connection
   * Used for server-side NWC forwarding via webhook
   */
  const getActiveConnectionUri = useCallback(async (): Promise<string | null> => {
    if (!activeConnection?.encryptedUri || !activeConnection?.walletPubkey) {
      console.log("[useNWC] getActiveConnectionUri: No active connection or missing data")
      return null
    }
    try {
      const uri: string = await CryptoUtils.decryptWithDerivedKey(
        activeConnection.encryptedUri,
        activeConnection.walletPubkey,
      )
      return uri
    } catch (err: unknown) {
      console.error("[useNWC] Failed to decrypt active connection URI:", err)
      return null
    }
  }, [activeConnection])

  /**
   * Initialize the active connection client (call after page load)
   */
  const initializeClient = useCallback(async (): Promise<void> => {
    if (!userPubkey) {
      console.log("[useNWC] No user pubkey, skipping client initialization")
      setClientReady(false)
      return
    }

    const keys = getStorageKeys(userPubkey)
    const activeId: string | null = localStorage.getItem(keys.active)
    if (!activeId) {
      setClientReady(false)
      return
    }

    const connection: LocalNWCConnection | undefined = connections.find(
      (c: LocalNWCConnection) => c.id === activeId,
    )
    if (!connection) {
      setClientReady(false)
      return
    }

    try {
      console.log(
        "[useNWC] Initializing client for:",
        connection.label,
        "(user:",
        userPubkey?.substring(0, 8) + "...)",
      )
      console.log("[useNWC] Stored capabilities:", connection.capabilities)
      console.log(
        "[useNWC] Has make_invoice:",
        connection.capabilities?.includes("make_invoice"),
      )

      const uri: string = await CryptoUtils.decryptWithDerivedKey(
        connection.encryptedUri,
        connection.walletPubkey,
      )
      clientRef.current = new NWCClient(uri)
      setActiveConnectionState(connection)
      setClientReady(true)
      console.log("[useNWC] Client initialized successfully")
    } catch (err: unknown) {
      console.error("[useNWC] Failed to initialize client:", err)
      setClientReady(false)
    }
  }, [connections, userPubkey])

  // Initialize client when connections are loaded
  useEffect(() => {
    if (!loading && connections.length > 0 && !clientRef.current) {
      initializeClient()
    }
  }, [loading, connections, initializeClient])

  // Cleanup sync timer on unmount
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
      }
    }
  }, [])

  return {
    // State
    connections,
    activeConnection,
    loading,
    error,
    hasNWC: connections.length > 0,
    clientReady,
    serverSynced,

    // Connection management
    addConnection,
    removeConnection,
    updateConnection,
    setActiveConnection,

    // Wallet operations
    getBalance,
    payInvoice,
    makeInvoice,
    lookupInvoice,
    listTransactions,

    // Helpers
    hasCapability,
    getActiveConnectionUri,

    // Server sync
    syncToServer: (): Promise<void> => syncToServer(connections),
    fetchFromServer,
  }
}

export default useNWC
