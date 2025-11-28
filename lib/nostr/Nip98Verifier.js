/**
 * NIP-98 HTTP Auth Verification
 * 
 * Server-side verification of NIP-98 authentication tokens.
 * NIP-98 uses kind 27235 events to authenticate HTTP requests.
 * 
 * @see https://github.com/nostr-protocol/nips/blob/master/98.md
 */

const crypto = require('crypto');

// Cache for dynamically imported modules
let secp256k1 = null;
let sha256Fn = null;
let modulesLoaded = false;
let moduleLoadPromise = null;

/**
 * Load ESM modules dynamically (they can't be require()'d)
 */
async function loadModules() {
  if (modulesLoaded) return { secp256k1, sha256: sha256Fn };
  
  if (moduleLoadPromise) return moduleLoadPromise;
  
  moduleLoadPromise = (async () => {
    try {
      // Dynamic import for ESM modules
      const secp = await import('@noble/secp256k1');
      const hashes = await import('@noble/hashes/sha256');
      
      secp256k1 = secp.default || secp;
      sha256Fn = hashes.sha256;
      modulesLoaded = true;
      console.log('NIP-98: Loaded @noble/secp256k1 and @noble/hashes successfully');
      
      return { secp256k1, sha256: sha256Fn };
    } catch (e) {
      console.warn('NIP-98: Failed to load @noble packages:', e.message);
      modulesLoaded = true; // Mark as loaded even on failure to prevent retries
      return { secp256k1: null, sha256: null };
    }
  })();
  
  return moduleLoadPromise;
}

/**
 * NIP-98 HTTP Auth event kind
 */
const NIP98_KIND = 27235;

/**
 * Maximum age of a NIP-98 event (in seconds)
 * Events older than this are rejected to prevent replay attacks
 */
const MAX_EVENT_AGE_SECONDS = 60;

/**
 * Hex string to Uint8Array
 * @param {string} hex 
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Uint8Array to hex string
 * @param {Uint8Array} bytes 
 * @returns {string}
 */
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Calculate the event ID (SHA256 hash of serialized event)
 * @param {Object} event - Nostr event
 * @returns {Promise<string>} - Event ID as hex string
 */
async function calculateEventId(event) {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);
  
  // Try to use @noble/hashes first
  const { sha256 } = await loadModules();
  
  if (sha256) {
    const hash = sha256(new TextEncoder().encode(serialized));
    return bytesToHex(hash);
  } else {
    // Fallback to Node.js crypto
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }
}

/**
 * Verify a Schnorr signature using secp256k1
 * @param {string} signature - Signature as hex string
 * @param {string} message - Message hash as hex string
 * @param {string} publicKey - Public key as hex string
 * @returns {Promise<boolean>}
 */
async function verifySchnorrSignature(signature, message, publicKey) {
  const { secp256k1 } = await loadModules();
  
  if (!secp256k1) {
    console.error('NIP-98: secp256k1 library not available');
    return false;
  }

  try {
    const sigBytes = hexToBytes(signature);
    const msgBytes = hexToBytes(message);
    const pubBytes = hexToBytes(publicKey);
    
    // @noble/secp256k1 v2.x uses schnorr.verify
    if (secp256k1.schnorr && secp256k1.schnorr.verify) {
      const result = await secp256k1.schnorr.verify(sigBytes, msgBytes, pubBytes);
      console.log('NIP-98: Schnorr signature verification result:', result);
      return result;
    }
    
    // Fallback for older versions or different exports
    if (typeof secp256k1.verify === 'function') {
      const result = secp256k1.verify(sigBytes, msgBytes, pubBytes);
      console.log('NIP-98: Legacy verification result:', result);
      return result;
    }
    
    // Check for schnorr as top-level export (some versions)
    if (secp256k1.default?.schnorr?.verify) {
      const result = await secp256k1.default.schnorr.verify(sigBytes, msgBytes, pubBytes);
      console.log('NIP-98: Default schnorr verification result:', result);
      return result;
    }
    
    console.error('NIP-98: No compatible verification method found. Available:', Object.keys(secp256k1));
    return false;
  } catch (error) {
    console.error('NIP-98: Signature verification error:', error);
    return false;
  }
}

