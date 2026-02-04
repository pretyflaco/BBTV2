/**
 * CryptoUtils - Encryption utilities for secure local storage
 * 
 * Uses Web Crypto API with AES-GCM for encryption.
 * Supports both device-key encryption (automatic) and password-based encryption.
 */

const DEVICE_KEY_STORAGE = '_blinkpos_dk';
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * @typedef {Object} EncryptedData
 * @property {string} encrypted - Base64-encoded encrypted data
 * @property {string} iv - Base64-encoded initialization vector
 * @property {string} salt - Base64-encoded salt (for password-based encryption)
 * @property {boolean} hasPassword - Whether password was used for encryption
 */

class CryptoUtils {
  /**
   * Check if Web Crypto API is available
   * @returns {boolean}
   */
  static isSupported() {
    return typeof window !== 'undefined' && 
           window.crypto && 
           window.crypto.subtle;
  }

  /**
   * Get or create a device-specific key for encryption
   * This key is unique to the device/browser and stored in localStorage
   * 
   * @returns {Promise<string>}
   */
  static async getOrCreateDeviceKey() {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage not available');
    }

    let deviceKey = localStorage.getItem(DEVICE_KEY_STORAGE);

    if (!deviceKey) {
      // Generate a random 256-bit key
      const keyBytes = crypto.getRandomValues(new Uint8Array(32));
      deviceKey = this.bytesToBase64(keyBytes);
      localStorage.setItem(DEVICE_KEY_STORAGE, deviceKey);
    }

