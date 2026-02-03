/**
 * NostrAuthService - Handles Nostr-based authentication
 * 
 * Supports:
 * - NIP-07: Browser extension signing (keys.band, Alby, nos2x)
 * - NIP-55: External signer via Android Intent (Amber)
 * - Generated: In-app key generation with encrypted local storage
 * 
 * @see https://github.com/nostr-protocol/nips/blob/master/07.md
 * @see https://github.com/nostr-protocol/nips/blob/master/55.md
 */

// Import noble curves for in-app key generation and signing
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils';
import { logAuth, logAuthError, logAuthWarn } from '../version.js';

/**
 * @typedef {'extension' | 'externalSigner' | 'generated'} SignInMethod
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

// Use localStorage for signer flow (persists across page reloads/redirects)
const SIGN_IN_STORAGE_KEY = 'blinkpos_signin_flow';
const PUBLIC_KEY_STORAGE_KEY = 'blinkpos_pubkey';
const SIGN_IN_METHOD_KEY = 'blinkpos_signin_method';
// Storage key for encrypted private key (in-app generated accounts)
const ENCRYPTED_NSEC_KEY = 'blinkpos_encrypted_nsec';
// URL parameter that indicates return from external signer
const SIGNER_RETURN_PARAM = 'nostr_return';

/**
 * Check if running as an installed PWA (standalone mode)
 * @returns {boolean}
 */
function isPWAMode() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || 
         window.navigator.standalone === true;
}

/**
 * Navigate to a custom URL scheme (nostrsigner:)
 * PWA standalone mode blocks some navigation methods, so we try multiple approaches.
 * 
 * @param {string} url - The nostrsigner: URL to open
 * @param {string} [context] - Description for logging
 * @returns {Promise<boolean>} - True if navigation was initiated (doesn't mean app opened)
 */
async function navigateToSignerUrl(url, context = 'unknown') {
  const inPWA = isPWAMode();
  logAuth('NostrAuthService', `navigateToSignerUrl (${context}), PWA mode: ${inPWA}`);
  logAuth('NostrAuthService', `URL (first 100 chars): ${url.substring(0, 100)}...`);
  
  // Method 1: In PWA mode, try using an anchor element with target="_blank"
  // This can break out of the PWA webview and trigger the URL scheme handler
  if (inPWA) {
    logAuth('NostrAuthService', 'PWA detected, trying anchor element with _blank target...');
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      logAuth('NostrAuthService', 'Anchor click triggered');
      // Small delay to let the navigation start
      await new Promise(resolve => setTimeout(resolve, 100));
      return true;
    } catch (e) {
      logAuthWarn('NostrAuthService', 'Anchor method failed:', e);
    }
  }
  
  // Method 2: Try window.open() - works in some browsers/PWA contexts
  if (inPWA) {
    logAuth('NostrAuthService', 'Trying window.open()...');
    try {
      const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
      if (newWindow !== null) {
        logAuth('NostrAuthService', 'window.open() succeeded');
        return true;
      } else {
        logAuth('NostrAuthService', 'window.open() returned null (blocked by popup blocker or PWA)');
      }
    } catch (e) {
      logAuthWarn('NostrAuthService', 'window.open() failed:', e);
    }
  }
  
  // Method 3: Direct location assignment (standard method, works in browser, may be blocked in PWA for step 2)
  // Use setTimeout to defer navigation to next event loop tick - this ensures React finishes rendering
  // and the browser doesn't ignore the navigation due to pending JavaScript
  logAuth('NostrAuthService', 'Scheduling deferred navigation via setTimeout...');
  
  return new Promise((resolve) => {
    // Schedule for next event loop tick
    setTimeout(() => {
      logAuth('NostrAuthService', 'Deferred navigation executing now...');
      try {
        // Try location.replace first - this is more "forceful" and replaces the current history entry
        logAuth('NostrAuthService', 'Trying window.location.replace()...');
        window.location.replace(url);
        logAuth('NostrAuthService', 'location.replace() called');
        resolve(true);
      } catch (e) {
        logAuthWarn('NostrAuthService', 'location.replace() failed:', e);
        
        // Fall back to location.href
        try {
          logAuth('NostrAuthService', 'Trying window.location.href assignment...');
          window.location.href = url;
          logAuth('NostrAuthService', 'location.href assigned');
          resolve(true);
        } catch (e2) {
          logAuthError('NostrAuthService', 'location.href assignment failed:', e2);
          
          // Last resort: location.assign()
          try {
            logAuth('NostrAuthService', 'Trying window.location.assign()...');
            window.location.assign(url);
            logAuth('NostrAuthService', 'location.assign() called');
            resolve(true);
          } catch (e3) {
            logAuthError('NostrAuthService', 'All navigation methods failed');
            resolve(false);
          }
        }
      }
    }, 50); // Small delay to ensure React finishes
  });
}

class NostrAuthService {
  static METHODS = ['extension', 'externalSigner', 'generated', 'nostrConnect'];

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
    
    // Generated keys are always available
    methods.push('generated');
    