/**
 * Extract a tag value from event tags
 * @param {Array} tags - Event tags array
 * @param {string} tagName - Tag name to find
 * @returns {string|null}
 */
function getTagValue(tags, tagName) {
  const tag = tags.find(t => Array.isArray(t) && t[0] === tagName);
  return tag ? tag[1] : null;
}

/**
 * Normalize URL for comparison
 * Removes trailing slashes and standardizes format
 * @param {string} url 
 * @returns {string}
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Remove trailing slash from pathname
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return url.replace(/\/+$/, '');
  }
}

class Nip98Verifier {
  /**
   * Extract NIP-98 token from Authorization header
   * @param {string} authHeader - Authorization header value
   * @returns {Object|null} - Parsed event or null
   */
  static extractToken(authHeader) {
    if (!authHeader) return null;
    
    // Format: "Nostr base64encodedEvent"
    const match = authHeader.match(/^Nostr\s+(.+)$/i);
    if (!match) return null;
    
    try {
      const decoded = Buffer.from(match[1], 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (error) {
      console.error('NIP-98: Failed to decode token:', error);
      return null;
    }
  }

  /**
   * Validate the structure of a NIP-98 event
   * @param {Object} event - The event to validate
   * @returns {{valid: boolean, error?: string}}
   */
  static validateEventStructure(event) {
    if (!event || typeof event !== 'object') {
      return { valid: false, error: 'Invalid event object' };
    }

    // Check required fields
    const requiredFields = ['id', 'pubkey', 'created_at', 'kind', 'tags', 'sig'];
    for (const field of requiredFields) {
      if (!(field in event)) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    // Validate kind
    if (event.kind !== NIP98_KIND) {
      return { valid: false, error: `Invalid event kind: ${event.kind}, expected ${NIP98_KIND}` };
    }

    // Validate pubkey format (64 char hex)
    if (!/^[0-9a-f]{64}$/i.test(event.pubkey)) {
      return { valid: false, error: 'Invalid pubkey format' };
    }

    // Validate signature format (128 char hex for Schnorr)
    if (!/^[0-9a-f]{128}$/i.test(event.sig)) {
      return { valid: false, error: 'Invalid signature format' };
    }

    // Validate id format (64 char hex)
    if (!/^[0-9a-f]{64}$/i.test(event.id)) {
      return { valid: false, error: 'Invalid event id format' };
    }

    // Validate tags is array
    if (!Array.isArray(event.tags)) {
      return { valid: false, error: 'Tags must be an array' };
    }

    return { valid: true };
  }

  /**
   * Validate the event timestamp
   * @param {Object} event - The event to validate
   * @param {number} maxAgeSeconds - Maximum age in seconds
   * @returns {{valid: boolean, error?: string}}
   */
  static validateTimestamp(event, maxAgeSeconds = MAX_EVENT_AGE_SECONDS) {
    const now = Math.floor(Date.now() / 1000);
    const eventTime = event.created_at;
    
    // Check if event is too old
    if (now - eventTime > maxAgeSeconds) {
      return { valid: false, error: `Event too old: ${now - eventTime}s (max: ${maxAgeSeconds}s)` };
    }
    
    // Check if event is in the future (with small tolerance)
    if (eventTime > now + 60) {
      return { valid: false, error: 'Event timestamp is in the future' };
    }
    
    return { valid: true };
  }

  /**
   * Validate the URL tag matches the request URL
   * @param {Object} event - The event to validate
   * @param {string} requestUrl - The URL of the request
   * @returns {{valid: boolean, error?: string}}
   */
  static validateUrlTag(event, requestUrl) {
    const urlTag = getTagValue(event.tags, 'u');
    
    if (!urlTag) {
      return { valid: false, error: 'Missing u (URL) tag' };
    }
    
    const normalizedEventUrl = normalizeUrl(urlTag);
    const normalizedRequestUrl = normalizeUrl(requestUrl);
    
    if (normalizedEventUrl !== normalizedRequestUrl) {
      return { valid: false, error: `URL mismatch: event=${normalizedEventUrl}, request=${normalizedRequestUrl}` };
    }
    
    return { valid: true };
  }

  /**
   * Validate the method tag matches the request method
   * @param {Object} event - The event to validate
   * @param {string} requestMethod - The HTTP method of the request
   * @returns {{valid: boolean, error?: string}}
   */
  static validateMethodTag(event, requestMethod) {
    const methodTag = getTagValue(event.tags, 'method');
    
    if (!methodTag) {
      return { valid: false, error: 'Missing method tag' };
    }
    
    if (methodTag.toUpperCase() !== requestMethod.toUpperCase()) {
      return { valid: false, error: `Method mismatch: event=${methodTag}, request=${requestMethod}` };
    }
    
    return { valid: true };
  }

  /**
   * Verify the event ID matches the calculated hash
   * @param {Object} event - The event to validate
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  static async verifyEventId(event) {
    const calculatedId = await calculateEventId(event);
    
    if (calculatedId.toLowerCase() !== event.id.toLowerCase()) {
      return { valid: false, error: 'Event ID does not match calculated hash' };
    }
    
    return { valid: true };
  }

  /**
   * Verify the event signature
   * @param {Object} event - The event to verify
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  static async verifySignature(event) {
    try {
      const isValid = await verifySchnorrSignature(event.sig, event.id, event.pubkey);
      
      if (!isValid) {
        return { valid: false, error: 'Invalid signature' };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, error: `Signature verification failed: ${error.message}` };
    }
  }

  /**
   * Fully validate a NIP-98 authentication request
   * @param {Object} options
   * @param {string} options.authHeader - The Authorization header value
   * @param {string} options.url - The request URL
   * @param {string} options.method - The HTTP method
   * @param {number} [options.maxAgeSeconds] - Maximum event age in seconds
   * @returns {Promise<{valid: boolean, pubkey?: string, error?: string}>}
   */
  static async verify({ authHeader, url, method, maxAgeSeconds = MAX_EVENT_AGE_SECONDS }) {
    // Extract token
    const event = this.extractToken(authHeader);
    if (!event) {
      return { valid: false, error: 'Failed to extract NIP-98 token from Authorization header' };
    }

    // Validate structure
    const structureResult = this.validateEventStructure(event);
    if (!structureResult.valid) {
      return structureResult;
    }

    // Validate timestamp
    const timestampResult = this.validateTimestamp(event, maxAgeSeconds);
    if (!timestampResult.valid) {
      return timestampResult;
    }

    // Validate URL tag
    const urlResult = this.validateUrlTag(event, url);
    if (!urlResult.valid) {
      return urlResult;
    }

    // Validate method tag
    const methodResult = this.validateMethodTag(event, method);
    if (!methodResult.valid) {
      return methodResult;
    }

    // Verify event ID
    const idResult = await this.verifyEventId(event);
    if (!idResult.valid) {
      return idResult;
    }

    // Verify signature
    const sigResult = await this.verifySignature(event);
    if (!sigResult.valid) {
      return sigResult;
    }

    // All validations passed
    return { 
      valid: true, 
      pubkey: event.pubkey.toLowerCase(),
      event 
    };
  }

  /**
   * Create a NIP-98 Authorization header value (for testing/client use)
   * @param {Object} event - Signed Nostr event
   * @returns {string}
   */
  static createAuthHeader(event) {
    const encoded = Buffer.from(JSON.stringify(event)).toString('base64');
    return `Nostr ${encoded}`;
  }
}

module.exports = Nip98Verifier;

