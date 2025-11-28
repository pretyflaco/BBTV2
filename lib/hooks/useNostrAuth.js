/**
 * useNostrAuth - React hook for Nostr-based authentication
 * 
 * Provides:
 * - Sign-in with browser extension (NIP-07)
 * - Sign-in with external signer (NIP-55)
 * - NIP-98 server session establishment
 * - Profile management
 * - Authentication state
 */

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import NostrAuthService from '../nostr/NostrAuthService.js';
import ProfileStorage from '../storage/ProfileStorage.js';

/**
 * @typedef {Object} NostrAuthState
 * @property {boolean} loading - Whether auth check is in progress
 * @property {boolean} isAuthenticated - Whether user is authenticated
 * @property {string|null} publicKey - User's Nostr public key
 * @property {string|null} method - Sign-in method ('extension' or 'externalSigner')
 * @property {Object|null} profile - User's profile data
 * @property {Object|null} activeBlinkAccount - Active Blink account info
 * @property {boolean} hasServerSession - Whether NIP-98 server session is established
 * @property {string|null} error - Last error message
 */

/**
 * @typedef {Object} NostrAuthActions
 * @property {Function} signInWithExtension - Sign in using browser extension
 * @property {Function} signInWithExternalSigner - Sign in using external signer (Amber)
 * @property {Function} signOut - Sign out and clear session
 * @property {Function} refreshProfile - Reload profile data
 * @property {Function} checkPendingSignerFlow - Check for pending external signer return
 * @property {Function} establishServerSession - Establish NIP-98 server session
 */

const NostrAuthContext = createContext(null);

/**
 * NostrAuthProvider - Provides Nostr authentication context
 */
