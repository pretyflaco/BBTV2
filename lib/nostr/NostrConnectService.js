/**
 * NostrConnectService - NIP-46 (Nostr Connect) implementation
 * 
 * Provides relay-based remote signing via the nostr-tools BunkerSigner.
 * This is the recommended method for web apps to communicate with external
 * signers like Amber, as it doesn't rely on unreliable URL schemes.
 * 
 * @see https://github.com/nostr-protocol/nips/blob/master/46.md
 */

import { BunkerSigner, createNostrConnectURI, parseBunkerInput } from 'nostr-tools/nip46';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Default relays for NIP-46 connections
// These relays are known to support NIP-46 well
const DEFAULT_NIP46_RELAYS = [
  'wss://relay.nsec.app',      // Popular NIP-46 relay
  'wss://relay.damus.io',      // Very reliable general relay
  'wss://nos.lol',             // Good uptime backup
  'wss://relay.getportal.cc',  // Portal relay
  'wss://offchain.pub'         // Offchain relay
];

// Storage keys
const NIP46_SESSION_KEY = 'blinkpos_nip46_session';
const NIP46_CLIENT_KEY = 'blinkpos_nip46_clientkey';
const NIP46_PENDING_KEY = 'blinkpos_nip46_pending';

// Connection timeout (2 minutes)
const CONNECTION_TIMEOUT = 120000;

// Bunker connect timeout (30 seconds - shorter than overall timeout)
const BUNKER_CONNECT_TIMEOUT = 30000;

// Post-connect stabilization delay (helps prevent first signing attempt failures)
// Some signers need a moment after connect() before they're ready for sign requests
const POST_CONNECT_DELAY = 500;

/**
 * @typedef {'disconnected' | 'connecting' | 'connected'} ConnectionState
 */

/**
 * @typedef {Object} NIP46Session
 * @property {string} publicKey - User's public key
 * @property {string} signerPubkey - Remote signer's public key
 * @property {string[]} relays - Relays used for the connection
 * @property {number} connectedAt - Timestamp when connection was established
 */

/**
 * @typedef {Object} ConnectionResult
 * @property {boolean} success
 * @property {string} [publicKey] - User's public key if successful
 * @property {string} [error] - Error message if failed
 */

class NostrConnectService {
  /** @type {BunkerSigner|null} */
  static signer = null;
  
  /** @type {ConnectionState} */
  static connectionState = 'disconnected';
  
  /** @type {string|null} */
  static userPublicKey = null;

  /**
   * Generate a nostrconnect:// URI for the user to scan in Amber
   * 
   * @param {Object} options
   * @param {string[]} [options.relays] - Custom relays to use
   * @returns {string} nostrconnect:// URI
   */
  static generateConnectionURI(options = {}) {
    // Generate or retrieve ephemeral client keypair
    const clientSecretKey = this.getOrCreateClientKey();
    const clientPubkey = getPublicKey(clientSecretKey);
    
    // Generate random secret for this connection (16 chars)
    const secretBytes = generateSecretKey();
    const secret = bytesToHex(secretBytes).slice(0, 16);
    
    const relays = options.relays || DEFAULT_NIP46_RELAYS;
    
    const uri = createNostrConnectURI({
      clientPubkey: clientPubkey,
      relays: relays,
      secret: secret,
      name: 'Blink POS',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://track.twentyone.ist',
      perms: ['sign_event:22242', 'get_public_key']  // NIP-98 auth events + pubkey
    });
    
    // Store connection params for reference
    this.storeConnectionParams({ secret, relays, uri });
    
    console.log('[NostrConnect] Generated connection URI');
    console.log('[NostrConnect] Client pubkey:', clientPubkey.slice(0, 16) + '...');
    console.log('[NostrConnect] Relays:', relays);
    
    return uri;
  }

