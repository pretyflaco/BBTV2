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

import { useState, useCallback, useEffect, useRef } from 'react';
import NWCClient from '../nwc/NWCClient';
import CryptoUtils from '../storage/CryptoUtils';

// Storage key prefix - actual keys are scoped to user pubkey
const NWC_STORAGE_PREFIX = 'blinkpos_nwc';

// Old global storage keys (pre-fix, for migration/cleanup)
const OLD_NWC_CONNECTIONS_KEY = 'blinkpos_nwc_connections';
const OLD_NWC_ACTIVE_KEY = 'blinkpos_nwc_active';

// Server sync debounce
const SERVER_SYNC_DEBOUNCE_MS = 1000;

/**
 * Get user-scoped storage keys
 * @param {string} userPubkey - User's public key
 */
const getStorageKeys = (userPubkey) => ({
  connections: `${NWC_STORAGE_PREFIX}_connections_${userPubkey}`,
  active: `${NWC_STORAGE_PREFIX}_active_${userPubkey}`
});

/**
 * Clean up old global NWC storage keys
 * This prevents cross-user data leakage from old versions
 */
const cleanupOldGlobalStorage = () => {
  try {
    if (localStorage.getItem(OLD_NWC_CONNECTIONS_KEY)) {
      console.log('[useNWC] Removing old global NWC connections storage (security fix)');
      localStorage.removeItem(OLD_NWC_CONNECTIONS_KEY);
    }
    if (localStorage.getItem(OLD_NWC_ACTIVE_KEY)) {
      console.log('[useNWC] Removing old global NWC active storage (security fix)');
      localStorage.removeItem(OLD_NWC_ACTIVE_KEY);
    }
  } catch (err) {
    console.error('[useNWC] Failed to cleanup old storage:', err);
  }
};

/**
 * @typedef {Object} NWCConnection
 * @property {string} id - Unique identifier
 * @property {string} label - User-friendly name
 * @property {string} encryptedUri - Encrypted connection URI
 * @property {string[]} capabilities - Supported methods
 * @property {string} walletPubkey - Wallet's public key (for display)
 * @property {string[]} relays - Relay URLs
 * @property {boolean} isActive - Whether this is the active connection
 * @property {number} createdAt - Timestamp
 * @property {number} [lastUsed] - Last used timestamp
 */

/**
 * Hook for NWC wallet management
 * @param {string} userPubkey - The current user's public key (required for user-scoped storage)
 * @param {boolean} hasServerSession - Whether the server session is established (prevents 401 errors)
 */
