/**
 * NostrConnectServiceNDK - NIP-46 (Nostr Connect) implementation using NDK
 * 
 * This is the Phase 2 implementation using @nostr-dev-kit/ndk instead of nostr-tools.
 * NDK handles NIP-46 more robustly, particularly with nsec.app on iOS Safari.
 * 
 * Key differences from nostr-tools implementation:
 * - NDK properly waits for EOSE before processing events
 * - NDK handles subscription lifecycle better
 * - NDK supports both bunker:// URLs and NIP-05 identifiers (e.g., user@nsec.app)
 * - NDK's NDKNip46Signer has better error handling and auth URL support
 * 
 * Based on habla.news implementation which works flawlessly with nsec.app.
 * 
 * v51: Initial NDK implementation for NIP-46
 * v52: Set build-time env var for NDK feature flag
 * v53: Use NDKNip46Signer.bunker() static method
 * v54: Match habla.news pattern exactly - use constructor with NDKPrivateKeySigner object
 * v59: Add retry logic for "invalid secret" - nsec.app sends this while awaiting approval
 * v60: On retries, try connecting WITHOUT secret (bunker pubkey only) - if client was approved,
 *      it should work without re-presenting the secret. Also store bunker pubkey for retry use.
 * v61: Fix retry logic - NDK expects bunker:// URL format, not raw pubkey. Construct proper
 *      bunker URL without secret for retries.
 * 
 * @see https://github.com/nostr-protocol/nips/blob/master/46.md
 * @see https://github.com/nostr-dev-kit/ndk
 */

import NDK, { NDKNip46Signer, NDKPrivateKeySigner, NDKUser } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