export function NostrAuthProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    isAuthenticated: false,
    publicKey: null,
    method: null,
    profile: null,
    activeBlinkAccount: null,
    hasServerSession: false,
    error: null
  });

  /**
   * Update state helper
   */
  const updateState = useCallback((updates) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * Load profile for a public key
   */
  const loadProfile = useCallback((publicKey) => {
    if (!publicKey) return null;
    
    const profile = ProfileStorage.getProfileByPublicKey(publicKey);
    if (profile) {
      const activeBlinkAccount = profile.blinkAccounts.find(a => a.isActive) || null;
      return { profile, activeBlinkAccount };
    }
    return { profile: null, activeBlinkAccount: null };
  }, []);

  /**
   * Check authentication status on mount
   */
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check for pending external signer flow first
        if (NostrAuthService.hasPendingExternalSignerFlow()) {
          const result = await NostrAuthService.handleExternalSignerReturn();
          
          if (result.success && result.publicKey) {
            const profile = ProfileStorage.createProfile(result.publicKey, result.method);
            ProfileStorage.setActiveProfile(profile.id);
            
            const { activeBlinkAccount } = loadProfile(result.publicKey);
            
            updateState({
              loading: false,
              isAuthenticated: true,
              publicKey: result.publicKey,
              method: result.method,
              profile,
              activeBlinkAccount,
              error: null
            });
            return;
          } else {
            updateState({
              loading: false,
              error: result.error || 'Failed to complete sign-in'
            });
            return;
          }
        }

        // Check stored auth data
        const { publicKey, method } = NostrAuthService.getStoredAuthData();
        
        if (publicKey && method) {
          // Verify extension is still available if using extension method
          if (method === 'extension' && !NostrAuthService.isExtensionAvailable()) {
            // Extension was removed - clear auth
            NostrAuthService.clearAuthData();
            updateState({
              loading: false,
              isAuthenticated: false,
              publicKey: null,
              method: null,
              profile: null,
              activeBlinkAccount: null,
              hasServerSession: false,
              error: null
            });
            return;
          }

          const { profile, activeBlinkAccount } = loadProfile(publicKey);
          
          updateState({
            loading: false,
            isAuthenticated: true,
            publicKey,
            method,
            profile,
            activeBlinkAccount,
            hasServerSession: false,
            error: null
          });

          // Try to establish server session in background
          setTimeout(async () => {
            try {
              const sessionResult = await NostrAuthService.nip98Login();
              if (sessionResult.success) {
                updateState({ hasServerSession: true });
              }
            } catch (e) {
              console.warn('Background NIP-98 login failed:', e);
            }
          }, 100);
        } else {
          updateState({
            loading: false,
            isAuthenticated: false,
            publicKey: null,
            method: null,
            profile: null,
            activeBlinkAccount: null,
            error: null
          });
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        updateState({
          loading: false,
          isAuthenticated: false,
          error: error.message
        });
      }
    };

    // Only run on client side
    if (typeof window !== 'undefined') {
      checkAuth();
    } else {
      updateState({ loading: false });
    }
  }, [loadProfile, updateState]);

  /**
   * Establish NIP-98 server session
   * Creates a signed NIP-98 event and sends to server for session establishment
   */
  const establishServerSession = useCallback(async () => {
    if (!state.isAuthenticated) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const result = await NostrAuthService.nip98Login();
      
      if (result.success) {
        updateState({ hasServerSession: true });
        return { success: true };
      } else {
        console.warn('NIP-98 login failed:', result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Server session establishment failed:', error);
      return { success: false, error: error.message };
    }
  }, [state.isAuthenticated, updateState]);

  /**
   * Sign in with browser extension (NIP-07)
   */
  const signInWithExtension = useCallback(async () => {
    updateState({ loading: true, error: null });

    try {
      const result = await NostrAuthService.signInWithExtension();

      if (result.success && result.publicKey) {
        // Create or get profile
        const profile = ProfileStorage.createProfile(result.publicKey, 'extension');
        ProfileStorage.setActiveProfile(profile.id);
        
        const activeBlinkAccount = profile.blinkAccounts.find(a => a.isActive) || null;

        updateState({
          loading: false,
          isAuthenticated: true,
          publicKey: result.publicKey,
          method: 'extension',
          profile,
          activeBlinkAccount,
          hasServerSession: false,
          error: null
        });

        // Automatically establish server session via NIP-98
        // Do this in the background - don't block the sign-in
        setTimeout(async () => {
          const sessionResult = await NostrAuthService.nip98Login();
          if (sessionResult.success) {
            updateState({ hasServerSession: true });
          } else {
            console.warn('Background NIP-98 login failed:', sessionResult.error);
          }
        }, 100);

        return { success: true, profile };
      } else {
        updateState({
          loading: false,
          error: result.error
        });
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Extension sign-in failed:', error);
      updateState({
        loading: false,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }, [updateState]);

  /**
   * Sign in with external signer (NIP-55 / Amber)
   */
  const signInWithExternalSigner = useCallback(async () => {
    updateState({ loading: true, error: null });

    try {
      const result = await NostrAuthService.signInWithExternalSigner();

      if (result.pending) {
        // The page will redirect to external signer
        // Reset loading state - the redirect may fail or user may cancel
        // When user returns, checkPendingSignerFlow will handle auth completion
        updateState({ loading: false });
        return { success: true, pending: true };
      }

      if (!result.success) {
        updateState({
          loading: false,
          error: result.error
        });
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (error) {
      console.error('External signer sign-in failed:', error);
      updateState({
        loading: false,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }, [updateState]);

  /**
   * Check for pending external signer flow (called on page focus)
   */
  const checkPendingSignerFlow = useCallback(async () => {
    if (!NostrAuthService.hasPendingExternalSignerFlow()) {
      return { pending: false };
    }

    updateState({ loading: true });

    const result = await NostrAuthService.handleExternalSignerReturn();

    if (result.success && result.publicKey) {
      const profile = ProfileStorage.createProfile(result.publicKey, 'externalSigner');
      ProfileStorage.setActiveProfile(profile.id);
      
      const activeBlinkAccount = profile.blinkAccounts.find(a => a.isActive) || null;

      updateState({
        loading: false,
        isAuthenticated: true,
        publicKey: result.publicKey,
        method: 'externalSigner',
        profile,
        activeBlinkAccount,
        hasServerSession: false,
        error: null
      });

      // Establish server session in background
      // External signer may not support NIP-98 signing easily, but try anyway
      setTimeout(async () => {
        try {
          const sessionResult = await NostrAuthService.nip98Login();
          if (sessionResult.success) {
            updateState({ hasServerSession: true });
          }
        } catch (e) {
          console.warn('Background NIP-98 login failed for external signer:', e);
        }
      }, 100);

      return { success: true, profile };
    }

    updateState({
      loading: false,
      error: result.error
    });

    return { success: false, error: result.error };
  }, [updateState]);

  /**
   * Sign out
   */
  const signOut = useCallback(async () => {
    try {
      // Call server logout endpoint
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Server logout failed:', error);
    }

    // Clear local auth data
    NostrAuthService.clearAuthData();

    updateState({
      loading: false,
      isAuthenticated: false,
      publicKey: null,
      method: null,
      profile: null,
      activeBlinkAccount: null,
      error: null
    });
  }, [updateState]);

  /**
   * Refresh profile data
   */
  const refreshProfile = useCallback(() => {
    if (state.publicKey) {
      const { profile, activeBlinkAccount } = loadProfile(state.publicKey);
      updateState({ profile, activeBlinkAccount });
    }
  }, [state.publicKey, loadProfile, updateState]);

  /**
   * Get available sign-in methods
   */
  const availableMethods = NostrAuthService.getAvailableMethods();

  const value = {
    // State
    ...state,
    
    // Computed
    availableMethods,
    hasExtension: NostrAuthService.isExtensionAvailable(),
    isMobile: NostrAuthService.isMobileDevice(),
    
    // Actions
    signInWithExtension,
    signInWithExternalSigner,
    signOut,
    refreshProfile,
    checkPendingSignerFlow,
    establishServerSession
  };

  return (
    <NostrAuthContext.Provider value={value}>
      {children}
    </NostrAuthContext.Provider>
  );
}

/**
 * useNostrAuth hook - Access Nostr authentication context
 */
export function useNostrAuth() {
  const context = useContext(NostrAuthContext);
  
  if (!context) {
    throw new Error('useNostrAuth must be used within a NostrAuthProvider');
  }
  
  return context;
}

export default useNostrAuth;