    return deviceKey;
  }

  /**
   * Derive an encryption key from the device key using PBKDF2
   * 
   * @returns {Promise<CryptoKey>}
   */
  static async deriveDeviceEncryptionKey() {
    const deviceKeyBase64 = await this.getOrCreateDeviceKey();
    
    // Decode the base64 device key back to original random bytes
    // This ensures we use the full entropy of the random key, not just
    // the UTF-8 encoding of the base64 string
    const deviceKeyBytes = this.base64ToBytes(deviceKeyBase64);
    
    // Import device key as raw key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      deviceKeyBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    // Use a fixed salt for device key mode (the randomness is in the device key itself)
    const salt = new TextEncoder().encode('blinkpos-device-salt-v1');

    // Derive AES-GCM key
    const encryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return encryptionKey;
  }

  /**
   * Derive an encryption key from a password using PBKDF2
   * 
   * @param {string} password
   * @param {Uint8Array} salt
   * @returns {Promise<CryptoKey>}
   */
  static async derivePasswordEncryptionKey(password, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const encryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return encryptionKey;
  }

  /**
   * Encrypt data using the device key (automatic, no password required)
   * 
   * @param {string} plaintext
   * @returns {Promise<EncryptedData>}
   */
  static async encryptWithDeviceKey(plaintext) {
    if (!this.isSupported()) {
      throw new Error('Web Crypto API not supported');
    }

    const encryptionKey = await this.deriveDeviceEncryptionKey();
    
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    // Encrypt
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      encryptionKey,
      new TextEncoder().encode(plaintext)
    );

    // Note: salt is included for structural consistency with password-based encryption.
    // For device-key encryption, the salt is not used (we use a fixed salt internally).
    // This allows the same EncryptedData type to be used for both modes, simplifying
    // storage and the decrypt() method's signature.
    const unusedSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

    return {
      encrypted: this.bytesToBase64(new Uint8Array(encryptedBuffer)),
      iv: this.bytesToBase64(iv),
      salt: this.bytesToBase64(unusedSalt), // Unused for device-key mode, kept for type consistency
      hasPassword: false
    };
  }

  /**
   * Decrypt data that was encrypted with the device key
   * 
   * @param {EncryptedData} encryptedData
   * @returns {Promise<string>}
   */
  static async decryptWithDeviceKey(encryptedData) {
    if (!this.isSupported()) {
      throw new Error('Web Crypto API not supported');
    }

    const encryptionKey = await this.deriveDeviceEncryptionKey();
    
    const iv = this.base64ToBytes(encryptedData.iv);
    const encrypted = this.base64ToBytes(encryptedData.encrypted);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      encryptionKey,
      encrypted
    );

    return new TextDecoder().decode(decryptedBuffer);
  }

  /**
   * Encrypt data using a password
   * 
   * @param {string} plaintext
   * @param {string} password
   * @returns {Promise<EncryptedData>}
   */
  static async encryptWithPassword(plaintext, password) {
    if (!this.isSupported()) {
      throw new Error('Web Crypto API not supported');
    }

    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const encryptionKey = await this.derivePasswordEncryptionKey(password, salt);

    // Encrypt
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      encryptionKey,
      new TextEncoder().encode(plaintext)
    );

    return {
      encrypted: this.bytesToBase64(new Uint8Array(encryptedBuffer)),
      iv: this.bytesToBase64(iv),
      salt: this.bytesToBase64(salt),
      hasPassword: true
    };
  }

  /**
   * Decrypt data that was encrypted with a password
   * 
   * @param {EncryptedData} encryptedData
   * @param {string} password
   * @returns {Promise<string>}
   */
  static async decryptWithPassword(encryptedData, password) {
    if (!this.isSupported()) {
      throw new Error('Web Crypto API not supported');
    }

    const salt = this.base64ToBytes(encryptedData.salt);
    const iv = this.base64ToBytes(encryptedData.iv);
    const encrypted = this.base64ToBytes(encryptedData.encrypted);

    const encryptionKey = await this.derivePasswordEncryptionKey(password, salt);

    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        encrypted
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (error) {
      if (error.name === 'OperationError') {
        throw new Error('Incorrect password');
      }
      throw error;
    }
  }

  /**
   * Encrypt data (auto-selects device key or password mode)
   * 
   * @param {string} plaintext
   * @param {string} [password] - Optional password for password-based encryption
   * @returns {Promise<EncryptedData>}
   */
  static async encrypt(plaintext, password) {
    if (password) {
      return this.encryptWithPassword(plaintext, password);
    }
    return this.encryptWithDeviceKey(plaintext);
  }

  /**
   * Decrypt data (auto-selects based on hasPassword flag)
   * 
   * @param {EncryptedData} encryptedData
   * @param {string} [password] - Required if hasPassword is true
   * @returns {Promise<string>}
   */
  static async decrypt(encryptedData, password) {
    if (encryptedData.hasPassword) {
      if (!password) {
        throw new Error('Password is required to decrypt this data');
      }
      return this.decryptWithPassword(encryptedData, password);
    }
    return this.decryptWithDeviceKey(encryptedData);
  }

  /**
   * Generate a random ID
   * @returns {string}
   */
  static generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Generate a random hex string
   * @param {number} length - Number of bytes (output will be 2x this in hex chars)
   * @returns {string}
   */
  static generateRandomHex(length = 32) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return this.bytesToHex(bytes);
  }

  // ============= Encoding Utilities =============

  /**
   * Convert bytes to base64 string
   * @param {Uint8Array} bytes
   * @returns {string}
   */
  static bytesToBase64(bytes) {
    return btoa(String.fromCharCode(...bytes));
  }

  /**
   * Convert base64 string to bytes
   * @param {string} base64
   * @returns {Uint8Array}
   */
  static base64ToBytes(base64) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
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

  /**
   * Hash a string using SHA-256
   * @param {string} str
   * @returns {Promise<string>}
   */
  static async sha256(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return this.bytesToHex(new Uint8Array(hashBuffer));
  }

  /**
   * Clear the device key (use with caution - will make existing encrypted data unrecoverable)
   */
  static clearDeviceKey() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DEVICE_KEY_STORAGE);
    }
  }

  /**
   * Check if device key exists
   * @returns {boolean}
   */
  static hasDeviceKey() {
    if (typeof localStorage === 'undefined') return false;
    return !!localStorage.getItem(DEVICE_KEY_STORAGE);
  }

  /**
   * Derive an encryption key from any string using PBKDF2
   * Useful for encrypting data with a known identifier (like a pubkey)
   * 
   * @param {string} keyString - String to derive key from
   * @returns {Promise<CryptoKey>}
   */
  static async deriveCryptoKeyFromString(keyString) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(keyString),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    // Use a fixed salt combined with the key string for deterministic derivation
    const salt = new TextEncoder().encode(`blinkpos-derived-${keyString.slice(0, 16)}`);

    const encryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return encryptionKey;
  }

  /**
   * Encrypt data using a derived key from a string
   * 
   * @param {string} plaintext - Data to encrypt
   * @param {string} keyString - String to derive encryption key from
   * @returns {Promise<EncryptedData>}
   */
  static async encryptWithDerivedKey(plaintext, keyString) {
    if (!this.isSupported()) {
      throw new Error('Web Crypto API not supported');
    }

    const encryptionKey = await this.deriveCryptoKeyFromString(keyString);
    
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    // Encrypt
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      encryptionKey,
      new TextEncoder().encode(plaintext)
    );

    return {
      encrypted: this.bytesToBase64(new Uint8Array(encryptedBuffer)),
      iv: this.bytesToBase64(iv),
      salt: '', // Not used for derived key mode
      hasPassword: false
    };
  }

  /**
   * Decrypt data that was encrypted with a derived key
   * 
   * @param {EncryptedData} encryptedData
   * @param {string} keyString - String that was used to derive the encryption key
   * @returns {Promise<string>}
   */
  static async decryptWithDerivedKey(encryptedData, keyString) {
    if (!this.isSupported()) {
      throw new Error('Web Crypto API not supported');
    }

    const encryptionKey = await this.deriveCryptoKeyFromString(keyString);
    
    const iv = this.base64ToBytes(encryptedData.iv);
    const encrypted = this.base64ToBytes(encryptedData.encrypted);

    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        encrypted
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (error) {
      if (error.name === 'OperationError') {
        throw new Error('Decryption failed - wrong key');
      }
      throw error;
    }
  }
}

// For ES modules
export default CryptoUtils;
export { CryptoUtils };