// Default relays for NIP-46 connections
const DEFAULT_NIP46_RELAYS = [
  'wss://relay.nsec.app',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

// Storage keys
const NDK_NIP46_SESSION_KEY = 'blinkpos_ndk_nip46_session';
const NDK_LOCAL_SIGNER_KEY = 'blinkpos_ndk_local_signer';

// Connection timeout (60 seconds - NDK handles this better)
const CONNECTION_TIMEOUT = 60000;

/**
 * @typedef {'disconnected' | 'connecting' | 'awaiting_approval' | 'connected'} ConnectionState
 */

/**
 * @typedef {Object} NDKSession
 * @property {string} publicKey - User's public key (hex)
 * @property {string} bunkerUrl - Original bunker URL or NIP-05 identifier
 * @property {string} localSignerPrivkey - Local signer private key (hex) for session persistence
 * @property {string[]} relays - Relays used for the connection
 * @property {number} connectedAt - Timestamp when connection was established
 */

/**
 * @typedef {Object} ConnectionResult
 * @property {boolean} success
 * @property {string} [publicKey] - User's public key if successful
 * @property {string} [error] - Error message if failed
 * @property {boolean} [needsApproval] - True if waiting for user approval in signer app
 * @property {string} [authUrl] - Auth URL if signer requires browser approval
 */

class NostrConnectServiceNDK {
  /** @type {NDK|null} - Dedicated NDK instance for bunker connection */
  static bunkerNDK = null;
  
  /** @type {NDKNip46Signer|null} */
  static signer = null;
  
  /** @type {NDKPrivateKeySigner|null} - Local signer for NIP-46 communication */
  static localSigner = null;
  
  /** @type {ConnectionState} */
  static connectionState = 'disconnected';
  
  /** @type {string|null} */
  static userPublicKey = null;
  
  /** @type {string|null} - Current bunker URL or NIP-05 being connected */
  static currentBunkerInput = null;
  
  /** @type {string|null} - Bunker pubkey extracted from bunker URL (for retry without secret) */
  static currentBunkerPubkey = null;
  
  /** @type {string[]|null} - Relays extracted from bunker URL (for retry without secret) */
  static currentRelays = null;
  
  /** @type {Function|null} - Callback for auth URL */
  static authUrlCallback = null;

  /**
   * Parse bunker input to determine type and extract settings
   * Supports:
   * - bunker://pubkey?relay=...&secret=...
   * - user@nsec.app (NIP-05 with NIP-46 support)
   * - npub... (just pubkey, will use default relays)
   * 
   * @param {string} input - Bunker URL, NIP-05, or npub
   * @returns {Promise<{type: 'bunker'|'nip05'|'npub', pubkey?: string, relays?: string[], secret?: string, nip05?: string}|null>}
   */
  static async parseBunkerInput(input) {
    if (!input || typeof input !== 'string') {
      return null;
    }
    
    const trimmed = input.trim();
    
    // bunker:// URL
    if (trimmed.startsWith('bunker://')) {
      try {
        const url = new URL(trimmed);
        const pubkey = url.hostname || url.pathname.replace(/^\/\//, '');
        const relays = url.searchParams.getAll('relay');
        const secret = url.searchParams.get('secret');
        
        if (!pubkey || pubkey.length !== 64) {
          console.error('[NDK-NIP46] Invalid pubkey in bunker URL');
          return null;
        }
        
        return {
          type: 'bunker',
          pubkey,
          relays: relays.length > 0 ? relays : DEFAULT_NIP46_RELAYS,
          secret: secret || undefined
        };
      } catch (e) {
        console.error('[NDK-NIP46] Failed to parse bunker URL:', e);
        return null;
      }
    }
    
    // NIP-05 identifier (contains @)
    if (trimmed.includes('@')) {
      return {
        type: 'nip05',
        nip05: trimmed
      };
    }
    
    // npub
    if (trimmed.startsWith('npub')) {
      try {
        const decoded = nip19.decode(trimmed);
        if (decoded.type === 'npub') {
          return {
            type: 'npub',
            pubkey: decoded.data,
            relays: DEFAULT_NIP46_RELAYS
          };
        }
      } catch (e) {
        console.error('[NDK-NIP46] Failed to decode npub:', e);
      }
    }
    
    // Raw hex pubkey
    if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      return {
        type: 'npub',
        pubkey: trimmed.toLowerCase(),
        relays: DEFAULT_NIP46_RELAYS
      };
    }
    
    return null;
  }

  /**
   * Get or create the local signer for NIP-46 communication
   * This is stored for session persistence
   * 
   * @param {boolean} forceNew - Force creation of a new signer
   * @returns {NDKPrivateKeySigner}
   */
  static getOrCreateLocalSigner(forceNew = false) {
    if (forceNew) {
      this.localSigner = null;
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(NDK_LOCAL_SIGNER_KEY);
      }
    }
    
    if (this.localSigner) {
      return this.localSigner;
    }
    
    // Try to restore from storage
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(NDK_LOCAL_SIGNER_KEY);
      if (stored) {
        try {
          this.localSigner = new NDKPrivateKeySigner(stored);
          console.log('[NDK-NIP46] Restored local signer from storage');
          return this.localSigner;
        } catch (e) {
          console.warn('[NDK-NIP46] Failed to restore local signer:', e);
          localStorage.removeItem(NDK_LOCAL_SIGNER_KEY);
        }
      }
    }
    
    // Generate new local signer
    console.log('[NDK-NIP46] Generating new local signer');
    this.localSigner = NDKPrivateKeySigner.generate();
    
    // Store for persistence
    if (typeof localStorage !== 'undefined' && this.localSigner.privateKey) {
      localStorage.setItem(NDK_LOCAL_SIGNER_KEY, this.localSigner.privateKey);
    }
    
    return this.localSigner;
  }

  /**
   * Connect using a bunker URL or NIP-05 identifier
   * This is the main entry point for NIP-46 connections
   * 
   * @param {string} bunkerInput - bunker:// URL or NIP-05 (e.g., user@nsec.app)
   * @param {Object} options
   * @param {Function} [options.onAuthUrl] - Callback when signer requests auth URL approval
   * @param {Function} [options.onStatusChange] - Callback for status updates
   * @param {number} [options.timeout] - Connection timeout in ms
   * @returns {Promise<ConnectionResult>}
   */
  static async connect(bunkerInput, options = {}) {
    const { onAuthUrl, onStatusChange, timeout = CONNECTION_TIMEOUT } = options;
    
    console.log('[NDK-NIP46] Starting connection...');
    console.log('[NDK-NIP46] Input:', bunkerInput?.slice(0, 50) + '...');
    
    this.authUrlCallback = onAuthUrl;
    this.currentBunkerInput = bunkerInput;
    
    try {
      // Parse the input to determine connection type
      const parsed = await this.parseBunkerInput(bunkerInput);
      if (!parsed) {
        return { success: false, error: 'Invalid bunker URL or NIP-05 identifier' };
      }
      
      console.log('[NDK-NIP46] Parsed input type:', parsed.type);
      
      this.connectionState = 'connecting';
      onStatusChange?.('connecting');
      
      // Get relays - for NIP-05, we'll resolve them
      let relays = parsed.relays || DEFAULT_NIP46_RELAYS;
      let targetPubkey = parsed.pubkey;
      
      // For NIP-05, resolve the user first
      if (parsed.type === 'nip05') {
        console.log('[NDK-NIP46] Resolving NIP-05:', parsed.nip05);
        
        // Create temporary NDK to resolve NIP-05
        const tempNDK = new NDK({ explicitRelayUrls: DEFAULT_NIP46_RELAYS });
        await tempNDK.connect();
        
        try {
          const user = await NDKUser.fromNip05(parsed.nip05, tempNDK);
          if (!user) {
            return { success: false, error: `Could not resolve NIP-05: ${parsed.nip05}` };
          }
          
          targetPubkey = user.pubkey;
          // Use NIP-46 relays from NIP-05 profile if available
          if (user.nip46Urls && user.nip46Urls.length > 0) {
            relays = user.nip46Urls;
            console.log('[NDK-NIP46] Using NIP-46 relays from profile:', relays);
          }
        } finally {
          // Clean up temp NDK
          // Note: NDK doesn't have explicit disconnect, connections close naturally
        }
      }
      
      console.log('[NDK-NIP46] Target pubkey:', targetPubkey?.slice(0, 16) + '...');
      console.log('[NDK-NIP46] Relays:', relays);
      
      // v60: Store bunker pubkey and relays for retry without secret
      if (parsed.type === 'bunker' && parsed.pubkey) {
        this.currentBunkerPubkey = parsed.pubkey;
        this.currentRelays = relays;
        console.log('[NDK-NIP46] v60: Stored bunker pubkey for potential secretless retry');
      }
      
      // Close any existing bunker NDK
      if (this.bunkerNDK) {
        console.log('[NDK-NIP46] Closing existing bunker NDK');
        this.bunkerNDK = null;
      }
      
      // Create dedicated NDK instance for this bunker connection
      // This follows habla.news pattern - each connection gets its own NDK
      this.bunkerNDK = new NDK({
        explicitRelayUrls: relays,
      });
      
      console.log('[NDK-NIP46] Connecting bunker NDK to relays...');
      await this.bunkerNDK.connect();
      console.log('[NDK-NIP46] Bunker NDK connected');
      
      // Get or create local signer for NIP-46 communication
      const localSigner = this.getOrCreateLocalSigner();
      
      // Create NIP-46 signer
      // v54: Match habla.news pattern EXACTLY - use constructor with bunker URL and NDKPrivateKeySigner object
      // This is what works in production with nsec.app
      console.log('[NDK-NIP46] Creating NDKNip46Signer...');
      console.log('[NDK-NIP46] Input type:', parsed.type);
      console.log('[NDK-NIP46] Secret included:', parsed.secret ? 'yes' : 'no');
      
      // CRITICAL: Use the constructor directly with the full bunker:// URL (or target pubkey for NIP-05)
      // and pass the NDKPrivateKeySigner object, NOT a string/nsec
      // This matches habla.news which works flawlessly with nsec.app
      if (parsed.type === 'bunker') {
        // For bunker:// URLs, pass the full URL as the second parameter
        // The constructor will call bunkerFlowInit() which extracts the secret
        console.log('[NDK-NIP46] Using constructor with bunker URL (habla.news pattern)');
        this.signer = new NDKNip46Signer(this.bunkerNDK, bunkerInput, localSigner);
        
        // Debug: log what NDK extracted from the bunker URL
        console.log('[NDK-NIP46] NDK parsed bunkerPubkey:', this.signer.bunkerPubkey?.slice(0, 16) + '...');
        console.log('[NDK-NIP46] NDK parsed userPubkey:', this.signer.userPubkey || '(none)');
        console.log('[NDK-NIP46] NDK parsed secret:', this.signer.secret ? 'yes (' + this.signer.secret.length + ' chars)' : 'no');
        console.log('[NDK-NIP46] NDK parsed relayUrls:', this.signer.relayUrls);
      } else {
        // For NIP-05 or npub, use constructor with target pubkey
        console.log('[NDK-NIP46] Using constructor with target pubkey');
        this.signer = new NDKNip46Signer(this.bunkerNDK, targetPubkey, localSigner);
      }
      
      // Set up auth URL handler
      this.signer.on('authUrl', (url) => {
        console.log('[NDK-NIP46] Auth URL received:', url);
        this.connectionState = 'awaiting_approval';
        onStatusChange?.('awaiting_approval');
        
        if (onAuthUrl) {
          onAuthUrl(url);
        } else {
          // Default: open in popup
          console.log('[NDK-NIP46] Opening auth URL in popup...');
          window.open(url, 'auth', 'width=600,height=600');
        }
      });
      
      // Wait for signer to be ready (this handles the NIP-46 handshake)
      // v61: Implement retry logic - on "invalid secret", retry WITHOUT the secret
      //      Build a proper bunker:// URL without secret (NDK expects bunker URL format)
      console.log('[NDK-NIP46] v61: Waiting for signer to be ready (with retry logic)...');
      
      const MAX_RETRIES = 5;
      const RETRY_DELAY_MS = 3000; // 3 seconds between retries
      let lastError = null;
      
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`[NDK-NIP46] v61: Connection attempt ${attempt}/${MAX_RETRIES}...`);
          
          // Create timeout promise for this attempt
          const attemptTimeout = Math.min(timeout, 15000); // Max 15s per attempt
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Connection attempt timed out')), attemptTimeout);
          });
          
          // Race between connection and timeout
          const user = await Promise.race([
            this.signer.blockUntilReady(),
            timeoutPromise
          ]);
          
          if (user && user.pubkey) {
            console.log('[NDK-NIP46] v61: Signer ready! User pubkey:', user.pubkey.slice(0, 16) + '...');
            
            this.connectionState = 'connected';
            this.userPublicKey = user.pubkey;
            onStatusChange?.('connected');
            
            // Store session for persistence
            this.storeSession({
              publicKey: user.pubkey,
              bunkerUrl: bunkerInput,
              localSignerPrivkey: localSigner.privateKey,
              relays,
            });
            
            return { success: true, publicKey: user.pubkey };
          }
        } catch (attemptError) {
          lastError = attemptError;
          const errorMsg = attemptError.message || String(attemptError);
          console.log(`[NDK-NIP46] v61: Attempt ${attempt} failed:`, errorMsg);
          
          // Check if this is an "invalid secret" error - means nsec.app needs approval
          if (errorMsg.includes('invalid secret') || errorMsg.includes('secret')) {
            console.log('[NDK-NIP46] v61: Got "invalid secret" - nsec.app needs approval, will retry...');
            this.connectionState = 'awaiting_approval';
            onStatusChange?.('awaiting_approval');
            
            if (attempt < MAX_RETRIES) {
              // Wait before retrying - give user time to approve in nsec.app
              console.log(`[NDK-NIP46] v61: Waiting ${RETRY_DELAY_MS}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
              
              // v61: On retries after "invalid secret", try connecting WITHOUT the secret
              // If the client pubkey was approved in nsec.app, this should work
              // The secret is only for initial authentication; after approval, client is trusted
              console.log('[NDK-NIP46] v61: Re-creating signer for retry (without secret)...');
              
              // Build a bunker URL WITHOUT the secret
              // NDK expects bunker:// format, not raw pubkey
              const bunkerPubkey = this.currentBunkerPubkey || targetPubkey;
              const retryRelays = this.currentRelays || relays || ['wss://relay.nsec.app'];
              
              if (bunkerPubkey) {
                // Construct bunker URL without secret
                const relayParams = retryRelays.map(r => `relay=${encodeURIComponent(r)}`).join('&');
                const retryBunkerUrl = `bunker://${bunkerPubkey}?${relayParams}`;
                console.log('[NDK-NIP46] v61: Retry bunker URL (no secret):', retryBunkerUrl.slice(0, 50) + '...');
                
                this.signer = new NDKNip46Signer(this.bunkerNDK, retryBunkerUrl, localSigner);
              } else {
                console.log('[NDK-NIP46] v61: No bunker pubkey available, using original input');
                this.signer = new NDKNip46Signer(this.bunkerNDK, bunkerInput, localSigner);
              }
              this.signer.on('authUrl', (url) => {
                console.log('[NDK-NIP46] Auth URL received on retry:', url);
                this.connectionState = 'awaiting_approval';
                onStatusChange?.('awaiting_approval');
                if (onAuthUrl) {
                  onAuthUrl(url);
                }
              });
              continue; // Retry
            }
          }
          
          // For other errors or if we've exhausted retries, break
          break;
        }
      }
      
      // If we get here, all retries failed
      throw lastError || new Error('Connection failed after retries');
      
    } catch (error) {
      console.error('[NDK-NIP46] Connection failed:', error);
      
      this.connectionState = 'disconnected';
      onStatusChange?.('disconnected');
      
      // Check for specific error types
      const errorMessage = error.message || String(error);
      
      if (errorMessage.includes('timed out')) {
        return { 
          success: false, 
          error: 'Connection timed out. Please ensure your signer app is open and try again.',
          needsApproval: this.connectionState === 'awaiting_approval'
        };
      }
      
      if (errorMessage.includes('invalid secret') || errorMessage.includes('secret')) {
        return {
          success: false,
          error: 'Please open your signer app (nsec.app) and approve the connection request, then try again.',
          needsApproval: true
        };
      }
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Sign an event using the connected remote signer
   * 
   * @param {Object} eventTemplate - Unsigned event (kind, content, tags, created_at)
   * @returns {Promise<{success: boolean, event?: Object, error?: string}>}
   */
  static async signEvent(eventTemplate) {
    if (!this.signer || this.connectionState !== 'connected') {
      console.error('[NDK-NIP46] Cannot sign: not connected');
      return { success: false, error: 'Not connected to remote signer' };
    }
    
    try {
      console.log('[NDK-NIP46] Signing event kind:', eventTemplate.kind);
      
      // NDK signer expects an NDKEvent, but we can use signEvent directly
      const signedEvent = await this.signer.sign(eventTemplate);
      
      console.log('[NDK-NIP46] Event signed successfully');
      return { success: true, event: signedEvent };
      
    } catch (error) {
      console.error('[NDK-NIP46] Signing failed:', error);
      return { success: false, error: error.message || 'Signing failed' };
    }
  }

  /**
   * Get the user's public key
   * @returns {Promise<string|null>}
   */
  static async getPublicKey() {
    if (this.userPublicKey) {
      return this.userPublicKey;
    }
    
    if (this.signer) {
      try {
        const user = await this.signer.user();
        return user?.pubkey || null;
      } catch (e) {
        console.error('[NDK-NIP46] Failed to get public key:', e);
      }
    }
    
    return null;
  }

  /**
   * Check if there's an active NIP-46 connection
   * @returns {boolean}
   */
  static isConnected() {
    return this.connectionState === 'connected' && this.signer !== null;
  }

  /**
   * Get the current connection state
   * @returns {ConnectionState}
   */
  static getConnectionState() {
    return this.connectionState;
  }

  /**
   * Attempt to restore a previous NIP-46 session
   * 
   * @returns {Promise<ConnectionResult>}
   */
  static async restoreSession() {
    const session = this.getStoredSession();
    if (!session) {
      console.log('[NDK-NIP46] No stored session to restore');
      return { success: false, error: 'No session found' };
    }
    
    console.log('[NDK-NIP46] Attempting to restore session...');
    console.log('[NDK-NIP46] Session pubkey:', session.publicKey?.slice(0, 16) + '...');
    
    try {
      // Restore local signer from session
      if (session.localSignerPrivkey) {
        this.localSigner = new NDKPrivateKeySigner(session.localSignerPrivkey);
      }
      
      // Reconnect using stored bunker URL
      const result = await this.connect(session.bunkerUrl, {
        timeout: 30000 // Shorter timeout for restore
      });
      
      if (result.success) {
        console.log('[NDK-NIP46] Session restored successfully');
        return result;
      }
      
      // If restore failed, clear session
      console.warn('[NDK-NIP46] Session restore failed:', result.error);
      this.clearSession();
      return result;
      
    } catch (error) {
      console.error('[NDK-NIP46] Session restore error:', error);
      this.clearSession();
      return { success: false, error: 'Session expired or invalid' };
    }
  }

  /**
   * Disconnect and clean up the NIP-46 connection
   */
  static async disconnect() {
    console.log('[NDK-NIP46] Disconnecting...');
    
    this.signer = null;
    this.bunkerNDK = null;
    this.localSigner = null;
    this.connectionState = 'disconnected';
    this.userPublicKey = null;
    this.currentBunkerInput = null;
    this.currentBunkerPubkey = null;
    this.currentRelays = null;
    this.authUrlCallback = null;
    
    this.clearSession();
    
    console.log('[NDK-NIP46] Disconnected');
  }

  // =============== Session Storage Methods ===============

  /**
   * Store session data for persistence
   * @param {Object} sessionData
   * @private
   */
  static storeSession(sessionData) {
    if (typeof localStorage !== 'undefined') {
      const session = {
        ...sessionData,
        connectedAt: Date.now()
      };
      localStorage.setItem(NDK_NIP46_SESSION_KEY, JSON.stringify(session));
      console.log('[NDK-NIP46] Session stored');
    }
  }

  /**
   * Get stored session data
   * @returns {NDKSession|null}
   * @private
   */
  static getStoredSession() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const stored = localStorage.getItem(NDK_NIP46_SESSION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  /**
   * Check if a stored session exists
   * @returns {boolean}
   */
  static hasStoredSession() {
    return this.getStoredSession() !== null;
  }

  /**
   * Clear stored session data
   * @private
   */
  static clearSession() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(NDK_NIP46_SESSION_KEY);
      localStorage.removeItem(NDK_LOCAL_SIGNER_KEY);
    }
    console.log('[NDK-NIP46] Session cleared');
  }

  /**
   * Get default relays
   * @returns {string[]}
   */
  static getDefaultRelays() {
    return [...DEFAULT_NIP46_RELAYS];
  }
}

export default NostrConnectServiceNDK;
