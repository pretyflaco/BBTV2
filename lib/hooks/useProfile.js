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

import { useState, useEffect, useCallback, useMemo, createContext, useContext, useRef } from 'react';
import ProfileStorage from '../storage/ProfileStorage.js';
import CryptoUtils from '../storage/CryptoUtils.js';
import { useNostrAuth } from './useNostrAuth.js';

// Server sync debounce
const SERVER_SYNC_DEBOUNCE_MS = 1000;

const ProfileContext = createContext(null);

/**
 * ProfileProvider - Provides profile management context
 * 
 * NOTE: This provider requires NostrAuthProvider as an ancestor.
 * Ensure the provider hierarchy is: NostrAuthProvider > ProfileProvider
 */
export function ProfileProvider({ children }) {
  // This hook requires NostrAuthProvider - will throw if not wrapped correctly
  const { isAuthenticated, publicKey, profile: authProfile, refreshProfile: refreshAuthProfile } = useNostrAuth();
  
  const [state, setState] = useState({
    loading: false,
    error: null,
    blinkAccounts: [],
    nwcConnections: [],
    tippingSettings: null,
    preferences: null,
    serverSynced: false
  });

  // Server sync debounce timer
  const syncTimerRef = useRef(null);

  /**
   * Update state helper
   */
  const updateState = useCallback((updates) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * Sync Blink API accounts to server (debounced)
   */
  const syncBlinkApiAccountsToServer = useCallback(async (accounts) => {
    if (!publicKey) return;
    
    // Clear existing timer
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    
    // Debounce the sync
    syncTimerRef.current = setTimeout(async () => {
      try {
        // Filter only API key accounts (not ln-address type)
        const apiAccounts = accounts.filter(a => a.type !== 'ln-address' && a.apiKey);
        
        if (apiAccounts.length === 0) {
          console.log('[useProfile] No Blink API accounts to sync');
          return;
        }
        
        console.log('[useProfile] Syncing', apiAccounts.length, 'Blink API accounts to server...');
        
        // Decrypt API keys before sending to server (server will re-encrypt)
        const accountsWithDecryptedKeys = await Promise.all(
          apiAccounts.map(async (account) => {
            let apiKey = null;
            try {
              // API key is stored encrypted locally - decrypt it
              apiKey = await CryptoUtils.decryptWithDeviceKey(account.apiKey);
            } catch (err) {
              console.error('[useProfile] Failed to decrypt API key for account:', account.id, err);
            }
            
            return {
              id: account.id,
              label: account.label,
              username: account.username,
              apiKey,
              defaultCurrency: account.defaultCurrency || 'BTC',
              isActive: account.isActive,
              createdAt: new Date(account.createdAt || Date.now()).toISOString(),
              lastUsed: account.lastUsed ? new Date(account.lastUsed).toISOString() : undefined
            };
          })
        );
        
        // Filter out accounts where decryption failed
        const validAccounts = accountsWithDecryptedKeys.filter(a => a.apiKey);
        
        if (validAccounts.length === 0) {
          console.log('[useProfile] No valid Blink API accounts after decryption');
          return;
        }
        
        const response = await fetch('/api/user/sync', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pubkey: publicKey,
            field: 'blinkApiAccounts',
            data: validAccounts
          })
        });
        
        if (response.ok) {
          console.log('[useProfile] ✓ Blink API accounts synced to server');
          updateState({ serverSynced: true });
        } else {
          console.error('[useProfile] Server sync failed:', response.status);
        }
      } catch (err) {
        console.error('[useProfile] Server sync error:', err);
      }
    }, SERVER_SYNC_DEBOUNCE_MS);
  }, [publicKey, updateState]);

  /**
   * Sync LN Address wallets to server (debounced)
   */
  const syncLnAddressWalletsToServer = useCallback(async (wallets) => {
    if (!publicKey) return;
    
    // Clear existing timer
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    
    // Debounce the sync
    syncTimerRef.current = setTimeout(async () => {
      try {
        // Filter only LN Address wallets
        const lnAddressWallets = wallets.filter(w => w.type === 'ln-address');
        
        if (lnAddressWallets.length === 0) return;
        
        console.log('[useProfile] Syncing', lnAddressWallets.length, 'LN Address wallets to server...');
        
        const response = await fetch('/api/user/sync', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pubkey: publicKey,
            field: 'blinkLnAddressWallets',
            data: lnAddressWallets.map(w => ({
              id: w.id,
              label: w.label,
              username: w.username,
              lightningAddress: w.lightningAddress,
              walletId: w.walletId,
              isActive: w.isActive,
              createdAt: new Date(w.createdAt).toISOString(),
              lastUsed: w.lastUsed ? new Date(w.lastUsed).toISOString() : undefined
            }))
          })
        });
        
        if (response.ok) {
          console.log('[useProfile] ✓ LN Address wallets synced to server');
          updateState({ serverSynced: true });
        } else {
          console.error('[useProfile] Server sync failed:', response.status);
        }
      } catch (err) {
        console.error('[useProfile] Server sync error:', err);
      }
    }, SERVER_SYNC_DEBOUNCE_MS);
  }, [publicKey, updateState]);

  /**
   * Fetch all Blink data from server (API accounts + LN Address wallets)
   */
  const fetchBlinkDataFromServer = useCallback(async () => {
    if (!publicKey) return { blinkApiAccounts: [], blinkLnAddressWallets: [] };
    
    try {
      console.log('[useProfile] Fetching Blink data from server...');
      const response = await fetch(`/api/user/sync?pubkey=${publicKey}`);
      
      if (!response.ok) {
        console.error('[useProfile] Server fetch failed:', response.status);
        return { blinkApiAccounts: [], blinkLnAddressWallets: [] };
      }
      
      const data = await response.json();
      console.log('[useProfile] Server returned:', {
        blinkApiAccounts: data.blinkApiAccounts?.length || 0,
        blinkLnAddressWallets: data.blinkLnAddressWallets?.length || 0
      });
      
      return {
        blinkApiAccounts: data.blinkApiAccounts || [],
        blinkLnAddressWallets: data.blinkLnAddressWallets || []
      };
    } catch (err) {
      console.error('[useProfile] Server fetch error:', err);
      return { blinkApiAccounts: [], blinkLnAddressWallets: [] };
    }
  }, [publicKey]);

  /**
   * Fetch LN Address wallets from server (backwards compatibility)
   */
  const fetchLnAddressWalletsFromServer = useCallback(async () => {
    const data = await fetchBlinkDataFromServer();
    return data.blinkLnAddressWallets;
  }, [fetchBlinkDataFromServer]);

  /**
   * Load profile data (with server sync for all Blink wallets)
   */
  const loadProfileData = useCallback(async () => {
    if (!isAuthenticated || !authProfile) {
      updateState({
        blinkAccounts: [],
        nwcConnections: [],
        tippingSettings: null,
        preferences: null
      });
      return;
    }

    // Load from localStorage first
    const localAccounts = authProfile.blinkAccounts || [];
    
    updateState({
      blinkAccounts: localAccounts,
      nwcConnections: authProfile.nwcConnections || [],
      tippingSettings: authProfile.tippingSettings || null,
      preferences: authProfile.preferences || null
    });

    // Fetch all Blink data from server for cross-device sync
    const serverData = await fetchBlinkDataFromServer();
    const serverApiAccounts = serverData.blinkApiAccounts || [];
    const serverLnAddressWallets = serverData.blinkLnAddressWallets || [];
    
    // Separate local accounts by type
    const localApiKeyAccounts = localAccounts.filter(a => a.type !== 'ln-address' && a.apiKey);
    const localLnAddressWallets = localAccounts.filter(a => a.type === 'ln-address');
    
    let mergedAccounts = [...localAccounts];
    let needsLocalUpdate = false;
    let needsServerSyncApi = false;
    let needsServerSyncLnAddr = false;

    // === Merge Blink API accounts ===
    if (serverApiAccounts.length > 0) {
      const mergedApiAccounts = [];
      
      // Add all server API accounts, checking against local
      for (const serverAccount of serverApiAccounts) {
        const localAccount = localApiKeyAccounts.find(
          l => l.id === serverAccount.id || l.username === serverAccount.username
        );
        
        if (localAccount) {
          // Keep local version (has encrypted API key for this device)
          mergedApiAccounts.push(localAccount);
        } else if (serverAccount.apiKey) {
          // New account from server - encrypt API key for local storage
          console.log('[useProfile] Adding server API account to local:', serverAccount.username);
          try {
            const encryptedApiKey = await CryptoUtils.encryptWithDeviceKey(serverAccount.apiKey);
            mergedApiAccounts.push({
              id: serverAccount.id,
              label: serverAccount.label,
              username: serverAccount.username,
              apiKey: encryptedApiKey,
              defaultCurrency: serverAccount.defaultCurrency || 'BTC',
              isActive: localAccounts.length === 0 && mergedApiAccounts.length === 0, // First account is active
              createdAt: new Date(serverAccount.createdAt).getTime(),
              lastUsed: serverAccount.lastUsed ? new Date(serverAccount.lastUsed).getTime() : undefined,
              source: 'server'
            });
            needsLocalUpdate = true;
          } catch (err) {
            console.error('[useProfile] Failed to encrypt server API key:', err);
          }
        }
      }
      
      // Add any local-only API accounts
      for (const localAccount of localApiKeyAccounts) {
        const existsOnServer = serverApiAccounts.find(
          s => s.id === localAccount.id || s.username === localAccount.username
        );
        if (!existsOnServer) {
          mergedApiAccounts.push(localAccount);
          needsServerSyncApi = true;
        }
      }
      
      // Replace local API accounts with merged
      mergedAccounts = [...mergedApiAccounts, ...localLnAddressWallets];
    } else if (localApiKeyAccounts.length > 0) {
      // No server API accounts but we have local - sync to server
      console.log('[useProfile] No server API accounts, syncing', localApiKeyAccounts.length, 'local accounts to server');
      needsServerSyncApi = true;
    }

    // === Merge LN Address wallets ===
    if (serverLnAddressWallets.length > 0) {
      const currentApiAccounts = mergedAccounts.filter(a => a.type !== 'ln-address');
      const mergedLnAddressWallets = [];
      
      // Add all server LN Address wallets, checking against local
      for (const serverWallet of serverLnAddressWallets) {
        const localWallet = localLnAddressWallets.find(l => l.id === serverWallet.id);
        
        if (localWallet) {
          mergedLnAddressWallets.push(localWallet);
        } else {
          // Add from server (new wallet from another device)
          console.log('[useProfile] Adding server LN Address wallet to local:', serverWallet.username);
          mergedLnAddressWallets.push({
            id: serverWallet.id,
            type: 'ln-address',
            label: serverWallet.label,
            username: serverWallet.username,
            lightningAddress: serverWallet.lightningAddress,
            walletId: serverWallet.walletId,
            isActive: mergedAccounts.length === 0 && mergedLnAddressWallets.length === 0,
            createdAt: new Date(serverWallet.createdAt).getTime(),
            lastUsed: serverWallet.lastUsed ? new Date(serverWallet.lastUsed).getTime() : undefined,
            source: 'server'
          });
          needsLocalUpdate = true;
        }
      }
      
      // Add any local-only LN Address wallets
      for (const localWallet of localLnAddressWallets) {
        if (!serverLnAddressWallets.find(s => s.id === localWallet.id)) {
          mergedLnAddressWallets.push(localWallet);
          needsServerSyncLnAddr = true;
        }
      }
      
      mergedAccounts = [...currentApiAccounts, ...mergedLnAddressWallets];
    } else if (localLnAddressWallets.length > 0) {
      // No server LN Address wallets but we have local - sync to server
      console.log('[useProfile] No server LN Address wallets, syncing', localLnAddressWallets.length, 'local wallets to server');
      needsServerSyncLnAddr = true;
    }

    // Update localStorage with merged data if needed
    if (needsLocalUpdate && authProfile.id) {
      console.log('[useProfile] Updating localStorage with merged accounts');
      const profile = ProfileStorage.getProfileById(authProfile.id);
      if (profile) {
        profile.blinkAccounts = mergedAccounts;
        ProfileStorage.updateProfile(profile);
      }
    }
    
    updateState({
      blinkAccounts: mergedAccounts,
      serverSynced: true
    });
    
    // Sync local-only accounts to server
    if (needsServerSyncApi) {
      syncBlinkApiAccountsToServer(mergedAccounts);
    }
    if (needsServerSyncLnAddr) {
      syncLnAddressWalletsToServer(mergedAccounts);
    }
  }, [isAuthenticated, authProfile, updateState, fetchBlinkDataFromServer, syncBlinkApiAccountsToServer, syncLnAddressWalletsToServer]);

  // Load profile data when auth changes
  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  // Cleanup sync timer on unmount
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  // ============= Blink Account Management =============

  /**
   * Add a new Blink account (via API key)
   */
  const addBlinkAccount = useCallback(async ({ label, apiKey, username, defaultCurrency }) => {
    if (!authProfile) throw new Error('Not authenticated');
    
    const profileId = authProfile.id;
    updateState({ loading: true, error: null });
    
    try {
      const account = await ProfileStorage.addBlinkAccount(
        profileId,
        label,
        apiKey,
        username,
        defaultCurrency
      );
      
      // Refresh auth profile state
      refreshAuthProfile();
      
      // Load data directly from storage to avoid stale closure issues
      const freshProfile = ProfileStorage.getProfileById(profileId);
      if (freshProfile) {
        const activeAccount = freshProfile.blinkAccounts.find(a => a.isActive) || null;
        updateState({
          loading: false,
          blinkAccounts: freshProfile.blinkAccounts,
          activeBlinkAccount: activeAccount
        });
        
        // Sync Blink API accounts to server for cross-device sync
        syncBlinkApiAccountsToServer(freshProfile.blinkAccounts);
      } else {
        updateState({ loading: false });
      }
      
      return { success: true, account };
    } catch (error) {
      console.error('Failed to add Blink account:', error);
      updateState({ loading: false, error: error.message });
      return { success: false, error: error.message };
    }
  }, [authProfile, refreshAuthProfile, updateState, syncBlinkApiAccountsToServer]);

  /**
   * Add a new Blink account via Lightning Address (no API key)
   */
  const addBlinkLnAddressAccount = useCallback(async ({ label, username, walletId, walletCurrency, lightningAddress }) => {
    if (!authProfile) throw new Error('Not authenticated');
    
    const profileId = authProfile.id;
    updateState({ loading: true, error: null });
    
    try {
      const account = await ProfileStorage.addBlinkLnAddressAccount(
        profileId,
        { label, username, walletId, walletCurrency, lightningAddress }
      );
      
      // Refresh auth profile state
      refreshAuthProfile();
      
      // Load data directly from storage to avoid stale closure issues
      const freshProfile = ProfileStorage.getProfileById(profileId);
      if (freshProfile) {
        const activeAccount = freshProfile.blinkAccounts.find(a => a.isActive) || null;
        updateState({
          loading: false,
          blinkAccounts: freshProfile.blinkAccounts,
          activeBlinkAccount: activeAccount
        });
        
        // Sync LN Address wallets to server
        syncLnAddressWalletsToServer(freshProfile.blinkAccounts);
      } else {
        updateState({ loading: false });
      }
      
      return { success: true, account };
    } catch (error) {
      console.error('Failed to add Blink LN Address account:', error);
      updateState({ loading: false, error: error.message });
      return { success: false, error: error.message };
    }
  }, [authProfile, refreshAuthProfile, updateState, syncLnAddressWalletsToServer]);

  /**
   * Get decrypted API key for an account
   */
  const getBlinkApiKey = useCallback(async (accountId) => {
    if (!authProfile) throw new Error('Not authenticated');
    
    try {
      return await ProfileStorage.getBlinkApiKey(authProfile.id, accountId);
    } catch (error) {
      console.error('Failed to get API key:', error);
      throw error;
    }
  }, [authProfile]);

  /**
   * Get API key for active Blink account
   */
  const getActiveBlinkApiKey = useCallback(async () => {
    if (!authProfile) return null;
    
    try {
      return await ProfileStorage.getActiveBlinkApiKey(authProfile.id);
    } catch (error) {
      console.error('Failed to get active API key:', error);
      return null;
    }
  }, [authProfile]);

  /**
   * Set active Blink account
   */
  const setActiveBlinkAccount = useCallback((accountId) => {
    if (!authProfile) throw new Error('Not authenticated');
    
    const profileId = authProfile.id;
    
    try {
      ProfileStorage.setActiveBlinkAccount(profileId, accountId);
      
      // Refresh auth profile state
      refreshAuthProfile();
      
      // Load data directly from storage to avoid stale closure issues
      const freshProfile = ProfileStorage.getProfileById(profileId);
      if (freshProfile) {
        const activeAccount = freshProfile.blinkAccounts.find(a => a.isActive) || null;
        updateState({
          blinkAccounts: freshProfile.blinkAccounts,
          activeBlinkAccount: activeAccount
        });
      }
    } catch (error) {
      console.error('Failed to set active account:', error);
      throw error;
    }
  }, [authProfile, refreshAuthProfile, updateState]);

  /**
   * Update a Blink account
   */
  const updateBlinkAccount = useCallback(async (accountId, updates) => {
    if (!authProfile) throw new Error('Not authenticated');
    
    const profileId = authProfile.id;
    updateState({ loading: true, error: null });
    
    try {
      await ProfileStorage.updateBlinkAccount(profileId, accountId, updates);
      
      // Refresh auth profile state
      refreshAuthProfile();
      
      // Load data directly from storage to avoid stale closure issues
      const freshProfile = ProfileStorage.getProfileById(profileId);
      if (freshProfile) {
        const activeAccount = freshProfile.blinkAccounts.find(a => a.isActive) || null;
        updateState({
          loading: false,
          blinkAccounts: freshProfile.blinkAccounts,
          activeBlinkAccount: activeAccount
        });
      } else {
        updateState({ loading: false });
      }
      
      return { success: true };
    } catch (error) {
      console.error('Failed to update account:', error);
      updateState({ loading: false, error: error.message });
      return { success: false, error: error.message };
    }
  }, [authProfile, refreshAuthProfile, updateState]);

  /**
   * Remove a Blink account
   */
  const removeBlinkAccount = useCallback((accountId) => {
    if (!authProfile) throw new Error('Not authenticated');
    
    try {
      ProfileStorage.removeBlinkAccount(authProfile.id, accountId);
      refreshAuthProfile();
      loadProfileData();
      return { success: true };
    } catch (error) {
      console.error('Failed to remove account:', error);
      return { success: false, error: error.message };
    }
  }, [authProfile, refreshAuthProfile, loadProfileData]);

  // ============= NWC Connection Management =============

  /**
   * Add an NWC connection
   */
  const addNWCConnection = useCallback(async ({ label, uri, capabilities }) => {
    if (!authProfile) throw new Error('Not authenticated');
    
    updateState({ loading: true, error: null });
    
    try {
      const connection = await ProfileStorage.addNWCConnection(
        authProfile.id,
        label,
        uri,
        capabilities
      );
      
      refreshAuthProfile();
      loadProfileData();
      updateState({ loading: false });
      
      return { success: true, connection };
    } catch (error) {
      console.error('Failed to add NWC connection:', error);
      updateState({ loading: false, error: error.message });
      return { success: false, error: error.message };
    }
  }, [authProfile, refreshAuthProfile, loadProfileData, updateState]);

  /**
   * Get decrypted NWC URI
   */
  const getNWCUri = useCallback(async (connectionId) => {
    if (!authProfile) throw new Error('Not authenticated');
    
    try {
      return await ProfileStorage.getNWCUri(authProfile.id, connectionId);
    } catch (error) {
      console.error('Failed to get NWC URI:', error);
      throw error;
    }
  }, [authProfile]);

  /**
   * Get active NWC URI
   */
  const getActiveNWCUri = useCallback(async () => {
    if (!authProfile) return null;
    
    try {
      return await ProfileStorage.getActiveNWCUri(authProfile.id);
    } catch (error) {
      console.error('Failed to get active NWC URI:', error);
      return null;
    }
  }, [authProfile]);

  /**
   * Set active NWC connection
   */
  const setActiveNWCConnection = useCallback((connectionId) => {
    if (!authProfile) throw new Error('Not authenticated');
    
    try {
      ProfileStorage.setActiveNWCConnection(authProfile.id, connectionId);
      refreshAuthProfile();
      loadProfileData();
    } catch (error) {
      console.error('Failed to set active NWC connection:', error);
      throw error;
    }
  }, [authProfile, refreshAuthProfile, loadProfileData]);

  /**
   * Remove an NWC connection
   */
  const removeNWCConnection = useCallback((connectionId) => {
    if (!authProfile) throw new Error('Not authenticated');
    
    try {
      ProfileStorage.removeNWCConnection(authProfile.id, connectionId);
      refreshAuthProfile();
      loadProfileData();
      return { success: true };
    } catch (error) {
      console.error('Failed to remove NWC connection:', error);
      return { success: false, error: error.message };
    }
  }, [authProfile, refreshAuthProfile, loadProfileData]);

  // ============= Settings Management =============

  /**
   * Update tipping settings
   */
  const updateTippingSettings = useCallback((settings) => {
    if (!authProfile) throw new Error('Not authenticated');
    
    try {
      ProfileStorage.updateTippingSettings(authProfile.id, settings);
      refreshAuthProfile();
      loadProfileData();
      return { success: true };
    } catch (error) {
      console.error('Failed to update tipping settings:', error);
      return { success: false, error: error.message };
    }
  }, [authProfile, refreshAuthProfile, loadProfileData]);

  /**
   * Update preferences
   */
  const updatePreferences = useCallback((preferences) => {
    if (!authProfile) throw new Error('Not authenticated');
    
    try {
      ProfileStorage.updatePreferences(authProfile.id, preferences);
      refreshAuthProfile();
      loadProfileData();
      return { success: true };
    } catch (error) {
      console.error('Failed to update preferences:', error);
      return { success: false, error: error.message };
    }
  }, [authProfile, refreshAuthProfile, loadProfileData]);

  // ============= Export/Import =============

  /**
   * Export profile data
   */
  const exportProfile = useCallback(() => {
    if (!authProfile) throw new Error('Not authenticated');
    
    try {
      return ProfileStorage.exportProfile(authProfile.id);
    } catch (error) {
      console.error('Failed to export profile:', error);
      throw error;
    }
  }, [authProfile]);

  /**
   * Export all profiles
   */
  const exportAllProfiles = useCallback(() => {
    return ProfileStorage.exportAllProfiles();
  }, []);

  /**
   * Import profiles
   */
  const importProfiles = useCallback((data, merge = true) => {
    try {
      ProfileStorage.importProfiles(data, merge);
      refreshAuthProfile();
      loadProfileData();
      return { success: true };
    } catch (error) {
      console.error('Failed to import profiles:', error);
      return { success: false, error: error.message };
    }
  }, [refreshAuthProfile, loadProfileData]);

  // Compute derived state with memoization to prevent unnecessary re-renders
  // Without useMemo, these would create new object references on every render,
  // causing downstream useEffect hooks (like in Dashboard) to fire unnecessarily
  const activeBlinkAccount = useMemo(
    () => state.blinkAccounts.find(a => a.isActive) || null,
    [state.blinkAccounts]
  );
  const activeNWCConnection = useMemo(
    () => state.nwcConnections.find(c => c.isActive) || null,
    [state.nwcConnections]
  );
  const hasBlinkAccount = state.blinkAccounts.length > 0;
  const hasNWCConnection = state.nwcConnections.length > 0;

  const value = {
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
    
    // Blink account actions
    addBlinkAccount,
    addBlinkLnAddressAccount,
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
    refreshProfile: loadProfileData
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

/**
 * useProfile hook - Access profile management context
 */
export function useProfile() {
  const context = useContext(ProfileContext);
  
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  
  return context;
}

export default useProfile;

