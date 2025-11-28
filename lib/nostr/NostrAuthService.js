/**
 * NostrAuthService - Handles Nostr-based authentication
 * 
 * Supports:
 * - NIP-07: Browser extension signing (keys.band, Alby, nos2x)
 * - NIP-55: External signer via Android Intent (Amber)
 * 
 * @see https://github.com/nostr-protocol/nips/blob/master/07.md
 * @see https://github.com/nostr-protocol/nips/blob/master/55.md
 */

/**
 * @typedef {'extension' | 'externalSigner'} SignInMethod
 * 
 * @typedef {Object} AuthResult
 * @property {boolean} success
 * @property {string} [publicKey] - Hex-encoded public key
 * @property {SignInMethod} [method]
 * @property {string} [error]
 * @property {boolean} [pending] - True if waiting for external signer return
 */

/**
 * @typedef {Object} UnsignedEvent
 * @property {number} kind
 * @property {number} created_at
 * @property {string[][]} tags
 * @property {string} content
 */

/**
 * @typedef {Object} SignedEvent
 * @property {string} id
 * @property {string} pubkey
 * @property {number} created_at
 * @property {number} kind
 * @property {string[][]} tags
 * @property {string} content
 * @property {string} sig
 */

const SIGN_IN_STORAGE_KEY = 'blinkpos_signin_flow';
const PUBLIC_KEY_STORAGE_KEY = 'blinkpos_pubkey';
const SIGN_IN_METHOD_KEY = 'blinkpos_signin_method';

class NostrAuthService {
  static METHODS = ['extension', 'externalSigner'];

  /**
   * Check if a Nostr browser extension is available
   * @returns {boolean}
   */
  static isExtensionAvailable() {
    return typeof window !== 'undefined' && !!window.nostr;
  }

