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
  'wss://nos.lol'              // Good uptime backup
];

// Storage keys
const NIP46_SESSION_KEY = 'blinkpos_nip46_session';
const NIP46_CLIENT_KEY = 'blinkpos_nip46_clientkey';
const NIP46_PENDING_KEY = 'blinkpos_nip46_pending';

// Connection timeout (2 minutes)
const CONNECTION_TIMEOUT = 120000;

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
   * @returns {Promise<ConnectionResult>}
   */
  static async connectWithBunkerURL(bunkerUrl) {
    try {
      console.log('[NostrConnect] Parsing bunker URL...');
      
      const bunkerPointer = await parseBunkerInput(bunkerUrl);
      if (!bunkerPointer) {
        return { success: false, error: 'Invalid bunker URL format' };
      }
      
      if (bunkerPointer.relays.length === 0) {
        return { success: false, error: 'Bunker URL must include at least one relay' };
      }
      
      const clientSecretKey = this.getOrCreateClientKey();
      
      this.connectionState = 'connecting';
      console.log('[NostrConnect] Connecting to bunker...');
      console.log('[NostrConnect] Signer pubkey:', bunkerPointer.pubkey.slice(0, 16) + '...');
      console.log('[NostrConnect] Relays:', bunkerPointer.relays);
      
      this.signer = BunkerSigner.fromBunker(clientSecretKey, bunkerPointer);
      
      // Establish connection with the remote signer
      await this.signer.connect();
      
      // Get user's public key
      const publicKey = await this.signer.getPublicKey();
      
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
      this.connectionState = 'disconnected';
      this.signer = null;
      console.error('[NostrConnect] Bunker connection failed:', error);
      return { success: false, error: error.message };
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
      console.error('[NostrConnect] Cannot sign: not connected');
      return { success: false, error: 'Not connected to remote signer' };
    }
    
    try {
      console.log('[NostrConnect] Requesting signature for event kind:', eventTemplate.kind);
      
      const signedEvent = await this.signer.signEvent(eventTemplate);
      
      console.log('[NostrConnect] Event signed successfully');
      console.log('[NostrConnect] Event ID:', signedEvent.id.slice(0, 16) + '...');
      
      return { success: true, event: signedEvent };
    } catch (error) {
      console.error('[NostrConnect] Signing failed:', error);
      return { success: false, error: error.message };
    }
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
      return generateSecretKey();
    }
    
    // Try to retrieve existing key
    const stored = localStorage.getItem(NIP46_CLIENT_KEY);
    if (stored) {
      try {
        return hexToBytes(stored);
      } catch (error) {
        console.warn('[NostrConnect] Invalid stored client key, generating new one');
      }
    }
    
    // Generate new ephemeral key
    const newKey = generateSecretKey();
    localStorage.setItem(NIP46_CLIENT_KEY, bytesToHex(newKey));
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
