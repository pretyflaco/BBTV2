/**
 * useServerSync - Hook for cross-device data synchronization
 * 
 * Provides functions to sync user data with the server:
 * - Blink Lightning Address wallets
 * - NWC connections
 * - UI preferences
 * 
 * Works alongside existing sync for:
 * - Blink API Key wallets (/api/auth/nostr-blink-account)
 * - Split Payment Profiles (/api/split-profiles)
 */

import { useState, useCallback, useEffect, useRef } from 'react';

const SYNC_DEBOUNCE_MS = 1000; // Debounce writes to avoid excessive API calls

/**
 * @typedef {Object} BlinkLnAddressWallet
 * @property {string} id
 * @property {string} label
 * @property {string} username
 * @property {string} lightningAddress
 * @property {string} walletId
 * @property {boolean} isActive
 * @property {string} createdAt
 * @property {string} [lastUsed]
 */

/**
 * @typedef {Object} NWCConnection
 * @property {string} id
 * @property {string} label
 * @property {string} uri - NWC connection string (nostr+walletconnect://...)
 * @property {string[]} [capabilities]
 * @property {boolean} isActive
 * @property {string} createdAt
 * @property {string} [lastUsed]
 */

/**
 * @typedef {Object} Preferences
 * @property {boolean} soundEnabled
 * @property {string} soundTheme
 * @property {boolean} darkMode
 * @property {string} displayCurrency
 * @property {boolean} tipsEnabled
 * @property {number[]} tipPresets
 */

/**
 * @typedef {Object} SyncedData
 * @property {BlinkLnAddressWallet[]} blinkLnAddressWallets
 * @property {NWCConnection[]} nwcConnections
 * @property {Preferences} preferences
 * @property {string} [lastSynced]
 */

export function useServerSync(userPubkey) {
  const [syncedData, setSyncedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  
  // Debounce timer ref
  const saveTimerRef = useRef(null);
  const pendingDataRef = useRef(null);

  /**
   * Fetch all synced data from server
   */
  const fetchSyncedData = useCallback(async () => {
    if (!userPubkey) {
      console.log('[useServerSync] No pubkey, skipping fetch');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[useServerSync] Fetching synced data for:', userPubkey.substring(0, 8) + '...');
      
      const response = await fetch(`/api/user/sync?pubkey=${userPubkey}`);
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log('[useServerSync] Fetched data:', {
        lnAddressWallets: data.blinkLnAddressWallets?.length || 0,
        nwcConnections: data.nwcConnections?.length || 0,
        hasPreferences: !!data.preferences
      });

      setSyncedData(data);
      setLastSynced(data.lastSynced);
      return data;
    } catch (err) {
      console.error('[useServerSync] Fetch error:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [userPubkey]);

  /**
   * Save all synced data to server (debounced)
   */
  const saveSyncedData = useCallback(async (data, immediate = false) => {
    if (!userPubkey) {
      console.log('[useServerSync] No pubkey, skipping save');
      return false;
    }

    // Store pending data
    pendingDataRef.current = data;

    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // If immediate, save now
    if (immediate) {
      return performSave(userPubkey, data);
    }

    // Otherwise debounce
    return new Promise((resolve) => {
      saveTimerRef.current = setTimeout(async () => {
        const result = await performSave(userPubkey, pendingDataRef.current);
        resolve(result);
      }, SYNC_DEBOUNCE_MS);
    });
  }, [userPubkey]);

  /**
   * Perform the actual save operation
   */
  const performSave = async (pubkey, data) => {
    try {
      console.log('[useServerSync] Saving data for:', pubkey.substring(0, 8) + '...');
      
      const response = await fetch('/api/user/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey,
          ...data
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      setLastSynced(result.lastSynced);
      console.log('[useServerSync] ✓ Data saved successfully');
      return true;
    } catch (err) {
      console.error('[useServerSync] Save error:', err);
      setError(err.message);
      return false;
    }
  };

  /**
   * Update a specific field (PATCH request)
   */
  const updateField = useCallback(async (field, data) => {
    if (!userPubkey) {
      console.log('[useServerSync] No pubkey, skipping update');
      return false;
    }

    try {
      console.log(`[useServerSync] Updating field '${field}'`);
      
      const response = await fetch('/api/user/sync', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey: userPubkey,
          field,
          data
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      setLastSynced(result.lastSynced);
      
      // Update local state
      setSyncedData(prev => prev ? { ...prev, [field]: data } : null);
      
      console.log(`[useServerSync] ✓ Field '${field}' updated`);
      return true;
    } catch (err) {
      console.error('[useServerSync] Update error:', err);
      setError(err.message);
      return false;
    }
  }, [userPubkey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  return {
    syncedData,
    loading,
    error,
    lastSynced,
    fetchSyncedData,
    saveSyncedData,
    updateField
  };
}

export default useServerSync;

