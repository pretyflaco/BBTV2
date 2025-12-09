/**
 * useNWC - React hook for managing NWC (Nostr Wallet Connect) connections
 * 
 * Provides:
 * - NWC connection management (add, remove, set active)
 * - Wallet operations (getBalance, payInvoice, makeInvoice)
 * - Connection validation and info fetching
 * 
 * IMPORTANT: NWC connections are scoped to the user's public key to prevent
 * cross-user data leakage.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import NWCClient from '../nwc/NWCClient';
import CryptoUtils from '../storage/CryptoUtils';

// Storage key prefix - actual keys are scoped to user pubkey
const NWC_STORAGE_PREFIX = 'blinkpos_nwc';

// Old global storage keys (pre-fix, for migration/cleanup)
const OLD_NWC_CONNECTIONS_KEY = 'blinkpos_nwc_connections';
const OLD_NWC_ACTIVE_KEY = 'blinkpos_nwc_active';

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
 */
export function useNWC(userPubkey) {
  const [connections, setConnections] = useState([]);
  const [activeConnection, setActiveConnectionState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clientReady, setClientReady] = useState(false);
  
  // Keep NWC client in ref to persist across renders
  const clientRef = useRef(null);
  
  // Track current user to detect user changes
  const currentUserRef = useRef(userPubkey);

  /**
   * Load connections from localStorage (user-scoped)
   */
  const loadConnections = useCallback(() => {
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
      
      if (stored) {
        const parsed = JSON.parse(stored);
        setConnections(parsed);
        console.log('[useNWC] Loaded', parsed.length, 'connections');
        
        if (activeId) {
          const active = parsed.find(c => c.id === activeId);
          if (active) {
            setActiveConnectionState(active);
          }
        }
      } else {
        console.log('[useNWC] No stored connections for this user');
        setConnections([]);
        setActiveConnectionState(null);
      }
    } catch (err) {
      console.error('[useNWC] Failed to load connections:', err);
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, [userPubkey]);

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
   * Save connections to localStorage (user-scoped)
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
    } catch (err) {
      console.error('[useNWC] Failed to save connections:', err);
    }
  }, [userPubkey]);

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

  return {
    // State
    connections,
    activeConnection,
    loading,
    error,
    hasNWC: connections.length > 0,
    clientReady,
    
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
    hasCapability
  };
}

export default useNWC;