  /**
   * Wait for Amber to connect after user scans QR
   * 
   * @param {string} uri - The nostrconnect:// URI that was displayed
   * @param {number} [timeout] - Connection timeout in ms (default 2 minutes)
   * @returns {Promise<ConnectionResult>}
   */
  static async waitForConnection(uri, timeout = CONNECTION_TIMEOUT) {
    const clientSecretKey = this.getOrCreateClientKey();
    
    try {
      this.connectionState = 'connecting';
      console.log('[NostrConnect] Waiting for connection (timeout:', timeout / 1000, 's)...');
      
      // BunkerSigner.fromURI waits for the connect response from the remote signer
      this.signer = await BunkerSigner.fromURI(
        clientSecretKey,
        uri,
        {
          onauth: (authUrl) => {
            // If remote signer needs additional auth (rare for Amber)
            console.log('[NostrConnect] Auth URL requested:', authUrl);
            // Could open authUrl in a popup if needed
          }
        },
        timeout
      );
      
      console.log('[NostrConnect] Connection established, getting public key...');
      
      // Get the user's public key from the remote signer
      const publicKey = await this.signer.getPublicKey();
      
      // Add stabilization delay to let WebSocket connections settle
      // This helps prevent the first signing attempt from failing
      console.log('[NostrConnect] Adding post-connect stabilization delay...');
      await new Promise(resolve => setTimeout(resolve, POST_CONNECT_DELAY));
      
      this.connectionState = 'connected';
      this.userPublicKey = publicKey;
      
      // Store session for persistence
      this.storeSession({
        publicKey,
        signerPubkey: this.signer.bp.pubkey,
        relays: this.signer.bp.relays
      });
      
      console.log('[NostrConnect] Successfully connected!');
      console.log('[NostrConnect] User pubkey:', publicKey.slice(0, 16) + '...');
      
      return { success: true, publicKey };
    } catch (error) {
      this.connectionState = 'disconnected';
      this.signer = null;
      console.error('[NostrConnect] Connection failed:', error);
      
      // Provide user-friendly error messages
      let errorMessage = error.message;
      if (error.message.includes('timed out')) {
        errorMessage = 'Connection timed out. Please try again.';
      } else if (error.message.includes('closed')) {
        errorMessage = 'Connection was closed. Please try again.';
      }
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Connect using a bunker:// URL provided by the user
   * Alternative flow if QR scanning isn't working
   * 
   * @param {string} bunkerUrl - bunker:// URL from Amber
   * @param {number} [maxRetries=3] - Maximum retry attempts for connection
   * @param {boolean} [forceNewClientKey=false] - Force generation of a new client key
   * @returns {Promise<ConnectionResult>}
   */
  static async connectWithBunkerURL(bunkerUrl, maxRetries = 3, forceNewClientKey = false) {
    try {
      console.log('[NostrConnect] Parsing bunker URL...');
      console.log('[NostrConnect] URL length:', bunkerUrl?.length);
      console.log('[NostrConnect] forceNewClientKey:', forceNewClientKey);
      
      const bunkerPointer = await parseBunkerInput(bunkerUrl);
      if (!bunkerPointer) {
        return { success: false, error: 'Invalid bunker URL format' };
      }
      
      if (bunkerPointer.relays.length === 0) {
        return { success: false, error: 'Bunker URL must include at least one relay' };
      }
      
      // Enhanced debugging for iOS issue
      console.log('[NostrConnect] Bunker pointer parsed:');
      console.log('[NostrConnect]   - pubkey:', bunkerPointer.pubkey?.slice(0, 16) + '...');
      console.log('[NostrConnect]   - secret exists:', !!bunkerPointer.secret);
      console.log('[NostrConnect]   - secret length:', bunkerPointer.secret?.length || 0);
      console.log('[NostrConnect]   - secret preview:', bunkerPointer.secret ? bunkerPointer.secret.slice(0, 8) + '...' : 'none');
      console.log('[NostrConnect]   - relays count:', bunkerPointer.relays?.length);
      
      // Force new client key if requested (helps with "invalid secret" errors)
      if (forceNewClientKey) {
        console.log('[NostrConnect] Forcing new client key generation...');
        this.clearClientKey();
      }
      
      const clientSecretKey = this.getOrCreateClientKey();
      const clientPubkey = getPublicKey(clientSecretKey);
      
      this.connectionState = 'connecting';
      console.log('[NostrConnect] Connecting to bunker...');
      console.log('[NostrConnect] Client pubkey:', clientPubkey.slice(0, 16) + '...');
      console.log('[NostrConnect] Signer pubkey:', bunkerPointer.pubkey.slice(0, 16) + '...');
      console.log('[NostrConnect] Relays:', bunkerPointer.relays);
      
      // Retry logic for bunker connection
      let lastError = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[NostrConnect] Connection attempt ${attempt}/${maxRetries}...`);
          
          // Clean up previous signer if exists
          if (this.signer) {
            try {
              await this.signer.close();
            } catch (e) {
              // Ignore close errors
            }
          }
          
          console.log('[NostrConnect] Creating BunkerSigner from bunker pointer...');
          this.signer = BunkerSigner.fromBunker(clientSecretKey, bunkerPointer);
          
          // Establish connection with the remote signer WITH TIMEOUT
          // nostr-tools signer.connect() has no built-in timeout, so we add one
          console.log('[NostrConnect] Calling signer.connect() with timeout...');
          await this.connectWithTimeout(this.signer, BUNKER_CONNECT_TIMEOUT);
          console.log('[NostrConnect] connect() completed successfully');
          
          // Small delay to let WebSocket connections stabilize
          // This is the primary stabilization delay - crucial for first signing success
          console.log('[NostrConnect] Adding post-connect stabilization delay...');
          await new Promise(resolve => setTimeout(resolve, POST_CONNECT_DELAY));
          
          // Get user's public key with retry
          console.log('[NostrConnect] Getting public key...');
          const publicKey = await this.getPublicKeyWithRetry(3);
          
          this.connectionState = 'connected';
          this.userPublicKey = publicKey;
          
          // Store session for persistence
          this.storeSession({
            publicKey,
            signerPubkey: bunkerPointer.pubkey,
            relays: bunkerPointer.relays
          });
          
          console.log('[NostrConnect] Successfully connected via bunker URL!');
          console.log('[NostrConnect] User pubkey:', publicKey.slice(0, 16) + '...');
          
          return { success: true, publicKey };
        } catch (error) {
          // Handle both Error objects and plain string throws
          const errorMessage = typeof error === 'string' ? error : (error.message || 'no message');
          lastError = typeof error === 'string' ? new Error(error) : error;
          
          console.warn(`[NostrConnect] Attempt ${attempt} failed:`, errorMessage);
          console.warn(`[NostrConnect] Error type:`, typeof error);
          console.warn(`[NostrConnect] Raw error value:`, error);
          
          if (typeof error === 'object') {
            console.warn(`[NostrConnect] Error details:`, JSON.stringify({
              name: error.name,
              message: error.message,
              stack: error.stack?.split('\n').slice(0, 3).join(' | ')
            }));
          }
          
          if (attempt < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s...
            const delay = Math.pow(2, attempt - 1) * 1000;
            console.log(`[NostrConnect] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // All retries failed
      throw lastError || new Error('Connection failed after retries');
    } catch (error) {
      this.connectionState = 'disconnected';
      this.signer = null;
      console.error('[NostrConnect] Bunker connection failed:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get public key with retry logic
   * @private
   */
  static async getPublicKeyWithRetry(maxRetries = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const publicKey = await this.signer.getPublicKey();
        return publicKey;
      } catch (error) {
        lastError = error;
        console.warn(`[NostrConnect] getPublicKey attempt ${attempt} failed:`, error.message);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
      }
    }
    throw lastError || new Error('Failed to get public key');
  }

  /**
   * Connect to bunker with timeout
   * nostr-tools BunkerSigner.connect() has no built-in timeout, so we wrap it
   * 
   * @param {BunkerSigner} signer - The BunkerSigner instance
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<void>}
   * @private
   */
  static async connectWithTimeout(signer, timeout = BUNKER_CONNECT_TIMEOUT) {
    return new Promise((resolve, reject) => {
      let resolved = false;
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.error(`[NostrConnect] connect() timed out after ${timeout}ms`);
          reject(new Error(`Connection timed out after ${timeout / 1000} seconds. The remote signer may not be responding. Please check that the signer app is open and connected to the relay.`));
        }
      }, timeout);
      
      // Call the actual connect
      signer.connect()
        .then(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            resolve();
          }
        })
        .catch((error) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            reject(error);
          }
        });
    });
  }

  /**
   * Sign an event using the connected remote signer
   * 
   * @param {Object} eventTemplate - Unsigned event (kind, content, tags, created_at)
   * @param {number} [maxRetries=3] - Maximum retry attempts
   * @returns {Promise<{success: boolean, event?: Object, error?: string}>}
   */
  static async signEvent(eventTemplate, maxRetries = 3) {
    if (!this.signer || this.connectionState !== 'connected') {
      console.error('[NostrConnect] Cannot sign: not connected');
      return { success: false, error: 'Not connected to remote signer' };
    }
    
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[NostrConnect] Requesting signature for event kind: ${eventTemplate.kind} (attempt ${attempt}/${maxRetries})`);
        
        const signedEvent = await this.signer.signEvent(eventTemplate);
        
        console.log('[NostrConnect] Event signed successfully');
        console.log('[NostrConnect] Event ID:', signedEvent.id.slice(0, 16) + '...');
        
        return { success: true, event: signedEvent };
      } catch (error) {
        lastError = error;
        console.warn(`[NostrConnect] Signing attempt ${attempt} failed:`, error.message);
        
        if (attempt < maxRetries) {
          // Exponential backoff: 500ms, 1000ms, 1500ms...
          const delay = 500 * attempt;
          console.log(`[NostrConnect] Retrying signature in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error('[NostrConnect] Signing failed after all retries:', lastError);
    return { success: false, error: lastError?.message || 'Signing failed' };
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
   * Get the connected user's public key
   * @returns {string|null}
   */
  static getPublicKey() {
    return this.userPublicKey;
  }

  /**
   * Attempt to restore a previous NIP-46 session
   * Called on app startup to reconnect if session exists
   * 
   * @returns {Promise<ConnectionResult>}
   */
  static async restoreSession() {
    const session = this.getStoredSession();
    if (!session) {
      console.log('[NostrConnect] No stored session to restore');
      return { success: false, error: 'No session found' };
    }
    
    console.log('[NostrConnect] Attempting to restore session...');
    console.log('[NostrConnect] Session pubkey:', session.publicKey.slice(0, 16) + '...');
    
    try {
      const clientSecretKey = this.getOrCreateClientKey();
      
      // Reconstruct bunker pointer from session
      const bunkerPointer = {
        pubkey: session.signerPubkey,
        relays: session.relays,
        secret: null
      };
      
      this.connectionState = 'connecting';
      this.signer = BunkerSigner.fromBunker(clientSecretKey, bunkerPointer);
      
      // Verify connection is alive with a ping
      console.log('[NostrConnect] Verifying connection with ping...');
      await this.signer.ping();
      
      // Verify public key matches
      const publicKey = await this.signer.getPublicKey();
      if (publicKey !== session.publicKey) {
        console.warn('[NostrConnect] Public key mismatch, clearing session');
        this.clearSession();
        this.connectionState = 'disconnected';
        this.signer = null;
        return { success: false, error: 'Session invalid' };
      }
      
      this.connectionState = 'connected';
      this.userPublicKey = publicKey;
      
      // Update session timestamp
      this.storeSession({
        ...session,
        connectedAt: Date.now()
      });
      
      console.log('[NostrConnect] Session restored successfully!');
      return { success: true, publicKey };
    } catch (error) {
      console.warn('[NostrConnect] Failed to restore session:', error.message);
      this.clearSession();
      this.connectionState = 'disconnected';
      this.signer = null;
      return { success: false, error: 'Session expired or invalid' };
    }
  }

  /**
   * Disconnect and clean up the NIP-46 connection
   */
  static async disconnect() {
    console.log('[NostrConnect] Disconnecting...');
    
    if (this.signer) {
      try {
        await this.signer.close();
      } catch (error) {
        console.warn('[NostrConnect] Error closing signer:', error);
      }
      this.signer = null;
    }
    
    this.connectionState = 'disconnected';
    this.userPublicKey = null;
    this.clearSession();
    
    console.log('[NostrConnect] Disconnected');
  }

  // =============== Private Helper Methods ===============

  /**
   * Get or create the ephemeral client keypair
   * This key is used to communicate with the remote signer
   * 
   * @returns {Uint8Array} Client secret key
   * @private
   */
  static getOrCreateClientKey() {
    if (typeof localStorage === 'undefined') {
      // Server-side, generate temporary key
      console.log('[NostrConnect] getOrCreateClientKey: Server-side, generating temp key');
      return generateSecretKey();
    }
    
    // Try to retrieve existing key
    const stored = localStorage.getItem(NIP46_CLIENT_KEY);
    console.log('[NostrConnect] getOrCreateClientKey: Stored key exists:', !!stored);
    console.log('[NostrConnect] getOrCreateClientKey: Stored key length:', stored?.length || 0);
    
    if (stored) {
      try {
        const key = hexToBytes(stored);
        const pubkey = getPublicKey(key);
        console.log('[NostrConnect] getOrCreateClientKey: Using existing key, pubkey:', pubkey.slice(0, 16) + '...');
        return key;
      } catch (error) {
        console.warn('[NostrConnect] getOrCreateClientKey: Invalid stored key, error:', error.message);
        console.warn('[NostrConnect] getOrCreateClientKey: Generating new one');
      }
    }
    
    // Generate new ephemeral key
    console.log('[NostrConnect] getOrCreateClientKey: Generating new key');
    const newKey = generateSecretKey();
    const newKeyHex = bytesToHex(newKey);
    localStorage.setItem(NIP46_CLIENT_KEY, newKeyHex);
    
    // Verify it was stored correctly
    const verifyStored = localStorage.getItem(NIP46_CLIENT_KEY);
    console.log('[NostrConnect] getOrCreateClientKey: Storage verification:', verifyStored === newKeyHex ? 'OK' : 'MISMATCH');
    
    const newPubkey = getPublicKey(newKey);
    console.log('[NostrConnect] getOrCreateClientKey: New key pubkey:', newPubkey.slice(0, 16) + '...');
    
    return newKey;
  }

  /**
   * Store pending connection parameters
   * @private
   */
  static storeConnectionParams(params) {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(NIP46_PENDING_KEY, JSON.stringify({
        ...params,
        timestamp: Date.now()
      }));
    }
  }

  /**
   * Get pending connection parameters
   * @returns {Object|null}
   * @private
   */
  static getPendingConnection() {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(NIP46_PENDING_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  /**
   * Clear pending connection
   * @private
   */
  static clearPendingConnection() {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(NIP46_PENDING_KEY);
    }
  }

  /**
   * Store session data for persistence
   * @param {Object} sessionData
   * @private
   */
  static storeSession(sessionData) {
    if (typeof localStorage !== 'undefined') {
      const session = {
        ...sessionData,
        connectedAt: sessionData.connectedAt || Date.now()
      };
      localStorage.setItem(NIP46_SESSION_KEY, JSON.stringify(session));
      console.log('[NostrConnect] Session stored');
    }
  }

  /**
   * Get stored session data
   * @returns {NIP46Session|null}
   * @private
   */
  static getStoredSession() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const stored = localStorage.getItem(NIP46_SESSION_KEY);
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
      localStorage.removeItem(NIP46_SESSION_KEY);
    }
    this.clearPendingConnection();
    console.log('[NostrConnect] Session cleared');
  }

  /**
   * Clear client key (use with caution - will invalidate all sessions)
   */
  static clearClientKey() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(NIP46_CLIENT_KEY);
    }
  }

  /**
   * Get default relays
   * @returns {string[]}
   */
  static getDefaultRelays() {
    return [...DEFAULT_NIP46_RELAYS];
  }
}

export default NostrConnectService;