export function useNWC(userPubkey, hasServerSession = false) {
  const [connections, setConnections] = useState([]);
  const [activeConnection, setActiveConnectionState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clientReady, setClientReady] = useState(false);
  const [serverSynced, setServerSynced] = useState(false);
  
  // Keep NWC client in ref to persist across renders
  const clientRef = useRef(null);
  
  // Track current user to detect user changes
  const currentUserRef = useRef(userPubkey);
  
  // Server sync debounce timer
  const syncTimerRef = useRef(null);

  /**
   * Fetch NWC connections from server
   * NOTE: Requires hasServerSession to be true to avoid 401 errors
   */
  const fetchFromServer = useCallback(async () => {
    if (!userPubkey) return null;
    
    // IMPORTANT: Don't fetch from server if session isn't established yet
    // This prevents 401 errors during the auth race condition
    if (!hasServerSession) {
      console.log('[useNWC] Skipping server fetch - no session yet (hasServerSession:', hasServerSession, ')');
      return null;
    }
    
    try {
      console.log('[useNWC] Fetching connections from server (session established)...');
      const response = await fetch(`/api/user/sync?pubkey=${userPubkey}`);
      
      if (!response.ok) {
        console.error('[useNWC] Server fetch failed:', response.status);
        return null;
      }
      
      const data = await response.json();
      console.log('[useNWC] Server returned', data.nwcConnections?.length || 0, 'connections');
      return data.nwcConnections || [];
    } catch (err) {
      console.error('[useNWC] Server fetch error:', err);
      return null;
    }
  }, [userPubkey, hasServerSession]);

  /**
   * Sync connections to server (debounced)
   */
  const syncToServer = useCallback(async (connectionsToSync) => {
    if (!userPubkey) return;
    
    // Clear existing timer
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    
    // Debounce the sync
    syncTimerRef.current = setTimeout(async () => {
      try {
        console.log('[useNWC] Syncing', connectionsToSync.length, 'connections to server...');
        
        // Prepare connections for server (decrypt for re-encryption on server)
        const serverConnections = await Promise.all(
          connectionsToSync.map(async (conn) => {
            // Decrypt locally encrypted URI
            const uri = await CryptoUtils.decryptWithDerivedKey(
              conn.encryptedUri,
              conn.walletPubkey
            );
            
            return {
              id: conn.id,
              label: conn.label,
              uri, // Server will encrypt this
              capabilities: conn.capabilities,
              walletPubkey: conn.walletPubkey,
              relays: conn.relays,
              isActive: conn.isActive,
              createdAt: new Date(conn.createdAt).toISOString(),
              lastUsed: conn.lastUsed ? new Date(conn.lastUsed).toISOString() : undefined
            };
          })
        );
        
        const response = await fetch('/api/user/sync', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pubkey: userPubkey,
            field: 'nwcConnections',
            data: serverConnections
          })
        });
        
        if (response.ok) {
          console.log('[useNWC] ✓ Synced to server');
          setServerSynced(true);
        } else {
          console.error('[useNWC] Server sync failed:', response.status);
        }
      } catch (err) {
        console.error('[useNWC] Server sync error:', err);
      }
    }, SERVER_SYNC_DEBOUNCE_MS);
  }, [userPubkey]);

  /**
   * Load connections from localStorage and server (user-scoped)
   */
  const loadConnections = useCallback(async () => {
    // SECURITY: Clean up old global storage keys to prevent cross-user data leakage
    cleanupOldGlobalStorage();
    
    // Don't load if no user is authenticated
    if (!userPubkey) {
      console.log('[useNWC] No user pubkey, skipping connection load');
      setConnections([]);
      setActiveConnectionState(null);
      setClientReady(false);
      setLoading(false);
      return;
    }
    
    try {
      const keys = getStorageKeys(userPubkey);
      const stored = localStorage.getItem(keys.connections);
      const activeId = localStorage.getItem(keys.active);
      
      console.log('[useNWC] Loading connections for user:', userPubkey?.substring(0, 8) + '...');
      
      // Load from localStorage first (fast)
      let localConnections = [];
      if (stored) {
        localConnections = JSON.parse(stored);
        setConnections(localConnections);
        console.log('[useNWC] Loaded', localConnections.length, 'connections from localStorage');
        
        if (activeId) {
          const active = localConnections.find(c => c.id === activeId);
          if (active) {
            setActiveConnectionState(active);
          }
        }
      } else {
        console.log('[useNWC] No stored connections in localStorage for this user');
      }
      
      // Then fetch from server (for cross-device sync)
      const serverConnections = await fetchFromServer();
      
      if (serverConnections && serverConnections.length > 0) {
        // Server has connections - merge with local
        // Server is source of truth, but we need to re-encrypt URIs locally
        const mergedConnections = await Promise.all(
          serverConnections.map(async (serverConn) => {
            // Check if we have this connection locally
            const localConn = localConnections.find(l => l.id === serverConn.id);
            
            if (localConn) {
              // Keep local encrypted URI (already encrypted for this device)
              return localConn;
            } else {
              // New connection from server - encrypt URI locally
              const encryptedUri = await CryptoUtils.encryptWithDerivedKey(
                serverConn.uri,
                serverConn.walletPubkey
              );
              
              return {
                id: serverConn.id,
                label: serverConn.label,
                encryptedUri,
                capabilities: serverConn.capabilities || [],
                walletPubkey: serverConn.walletPubkey,
                relays: serverConn.relays || [],
                isActive: serverConn.isActive,
                createdAt: new Date(serverConn.createdAt).getTime(),
                lastUsed: serverConn.lastUsed ? new Date(serverConn.lastUsed).getTime() : undefined
              };
            }
          })
        );
        
        // Add any local connections not on server
        for (const localConn of localConnections) {
          if (!serverConnections.find(s => s.id === localConn.id)) {
            mergedConnections.push(localConn);
          }
        }
        
        // Save merged to localStorage
        localStorage.setItem(keys.connections, JSON.stringify(mergedConnections));
        setConnections(mergedConnections);
        
        // Find active connection
        if (activeId) {
          const active = mergedConnections.find(c => c.id === activeId);
          if (active) {
            setActiveConnectionState(active);
          }
        }
        
        console.log('[useNWC] Merged connections:', mergedConnections.length);
        setServerSynced(true);
        
        // Sync local-only connections to server
        const localOnlyConnections = localConnections.filter(
          l => !serverConnections.find(s => s.id === l.id)
        );
        if (localOnlyConnections.length > 0) {
          console.log('[useNWC] Syncing', localOnlyConnections.length, 'local-only connections to server');
          syncToServer(mergedConnections);
        }
      } else if (localConnections.length > 0) {
        // No server connections but we have local - sync to server
        console.log('[useNWC] No server connections, syncing local to server');
        syncToServer(localConnections);
      } else {
        setConnections([]);
        setActiveConnectionState(null);
      }
    } catch (err) {
      console.error('[useNWC] Failed to load connections:', err);
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, [userPubkey, fetchFromServer, syncToServer]);

  // Load connections when user changes
  useEffect(() => {
    // Detect user change and clear state
    if (currentUserRef.current !== userPubkey) {
      console.log('[useNWC] User changed from', currentUserRef.current?.substring(0, 8), 'to', userPubkey?.substring(0, 8));
      currentUserRef.current = userPubkey;
      
      // Close existing client when user changes
      if (clientRef.current) {
        clientRef.current.close();
        clientRef.current = null;
      }
      setClientReady(false);
      setActiveConnectionState(null);
      setConnections([]);
    }
    
    loadConnections();
  }, [userPubkey, loadConnections]);

  /**
   * Save connections to localStorage and server (user-scoped)
   */
  const saveConnections = useCallback((newConnections) => {
    if (!userPubkey) {
      console.error('[useNWC] Cannot save connections without user pubkey');
      return;
    }
    
    try {
      const keys = getStorageKeys(userPubkey);
      localStorage.setItem(keys.connections, JSON.stringify(newConnections));
      setConnections(newConnections);
      
      // Sync to server (debounced)
      syncToServer(newConnections);
    } catch (err) {
      console.error('[useNWC] Failed to save connections:', err);
    }
  }, [userPubkey, syncToServer]);

  /**
   * Validate and add a new NWC connection
   * @param {string} connectionUri - The NWC connection string
   * @param {string} label - User-friendly name for the connection
   * @returns {Promise<{success: boolean, connection?: NWCConnection, error?: string}>}
   */
  const addConnection = useCallback(async (connectionUri, label) => {
    setError(null);

    try {
      // Validate the connection
      const validation = await NWCClient.validate(connectionUri);
      
      if (!validation.valid) {
        return { success: false, error: validation.error || 'Invalid connection string' };
      }

      // Parse URI to get pubkey and relays
      const tempClient = new NWCClient(connectionUri);
      
      // Encrypt the URI for storage
      // For simplicity, we use a derived key from the wallet pubkey
      // In production, you might want user password encryption
      const encryptedUri = await CryptoUtils.encryptWithDerivedKey(
        connectionUri,
        tempClient.getWalletPubkey()
      );

      const connection = {
        id: `nwc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        label: label || `Wallet ${tempClient.getDisplayName()}`,
        encryptedUri,
        capabilities: validation.info?.methods || [],
        walletPubkey: tempClient.getWalletPubkey(),
        relays: tempClient.getRelays(),
        isActive: false,
        createdAt: Date.now()
      };

      tempClient.close();

      const newConnections = [...connections, connection];
      saveConnections(newConnections);

      // If this is the first connection, make it active
      if (connections.length === 0) {
        await setActiveConnection(connection.id, newConnections);
      }

      return { success: true, connection };
    } catch (err) {
      console.error('[useNWC] Failed to add connection:', err);
      return { success: false, error: err.message || 'Failed to add connection' };
    }
  }, [connections, saveConnections]);

  /**
   * Clear the active NWC connection (deactivate NWC)
   */
  const clearActiveConnection = useCallback(() => {
    console.log('[useNWC] Clearing active connection');
    
    if (userPubkey) {
      const keys = getStorageKeys(userPubkey);
      localStorage.removeItem(keys.active);
    }
    
    setActiveConnectionState(null);
    setClientReady(false);
    
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
    }
    
    // Update all connections to not be active
    const updatedConnections = connections.map(c => ({
      ...c,
      isActive: false
    }));
    saveConnections(updatedConnections);
    
    return { success: true };
  }, [connections, saveConnections, userPubkey]);

  /**
   * Set the active NWC connection
   * @param {string|null} connectionId - Pass null to clear active connection
   * @param {NWCConnection[]} [connectionsOverride] - Optional connections array to use
   */
  const setActiveConnection = useCallback(async (connectionId, connectionsOverride) => {
    // Handle null/undefined to clear active connection
    if (!connectionId) {
      return clearActiveConnection();
    }
    
    if (!userPubkey) {
      return { success: false, error: 'No user authenticated' };
    }
    
    const conns = connectionsOverride || connections;
    const connection = conns.find(c => c.id === connectionId);
    
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    try {
      setClientReady(false);
      
      // Decrypt the URI
      const uri = await CryptoUtils.decryptWithDerivedKey(
        connection.encryptedUri,
        connection.walletPubkey
      );

      // Close existing client
      if (clientRef.current) {
        clientRef.current.close();
      }

      // Create new client
      clientRef.current = new NWCClient(uri);

      // Update storage (user-scoped)
      const keys = getStorageKeys(userPubkey);
      localStorage.setItem(keys.active, connectionId);
      
      // Update connection's lastUsed
      const updatedConnections = conns.map(c => ({
        ...c,
        isActive: c.id === connectionId,
        lastUsed: c.id === connectionId ? Date.now() : c.lastUsed
      }));
      
      saveConnections(updatedConnections);
      setActiveConnectionState(connection);
      setClientReady(true);

      return { success: true };
    } catch (err) {
      console.error('[useNWC] Failed to set active connection:', err);
      setClientReady(false);
      return { success: false, error: err.message };
    }
  }, [connections, saveConnections, clearActiveConnection, userPubkey]);

  /**
   * Remove an NWC connection
   * @param {string} connectionId 
   */
  const removeConnection = useCallback((connectionId) => {
    const newConnections = connections.filter(c => c.id !== connectionId);
    saveConnections(newConnections);

    // If we removed the active connection, clear it
    if (activeConnection?.id === connectionId) {
      if (userPubkey) {
        const keys = getStorageKeys(userPubkey);
        localStorage.removeItem(keys.active);
      }
      setActiveConnectionState(null);
      setClientReady(false);
      if (clientRef.current) {
        clientRef.current.close();
        clientRef.current = null;
      }
    }

    return { success: true };
  }, [connections, activeConnection, saveConnections, userPubkey]);

  /**
   * Get wallet balance (in millisats)
   * @returns {Promise<{success: boolean, balance?: number, error?: string}>}
   */
  const getBalance = useCallback(async () => {
    if (!clientRef.current) {
      return { success: false, error: 'No active NWC connection' };
    }

    try {
      const response = await clientRef.current.getBalance();
      
      if (response.error) {
        return { success: false, error: response.error.message };
      }

      return { success: true, balance: response.result?.balance || 0 };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Pay a lightning invoice
   * @param {string} invoice - BOLT11 invoice
   * @returns {Promise<{success: boolean, preimage?: string, fees_paid?: number, error?: string}>}
   */
  const payInvoice = useCallback(async (invoice) => {
    if (!clientRef.current) {
      return { success: false, error: 'No active NWC connection' };
    }

    try {
      const response = await clientRef.current.payInvoice(invoice);
      
      if (response.error) {
        return { success: false, error: response.error.message };
      }

      return { 
        success: true, 
        preimage: response.result?.preimage,
        fees_paid: response.result?.fees_paid
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Create a lightning invoice
   * @param {Object} params
   * @param {number} params.amount - Amount in millisats
   * @param {string} [params.description] - Invoice description
   * @param {number} [params.expiry] - Expiry in seconds
   * @returns {Promise<{success: boolean, invoice?: string, payment_hash?: string, error?: string}>}
   */
  const makeInvoice = useCallback(async ({ amount, description, expiry }) => {
    console.log('[useNWC] makeInvoice called:', { amount, description, expiry });
    console.log('[useNWC] Active connection:', activeConnection?.label);
    console.log('[useNWC] Connection capabilities:', activeConnection?.capabilities);
    console.log('[useNWC] Client ready:', !!clientRef.current);
    
    if (!clientRef.current) {
      return { success: false, error: 'No active NWC connection' };
    }

    // Check if make_invoice capability is supported
    if (activeConnection && !activeConnection.capabilities?.includes('make_invoice')) {
      console.error('[useNWC] Wallet does not support make_invoice capability');
      return { 
        success: false, 
        error: `This wallet does not support invoice creation. Supported capabilities: ${activeConnection.capabilities?.join(', ') || 'none'}`
      };
    }

    try {
      const response = await clientRef.current.makeInvoice({
        amount,
        description,
        expiry
      });
      
      if (response.error) {
        return { success: false, error: response.error.message };
      }

      return { 
        success: true, 
        invoice: response.result?.invoice,
        payment_hash: response.result?.payment_hash
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [activeConnection]);

  /**
   * Look up invoice status
   * @param {string} paymentHash 
   */
  const lookupInvoice = useCallback(async (paymentHash) => {
    if (!clientRef.current) {
      return { success: false, error: 'No active NWC connection' };
    }

    try {
      const response = await clientRef.current.lookupInvoice(paymentHash);
      
      if (response.error) {
        return { success: false, error: response.error.message };
      }

      return { success: true, invoice: response.result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * List transactions from NWC wallet
   * @param {Object} params
   * @param {number} [params.from] - Start timestamp (seconds)
   * @param {number} [params.until] - End timestamp (seconds)
   * @param {number} [params.limit] - Max number of transactions
   * @param {number} [params.offset] - Pagination offset
   * @param {string} [params.type] - 'incoming' or 'outgoing'
   * @returns {Promise<{success: boolean, transactions?: Array, error?: string}>}
   */
  const listTransactions = useCallback(async (params = {}) => {
    if (!clientRef.current) {
      return { success: false, error: 'No active NWC connection' };
    }

    // Check if list_transactions capability is supported
    if (activeConnection && !activeConnection.capabilities?.includes('list_transactions')) {
      return { 
        success: false, 
        error: 'This wallet does not support transaction history'
      };
    }

    try {
      const response = await clientRef.current.listTransactions(params);
      
      if (response.error) {
        return { success: false, error: response.error.message };
      }

      return { 
        success: true, 
        transactions: response.result?.transactions || []
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [activeConnection]);

  /**
   * Check if a specific capability is supported
   * @param {string} method - e.g., 'pay_invoice', 'get_balance'
   */
  const hasCapability = useCallback((method) => {
    if (!activeConnection) return false;
    return activeConnection.capabilities?.includes(method) || false;
  }, [activeConnection]);

  /**
   * Get the decrypted connection URI for the active connection
   * Used for server-side NWC forwarding via webhook
   * @returns {Promise<string|null>} The decrypted NWC connection URI, or null if not available
   */
  const getActiveConnectionUri = useCallback(async () => {
    if (!activeConnection?.encryptedUri || !activeConnection?.walletPubkey) {
      console.log('[useNWC] getActiveConnectionUri: No active connection or missing data');
      return null;
    }
    try {
      const uri = await CryptoUtils.decryptWithDerivedKey(
        activeConnection.encryptedUri,
        activeConnection.walletPubkey
      );
      return uri;
    } catch (error) {
      console.error('[useNWC] Failed to decrypt active connection URI:', error);
      return null;
    }
  }, [activeConnection]);

  /**
   * Initialize the active connection client (call after page load)
   */
  const initializeClient = useCallback(async () => {
    if (!userPubkey) {
      console.log('[useNWC] No user pubkey, skipping client initialization');
      setClientReady(false);
      return;
    }
    
    const keys = getStorageKeys(userPubkey);
    const activeId = localStorage.getItem(keys.active);
    if (!activeId) {
      setClientReady(false);
      return;
    }

    const connection = connections.find(c => c.id === activeId);
    if (!connection) {
      setClientReady(false);
      return;
    }

    try {
      console.log('[useNWC] Initializing client for:', connection.label, '(user:', userPubkey?.substring(0, 8) + '...)');
      console.log('[useNWC] Stored capabilities:', connection.capabilities);
      console.log('[useNWC] Has make_invoice:', connection.capabilities?.includes('make_invoice'));
      
      const uri = await CryptoUtils.decryptWithDerivedKey(
        connection.encryptedUri,
        connection.walletPubkey
      );
      clientRef.current = new NWCClient(uri);
      setActiveConnectionState(connection);
      setClientReady(true);
      console.log('[useNWC] Client initialized successfully');
    } catch (err) {
      console.error('[useNWC] Failed to initialize client:', err);
      setClientReady(false);
    }
  }, [connections, userPubkey]);

  // Initialize client when connections are loaded
  useEffect(() => {
    if (!loading && connections.length > 0 && !clientRef.current) {
      initializeClient();
    }
  }, [loading, connections, initializeClient]);

  // Cleanup sync timer on unmount
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

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
    syncToServer: () => syncToServer(connections),
    fetchFromServer
  };
}

export default useNWC;