  /**
   * Check if we're on a mobile device (likely to have Amber)
   * @returns {boolean}
   */
  static isMobileDevice() {
    if (typeof window === 'undefined') return false;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  /**
   * Get available sign-in methods based on environment
   * @returns {SignInMethod[]}
   */
  static getAvailableMethods() {
    const methods = [];
    
    if (this.isExtensionAvailable()) {
      methods.push('extension');
    }
    
    // External signer (Amber) is always available as an option on mobile
    // and can be tried on desktop too
    methods.push('externalSigner');
    
    return methods;
  }

  /**
   * Sign in with Nostr browser extension (NIP-07)
   * Compatible with: keys.band, Alby, nos2x, Flamingo, etc.
   * 
   * @returns {Promise<AuthResult>}
   */
  static async signInWithExtension() {
    try {
      if (!this.isExtensionAvailable()) {
        return {
          success: false,
          error: 'Nostr extension not found. Please install keys.band, Alby, or another NIP-07 compatible extension.'
        };
      }

      // Request public key from extension
      const publicKey = await window.nostr.getPublicKey();

      // Validate public key format (64 hex characters)
      if (!publicKey || typeof publicKey !== 'string' || publicKey.length !== 64) {
        return {
          success: false,
          error: 'Invalid public key received from extension'
        };
      }

      // Validate it's a valid hex string
      if (!/^[0-9a-f]{64}$/i.test(publicKey)) {
        return {
          success: false,
          error: 'Invalid public key format (must be 64 hex characters)'
        };
      }

      // Normalize to lowercase for consistent storage and comparison
      const normalizedPublicKey = publicKey.toLowerCase();

      // Store auth data with normalized key
      this.storeAuthData(normalizedPublicKey, 'extension');

      return {
        success: true,
        publicKey: normalizedPublicKey,
        method: 'extension'
      };
    } catch (error) {
      console.error('Extension sign in failed:', error);
      
      // Handle user rejection
      if (error.message?.includes('rejected') || error.message?.includes('denied')) {
        return {
          success: false,
          error: 'Sign-in was rejected. Please approve the request in your extension.'
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Extension sign in failed'
      };
    }
  }

  /**
   * Sign in with external signer (NIP-55)
   * Compatible with: Amber (Android)
   * 
   * This initiates a redirect to the signer app. The user will return
   * to the app after signing, and handleExternalSignerReturn() should
   * be called to complete the flow.
   * 
   * @param {string} [callbackUrl] - Optional callback URL for the signer to return to
   * @returns {Promise<AuthResult>}
   */
  static async signInWithExternalSigner(callbackUrl) {
    try {
      // Store sign-in flow data for when user returns
      const signInData = {
        flow: 'externalSigner',
        timestamp: Date.now(),
        callbackUrl: callbackUrl || window.location.href
      };
      
      sessionStorage.setItem(SIGN_IN_STORAGE_KEY, JSON.stringify(signInData));

      // Build nostrsigner URL
      // The signer will copy the public key to clipboard (or use callback)
      let nostrSignerURL = 'nostrsigner:?compressionType=none&returnType=signature&type=get_public_key';
      
      // Add callback URL if provided (for web flow)
      if (callbackUrl) {
        nostrSignerURL += `&callbackUrl=${encodeURIComponent(callbackUrl)}`;
      }

      // Set up visibility change listener to detect when signer opens
      const navigationPromise = new Promise((resolve) => {
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'hidden') {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            resolve(true);
          }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Navigate to signer
        window.location.href = nostrSignerURL;

        // Timeout if no navigation occurs (signer not installed)
        setTimeout(() => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          resolve(false);
        }, 3000);
      });

      const navigationOccurred = await navigationPromise;

      if (!navigationOccurred) {
        sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);
        return {
          success: false,
          error: 'No external signer found. Please install Amber or another NIP-55 compatible signer app.'
        };
      }

      // Return pending state - the actual completion happens in handleExternalSignerReturn
      return {
        success: true,
        method: 'externalSigner',
        pending: true
      };
    } catch (error) {
      console.error('External signer sign in failed:', error);
      sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'External signer sign in failed'
      };
    }
  }

  /**
   * Handle return from external signer
   * Should be called when the app regains focus after external signer flow
   * 
   * @returns {Promise<AuthResult>}
   */
  static async handleExternalSignerReturn() {
    try {
      const signInDataStr = sessionStorage.getItem(SIGN_IN_STORAGE_KEY);
      
      if (!signInDataStr) {
        return {
          success: false,
          error: 'No pending sign-in flow found'
        };
      }

      const signInData = JSON.parse(signInDataStr);
      
      if (signInData.flow !== 'externalSigner') {
        return {
          success: false,
          error: 'Invalid sign-in flow'
        };
      }

      // Check if the flow is too old (more than 5 minutes)
      if (Date.now() - signInData.timestamp > 5 * 60 * 1000) {
        sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);
        return {
          success: false,
          error: 'Sign-in session expired. Please try again.'
        };
      }

      // Clear the sign-in flow data
      sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);

      // Try to get public key from clipboard
      const publicKey = await this.getPublicKeyFromClipboard();
      
      if (!publicKey) {
        return {
          success: false,
          error: 'Could not retrieve public key. Please ensure you approved the request in Amber.'
        };
      }

      // Store auth data
      this.storeAuthData(publicKey, 'externalSigner');

      return {
        success: true,
        publicKey,
        method: 'externalSigner'
      };
    } catch (error) {
      console.error('External signer return handling failed:', error);
      sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to complete sign-in'
      };
    }
  }

  /**
   * Check if there's a pending external signer flow
   * @returns {boolean}
   */
  static hasPendingExternalSignerFlow() {
    try {
      const signInDataStr = sessionStorage.getItem(SIGN_IN_STORAGE_KEY);
      if (!signInDataStr) return false;
      
      const signInData = JSON.parse(signInDataStr);
      return signInData.flow === 'externalSigner';
    } catch {
      return false;
    }
  }

  /**
   * Read raw text from clipboard (used for signed events)
   * Returns the raw clipboard content without any parsing/transformation
   * 
   * @param {string} fallbackPromptMessage - Message to show if clipboard access fails
   * @returns {Promise<string|null>}
   */
  static async getRawClipboardText(fallbackPromptMessage = 'Please paste from clipboard:') {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.readText) {
        // Retry a few times to account for timing after app switch
        for (let i = 0; i < 10; i++) {
          try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) return text.trim();
          } catch (clipboardError) {
            console.warn('Clipboard read attempt failed:', clipboardError);
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Fallback: prompt user to paste manually
      const manualInput = window.prompt(fallbackPromptMessage);
      return manualInput ? manualInput.trim() : null;
    } catch (error) {
      console.error('Clipboard access failed:', error);
      return null;
    }
  }

  /**
   * Get public key from clipboard (used after external signer return)
   * Handles multiple formats: hex, npub, nostr:npub
   * 
   * @returns {Promise<string|null>}
   */
  static async getPublicKeyFromClipboard() {
    const rawText = await this.getRawClipboardText(
      'Please paste your public key from Amber:\n\n' +
      '(Amber should have copied it to your clipboard)'
    );
    
    if (rawText) {
      return this.parsePublicKey(rawText);
    }
    
    return null;
  }

  /**
   * Parse a public key from various formats
   * Supports: hex, npub1..., nostr:npub1...
   * 
   * @param {string} input
   * @returns {string|null}
   */
  static parsePublicKey(input) {
    if (!input || typeof input !== 'string') return null;

    const trimmed = input.trim();

    // Remove nostr: prefix if present
    const cleaned = trimmed.replace(/^nostr:/i, '');

    // Check if it's already a valid hex pubkey
    if (/^[0-9a-f]{64}$/i.test(cleaned)) {
      return cleaned.toLowerCase();
    }

    // Check if it's an npub (bech32 encoded)
    if (/^npub1[0-9a-z]+$/i.test(cleaned)) {
      try {
        const decoded = this.decodeBech32(cleaned);
        if (decoded && decoded.prefix === 'npub' && decoded.data.length === 32) {
          return this.bytesToHex(decoded.data);
        }
      } catch (e) {
        console.warn('Failed to decode npub:', e);
      }
    }

    return null;
  }

  /**
   * Sign a Nostr event using the current authentication method
   * 
   * For extension method: Returns the signed event directly.
   * For external signer: Throws and redirects to signer app.
   *   Use handleSignEventReturn() on page reload to get the signed event.
   * 
   * @param {UnsignedEvent} event
   * @returns {Promise<SignedEvent>}
   * @throws {Error} If using external signer (will redirect)
   */
  static async signEvent(event) {
    const method = this.getCurrentMethod();
    
    if (!method) {
      throw new Error('Not authenticated. Please sign in first.');
    }

    if (method === 'extension') {
      return await this.signEventWithExtension(event);
    } else if (method === 'externalSigner') {
      // This will throw and redirect - does not return
      this.signEventWithExternalSigner(event);
      // Unreachable, but TypeScript/editors may not know that
      throw new Error('Redirecting to external signer');
    }

    throw new Error(`Unknown sign-in method: ${method}`);
  }

  /**
   * Sign event using browser extension (NIP-07)
   * @param {UnsignedEvent} event
   * @returns {Promise<SignedEvent>}
   */
  static async signEventWithExtension(event) {
    if (!this.isExtensionAvailable()) {
      throw new Error('Nostr extension not available');
    }

    // Ensure pubkey is set
    if (!event.pubkey) {
      event.pubkey = await window.nostr.getPublicKey();
    }

    return await window.nostr.signEvent(event);
  }

  /**
   * Sign event using external signer (NIP-55)
   * This will redirect to the signer app
   * 
   * IMPORTANT: This method triggers a page redirect and does not return.
   * The calling code must handle the return flow separately by checking
   * for pending sign event data when the page reloads.
   * 
   * @param {UnsignedEvent} event
   * @throws {Error} Always throws to indicate redirect will occur
   */
  static signEventWithExternalSigner(event) {
    // Store the event data for when we return
    const signData = {
      flow: 'signEvent',
      event,
      timestamp: Date.now()
    };
    
    sessionStorage.setItem(SIGN_IN_STORAGE_KEY, JSON.stringify(signData));

    // Build nostrsigner URL
    const eventJson = encodeURIComponent(JSON.stringify(event));
    const nostrSignerURL = `nostrsigner:${eventJson}?compressionType=none&returnType=event&type=sign_event`;

    // Redirect to signer - this will navigate away from the page
    window.location.href = nostrSignerURL;

    // Throw to make it clear this function doesn't return normally
    // The page will redirect, so this code may not even execute
    throw new Error('Redirecting to external signer. Handle return flow on page reload.');
  }

  /**
   * Check if there's a pending sign event flow and retrieve the signed event
   * Call this on page load to complete external signer sign event flow
   * 
   * @returns {Promise<{pending: boolean, event?: SignedEvent, error?: string}>}
   */
  static async handleSignEventReturn() {
    try {
      const signDataStr = sessionStorage.getItem(SIGN_IN_STORAGE_KEY);
      
      if (!signDataStr) {
        return { pending: false };
      }

      const signData = JSON.parse(signDataStr);
      
      if (signData.flow !== 'signEvent') {
        return { pending: false };
      }

      // Check if too old (more than 5 minutes)
      if (Date.now() - signData.timestamp > 5 * 60 * 1000) {
        sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);
        return { pending: false, error: 'Sign event session expired' };
      }

      // Clear the flow data
      sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);

      // Try to get raw signed event JSON from clipboard
      // Note: We use getRawClipboardText(), not getPublicKeyFromClipboard()
      // because signed events are JSON objects, not public key strings
      const clipboardText = await this.getRawClipboardText(
        'Please paste the signed event from Amber:\n\n' +
        '(Amber should have copied it to your clipboard)'
      );
      
      if (!clipboardText) {
        return { pending: true, error: 'Could not retrieve signed event from clipboard' };
      }

      // Try to parse as JSON (signed event)
      try {
        const signedEvent = JSON.parse(clipboardText);
        if (signedEvent.id && signedEvent.sig && signedEvent.pubkey) {
          return { pending: true, event: signedEvent };
        }
        return { pending: true, error: 'Signed event missing required fields (id, sig, pubkey)' };
      } catch (parseError) {
        console.error('Failed to parse signed event JSON:', parseError);
        return { pending: true, error: 'Invalid signed event JSON format' };
      }
    } catch (error) {
      console.error('Handle sign event return failed:', error);
      sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);
      return { pending: false, error: error.message };
    }
  }

  /**
   * Create a NIP-98 HTTP Auth event for server authentication
   * 
   * @param {string} url - The URL being authenticated to
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @returns {Promise<SignedEvent>}
   */
  static async createAuthEvent(url, method = 'GET') {
    const event = {
      kind: 27235, // NIP-98 HTTP Auth
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['u', url],
        ['method', method.toUpperCase()]
      ],
      content: ''
    };

    return await this.signEvent(event);
  }

  /**
   * Store authentication data
   * @param {string} publicKey
   * @param {SignInMethod} method
   */
  static storeAuthData(publicKey, method) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, publicKey);
      localStorage.setItem(SIGN_IN_METHOD_KEY, method);
    }
  }

  /**
   * Get stored authentication data
   * @returns {{publicKey: string|null, method: SignInMethod|null}}
   */
  static getStoredAuthData() {
    if (typeof localStorage === 'undefined') {
      return { publicKey: null, method: null };
    }

    return {
      publicKey: localStorage.getItem(PUBLIC_KEY_STORAGE_KEY),
      method: localStorage.getItem(SIGN_IN_METHOD_KEY)
    };
  }

  /**
   * Get current user's public key
   * @returns {string|null}
   */
  static getCurrentPublicKey() {
    return this.getStoredAuthData().publicKey;
  }

  /**
   * Get current sign-in method
   * @returns {SignInMethod|null}
   */
  static getCurrentMethod() {
    return this.getStoredAuthData().method;
  }

  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  static isAuthenticated() {
    const { publicKey, method } = this.getStoredAuthData();
    return !!publicKey && !!method && this.METHODS.includes(method);
  }

  /**
   * Clear authentication data (logout)
   */
  static clearAuthData() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY);
      localStorage.removeItem(SIGN_IN_METHOD_KEY);
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SIGN_IN_STORAGE_KEY);
    }
  }

  /**
   * Encrypt data using NIP-04 (via extension)
   * @param {string} recipientPubkey
   * @param {string} plaintext
   * @returns {Promise<string>}
   */
  static async nip04Encrypt(recipientPubkey, plaintext) {
    const method = this.getCurrentMethod();
    
    if (method === 'extension' && window.nostr?.nip04?.encrypt) {
      return await window.nostr.nip04.encrypt(recipientPubkey, plaintext);
    }
    
    throw new Error('NIP-04 encryption not available with current sign-in method');
  }

  /**
   * Decrypt data using NIP-04 (via extension)
   * @param {string} senderPubkey
   * @param {string} ciphertext
   * @returns {Promise<string>}
   */
  static async nip04Decrypt(senderPubkey, ciphertext) {
    const method = this.getCurrentMethod();
    
    if (method === 'extension' && window.nostr?.nip04?.decrypt) {
      return await window.nostr.nip04.decrypt(senderPubkey, ciphertext);
    }
    
    throw new Error('NIP-04 decryption not available with current sign-in method');
  }

  /**
   * Get user's relay list from extension
   * @returns {Promise<Object|null>}
   */
  static async getRelays() {
    if (this.isExtensionAvailable() && window.nostr.getRelays) {
      try {
        return await window.nostr.getRelays();
      } catch {
        return null;
      }
    }
    return null;
  }

  // ============= Utility Methods =============

  /**
   * Simple bech32 decoder for npub
   * @param {string} bech32str
   * @returns {{prefix: string, data: Uint8Array}}
   */
  static decodeBech32(bech32str) {
    const ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    const str = bech32str.toLowerCase();
    
    const sepIndex = str.lastIndexOf('1');
    if (sepIndex < 1) throw new Error('Invalid bech32');
    
    const prefix = str.slice(0, sepIndex);
    const dataStr = str.slice(sepIndex + 1);
    
    // Decode data part
    const data = [];
    for (const char of dataStr) {
      const idx = ALPHABET.indexOf(char);
      if (idx === -1) throw new Error('Invalid character');
      data.push(idx);
    }
    
    // Remove checksum (last 6 characters)
    const values = data.slice(0, -6);
    
    // Convert 5-bit groups to 8-bit bytes
    let acc = 0;
    let bits = 0;
    const result = [];
    
    for (const value of values) {
      acc = (acc << 5) | value;
      bits += 5;
      while (bits >= 8) {
        bits -= 8;
        result.push((acc >> bits) & 0xff);
      }
    }
    
    return { prefix, data: new Uint8Array(result) };
  }

  /**
   * Convert bytes to hex string
   * @param {Uint8Array} bytes
   * @returns {string}
   */
  static bytesToHex(bytes) {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert hex string to bytes
   * @param {string} hex
   * @returns {Uint8Array}
   */
  static hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  // ============= NIP-98 Server Authentication =============

  /**
   * Create a NIP-98 Authorization header value
   * @param {Object} signedEvent - Signed Nostr event
   * @returns {string} - Authorization header value
   */
  static createNip98AuthHeader(signedEvent) {
    const eventJson = JSON.stringify(signedEvent);
    const base64Event = btoa(eventJson);
    return `Nostr ${base64Event}`;
  }

  /**
   * Perform NIP-98 authenticated login with the server
   * Creates a NIP-98 event, signs it, and sends to /api/auth/nostr-login
   * 
   * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
   */
  static async nip98Login() {
    if (!this.isAuthenticated()) {
      return { success: false, error: 'Not signed in with Nostr' };
    }

    try {
      // Build the login URL
      const loginUrl = `${window.location.origin}/api/auth/nostr-login`;

      // Create and sign NIP-98 event
      const signedEvent = await this.createAuthEvent(loginUrl, 'POST');

      if (!signedEvent) {
        return { success: false, error: 'Failed to sign NIP-98 event' };
      }

      // Create Authorization header
      const authHeader = this.createNip98AuthHeader(signedEvent);

      // Send login request
      const response = await fetch('/api/auth/nostr-login', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        credentials: 'include' // Include cookies in response
      });

      const data = await response.json();

      if (!response.ok) {
        return { 
          success: false, 
          error: data.error || 'Login failed',
          details: data.details
        };
      }

      return {
        success: true,
        user: data.user
      };
    } catch (error) {
      console.error('NIP-98 login error:', error);
      return { 
        success: false, 
        error: error.message || 'Login failed'
      };
    }
  }

  /**
   * Create a NIP-98 authenticated fetch wrapper
   * Automatically adds NIP-98 Authorization header to requests
   * 
   * @param {string} url - URL to fetch
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>}
   */
  static async nip98Fetch(url, options = {}) {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated with Nostr');
    }

    // Get full URL
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;

    // Create and sign NIP-98 event
    const method = options.method || 'GET';
    const signedEvent = await this.createAuthEvent(fullUrl, method);

    if (!signedEvent) {
      throw new Error('Failed to sign NIP-98 event');
    }

    // Create Authorization header
    const authHeader = this.createNip98AuthHeader(signedEvent);

    // Merge headers
    const headers = {
      ...options.headers,
      'Authorization': authHeader
    };

    // Perform fetch with NIP-98 auth
    return fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });
  }
}

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NostrAuthService;
}

// For ES modules
export default NostrAuthService;
export { NostrAuthService };

