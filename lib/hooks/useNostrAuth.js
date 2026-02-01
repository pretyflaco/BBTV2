/**
 * useNostrAuth - React hook for Nostr-based authentication
 * Build version: v13-debug-2026-02-01
 * 
 * Provides:
 * - Sign-in with browser extension (NIP-07)
 * - Sign-in with external signer (NIP-55)
 * - NIP-98 server session establishment
 * - Profile management
 * - Authentication state
 */

import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import NostrAuthService from '../nostr/NostrAuthService.js';
import NostrProfileService from '../nostr/NostrProfileService.js';
import ProfileStorage from '../storage/ProfileStorage.js';
import CryptoUtils from '../storage/CryptoUtils.js';

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
    nostrProfile: null, // Nostr profile metadata (name, picture, etc.)
    error: null
  });

  // Track extension availability separately - extensions inject window.nostr asynchronously
  const [hasExtension, setHasExtension] = useState(NostrAuthService.isExtensionAvailable());
  
  // Track if auth check has been initiated to handle React Strict Mode
  const authCheckInitiated = useRef(false);
  
  // Track if challenge flow is being handled to prevent duplicate processing
  const challengeFlowHandling = useRef(false);
  
  // Re-check extension availability after short delay (extensions may inject asynchronously)
  useEffect(() => {
    // Immediate check
    setHasExtension(NostrAuthService.isExtensionAvailable());
    
    // Check again after delays (some extensions take time to inject)
    const timeouts = [100, 500, 1000, 2000].map(delay => 
      setTimeout(() => {
        const available = NostrAuthService.isExtensionAvailable();
        if (available) {
          console.log('[useNostrAuth] Extension detected after', delay, 'ms');
          setHasExtension(true);
        }
      }, delay)
    );
    
    return () => timeouts.forEach(clearTimeout);
  }, []);

  /**
   * Update state helper
   */
  const updateState = useCallback((updates) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * Fetch Nostr profile metadata from relays
   */
  const fetchNostrProfile = useCallback(async (publicKey) => {
    if (!publicKey) return null;
    
    try {
      console.log('[useNostrAuth] Fetching Nostr profile for:', publicKey.slice(0, 8) + '...');
      const nostrProfile = await NostrProfileService.fetchProfile(publicKey);
      
      if (nostrProfile) {
        console.log('[useNostrAuth] ✓ Fetched Nostr profile:', 
          nostrProfile.display_name || nostrProfile.name || 'No name');
        updateState({ nostrProfile });
        return nostrProfile;
      }
    } catch (error) {
      console.warn('[useNostrAuth] Failed to fetch Nostr profile:', error);
    }
    
    return null;
  }, [updateState]);

  /**
   * Load profile for a public key
   * Creates profile if it doesn't exist (for manual pubkey entry flow)
   */
  const loadProfile = useCallback((publicKey, method = 'externalSigner') => {
    if (!publicKey) return { profile: null, activeBlinkAccount: null };
    
    let profile = ProfileStorage.getProfileByPublicKey(publicKey);
    
    // If no profile exists, create one (supports manual pubkey entry)
    if (!profile) {
      console.log('[useNostrAuth] Creating profile for pubkey:', publicKey.substring(0, 8) + '...');
      profile = ProfileStorage.createProfile(publicKey, method);
      ProfileStorage.setActiveProfile(profile.id);
    }
    
    const activeBlinkAccount = profile.blinkAccounts.find(a => a.isActive) || null;
    return { profile, activeBlinkAccount };
  }, []);

  /**
   * Check authentication status on mount
   */
  useEffect(() => {
    const checkAuth = async () => {
      // VERSION CHECK - this log confirms which build is running
      console.log('[useNostrAuth] BUILD VERSION: v14-debug-20260201');
      
      try {
        // Check for pending challenge-based flow first (new secure flow for external signers)
        if (NostrAuthService.hasPendingChallengeFlow()) {
          // Prevent duplicate processing of the same challenge flow
          if (challengeFlowHandling.current) {
            console.log('[useNostrAuth] Challenge flow already being handled, skipping duplicate call');
            return;
          }
          challengeFlowHandling.current = true;
          
          console.log('[useNostrAuth] Handling pending challenge flow...');
          
          // Check URL to determine which step of challenge flow
          const urlParams = new URLSearchParams(window.location.search);
          const nostrReturn = urlParams.get('nostr_return');
          
          // DETAILED DEBUG LOGGING
          console.log('[useNostrAuth] DEBUG: Full URL:', window.location.href);
          console.log('[useNostrAuth] DEBUG: nostr_return value:', nostrReturn);
          console.log('[useNostrAuth] DEBUG: nostr_return length:', nostrReturn?.length);
          console.log('[useNostrAuth] DEBUG: startsWith challenge:', nostrReturn?.startsWith('challenge'));
          console.log('[useNostrAuth] DEBUG: startsWith signed:', nostrReturn?.startsWith('signed'));
          
          const flow = NostrAuthService.getPendingChallengeFlow();
          console.log('[useNostrAuth] DEBUG: Current flow:', JSON.stringify(flow));
          
          let result;
          try {
            // Note: Amber concatenates results directly, so we get "challenge{pubkey}" or "signed{event}"
            if (nostrReturn?.startsWith('challenge')) {
              console.log('[useNostrAuth] DEBUG: Taking challenge branch, calling handleChallengeFlowReturn...');
              result = await NostrAuthService.handleChallengeFlowReturn();
              console.log('[useNostrAuth] DEBUG: handleChallengeFlowReturn returned:', JSON.stringify(result));
            } else if (nostrReturn?.startsWith('signed')) {
              console.log('[useNostrAuth] DEBUG: Taking signed branch...');
              result = await NostrAuthService.handleChallengeSignReturn();
              console.log('[useNostrAuth] DEBUG: handleChallengeSignReturn returned:', JSON.stringify(result));
            } else {
              console.log('[useNostrAuth] DEBUG: Taking else branch...');
              // Check if we need to continue signing
              if (flow?.step === 'awaitingSignedChallenge') {
                console.log('[useNostrAuth] DEBUG: Flow says awaitingSignedChallenge, calling handleChallengeSignReturn...');
                result = await NostrAuthService.handleChallengeSignReturn();
                console.log('[useNostrAuth] DEBUG: handleChallengeSignReturn returned:', JSON.stringify(result));
              } else {
                console.log('[useNostrAuth] DEBUG: Unknown state, flow step:', flow?.step);
                result = { success: false, error: 'Unknown challenge flow state' };
              }
            }
          } catch (flowError) {
            console.error('[useNostrAuth] DEBUG: Challenge flow error:', flowError);
            challengeFlowHandling.current = false;
            result = { success: false, error: flowError.message };
          }
          
          if (result.pending) {
            // Still in flow, redirect will happen
            // Keep the flag set - we're still handling the flow
            updateState({ loading: false });
            return;
          }
          
          // Flow completed (success or failure) - reset the flag
          challengeFlowHandling.current = false;
          
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
              hasServerSession: result.hasServerSession || false,
              nostrProfile: null,
              error: null
            });
            
            // Fetch Nostr profile metadata from relays (in background)
            fetchNostrProfile(result.publicKey);
            
            // If we have server session, sync data from server
            if (result.hasServerSession) {
              console.log('[useNostrAuth] External signer: Session established, syncing data...');
              setTimeout(async () => {
                const syncResult = await syncBlinkAccountFromServer();
                console.log('[useNostrAuth] Sync result:', syncResult);
              }, 100);
            }
            
            return;
          } else {
            updateState({
              loading: false,
              error: result.error || 'Failed to complete sign-in'
            });
            return;
          }
        }
        
        // Check for pending external signer flow (legacy flow for pubkey-only)
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
              nostrProfile: null,
              error: null
            });
            
            // Fetch Nostr profile metadata from relays (in background)
            fetchNostrProfile(result.publicKey);
            
            // For legacy flow, try to establish session via challenge
            console.log('[useNostrAuth] External signer return: Attempting to establish session via challenge...');
            
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

          // For generated accounts, session private key is required for signing
          // If the app was closed and reopened, the session key is lost
          // User needs to sign in with password again
          if (method === 'generated' && !NostrAuthService.getSessionPrivateKey()) {
            console.log('[useNostrAuth] Generated account detected but no session key - requiring password re-entry');
            // Don't clear auth data - keep the encrypted nsec stored
            // Just don't mark as authenticated so they see the login form
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

          const { profile, activeBlinkAccount } = loadProfile(publicKey, method);
          
          updateState({
            loading: false,
            isAuthenticated: true,
            publicKey,
            method,
            profile,
            activeBlinkAccount,
            hasServerSession: false,
            nostrProfile: null,
            error: null
          });

          // Fetch Nostr profile metadata from relays (in background)
          fetchNostrProfile(publicKey);

          // Try to establish server session in background
          // For external signers, check if we already have a session first
          if (method === 'externalSigner') {
            // Check if we already have a valid server session
            console.log('[useNostrAuth] External signer: Checking for existing server session...');
            setTimeout(async () => {
              try {
                const sessionCheck = await NostrAuthService.verifyServerSession();
                if (sessionCheck.hasSession && sessionCheck.pubkey === publicKey) {
                  console.log('[useNostrAuth] ✓ External signer: Existing server session found');
                  updateState({ hasServerSession: true });
                  // Sync data from server
                  const syncResult = await syncBlinkAccountFromServer();
                  console.log('[useNostrAuth] Sync result:', syncResult);
                } else {
                  console.log('[useNostrAuth] External signer: No server session. User can use challenge-based auth to establish session.');
                }
              } catch (e) {
                console.warn('[useNostrAuth] Session check failed:', e);
              }
            }, 100);
            return;
          }

          // For extension and generated methods, establish NIP-98 server session
          setTimeout(async () => {
            console.log('[useNostrAuth] Starting background NIP-98 login...');
            try {
              const sessionResult = await NostrAuthService.nip98Login();
              console.log('[useNostrAuth] NIP-98 login result:', sessionResult);
              
              if (sessionResult.success) {
                updateState({ hasServerSession: true });
                console.log('[useNostrAuth] ✓ Server session established');
                
                // Sync Blink account from server (for cross-device consistency)
                try {
                  console.log('[useNostrAuth] Checking server for existing Blink account...');
                  const syncResponse = await fetch('/api/auth/nostr-blink-account', {
                    method: 'GET',
                    credentials: 'include'
                  });

                  console.log('[useNostrAuth] Server response status:', syncResponse.status);
                  
                  if (syncResponse.ok) {
                    const data = await syncResponse.json();
                    console.log('[useNostrAuth] Server data:', data);
                    
                    if (data.hasAccount && data.blinkUsername) {
                      console.log('[useNostrAuth] Found Blink account on server:', data.blinkUsername);
                      
                      // Get current profile from storage
                      const currentProfile = ProfileStorage.loadProfile(publicKey);
                      console.log('[useNostrAuth] Current profile:', currentProfile?.id, 'Blink accounts:', currentProfile?.blinkAccounts?.length);
                      
                      if (currentProfile) {
                        // Check if we already have this account locally
                        const existingAccount = currentProfile.blinkAccounts.find(
                          a => a.username === data.blinkUsername
                        );

                        if (!existingAccount && data.apiKey) {
                          console.log('[useNostrAuth] Adding server Blink account to local profile...');
                          // Encrypt the API key before storing locally
                          const encryptedApiKey = await CryptoUtils.encryptWithDeviceKey(data.apiKey);
                          // Add the server account to local profile
                          const serverAccount = {
                            id: `server-${Date.now()}`,
                            label: data.accountLabel || data.blinkUsername,  // Use stored label if available
                            username: data.blinkUsername,
                            apiKey: encryptedApiKey,  // Encrypted for local storage
                            defaultCurrency: data.preferredCurrency || 'BTC',
                            isActive: currentProfile.blinkAccounts.length === 0,
                            addedAt: new Date().toISOString(),
                            source: 'server'
                          };

                          const updatedAccounts = [...currentProfile.blinkAccounts, serverAccount];
                          const updatedProfile = {
                            ...currentProfile,
                            blinkAccounts: updatedAccounts
                          };
                          
                          ProfileStorage.updateProfile(updatedProfile);

                          const newActiveBlinkAccount = serverAccount.isActive ? serverAccount : 
                            (updatedAccounts.find(a => a.isActive) || null);
                          
                          updateState({
                            profile: updatedProfile,
                            activeBlinkAccount: newActiveBlinkAccount
                          });

                          console.log('[useNostrAuth] ✓ Synced Blink account from server');
                        } else {
                          console.log('[useNostrAuth] Blink account already exists locally');
                        }
                      }
                    } else {
                      console.log('[useNostrAuth] No Blink account found on server');
                    }
                  } else {
                    console.warn('[useNostrAuth] Server returned non-OK status:', syncResponse.status);
                  }
                } catch (syncError) {
                  console.warn('[useNostrAuth] Blink account sync failed:', syncError);
                }
              } else {
                console.warn('[useNostrAuth] NIP-98 login failed:', sessionResult.error);
              }
            } catch (e) {
              console.warn('[useNostrAuth] Background NIP-98 login exception:', e);
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
      // In React Strict Mode, effects run twice. Only initiate auth check once.
      if (authCheckInitiated.current) {
        return;
      }
      authCheckInitiated.current = true;
      checkAuth();
    } else {
      updateState({ loading: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount - dependencies are stable refs/callbacks

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
   * Sync Blink account by pubkey (for external signers like Amber)
   * 
   * SECURITY: This function has been disabled.
   * The unauthenticated pubkey-based API endpoint was a security vulnerability
   * that allowed anyone to retrieve API keys just by knowing a user's pubkey.
   * 
   * External signers now use localStorage only. To sync across devices,
   * users must re-add their Blink account on the new device.
   * 
   * @deprecated This function is no longer functional for security reasons
   */
  const syncBlinkAccountByPubkey = useCallback(async (publicKey) => {
    console.warn('[useNostrAuth] syncBlinkAccountByPubkey is disabled for security reasons');
    console.log('[useNostrAuth] External signers now use localStorage only');
    return { synced: false, error: 'Pubkey-based sync disabled for security' };
  }, []);

  /**
   * Sync Blink account from server (for cross-device consistency)
   * Called after NIP-98 session is established
   */
  const syncBlinkAccountFromServer = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/nostr-blink-account', {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        console.log('No server Blink account to sync');
        return { synced: false };
      }

      const data = await response.json();
      
      if (data.hasAccount && data.blinkUsername && data.apiKey) {
        console.log('[useNostrAuth] Found Blink account on server:', data.blinkUsername);
        
        // Get current profile - reload from storage to avoid stale closure
        const activeProfileId = ProfileStorage.getActiveProfileId();
        const currentProfile = activeProfileId ? ProfileStorage.getProfileById(activeProfileId) : state.profile;
        
        if (!currentProfile) {
          console.warn('[useNostrAuth] No local profile found for sync');
          return { synced: false, error: 'No local profile' };
        }
        
        console.log('[useNostrAuth] Current profile has', currentProfile.blinkAccounts?.length || 0, 'accounts');

        // Check if we already have this account locally
        const existingAccount = currentProfile.blinkAccounts.find(
          a => a.username === data.blinkUsername
        );

        if (existingAccount) {
          console.log('[useNostrAuth] Blink account already exists locally');
          return { synced: false, alreadyExists: true };
        }

        // Add the server account to local profile WITH the API key
        // Encrypt the API key before storing locally
        const encryptedApiKey = await CryptoUtils.encryptWithDeviceKey(data.apiKey);
        const serverAccount = {
          id: `server-${Date.now()}`,
          label: data.accountLabel || data.blinkUsername,  // Use stored label if available
          username: data.blinkUsername,
          apiKey: encryptedApiKey,  // Encrypted for local storage
          defaultCurrency: data.preferredCurrency || 'BTC',
          isActive: currentProfile.blinkAccounts.length === 0, // Make active if no other accounts
          addedAt: new Date().toISOString(),
          source: 'server' // Mark as synced from server
        };

        // Update local profile
        console.log('[useNostrAuth] Adding synced account to local profile...');
        const updatedAccounts = [...currentProfile.blinkAccounts, serverAccount];
        const updatedProfile = {
          ...currentProfile,
          blinkAccounts: updatedAccounts
        };
        
        ProfileStorage.updateProfile(updatedProfile);

        // Update state
        const activeBlinkAccount = serverAccount.isActive ? serverAccount : 
          (updatedAccounts.find(a => a.isActive) || null);
        
        console.log('[useNostrAuth] ✓ Synced Blink account from server (NIP-98)');
        
        updateState({
          profile: updatedProfile,
          activeBlinkAccount
        });

        console.log('[useNostrAuth] ✓ Synced Blink account from server');
        return { synced: true, account: serverAccount };
      } else if (data.hasAccount && !data.apiKey) {
        console.warn('[useNostrAuth] Server has account but no API key returned');
      }

      return { synced: false };
    } catch (error) {
      console.error('[useNostrAuth] Failed to sync Blink account from server:', error);
      return { synced: false, error: error.message };
    }
  }, [state.profile, updateState]);

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
          nostrProfile: null,
          error: null
        });

        // Fetch Nostr profile metadata from relays (in background)
        fetchNostrProfile(result.publicKey);

        // Automatically establish server session via NIP-98
        // Do this in the background - don't block the sign-in
        setTimeout(async () => {
          console.log('[useNostrAuth] Starting background NIP-98 login after extension sign-in...');
          try {
            const sessionResult = await NostrAuthService.nip98Login();
            console.log('[useNostrAuth] NIP-98 login result:', sessionResult);
            if (sessionResult.success) {
              console.log('[useNostrAuth] ✓ Server session established via extension sign-in');
              updateState({ hasServerSession: true });
              // After server session is established, sync Blink account from server
              // This enables cross-device account persistence
              console.log('[useNostrAuth] Now syncing Blink account from server...');
              const syncResult = await syncBlinkAccountFromServer();
              console.log('[useNostrAuth] Sync result:', syncResult);
            } else {
              console.warn('[useNostrAuth] Background NIP-98 login failed:', sessionResult.error, sessionResult.details);
            }
          } catch (err) {
            console.error('[useNostrAuth] Background NIP-98 login exception:', err);
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
  }, [updateState, syncBlinkAccountFromServer, fetchNostrProfile]);

  /**
   * Sign in with external signer (NIP-55 / Amber)
   * Uses challenge-based authentication for secure session establishment
   */
  const signInWithExternalSigner = useCallback(async () => {
    updateState({ loading: true, error: null });

    try {
      // Use the new challenge-based flow for secure authentication
      const result = await NostrAuthService.signInWithExternalSignerChallenge();

      if (result.pending) {
        // The page will redirect to external signer
        // Reset loading state - the redirect may fail or user may cancel
        // When user returns, checkAuth will handle the completion
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

      // If we got here with success and no pending, the full flow completed
      if (result.publicKey) {
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
          hasServerSession: result.hasServerSession || false,
          nostrProfile: null,
          error: null
        });

        // Fetch Nostr profile metadata from relays (in background)
        fetchNostrProfile(result.publicKey);

        // If we have server session, sync data
        if (result.hasServerSession) {
          setTimeout(async () => {
            const syncResult = await syncBlinkAccountFromServer();
            console.log('[useNostrAuth] Sync result:', syncResult);
          }, 100);
        }

        return { success: true, profile };
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
  }, [updateState, fetchNostrProfile, syncBlinkAccountFromServer]);

  /**
   * Check for pending external signer flow (called on page focus)
   * Handles both legacy flow and new challenge-based flow
   */
  const checkPendingSignerFlow = useCallback(async () => {
    // Check for challenge-based flow first (new secure flow)
    if (NostrAuthService.hasPendingChallengeFlow()) {
      console.log('[useNostrAuth] Handling pending challenge flow...');
      
      const urlParams = new URLSearchParams(window.location.search);
      const nostrReturn = urlParams.get('nostr_return');
      
      updateState({ loading: true });
      
      let result;
      // Note: Amber concatenates results directly, so we get "challenge{pubkey}" or "signed{event}"
      if (nostrReturn?.startsWith('challenge')) {
        result = await NostrAuthService.handleChallengeFlowReturn();
      } else if (nostrReturn?.startsWith('signed')) {
        result = await NostrAuthService.handleChallengeSignReturn();
      } else {
        const flow = NostrAuthService.getPendingChallengeFlow();
        if (flow?.step === 'awaitingSignedChallenge') {
          result = await NostrAuthService.handleChallengeSignReturn();
        } else {
          result = { success: false, error: 'Unknown challenge flow state' };
        }
      }
      
      if (result.pending) {
        updateState({ loading: false });
        return { pending: true };
      }
      
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
          hasServerSession: result.hasServerSession || false,
          nostrProfile: null,
          error: null
        });

        fetchNostrProfile(result.publicKey);

        if (result.hasServerSession) {
          setTimeout(async () => {
            const syncResult = await syncBlinkAccountFromServer();
            console.log('[useNostrAuth] Sync result:', syncResult);
          }, 100);
        }

        return { success: true, profile };
      }

      updateState({ loading: false, error: result.error });
      return { success: false, error: result.error };
    }
    
    // Legacy flow (pubkey-only, no server session)
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
        nostrProfile: null,
        error: null
      });

      // Fetch Nostr profile metadata from relays (in background)
      fetchNostrProfile(result.publicKey);

      // Legacy flow: No server session, using localStorage only
      console.log('[useNostrAuth] Legacy external signer flow: Using localStorage only');
      console.log('[useNostrAuth] To enable cross-device sync, use challenge-based auth');

      return { success: true, profile };
    }

    updateState({
      loading: false,
      error: result.error
    });

    return { success: false, error: result.error };
  }, [updateState, fetchNostrProfile, syncBlinkAccountFromServer]);

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
   * Create a new account with password (in-app key generation)
   * Generates keypair, encrypts with password, stores locally, and signs in
   */
  const createAccountWithPassword = useCallback(async (password) => {
    updateState({ loading: true, error: null });

    try {
      // Validate password
      if (!password || password.length < 8) {
        updateState({ loading: false, error: 'Password must be at least 8 characters' });
        return { success: false, error: 'Password must be at least 8 characters' };
      }

      // Generate new keypair
      const { privateKey, publicKey } = NostrAuthService.generateKeypair();
      console.log('[useNostrAuth] Generated new keypair, pubkey:', publicKey.slice(0, 8) + '...');

      // Encrypt private key with password
      const encryptedNsec = await CryptoUtils.encryptWithPassword(privateKey, password);
      
      // Store encrypted nsec locally
      NostrAuthService.storeEncryptedNsec(encryptedNsec);
      console.log('[useNostrAuth] Stored encrypted nsec');

      // Sign in with the new keys (this sets session private key)
      const result = NostrAuthService.signInWithGeneratedKeys(publicKey, privateKey);
      
      if (!result.success) {
        updateState({ loading: false, error: result.error });
        return { success: false, error: result.error };
      }

      // Create or get profile
      const profile = ProfileStorage.createProfile(publicKey, 'generated');
      ProfileStorage.setActiveProfile(profile.id);
      
      const activeBlinkAccount = profile.blinkAccounts.find(a => a.isActive) || null;

      // Update state - no reload needed!
      updateState({
        loading: false,
        isAuthenticated: true,
        publicKey: publicKey.toLowerCase(),
        method: 'generated',
        profile,
        activeBlinkAccount,
        hasServerSession: false,
        nostrProfile: null,
        error: null
      });

      // Fetch Nostr profile metadata from relays (in background)
      fetchNostrProfile(publicKey);

      // Establish server session via NIP-98 in background
      setTimeout(async () => {
        console.log('[useNostrAuth] Starting background NIP-98 login after account creation...');
        try {
          const sessionResult = await NostrAuthService.nip98Login();
          console.log('[useNostrAuth] NIP-98 login result:', sessionResult);
          if (sessionResult.success) {
            console.log('[useNostrAuth] ✓ Server session established for generated account');
            updateState({ hasServerSession: true });
            const syncResult = await syncBlinkAccountFromServer();
            console.log('[useNostrAuth] Sync result:', syncResult);
          } else {
            console.warn('[useNostrAuth] NIP-98 login failed:', sessionResult.error);
          }
        } catch (err) {
          console.error('[useNostrAuth] NIP-98 login exception:', err);
        }
      }, 100);

      return { success: true, profile, publicKey };
    } catch (error) {
      console.error('Create account failed:', error);
      updateState({ loading: false, error: error.message });
      return { success: false, error: error.message };
    }
  }, [updateState, fetchNostrProfile, syncBlinkAccountFromServer]);

  /**
   * Sign in with password (for returning users with stored encrypted nsec)
   */
  const signInWithPassword = useCallback(async (password) => {
    updateState({ loading: true, error: null });

    try {
      // Get stored encrypted nsec
      const encryptedNsec = NostrAuthService.getStoredEncryptedNsec();
      
      if (!encryptedNsec) {
        updateState({ loading: false, error: 'No account found on this device' });
        return { success: false, error: 'No account found on this device' };
      }

      // Decrypt with password
      let privateKey;
      try {
        privateKey = await CryptoUtils.decryptWithPassword(encryptedNsec, password);
      } catch (decryptError) {
        updateState({ loading: false, error: 'Incorrect password' });
        return { success: false, error: 'Incorrect password' };
      }

      // Sign in with decrypted key (this sets session private key)
      const result = NostrAuthService.signInWithDecryptedKey(privateKey);
      
      if (!result.success) {
        updateState({ loading: false, error: result.error });
        return { success: false, error: result.error };
      }

      const publicKey = result.publicKey;

      // Create or get profile
      const profile = ProfileStorage.createProfile(publicKey, 'generated');
      ProfileStorage.setActiveProfile(profile.id);
      
      const activeBlinkAccount = profile.blinkAccounts.find(a => a.isActive) || null;

      // Update state - no reload needed!
      updateState({
        loading: false,
        isAuthenticated: true,
        publicKey,
        method: 'generated',
        profile,
        activeBlinkAccount,
        hasServerSession: false,
        nostrProfile: null,
        error: null
      });

      // Fetch Nostr profile metadata from relays (in background)
      fetchNostrProfile(publicKey);

      // Establish server session via NIP-98 in background
      setTimeout(async () => {
        console.log('[useNostrAuth] Starting background NIP-98 login after password sign-in...');
        try {
          const sessionResult = await NostrAuthService.nip98Login();
          console.log('[useNostrAuth] NIP-98 login result:', sessionResult);
          if (sessionResult.success) {
            console.log('[useNostrAuth] ✓ Server session established for generated account');
            updateState({ hasServerSession: true });
            const syncResult = await syncBlinkAccountFromServer();
            console.log('[useNostrAuth] Sync result:', syncResult);
          } else {
            console.warn('[useNostrAuth] NIP-98 login failed:', sessionResult.error);
          }
        } catch (err) {
          console.error('[useNostrAuth] NIP-98 login exception:', err);
        }
      }, 100);

      return { success: true, profile, publicKey };
    } catch (error) {
      console.error('Password sign-in failed:', error);
      updateState({ loading: false, error: error.message });
      return { success: false, error: error.message };
    }
  }, [updateState, fetchNostrProfile, syncBlinkAccountFromServer]);

  /**
   * Get available sign-in methods
   */
  const availableMethods = NostrAuthService.getAvailableMethods();

  const value = {
    // State
    ...state,
    
    // Computed
    availableMethods,
    hasExtension,  // Uses state that re-checks after mount for async extensions
    isMobile: NostrAuthService.isMobileDevice(),
    
    // Actions
    signInWithExtension,
    signInWithExternalSigner,
    signOut,
    refreshProfile,
    checkPendingSignerFlow,
    establishServerSession,
    syncBlinkAccountFromServer,
    createAccountWithPassword,
    signInWithPassword
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

