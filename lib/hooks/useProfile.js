/**
 * useProfile - React hook for profile and credential management
 * 
 * Provides:
 * - Blink account management
 * - NWC connection management
 * - Settings management
 * - Profile switching
 * 
 * IMPORTANT: ProfileProvider MUST be nested inside NostrAuthProvider.
 * Example in _app.js:
 *   <NostrAuthProvider>
 *     <ProfileProvider>
 *       <Component {...pageProps} />
 *     </ProfileProvider>
 *   </NostrAuthProvider>
 */

import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import ProfileStorage from '../storage/ProfileStorage.js';
import { useNostrAuth } from './useNostrAuth.js';

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
    preferences: null
  });

  /**
   * Update state helper
   */
  const updateState = useCallback((updates) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * Load profile data
   */
  const loadProfileData = useCallback(() => {
    if (!isAuthenticated || !authProfile) {
      updateState({
        blinkAccounts: [],
        nwcConnections: [],
        tippingSettings: null,
        preferences: null
      });
      return;
    }

    updateState({
      blinkAccounts: authProfile.blinkAccounts || [],
      nwcConnections: authProfile.nwcConnections || [],
      tippingSettings: authProfile.tippingSettings || null,
      preferences: authProfile.preferences || null
    });
  }, [isAuthenticated, authProfile, updateState]);

  // Load profile data when auth changes
  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

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
      } else {
        updateState({ loading: false });
      }
      
      return { success: true, account };
    } catch (error) {
      console.error('Failed to add Blink account:', error);
      updateState({ loading: false, error: error.message });
      return { success: false, error: error.message };
    }
  }, [authProfile, refreshAuthProfile, updateState]);

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
      } else {
        updateState({ loading: false });
      }
      
      return { success: true, account };
    } catch (error) {
      console.error('Failed to add Blink LN Address account:', error);
      updateState({ loading: false, error: error.message });
      return { success: false, error: error.message };
    }
  }, [authProfile, refreshAuthProfile, updateState]);

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