    return methods;
  }

  // ============= In-App Key Generation Methods =============

  /**
   * Generate a new Nostr keypair
   * @returns {{privateKey: string, publicKey: string}} - Both keys as hex strings
   */
  static generateKeypair() {
    // Generate random 32-byte private key
    const privateKeyBytes = randomBytes(32);
    const privateKey = bytesToHex(privateKeyBytes);
    
    // Derive public key using schnorr
    const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes);
    const publicKey = bytesToHex(publicKeyBytes);
    
    return { privateKey, publicKey };
  }

  /**
   * Get public key from a private key
   * @param {string} privateKey - Hex-encoded private key
   * @returns {string} - Hex-encoded public key
   */
  static getPublicKeyFromPrivate(privateKey) {
    const privateKeyBytes = hexToBytes(privateKey);
    const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes);
    return bytesToHex(publicKeyBytes);
  }

  /**
   * Check if there's an encrypted nsec stored locally
   * @returns {boolean}
   */
  static hasStoredEncryptedNsec() {
    if (typeof localStorage === 'undefined') return false;
    return !!localStorage.getItem(ENCRYPTED_NSEC_KEY);
  }

  /**
   * Store encrypted nsec in localStorage
   * @param {Object} encryptedData - Encrypted data object from CryptoUtils
   */
  static storeEncryptedNsec(encryptedData) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ENCRYPTED_NSEC_KEY, JSON.stringify(encryptedData));
    }
  }

  /**
   * Get stored encrypted nsec
   * @returns {Object|null} - Encrypted data object or null
   */
  static getStoredEncryptedNsec() {
    if (typeof localStorage === 'undefined') return null;
    const stored = localStorage.getItem(ENCRYPTED_NSEC_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  /**
   * Clear stored encrypted nsec (use with caution!)
   */
  static clearEncryptedNsec() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ENCRYPTED_NSEC_KEY);
    }
  }

  /**
   * Sign event using locally stored private key (for 'generated' method)
   * Requires the decrypted private key to be passed in
   * 
   * @param {UnsignedEvent} event - Event to sign
   * @param {string} privateKey - Hex-encoded private key
   * @returns {SignedEvent} - Signed event
   */
  static signEventWithPrivateKey(event, privateKey) {
    const publicKey = this.getPublicKeyFromPrivate(privateKey);
    
    // Build the event with pubkey
    const eventWithPubkey = {
      ...event,
      pubkey: publicKey
    };

    // Calculate event ID (SHA256 of serialized event)
    const serialized = JSON.stringify([
      0,
      eventWithPubkey.pubkey,
      eventWithPubkey.created_at,
      eventWithPubkey.kind,
      eventWithPubkey.tags,
      eventWithPubkey.content
    ]);
    
    const eventIdBytes = sha256(new TextEncoder().encode(serialized));
    const eventId = bytesToHex(eventIdBytes);

    // Sign the event ID with schnorr
    const privateKeyBytes = hexToBytes(privateKey);
    const signatureBytes = schnorr.sign(eventIdBytes, privateKeyBytes);
    const signature = bytesToHex(signatureBytes);

    // Return complete signed event
    return {
      id: eventId,
      pubkey: publicKey,
      created_at: eventWithPubkey.created_at,
      kind: eventWithPubkey.kind,
      tags: eventWithPubkey.tags,
      content: eventWithPubkey.content,
      sig: signature
    };
  }

  /**
   * Temporarily store decrypted private key in memory for signing
   * This is cleared on page refresh or when clearSessionPrivateKey() is called
   * @private
   */
  static _sessionPrivateKey = null;

  /**
   * Set session private key (call after password verification)
   * @param {string} privateKey - Decrypted private key
   */
  static setSessionPrivateKey(privateKey) {
    this._sessionPrivateKey = privateKey;
  }

  /**
   * Get session private key
   * @returns {string|null}
   */
  static getSessionPrivateKey() {
    return this._sessionPrivateKey;
  }

  /**
   * Clear session private key from memory
   */
  static clearSessionPrivateKey() {
    this._sessionPrivateKey = null;
  }

  /**
   * Sign in with generated keys (create new account)
   * The caller is responsible for encrypting the private key with CryptoUtils
   * 
   * @param {string} publicKey - Hex-encoded public key
   * @param {string} privateKey - Hex-encoded private key (will be stored in session)
   * @returns {AuthResult}
   */
  static signInWithGeneratedKeys(publicKey, privateKey) {
    try {
      // Validate keys
      if (!publicKey || publicKey.length !== 64 || !/^[0-9a-f]{64}$/i.test(publicKey)) {
        return { success: false, error: 'Invalid public key' };
      }
      if (!privateKey || privateKey.length !== 64 || !/^[0-9a-f]{64}$/i.test(privateKey)) {
        return { success: false, error: 'Invalid private key' };
      }

      // Verify the keys match
      const derivedPubkey = this.getPublicKeyFromPrivate(privateKey);
      if (derivedPubkey.toLowerCase() !== publicKey.toLowerCase()) {
        return { success: false, error: 'Public key does not match private key' };
      }

      // Store auth data
      this.storeAuthData(publicKey.toLowerCase(), 'generated');
      
      // Store private key in session for signing
      this.setSessionPrivateKey(privateKey);

      return {
        success: true,
        publicKey: publicKey.toLowerCase(),
        method: 'generated'
      };
    } catch (error) {
      logAuthError('NostrAuthService', 'Generated key sign in failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sign in with generated keys'
      };
    }
  }

  /**
   * Sign in with password (for returning users with stored encrypted nsec)
   * The caller must decrypt the nsec using CryptoUtils and pass the result
   * 
   * @param {string} privateKey - Decrypted private key
   * @returns {AuthResult}
   */
  static signInWithDecryptedKey(privateKey) {
    try {
      // Derive public key from private key
      const publicKey = this.getPublicKeyFromPrivate(privateKey);
      
      // Store auth data
      this.storeAuthData(publicKey.toLowerCase(), 'generated');
      
      // Store private key in session for signing
      this.setSessionPrivateKey(privateKey);

      return {
        success: true,
        publicKey: publicKey.toLowerCase(),
        method: 'generated'
      };
    } catch (error) {
      logAuthError('NostrAuthService', 'Decrypted key sign in failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sign in'
      };
    }
  }

  /**
   * Sign in with Nostr Connect (NIP-46)
   * Called after successful NIP-46 connection via NostrConnectService
   * 
   * @param {string} publicKey - Public key from connected remote signer
   * @returns {AuthResult}
   */
  static signInWithNostrConnect(publicKey) {
    try {
      // Validate public key format
      if (!publicKey || publicKey.length !== 64 || !/^[0-9a-f]{64}$/i.test(publicKey)) {
        return { success: false, error: 'Invalid public key' };
      }

      const normalizedPublicKey = publicKey.toLowerCase();

      // Store auth data with nostrConnect method
      this.storeAuthData(normalizedPublicKey, 'nostrConnect');

      logAuth('NostrAuthService', 'Signed in with Nostr Connect, pubkey:', normalizedPublicKey.slice(0, 16) + '...');

      return {
        success: true,
        publicKey: normalizedPublicKey,
        method: 'nostrConnect'
      };
    } catch (error) {
      logAuthError('NostrAuthService', 'Nostr Connect sign in failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sign in with Nostr Connect'
      };
    }
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
      logAuthError('NostrAuthService', 'Extension sign in failed:', error);
      
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
   * Compatible with: Amber (Android), Nowser (iOS/Android)
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
      // Build callback URL with return indicator
      // IMPORTANT: Amber concatenates the result directly to the callback URL
      // So we need to end with "&pubkey=" so it becomes "&pubkey={result}"
      const currentUrl = new URL(window.location.href);
      // Remove any existing signer params
      currentUrl.searchParams.delete(SIGNER_RETURN_PARAM);
      currentUrl.searchParams.delete('pubkey');
      // Add return indicator
      currentUrl.searchParams.set(SIGNER_RETURN_PARAM, '1');
      // Add pubkey= at the end - Amber will append the actual pubkey
      const returnUrl = callbackUrl || (currentUrl.toString() + '&pubkey=');

      // Store sign-in flow data in localStorage (persists across page reloads)
      const signInData = {
        flow: 'externalSigner',
        timestamp: Date.now(),
        callbackUrl: returnUrl
      };
      
      // Use localStorage instead of sessionStorage (survives page reload)
      localStorage.setItem(SIGN_IN_STORAGE_KEY, JSON.stringify(signInData));

      // Build nostrsigner URL for NIP-55
      // iOS requires nostrsigner:// format, Android uses nostrsigner:
      // Both Amber and Nowser support the query params: type, callbackUrl
      const params = new URLSearchParams({
        type: 'get_public_key',
        callbackUrl: returnUrl,
        returnType: 'signature',
        compressionType: 'none',
        appName: 'Blink POS'  // App name shown in signer (e.g., Amber)
      });
      
      // Detect iOS to use the correct URL format
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      
      // iOS Safari requires a valid URL structure with host/path
      // nostrsigner://sign?... works on iOS
      // Android uses nostrsigner:?... format
      let nostrSignerURL;
      if (isIOS) {
        // For iOS, use nostrsigner://sign?... format (valid URL with path)
        nostrSignerURL = 'nostrsigner://sign?' + params.toString();
      } else {
        // For Android, use nostrsigner:?... format (NIP-55 standard)
        nostrSignerURL = 'nostrsigner:?' + params.toString();
      }
      
      logAuth('NostrAuthService', 'Opening external signer with URL:', nostrSignerURL);
      logAuth('NostrAuthService', 'Callback URL:', returnUrl);
      logAuth('NostrAuthService', 'Platform:', isIOS ? 'iOS' : 'Android/Other');

      // Navigate to signer app using PWA-compatible method
      await navigateToSignerUrl(nostrSignerURL, 'signInWithExternalSigner');

      // Return pending state immediately - the actual completion happens 
      // when the page reloads and handleExternalSignerReturn() is called
      return {
        success: true,
        method: 'externalSigner',
        pending: true
      };
    } catch (error) {
      logAuthError('NostrAuthService', 'External signer sign in failed:', error);
      localStorage.removeItem(SIGN_IN_STORAGE_KEY);
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
      // Check if we have a pubkey in the URL - this takes priority
      // Even if localStorage is cleared, if URL has pubkey, we can complete sign-in
      const urlParams = new URLSearchParams(window.location.search);
      const nostrReturn = urlParams.get(SIGNER_RETURN_PARAM) || '';
      const hasPubkeyInUrl = /^1[a-f0-9]{64}$/i.test(nostrReturn) || 
                             urlParams.has('pubkey') || 
                             urlParams.has('result');
      
      // Check localStorage for pending flow (persists across page reloads)
      const signInDataStr = localStorage.getItem(SIGN_IN_STORAGE_KEY);
      
      // If no localStorage data AND no pubkey in URL, we can't proceed
      if (!signInDataStr && !hasPubkeyInUrl) {
        return {
          success: false,
          error: 'No pending sign-in flow found'
        };
      }

      // If we have localStorage data, validate it
      if (signInDataStr) {
        const signInData = JSON.parse(signInDataStr);
        
        if (signInData.flow !== 'externalSigner') {
          // If URL has pubkey, we can still proceed despite invalid localStorage
          if (!hasPubkeyInUrl) {
            return {
              success: false,
              error: 'Invalid sign-in flow'
            };
          }
        }

        // Check if the flow is too old (more than 5 minutes)
        if (Date.now() - signInData.timestamp > 5 * 60 * 1000) {
          localStorage.removeItem(SIGN_IN_STORAGE_KEY);
          // If URL has pubkey, we can still proceed despite expiry
          if (!hasPubkeyInUrl) {
            return {
              success: false,
              error: 'Sign-in session expired. Please try again.'
            };
          }
        }
      }
      
      logAuth('NostrAuthService', 'Processing external signer return. Has pubkey in URL:', hasPubkeyInUrl);

      let publicKey = null;

      // Method 1: Check URL parameters (some signers return data via URL)
      // Amber appends the result directly to the callbackUrl, so check various param names
      // Note: urlParams and nostrReturn already defined above
      let urlPubkey = urlParams.get('pubkey') || urlParams.get('result') || urlParams.get('signature');
      
      logAuth('NostrAuthService', 'URL search:', window.location.search);
      logAuth('NostrAuthService', 'nostr_return value:', urlParams.get(SIGNER_RETURN_PARAM));
      
      // Method 1b: Amber concatenates directly to callbackUrl, so if our callback ended with
      // "?nostr_return=1", the result becomes "?nostr_return=1{pubkey}"
      // So nostr_return value = "1" + 64-char hex pubkey
      if (!urlPubkey) {
        const nostrReturn = urlParams.get(SIGNER_RETURN_PARAM) || '';
        // Check if it's "1" followed by 64 hex chars (our marker + pubkey)
        const concatMatch = nostrReturn.match(/^1([a-f0-9]{64})$/i);
        if (concatMatch) {
          logAuth('NostrAuthService', 'Found pubkey concatenated to nostr_return');
          urlPubkey = concatMatch[1];
        }
      }
      
      // SECURITY: Method 1c removed - was matching ANY 64-char hex in URL which is dangerous
      // The previous code could match unrelated hex strings (like other users' pubkeys)
      // appearing in the URL from navigation history, referrer, etc.
      // If Amber doesn't return the pubkey via standard params, user should retry sign-in
      // 
      // Removed dangerous code:
      // const hexMatch = fullUrl.match(/[?&=]([a-f0-9]{64})(?:$|&)/i);
      // if (hexMatch) { urlPubkey = hexMatch[1]; }
      
      logAuth('NostrAuthService', 'URL pubkey:', urlPubkey);
      logAuth('NostrAuthService', 'Full URL:', window.location.href);
      
      if (urlPubkey) {
        logAuth('NostrAuthService', 'Got public key from URL parameters:', urlPubkey);
        publicKey = this.parsePublicKey(urlPubkey);
        
        // Clean up URL (remove signer params)
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete(SIGNER_RETURN_PARAM);
        cleanUrl.searchParams.delete('pubkey');
        cleanUrl.searchParams.delete('result');
        cleanUrl.searchParams.delete('signature');
        window.history.replaceState({}, '', cleanUrl.toString());
      }

      // Method 2: Try clipboard if URL didn't have the key
      if (!publicKey) {
        logAuth('NostrAuthService', 'Trying to get public key from clipboard...');
        publicKey = await this.getPublicKeyFromClipboard();
      }
      
      logAuth('NostrAuthService', 'Final parsed public key:', publicKey);
      
      // Clear the sign-in flow data
      localStorage.removeItem(SIGN_IN_STORAGE_KEY);

      if (!publicKey) {
        return {
          success: false,
          error: 'Could not retrieve public key. Please ensure you approved the request in your signer app and try again.'
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
      logAuthError('NostrAuthService', 'External signer return handling failed:', error);
      localStorage.removeItem(SIGN_IN_STORAGE_KEY);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to complete sign-in'
      };
    }
  }

  /**
   * Check if there's a pending external signer flow
   * Also checks for return URL parameter
   * @returns {boolean}
   */
  static hasPendingExternalSignerFlow() {
    try {
      // Check if we just returned from signer (URL has return param)
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const nostrReturn = urlParams.get(SIGNER_RETURN_PARAM);
        
        // Check for nostr_return param - could be just "1" or "1{pubkey}" if Amber concatenated
        if (nostrReturn) {
          // Either exact "1" or starts with "1" followed by hex (Amber's concatenation)
          if (nostrReturn === '1' || /^1[a-f0-9]{64}$/i.test(nostrReturn)) {
            logAuth('NostrAuthService', 'Detected return from external signer via URL');
            return true;
          }
        }
      }

      // Check localStorage for pending flow
      const signInDataStr = localStorage.getItem(SIGN_IN_STORAGE_KEY);
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
            logAuthWarn('NostrAuthService', 'Clipboard read attempt failed:', clipboardError);
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Fallback: prompt user to paste manually
      const manualInput = window.prompt(fallbackPromptMessage);
      return manualInput ? manualInput.trim() : null;
    } catch (error) {
      logAuthError('NostrAuthService', 'Clipboard access failed:', error);
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
      'Please paste your public key from your signer app:\n\n' +
      '(It should have copied it to your clipboard)'
    );
    
    if (rawText) {
      return this.parsePublicKey(rawText);
    }
    
    return null;
  }

  /**
   * Parse a public key from various formats
   * Supports: hex, npub1..., nostr:npub1..., URL-encoded, JSON
   * 
   * @param {string} input
   * @returns {string|null}
   */
  static parsePublicKey(input) {
    if (!input || typeof input !== 'string') return null;

    try {
      // Try to URL-decode first (handles callback URLs from signers)
      let decoded = input;
      try {
        decoded = decodeURIComponent(input);
      } catch {
        // Not URL-encoded, use as-is
      }

      const trimmed = decoded.trim();

      // Remove nostr: prefix if present
      const cleaned = trimmed.replace(/^nostr:/i, '');

      // Check if it's already a valid hex pubkey
      if (/^[0-9a-f]{64}$/i.test(cleaned)) {
        return cleaned.toLowerCase();
      }

      // Check if it's an npub (bech32 encoded)
      if (/^npub1[0-9a-z]+$/i.test(cleaned)) {
        try {
          const bech32Decoded = this.decodeBech32(cleaned);
          if (bech32Decoded && bech32Decoded.prefix === 'npub' && bech32Decoded.data.length === 32) {
            return this.bytesToHex(bech32Decoded.data);
          }
        } catch (e) {
          logAuthWarn('NostrAuthService', 'Failed to decode npub:', e);
        }
      }

      // Try parsing as JSON (some signers return JSON with pubkey field)
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.pubkey) {
          // Recursively parse the pubkey field (might be hex or npub)
          return this.parsePublicKey(parsed.pubkey);
        }
        if (parsed.result) {
          return this.parsePublicKey(parsed.result);
        }
      } catch {
        // Not JSON, continue
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Sign a Nostr event using the current authentication method
   * 
   * For extension method: Returns the signed event directly.
   * For external signer: Throws and redirects to signer app.
   *   Use handleSignEventReturn() on page reload to get the signed event.
   * For generated method: Signs locally with session private key.
   * 
   * @param {UnsignedEvent} event
   * @returns {Promise<SignedEvent>}
   * @throws {Error} If using external signer (will redirect) or if session key not available
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
    } else if (method === 'generated') {
      // Sign with locally stored private key
      const privateKey = this.getSessionPrivateKey();
      if (!privateKey) {
        throw new Error('Session expired. Please sign in again with your password.');
      }
      return this.signEventWithPrivateKey(event, privateKey);
    } else if (method === 'nostrConnect') {
      // Sign with remote signer via NIP-46
      return await this.signEventWithNostrConnect(event);
    }

    throw new Error(`Unknown sign-in method: ${method}`);
  }

  /**
   * Sign event using Nostr Connect (NIP-46)
   * 
   * Note: We check which service is actually connected, not just the feature flag
   * - QR code flow (nostrconnect://) uses legacy NostrConnectService
   * - Bunker URL flow uses NostrConnectServiceNDK when USE_NDK=true
   * - We need to check both services and use whichever one is connected
   * 
   * @param {UnsignedEvent} event
   * @returns {Promise<SignedEvent>}
   */
  static async signEventWithNostrConnect(event) {
    const USE_NDK = process.env.NEXT_PUBLIC_USE_NDK_NIP46 === 'true';
    
    // Import both services
    const NostrConnectServiceNDK = (await import('./NostrConnectServiceNDK.js')).default;
    const NostrConnectService = (await import('./NostrConnectService.js')).default;
    
    // Check which service is actually connected
    const ndkConnected = NostrConnectServiceNDK.isConnected();
    const legacyConnected = NostrConnectService.isConnected();
    
    logAuth('NostrAuthService', 'Checking connected services - NDK:', ndkConnected, 'Legacy:', legacyConnected);
    
    // Use whichever service is actually connected
    // Priority: If both connected, prefer NDK when USE_NDK is true
    if (ndkConnected && (USE_NDK || !legacyConnected)) {
      logAuth('NostrAuthService', 'Using NDK service for signing');
      const result = await NostrConnectServiceNDK.signEvent(event);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to sign event via Nostr Connect (NDK)');
      }
      
      return result.event;
    } else if (legacyConnected) {
      logAuth('NostrAuthService', 'Using legacy nostr-tools service for signing');
      const result = await NostrConnectService.signEvent(event);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to sign event via Nostr Connect');
      }
      
      return result.event;
    } else {
      // Neither service is connected
      throw new Error('Nostr Connect session not active. Please reconnect.');
    }
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
    
    localStorage.setItem(SIGN_IN_STORAGE_KEY, JSON.stringify(signData));

    // Build nostrsigner URL
    // iOS requires nostrsigner:// format, Android uses nostrsigner:
    const eventJson = encodeURIComponent(JSON.stringify(event));
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const appName = encodeURIComponent('Blink POS');
    const nostrSignerURL = isIOS
      ? `nostrsigner://${eventJson}?compressionType=none&returnType=event&type=sign_event&appName=${appName}`
      : `nostrsigner:${eventJson}?compressionType=none&returnType=event&type=sign_event&appName=${appName}`;

    logAuth('NostrAuthService', 'Signing event with external signer, platform:', isIOS ? 'iOS' : 'Android/Other');

    // Navigate to signer app using PWA-compatible method
    // Note: This is an async function now, but we still throw after to indicate the flow changed
    navigateToSignerUrl(nostrSignerURL, 'signEventWithExternalSigner').catch(e => {
      logAuthError('NostrAuthService', 'Navigation to signer failed:', e);
    });

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
      const signDataStr = localStorage.getItem(SIGN_IN_STORAGE_KEY);
      
      if (!signDataStr) {
        return { pending: false };
      }

      const signData = JSON.parse(signDataStr);
      
      if (signData.flow !== 'signEvent') {
        return { pending: false };
      }

      // Check if too old (more than 5 minutes)
      if (Date.now() - signData.timestamp > 5 * 60 * 1000) {
        localStorage.removeItem(SIGN_IN_STORAGE_KEY);
        return { pending: false, error: 'Sign event session expired' };
      }

      // Clear the flow data
      localStorage.removeItem(SIGN_IN_STORAGE_KEY);

      // Try to get raw signed event JSON from clipboard
      // Note: We use getRawClipboardText(), not getPublicKeyFromClipboard()
      // because signed events are JSON objects, not public key strings
      const clipboardText = await this.getRawClipboardText(
        'Please paste the signed event from your signer app:\n\n' +
        '(It should have copied it to your clipboard)'
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
        logAuthError('NostrAuthService', 'Failed to parse signed event JSON:', parseError);
        return { pending: true, error: 'Invalid signed event JSON format' };
      }
    } catch (error) {
      logAuthError('NostrAuthService', 'Handle sign event return failed:', error);
      localStorage.removeItem(SIGN_IN_STORAGE_KEY);
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
    // Clear sign-in flow data from localStorage
    localStorage.removeItem(SIGN_IN_STORAGE_KEY);
    // Clear session private key from memory
    this.clearSessionPrivateKey();
    // Note: We don't clear ENCRYPTED_NSEC_KEY here - that's the user's account
    // They should use clearEncryptedNsec() explicitly if they want to delete their account
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
    logAuth('NostrAuthService', 'nip98Login called');
    
    if (!this.isAuthenticated()) {
      logAuth('NostrAuthService', 'Not authenticated - cannot do NIP-98 login');
      return { success: false, error: 'Not signed in with Nostr' };
    }

    try {
      // Build the login URL
      const loginUrl = `${window.location.origin}/api/auth/nostr-login`;
      logAuth('NostrAuthService', 'Creating auth event for URL:', loginUrl);

      // Create and sign NIP-98 event
      const signedEvent = await this.createAuthEvent(loginUrl, 'POST');
      logAuth('NostrAuthService', 'Signed event created:', signedEvent ? 'yes' : 'no');

      if (!signedEvent) {
        return { success: false, error: 'Failed to sign NIP-98 event' };
      }

      // Create Authorization header
      const authHeader = this.createNip98AuthHeader(signedEvent);

      // Send login request
      logAuth('NostrAuthService', 'Sending NIP-98 login request...');
      const response = await fetch('/api/auth/nostr-login', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        credentials: 'include' // Include cookies in response
      });

      const data = await response.json();
      logAuth('NostrAuthService', 'NIP-98 login response:', response.status, data);

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
      logAuthError('NostrAuthService', 'NIP-98 login error:', error);
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

  // ============= Challenge-Based Authentication (for External Signers) =============

  /**
   * Storage key for challenge signing flow
   */
  static CHALLENGE_STORAGE_KEY = 'blinkpos_challenge_flow';

  /**
   * Fetch a challenge from the server for ownership verification
   * @returns {Promise<{success: boolean, challenge?: string, eventTemplate?: Object, error?: string}>}
   */
  static async fetchChallenge() {
    try {
      const response = await fetch('/api/auth/challenge');
      const data = await response.json();
      
      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to get challenge' };
      }
      
      return {
        success: true,
        challenge: data.challenge,
        eventTemplate: data.eventTemplate,
        expiresIn: data.expiresIn
      };
    } catch (error) {
      logAuthError('NostrAuthService', 'Failed to fetch challenge:', error);
      return { success: false, error: error.message || 'Failed to fetch challenge' };
    }
  }

  /**
   * Sign in with external signer using challenge-based verification
   * This is a two-step flow:
   * 1. First call: Gets pubkey, stores challenge, redirects to sign challenge
   * 2. Second call (on return): Verifies signed challenge with server
   * 
   * @returns {Promise<AuthResult>}
   */
  static async signInWithExternalSignerChallenge() {
    try {
      logAuth('NostrAuthService', 'signInWithExternalSignerChallenge() called');
      
      // Check if we're returning from signing a challenge
      const pendingFlow = this.getPendingChallengeFlow();
      logAuth('NostrAuthService', 'Pending flow:', pendingFlow?.step || 'none');
      
      if (pendingFlow && pendingFlow.step === 'awaitingSignedChallenge') {
        logAuth('NostrAuthService', 'Returning from challenge signing...');
        return await this.handleChallengeSignReturn();
      }
      
      // Build callback URL for pubkey retrieval (needed for both new and retry flows)
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete(SIGNER_RETURN_PARAM);
      currentUrl.searchParams.delete('pubkey');
      currentUrl.searchParams.set(SIGNER_RETURN_PARAM, 'challenge');
      const returnUrl = currentUrl.toString() + '&pubkey=';
      
      // Don't overwrite an existing pending flow
      // This prevents multiple rapid clicks from creating new challenges
      // while waiting for Amber to return with the pubkey
      // BUT we still need to retry the redirect to Amber if user clicks again
      if (pendingFlow && pendingFlow.step === 'awaitingPubkey') {
        const flowAge = Date.now() - pendingFlow.timestamp;
        const maxFlowAge = 5 * 60 * 1000; // 5 minutes
        
        if (flowAge < maxFlowAge) {
          logAuth('NostrAuthService', 'Challenge flow already pending (age: ' + Math.round(flowAge/1000) + 's), reusing existing challenge');
          
          // Still redirect to Amber - user might need to retry if first redirect failed
          const params = new URLSearchParams({
            type: 'get_public_key',
            callbackUrl: returnUrl,
            returnType: 'signature',
            compressionType: 'none',
            appName: 'Blink POS'
          });
          
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          const nostrSignerURL = isIOS
            ? 'nostrsigner://sign?' + params.toString()
            : 'nostrsigner:?' + params.toString();
          
          logAuth('NostrAuthService', 'Retrying signer redirect with existing challenge...');
          await navigateToSignerUrl(nostrSignerURL, 'signInWithExternalSignerChallenge-getPubkey-retry');
          
          return { success: true, pending: true, method: 'externalSigner', alreadyPending: true };
        } else {
          logAuth('NostrAuthService', 'Existing flow expired (age: ' + Math.round(flowAge/1000) + 's), starting fresh');
          localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
        }
      }

      // Step 1: Start new sign-in flow - get pubkey first
      logAuth('NostrAuthService', 'Starting challenge-based sign-in...');
      logAuth('NostrAuthService', 'Return URL:', returnUrl);

      // Fetch challenge from server
      logAuth('NostrAuthService', 'Fetching challenge from server...');
      const challengeResult = await this.fetchChallenge();
      logAuth('NostrAuthService', 'Challenge result:', challengeResult.success ? 'success' : challengeResult.error);
      if (!challengeResult.success) {
        return { success: false, error: challengeResult.error };
      }

      // Store flow data
      const flowData = {
        step: 'awaitingPubkey',
        challenge: challengeResult.challenge,
        eventTemplate: challengeResult.eventTemplate,
        timestamp: Date.now()
      };
      localStorage.setItem(this.CHALLENGE_STORAGE_KEY, JSON.stringify(flowData));
      logAuth('NostrAuthService', 'Stored challenge flow data');

      // Build nostrsigner URL to get pubkey
      const params = new URLSearchParams({
        type: 'get_public_key',
        callbackUrl: returnUrl,
        returnType: 'signature',
        compressionType: 'none',
        appName: 'Blink POS'
      });
      
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const nostrSignerURL = isIOS
        ? 'nostrsigner://sign?' + params.toString()
        : 'nostrsigner:?' + params.toString();
      
      logAuth('NostrAuthService', 'Opening signer URL:', nostrSignerURL.substring(0, 100) + '...');
      logAuth('NostrAuthService', 'Full callback URL:', returnUrl);
      
      // Navigate to signer app using PWA-compatible method
      await navigateToSignerUrl(nostrSignerURL, 'signInWithExternalSignerChallenge-getPubkey');

      return { success: true, pending: true, method: 'externalSigner' };
    } catch (error) {
      logAuthError('NostrAuthService', 'Challenge sign-in failed:', error);
      localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get pending challenge flow data
   * @returns {Object|null}
   */
  static getPendingChallengeFlow() {
    try {
      const data = localStorage.getItem(this.CHALLENGE_STORAGE_KEY);
      if (!data) return null;
      
      const flow = JSON.parse(data);
      
      // Check if expired (10 minutes)
      if (Date.now() - flow.timestamp > 10 * 60 * 1000) {
        localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
        return null;
      }
      
      return flow;
    } catch {
      return null;
    }
  }

  /**
   * Clear pending challenge flow data
   * Used when flow is stale or needs to be reset
   */
  static clearPendingChallengeFlow() {
    logAuth('NostrAuthService', 'clearPendingChallengeFlow called');
    localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
  }

  /**
   * Handle return from external signer during challenge flow
   * Called when URL has nostr_return=challenge
   * @returns {Promise<AuthResult>}
   */
  static async handleChallengeFlowReturn() {
    const urlParams = new URLSearchParams(window.location.search);
    const nostrReturn = urlParams.get(SIGNER_RETURN_PARAM);
    
    logAuth('NostrAuthService', 'handleChallengeFlowReturn called');
    logAuth('NostrAuthService', 'URL params:', window.location.search);
    logAuth('NostrAuthService', 'nostr_return value:', nostrReturn);
    
    // Amber concatenates the pubkey directly: "challenge{pubkey}" instead of separate params
    if (!nostrReturn?.startsWith('challenge')) {
      return { success: false, error: 'Not a challenge flow return' };
    }

    const flow = this.getPendingChallengeFlow();
    logAuth('NostrAuthService', 'Current flow state:', flow?.step || 'none');
    
    if (!flow) {
      return { success: false, error: 'No pending challenge flow' };
    }

    if (flow.step === 'awaitingPubkey') {
      // Extract pubkey from URL
      let pubkey = urlParams.get('pubkey') || urlParams.get('result');
      logAuth('NostrAuthService', 'Pubkey from URL params:', pubkey?.substring(0, 16) || 'none');
      
      // Check for concatenated pubkey in nostr_return
      if (!pubkey) {
        const concatMatch = nostrReturn.match(/^challenge([a-f0-9]{64})$/i);
        if (concatMatch) {
          pubkey = concatMatch[1];
          logAuth('NostrAuthService', 'Pubkey from concatenated nostr_return:', pubkey.substring(0, 16));
        }
      }
      
      // Check all URL params for anything that looks like a pubkey
      if (!pubkey) {
        for (const [key, value] of urlParams.entries()) {
          logAuth('NostrAuthService', 'URL param:', key, '=', value?.substring(0, 20) || 'empty');
          if (/^[a-f0-9]{64}$/i.test(value)) {
            pubkey = value;
            logAuth('NostrAuthService', 'Found pubkey in param:', key);
            break;
          }
        }
      }
      
      if (!pubkey) {
        // Try clipboard as last resort
        logAuth('NostrAuthService', 'Trying clipboard...');
        pubkey = await this.getPublicKeyFromClipboard();
      }
      
      if (!pubkey) {
        logAuthError('NostrAuthService', 'Could not extract pubkey from anywhere');
        localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
        return { success: false, error: 'Could not get pubkey from signer. Please try again.' };
      }

      pubkey = this.parsePublicKey(pubkey);
      if (!pubkey) {
        localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
        return { success: false, error: 'Invalid pubkey format' };
      }

      logAuth('NostrAuthService', '✓ Got pubkey:', pubkey.substring(0, 8) + '...');

      // Clean URL
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete(SIGNER_RETURN_PARAM);
      cleanUrl.searchParams.delete('pubkey');
      cleanUrl.searchParams.delete('result');
      window.history.replaceState({}, '', cleanUrl.toString());

      // Update flow to step 2: sign challenge
      const updatedFlow = {
        ...flow,
        step: 'awaitingSignedChallenge',
        pubkey,
        timestamp: Date.now()
      };
      localStorage.setItem(this.CHALLENGE_STORAGE_KEY, JSON.stringify(updatedFlow));
      logAuth('NostrAuthService', 'Updated flow to awaitingSignedChallenge');

      // Build the challenge event for signing
      const challengeEvent = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        content: flow.challenge,
        tags: [
          ['relay', window.location.origin],
          ['challenge', flow.challenge]
        ],
        pubkey: pubkey
      };
      logAuth('NostrAuthService', 'Challenge event to sign:', JSON.stringify(challengeEvent).substring(0, 100) + '...');

      // Build callback URL for signed event
      const signCallbackUrl = new URL(window.location.href);
      signCallbackUrl.searchParams.set(SIGNER_RETURN_PARAM, 'signed');

      // Redirect to signer to sign the challenge
      const eventJson = encodeURIComponent(JSON.stringify(challengeEvent));
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const appName = encodeURIComponent('Blink POS');
      const callbackParam = encodeURIComponent(signCallbackUrl.toString());
      
      const nostrSignerURL = isIOS
        ? `nostrsigner://${eventJson}?compressionType=none&returnType=event&type=sign_event&appName=${appName}&callbackUrl=${callbackParam}`
        : `nostrsigner:${eventJson}?compressionType=none&returnType=event&type=sign_event&appName=${appName}&callbackUrl=${callbackParam}`;

      logAuth('NostrAuthService', 'Redirecting to signer for challenge signature...');
      logAuth('NostrAuthService', 'Callback URL:', signCallbackUrl.toString());
      
      // Navigate to signer app using PWA-compatible method
      // This is Step 2 - the one that gets blocked in PWA standalone mode
      const navSuccess = await navigateToSignerUrl(nostrSignerURL, 'handleChallengeFlowReturn-signChallenge');
      
      if (!navSuccess) {
        logAuthError('NostrAuthService', 'Failed to navigate to signer for challenge signing');
        // Don't clear the flow - user might want to retry
        return { 
          success: false, 
          error: 'Could not open signer app. Please try again or use browser instead of PWA.' 
        };
      }

      return { success: true, pending: true, method: 'externalSigner' };
    }

    return { success: false, error: 'Unknown challenge flow step' };
  }

  /**
   * Retry redirect to Amber for signing the challenge
   * Called when we're in awaitingSignedChallenge state but no signed event in URL
   * This happens when Step 1 completed but Step 2 redirect failed or didn't execute
   * @returns {Promise<AuthResult>}
   */
  static async retrySignChallengeRedirect() {
    logAuth('NostrAuthService', 'retrySignChallengeRedirect called');
    
    const flow = this.getPendingChallengeFlow();
    logAuth('NostrAuthService', 'retrySignChallengeRedirect - flow:', JSON.stringify(flow));
    
    if (!flow || flow.step !== 'awaitingSignedChallenge') {
      logAuth('NostrAuthService', 'retrySignChallengeRedirect - Invalid flow state');
      return { success: false, error: 'Invalid flow state for retry' };
    }
    
    if (!flow.pubkey) {
      logAuth('NostrAuthService', 'retrySignChallengeRedirect - No pubkey in flow');
      localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
      return { success: false, error: 'No pubkey in flow, please restart sign-in' };
    }
    
    if (!flow.challenge) {
      logAuth('NostrAuthService', 'retrySignChallengeRedirect - No challenge in flow');
      localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
      return { success: false, error: 'No challenge in flow, please restart sign-in' };
    }
    
    // Check if flow is too old (more than 5 minutes)
    const flowAge = Date.now() - (flow.timestamp || 0);
    if (flowAge > 5 * 60 * 1000) {
      logAuth('NostrAuthService', 'retrySignChallengeRedirect - Flow too old:', flowAge, 'ms');
      localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
      return { success: false, error: 'Challenge expired, please restart sign-in' };
    }
    
    logAuth('NostrAuthService', 'retrySignChallengeRedirect - Rebuilding sign request...');
    logAuth('NostrAuthService', 'retrySignChallengeRedirect - pubkey:', flow.pubkey.substring(0, 16) + '...');
    logAuth('NostrAuthService', 'retrySignChallengeRedirect - challenge:', flow.challenge.substring(0, 30) + '...');
    
    // Build the challenge event for signing (same as in handleChallengeFlowReturn)
    const challengeEvent = {
      kind: 22242,
      created_at: Math.floor(Date.now() / 1000),
      content: flow.challenge,
      tags: [
        ['relay', window.location.origin],
        ['challenge', flow.challenge]
      ],
      pubkey: flow.pubkey
    };
    logAuth('NostrAuthService', 'retrySignChallengeRedirect - Challenge event:', JSON.stringify(challengeEvent).substring(0, 100) + '...');

    // Build callback URL for signed event
    const signCallbackUrl = new URL(window.location.href);
    // Make sure URL is clean before adding our param
    signCallbackUrl.searchParams.delete(SIGNER_RETURN_PARAM);
    signCallbackUrl.searchParams.set(SIGNER_RETURN_PARAM, 'signed');

    // Redirect to signer to sign the challenge
    const eventJson = encodeURIComponent(JSON.stringify(challengeEvent));
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const appName = encodeURIComponent('Blink POS');
    const callbackParam = encodeURIComponent(signCallbackUrl.toString());
    
    const nostrSignerURL = isIOS
      ? `nostrsigner://${eventJson}?compressionType=none&returnType=event&type=sign_event&appName=${appName}&callbackUrl=${callbackParam}`
      : `nostrsigner:${eventJson}?compressionType=none&returnType=event&type=sign_event&appName=${appName}&callbackUrl=${callbackParam}`;

    logAuth('NostrAuthService', 'retrySignChallengeRedirect - Redirecting to signer for challenge signature...');
    logAuth('NostrAuthService', 'retrySignChallengeRedirect - Callback URL:', signCallbackUrl.toString());
    
    // Navigate to signer app
    const navSuccess = await navigateToSignerUrl(nostrSignerURL, 'retrySignChallengeRedirect');
    
    if (!navSuccess) {
      logAuthError('NostrAuthService', 'retrySignChallengeRedirect - Failed to navigate to signer');
      return { 
        success: false, 
        error: 'Could not open Amber. Please tap the Amber button to try again.' 
      };
    }

    logAuth('NostrAuthService', 'retrySignChallengeRedirect - Navigation initiated, returning pending');
    return { success: true, pending: true, method: 'externalSigner' };
  }

  /**
   * Handle return from signing the challenge event
   * @returns {Promise<AuthResult>}
   */
  static async handleChallengeSignReturn() {
    const urlParams = new URLSearchParams(window.location.search);
    const nostrReturn = urlParams.get(SIGNER_RETURN_PARAM);
    
    // Note: Amber concatenates results directly, so we get "signed{json-event}" not "signed"
    if (!nostrReturn?.startsWith('signed')) {
      return { success: false, error: 'Not a signed challenge return' };
    }

    const flow = this.getPendingChallengeFlow();
    if (!flow || flow.step !== 'awaitingSignedChallenge') {
      localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
      return { success: false, error: 'Invalid challenge flow state' };
    }

    // Clean URL
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete(SIGNER_RETURN_PARAM);
    cleanUrl.searchParams.delete('result');
    cleanUrl.searchParams.delete('event');
    window.history.replaceState({}, '', cleanUrl.toString());

    // Try to get signed event from:
    // 1. Amber's concatenated format: "signed{json-event}"
    // 2. Standard URL params: ?result= or ?event=
    // 3. Clipboard fallback
    let signedEventJson = null;
    
    // First check if Amber concatenated the event to nostr_return
    if (nostrReturn.length > 6) {
      // Extract everything after "signed"
      signedEventJson = nostrReturn.substring(6);
      logAuth('NostrAuthService', 'Extracted signed event from concatenated nostr_return');
    }
    
    // Fall back to URL params
    if (!signedEventJson) {
      signedEventJson = urlParams.get('result') || urlParams.get('event');
    }
    
    if (!signedEventJson) {
      // Try clipboard
      signedEventJson = await this.getRawClipboardText(
        'Please paste the signed event from your signer app:'
      );
    }

    if (!signedEventJson) {
      localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
      return { success: false, error: 'Could not get signed event from signer' };
    }

    // Parse the signed event
    let signedEvent;
    try {
      // Handle URL-encoded JSON
      const decoded = decodeURIComponent(signedEventJson);
      signedEvent = JSON.parse(decoded);
    } catch (e) {
      try {
        signedEvent = JSON.parse(signedEventJson);
      } catch (e2) {
        localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
        return { success: false, error: 'Invalid signed event JSON' };
      }
    }

    logAuth('NostrAuthService', 'Got signed challenge event, verifying with server...');

    // Verify with server
    try {
      const response = await fetch('/api/auth/verify-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedEvent }),
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
        return { success: false, error: data.error || 'Verification failed' };
      }

      logAuth('NostrAuthService', '✓ Challenge verified, session established!');

      // Store auth data
      const pubkey = flow.pubkey.toLowerCase();
      this.storeAuthData(pubkey, 'externalSigner');

      // Clear flow data
      localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);

      return {
        success: true,
        publicKey: pubkey,
        method: 'externalSigner',
        hasServerSession: true
      };
    } catch (error) {
      logAuthError('NostrAuthService', 'Server verification failed:', error);
      localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
      return { success: false, error: error.message || 'Server verification failed' };
    }
  }

  /**
   * Check if there's a pending challenge flow that needs handling
   * @returns {boolean}
   */
  static hasPendingChallengeFlow() {
    if (typeof window === 'undefined') return false;
    
    const urlParams = new URLSearchParams(window.location.search);
    const nostrReturn = urlParams.get(SIGNER_RETURN_PARAM);
    
    // Check for challenge flow returns
    // Note: Amber concatenates the result directly, so we get "challenge{pubkey}" or "signed{event}"
    if (nostrReturn?.startsWith('challenge') || nostrReturn?.startsWith('signed')) {
      return true;
    }
    
    // Also check if there's pending flow data
    const flow = this.getPendingChallengeFlow();
    return !!(flow && flow.step === 'awaitingSignedChallenge');
  }

  /**
   * Clear any stuck challenge flow data (for debugging/recovery)
   * Can be called from browser console: NostrAuthService.clearChallengeFlow()
   */
  static clearChallengeFlow() {
    localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
    logAuth('NostrAuthService', 'Challenge flow data cleared');
    return 'Challenge flow cleared. You can try signing in again.';
  }

  /**
   * Debug helper: Show current challenge flow state
   * Can be called from browser console: NostrAuthService.debugChallengeFlow()
   */
  static debugChallengeFlow() {
    const flow = this.getPendingChallengeFlow();
    const urlParams = new URLSearchParams(window.location.search);
    logAuth('NostrAuthService', 'Debug info:');
    logAuth('NostrAuthService', '  URL:', window.location.href);
    logAuth('NostrAuthService', '  nostr_return:', urlParams.get(SIGNER_RETURN_PARAM));
    logAuth('NostrAuthService', '  Flow data:', flow);
    return { url: window.location.href, nostrReturn: urlParams.get(SIGNER_RETURN_PARAM), flow };
  }

  /**
   * Verify server session with a simple authenticated request
   * @returns {Promise<{hasSession: boolean, pubkey?: string}>}
   */
  static async verifyServerSession() {
    try {
      const response = await fetch('/api/auth/session', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        return { hasSession: false };
      }
      
      const data = await response.json();
      return {
        hasSession: !!data.authenticated,
        pubkey: data.pubkey
      };
    } catch {
      return { hasSession: false };
    }
  }
}

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NostrAuthService;
}

// For ES modules
export default NostrAuthService;
export { NostrAuthService };

