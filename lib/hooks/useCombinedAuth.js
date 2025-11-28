/**
 * useCombinedAuth - Unified authentication hook supporting both legacy and Nostr auth
 * 
 * This hook provides a seamless interface that works with:
 * 1. Legacy authentication (API key via useAuth)
 * 2. New Nostr authentication (extension/signer via useNostrAuth + useProfile)
 * 
 * Components can use this hook without worrying about which auth system is active.
 */

import { useCallback, useMemo, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { useNostrAuth } from './useNostrAuth';
import { useProfile } from './useProfile';
const MigrationService = require('../migration/MigrationService');

/**
 * Authentication mode
 * @typedef {'legacy' | 'nostr' | null} AuthMode
 */

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

export function useCombinedAuth() {
  // Legacy auth (API key based)
  const legacyAuth = useAuth();
  
  // Nostr auth (extension/signer based)
  const nostrAuth = useNostrAuth();
  
  // Profile management (Blink accounts, settings)
  const profile = useProfile();

  // Track initialization state
  const [initialized, setInitialized] = useState(false);

  // Determine loading state
  const loading = useMemo(() => {
    return legacyAuth.loading || nostrAuth.loading;
  }, [legacyAuth.loading, nostrAuth.loading]);

  // Determine which auth mode is active
  // Prioritize Nostr auth if user has a local Nostr profile
  // This prevents NIP-98 server sessions from being detected as "legacy"
  const authMode = useMemo(() => {
    // Check Nostr first - if user has local Nostr profile, they're a Nostr user
    if (nostrAuth.isAuthenticated) return 'nostr';
    // Check if legacy user (API key only, not Nostr with server session)
    if (legacyAuth.user && !legacyAuth.user.authMethod?.startsWith('nostr')) return 'legacy';
    // If user has authMethod === 'nostr' from verify, they're Nostr but profile not loaded yet
    if (legacyAuth.user?.authMethod === 'nostr') return 'nostr';
    return null;
  }, [legacyAuth.user, nostrAuth.isAuthenticated]);

  // Check if authenticated via either method
  const isAuthenticated = useMemo(() => {
    return !!legacyAuth.user || nostrAuth.isAuthenticated;
  }, [legacyAuth.user, nostrAuth.isAuthenticated]);

  // Get unified user info
  // Check Nostr first to prevent NIP-98 sessions from showing as legacy
  const user = useMemo(() => {
    // Nostr with Blink account - show Blink username
    if (nostrAuth.isAuthenticated && profile.activeBlinkAccount) {
      return {
        username: profile.activeBlinkAccount.username,
        preferredCurrency: profile.preferences?.defaultCurrency || 'BTC',
        publicKey: nostrAuth.publicKey,
        authMode: 'nostr'
      };
    }
    
    // Nostr without Blink account yet
    if (nostrAuth.isAuthenticated) {
      return {
        username: null,
        preferredCurrency: profile.preferences?.defaultCurrency || 'BTC',
        publicKey: nostrAuth.publicKey,
        authMode: 'nostr'
      };
    }
    
    // Legacy user (API key auth, not Nostr)
    // Only treat as legacy if authMethod is not 'nostr'
    if (legacyAuth.user && legacyAuth.user.authMethod !== 'nostr') {
      return {
        ...legacyAuth.user,
        authMode: 'legacy'
      };
    }
    
    return null;
  }, [legacyAuth.user, nostrAuth.isAuthenticated, nostrAuth.publicKey, profile.activeBlinkAccount, profile.preferences]);

  // Check if Nostr user needs to set up Blink account
  const needsBlinkSetup = useMemo(() => {
    return nostrAuth.isAuthenticated && !profile.hasBlinkAccount;
  }, [nostrAuth.isAuthenticated, profile.hasBlinkAccount]);

  // Unified logout function
  const logout = useCallback(async () => {
    if (authMode === 'legacy') {
      await legacyAuth.logout();
    } else if (authMode === 'nostr') {
      await nostrAuth.signOut();
    }
  }, [authMode, legacyAuth, nostrAuth]);

  // Get API key (works for both auth methods)
  const getApiKey = useCallback(async () => {
    if (authMode === 'legacy') {
      // Legacy: Fetch from server
      try {
        const response = await fetch('/api/auth/get-api-key');
        if (response.ok) {
          const data = await response.json();
          return data.apiKey;
        }
      } catch (error) {
        console.error('Failed to get API key (legacy):', error);
      }
      return null;
    } else if (authMode === 'nostr') {
      // Nostr with server session: API key is stored server-side
      if (nostrAuth.hasServerSession) {
        try {
          const response = await fetch('/api/auth/get-api-key');
          if (response.ok) {
            const data = await response.json();
            return data.apiKey;
          }
        } catch (error) {
          console.error('Failed to get API key (nostr server):', error);
        }
      }
      // Fallback: Get from encrypted local storage
      return await profile.getActiveBlinkApiKey();
    }
    return null;
  }, [authMode, profile, nostrAuth.hasServerSession]);

  // Store Blink account on server (for Nostr users with server session)
  const storeBlinkAccountOnServer = useCallback(async (apiKey, preferredCurrency = 'BTC', label = null) => {
    console.log('[storeBlinkAccountOnServer] Called with authMode:', authMode, 'hasServerSession:', nostrAuth.hasServerSession);
    
    if (authMode !== 'nostr' || !nostrAuth.hasServerSession) {
      console.log('[storeBlinkAccountOnServer] Skipping - no Nostr server session');
      return { success: false, error: 'No Nostr server session' };
    }

    try {
      console.log('[storeBlinkAccountOnServer] Making POST request...');
      const response = await fetch('/api/auth/nostr-blink-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiKey, preferredCurrency, label })
      });

      console.log('[storeBlinkAccountOnServer] Response status:', response.status);
      const data = await response.json();
      console.log('[storeBlinkAccountOnServer] Response data:', data);

      if (response.ok) {
        return { success: true, blinkUsername: data.blinkUsername };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('[storeBlinkAccountOnServer] Failed:', error);
      return { success: false, error: error.message };
    }
  }, [authMode, nostrAuth.hasServerSession]);

  // Mark as initialized once loading is complete
  useEffect(() => {
    if (!loading && !initialized) {
      setInitialized(true);
    }
  }, [loading, initialized]);

  // Check if legacy user can migrate to Nostr
  const canMigrateToNostr = useMemo(() => {
    return authMode === 'legacy' && typeof window !== 'undefined';
  }, [authMode]);

  // Check for pending migration (for completing after Nostr sign-in)
  const pendingMigration = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return MigrationService.getPendingMigration();
  }, []);

  // Start migration process
  const startMigration = useCallback(() => {
    if (authMode !== 'legacy' || !legacyAuth.user) {
      return { success: false, error: 'Must be logged in with legacy auth' };
    }
    const started = MigrationService.startMigration(legacyAuth.user.username);
    return { success: started };
  }, [authMode, legacyAuth.user]);

  // Complete migration (call after Nostr sign-in)
  const completeMigration = useCallback(async (nostrPublicKey, signInMethod = 'extension') => {
    const result = await MigrationService.completeMigration(nostrPublicKey);
    
    if (result.success) {
      // Add the Blink account to the new Nostr profile
      try {
        const ProfileStorage = (await import('../storage/ProfileStorage.js')).default;
        
        // Ensure profile exists - use getProfileByPublicKey and createProfile with signInMethod
        let profile = ProfileStorage.getProfileByPublicKey(nostrPublicKey);
        if (!profile) {
          profile = ProfileStorage.createProfile(nostrPublicKey, signInMethod);
        }
        
        // Add the migrated Blink account using correct method signature:
        // addBlinkAccount(profileId, label, apiKey, username, defaultCurrency)
        await ProfileStorage.addBlinkAccount(
          profile.id,
          `Migrated from ${result.blinkUsername}`,
          result.apiKey,
          result.blinkUsername,
          result.preferences?.preferredCurrency || 'BTC'
        );

        // Update preferences using profile.id, not nostrPublicKey
        if (result.preferences) {
          ProfileStorage.updatePreferences(profile.id, result.preferences);
        }

        return { success: true, message: 'Migration complete' };
      } catch (error) {
        console.error('Failed to save migrated account:', error);
        return { success: false, error: error.message };
      }
    }
    
    return result;
  }, []);

  // Clear pending migration
  const clearMigration = useCallback(() => {
    MigrationService.clearMigration();
  }, []);

  return {
    // State
    loading,
    initialized,
    isAuthenticated,
    authMode,
    user,
    needsBlinkSetup,
    
    // Nostr-specific
    publicKey: nostrAuth.publicKey,
    hasExtension: nostrAuth.hasExtension,
    isMobile: nostrAuth.isMobile,
    hasServerSession: nostrAuth.hasServerSession,
    
    // Profile data
    hasBlinkAccount: profile.hasBlinkAccount,
    blinkAccounts: profile.blinkAccounts,
    activeBlinkAccount: profile.activeBlinkAccount,
    tippingSettings: profile.tippingSettings,
    preferences: profile.preferences,
    
    // Legacy auth methods
    legacyLogin: legacyAuth.login,
    
    // Nostr auth methods
    signInWithExtension: nostrAuth.signInWithExtension,
    signInWithExternalSigner: nostrAuth.signInWithExternalSigner,
    checkPendingSignerFlow: nostrAuth.checkPendingSignerFlow,
    establishServerSession: nostrAuth.establishServerSession,
    
    // Profile methods
    addBlinkAccount: profile.addBlinkAccount,
    getActiveBlinkApiKey: profile.getActiveBlinkApiKey,
    setActiveBlinkAccount: profile.setActiveBlinkAccount,
    updateTippingSettings: profile.updateTippingSettings,
    updatePreferences: profile.updatePreferences,
    storeBlinkAccountOnServer,
    
    // Unified methods
    logout,
    getApiKey,
    
    // Raw access to individual hooks (for advanced usage)
    _legacy: legacyAuth,
    _nostr: nostrAuth,
    _profile: profile
  };
}

export default useCombinedAuth;

