/**
 * CryptoUtils - Encryption utilities for secure local storage
 *
 * Uses Web Crypto API with AES-GCM for encryption.
 * Supports both device-key encryption (automatic) and password-based encryption.
 */

const DEVICE_KEY_STORAGE: string = "_blinkpos_dk"
const PBKDF2_ITERATIONS: number = 100000
const SALT_LENGTH: number = 16
const IV_LENGTH: number = 12

/**
 * Encrypted data structure returned by encryption methods.
 * Uses a distinct name to avoid collision with the global EncryptedField in types/nostr.d.ts.
 */
export interface EncryptedData {
  encrypted: string
  iv: string
  salt: string
  hasPassword: boolean
}

class CryptoUtils {
  /**
   * Check if Web Crypto API is available
   */
  static isSupported(): boolean {
    return typeof window !== "undefined" && !!window.crypto && !!window.crypto.subtle
  }

  /**
   * Get or create a device-specific key for encryption
   * This key is unique to the device/browser and stored in localStorage
   */
  static async getOrCreateDeviceKey(): Promise<string> {
    if (typeof localStorage === "undefined") {
      throw new Error("localStorage not available")
    }

    let deviceKey: string | null = localStorage.getItem(DEVICE_KEY_STORAGE)

    if (!deviceKey) {
      // Generate a random 256-bit key
      const keyBytes: Uint8Array = crypto.getRandomValues(new Uint8Array(32))
      deviceKey = this.bytesToBase64(keyBytes)
      localStorage.setItem(DEVICE_KEY_STORAGE, deviceKey)
    }

    return deviceKey
  }

  /**
   * Derive an encryption key from the device key using PBKDF2
   */
  static async deriveDeviceEncryptionKey(): Promise<CryptoKey> {
    const deviceKeyBase64: string = await this.getOrCreateDeviceKey()

    // Decode the base64 device key back to original random bytes
    // This ensures we use the full entropy of the random key, not just
    // the UTF-8 encoding of the base64 string
    const deviceKeyBytes: Uint8Array = this.base64ToBytes(deviceKeyBase64)

    // Import device key as raw key material
    const keyMaterial: CryptoKey = await crypto.subtle.importKey(
      "raw",
      deviceKeyBytes as BufferSource,
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    )

    // Use a fixed salt for device key mode (the randomness is in the device key itself)
    const salt: Uint8Array = new TextEncoder().encode("blinkpos-device-salt-v1")

    // Derive AES-GCM key
    const encryptionKey: CryptoKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    )

    return encryptionKey
  }

  /**
   * Derive an encryption key from a password using PBKDF2
   */
  static async derivePasswordEncryptionKey(
    password: string,
    salt: Uint8Array,
  ): Promise<CryptoKey> {
    const keyMaterial: CryptoKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password) as BufferSource,
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    )

    const encryptionKey: CryptoKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    )

    return encryptionKey
  }

  /**
   * Encrypt data using the device key (automatic, no password required)
   */
  static async encryptWithDeviceKey(plaintext: string): Promise<EncryptedData> {
    if (!this.isSupported()) {
      throw new Error("Web Crypto API not supported")
    }

    const encryptionKey: CryptoKey = await this.deriveDeviceEncryptionKey()

    // Generate random IV
    const iv: Uint8Array = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

    // Encrypt
    const encryptedBuffer: ArrayBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      encryptionKey,
      new TextEncoder().encode(plaintext) as BufferSource,
    )

    // Note: salt is included for structural consistency with password-based encryption.
    // For device-key encryption, the salt is not used (we use a fixed salt internally).
    // This allows the same EncryptedData type to be used for both modes, simplifying
    // storage and the decrypt() method's signature.
    const unusedSalt: Uint8Array = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))

    return {
      encrypted: this.bytesToBase64(new Uint8Array(encryptedBuffer)),
      iv: this.bytesToBase64(iv),
      salt: this.bytesToBase64(unusedSalt), // Unused for device-key mode, kept for type consistency
      hasPassword: false,
    }
  }

  /**
   * Decrypt data that was encrypted with the device key
   */
  static async decryptWithDeviceKey(encryptedData: EncryptedData): Promise<string> {
    if (!this.isSupported()) {
      throw new Error("Web Crypto API not supported")
    }

    const encryptionKey: CryptoKey = await this.deriveDeviceEncryptionKey()

    const iv: Uint8Array = this.base64ToBytes(encryptedData.iv)
    const encrypted: Uint8Array = this.base64ToBytes(encryptedData.encrypted)

    const decryptedBuffer: ArrayBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      encryptionKey,
      encrypted as BufferSource,
    )

    return new TextDecoder().decode(decryptedBuffer)
  }

  /**
   * Encrypt data using a password
   */
  static async encryptWithPassword(
    plaintext: string,
    password: string,
  ): Promise<EncryptedData> {
    if (!this.isSupported()) {
      throw new Error("Web Crypto API not supported")
    }

    // Generate random salt and IV
    const salt: Uint8Array = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
    const iv: Uint8Array = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

    const encryptionKey: CryptoKey = await this.derivePasswordEncryptionKey(
      password,
      salt,
    )

    // Encrypt
    const encryptedBuffer: ArrayBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      encryptionKey,
      new TextEncoder().encode(plaintext) as BufferSource,
    )

    return {
      encrypted: this.bytesToBase64(new Uint8Array(encryptedBuffer)),
      iv: this.bytesToBase64(iv),
      salt: this.bytesToBase64(salt),
      hasPassword: true,
    }
  }

  /**
   * Decrypt data that was encrypted with a password
   */
  static async decryptWithPassword(
    encryptedData: EncryptedData,
    password: string,
  ): Promise<string> {
    if (!this.isSupported()) {
      throw new Error("Web Crypto API not supported")
    }

    const salt: Uint8Array = this.base64ToBytes(encryptedData.salt)
    const iv: Uint8Array = this.base64ToBytes(encryptedData.iv)
    const encrypted: Uint8Array = this.base64ToBytes(encryptedData.encrypted)

    const encryptionKey: CryptoKey = await this.derivePasswordEncryptionKey(
      password,
      salt,
    )

    try {
      const decryptedBuffer: ArrayBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        encryptionKey,
        encrypted as BufferSource,
      )

      return new TextDecoder().decode(decryptedBuffer)
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "OperationError") {
        throw new Error("Incorrect password")
      }
      throw error
    }
  }

  /**
   * Encrypt data (auto-selects device key or password mode)
   */
  static async encrypt(plaintext: string, password?: string): Promise<EncryptedData> {
    if (password) {
      return this.encryptWithPassword(plaintext, password)
    }
    return this.encryptWithDeviceKey(plaintext)
  }

  /**
   * Decrypt data (auto-selects based on hasPassword flag)
   */
  static async decrypt(encryptedData: EncryptedData, password?: string): Promise<string> {
    if (encryptedData.hasPassword) {
      if (!password) {
        throw new Error("Password is required to decrypt this data")
      }
      return this.decryptWithPassword(encryptedData, password)
    }
    return this.decryptWithDeviceKey(encryptedData)
  }

  /**
   * Generate a random ID
   */
  static generateId(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    // Fallback for older browsers
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      (c: string): string => {
        const r: number = (Math.random() * 16) | 0
        const v: number = c === "x" ? r : (r & 0x3) | 0x8
        return v.toString(16)
      },
    )
  }

  /**
   * Generate a random hex string
   */
  static generateRandomHex(length: number = 32): string {
    const bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(length))
    return this.bytesToHex(bytes)
  }

  // ============= Encoding Utilities =============

  /**
   * Convert bytes to base64 string
   */
  static bytesToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
  }

  /**
   * Convert base64 string to bytes
   */
  static base64ToBytes(base64: string): Uint8Array {
    return Uint8Array.from(atob(base64), (c: string): number => c.charCodeAt(0))
  }

  /**
   * Convert bytes to hex string
   */
  static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b: number): string => b.toString(16).padStart(2, "0"))
      .join("")
  }

  /**
   * Convert hex string to bytes
   */
  static hexToBytes(hex: string): Uint8Array {
    const bytes: Uint8Array = new Uint8Array(hex.length / 2)
    for (let i: number = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
    }
    return bytes
  }

  /**
   * Hash a string using SHA-256
   */
  static async sha256(str: string): Promise<string> {
    const buffer: Uint8Array = new TextEncoder().encode(str)
    const hashBuffer: ArrayBuffer = await crypto.subtle.digest(
      "SHA-256",
      buffer as BufferSource,
    )
    return this.bytesToHex(new Uint8Array(hashBuffer))
  }

  /**
   * Clear the device key (use with caution - will make existing encrypted data unrecoverable)
   */
  static clearDeviceKey(): void {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(DEVICE_KEY_STORAGE)
    }
  }

  /**
   * Check if device key exists
   */
  static hasDeviceKey(): boolean {
    if (typeof localStorage === "undefined") return false
    return !!localStorage.getItem(DEVICE_KEY_STORAGE)
  }

  /**
   * Derive an encryption key from any string using PBKDF2
   * Useful for encrypting data with a known identifier (like a pubkey)
   */
  static async deriveCryptoKeyFromString(keyString: string): Promise<CryptoKey> {
    const keyMaterial: CryptoKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(keyString) as BufferSource,
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    )

    // Use a fixed salt combined with the key string for deterministic derivation
    const salt: Uint8Array = new TextEncoder().encode(
      `blinkpos-derived-${keyString.slice(0, 16)}`,
    )

    const encryptionKey: CryptoKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    )

    return encryptionKey
  }

  /**
   * Encrypt data using a derived key from a string
   */
  static async encryptWithDerivedKey(
    plaintext: string,
    keyString: string,
  ): Promise<EncryptedData> {
    if (!this.isSupported()) {
      throw new Error("Web Crypto API not supported")
    }

    const encryptionKey: CryptoKey = await this.deriveCryptoKeyFromString(keyString)

    // Generate random IV
    const iv: Uint8Array = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

    // Encrypt
    const encryptedBuffer: ArrayBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      encryptionKey,
      new TextEncoder().encode(plaintext) as BufferSource,
    )

    return {
      encrypted: this.bytesToBase64(new Uint8Array(encryptedBuffer)),
      iv: this.bytesToBase64(iv),
      salt: "", // Not used for derived key mode
      hasPassword: false,
    }
  }

  /**
   * Decrypt data that was encrypted with a derived key
   */
  static async decryptWithDerivedKey(
    encryptedData: EncryptedData,
    keyString: string,
  ): Promise<string> {
    if (!this.isSupported()) {
      throw new Error("Web Crypto API not supported")
    }

    const encryptionKey: CryptoKey = await this.deriveCryptoKeyFromString(keyString)

    const iv: Uint8Array = this.base64ToBytes(encryptedData.iv)
    const encrypted: Uint8Array = this.base64ToBytes(encryptedData.encrypted)

    try {
      const decryptedBuffer: ArrayBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        encryptionKey,
        encrypted as BufferSource,
      )

      return new TextDecoder().decode(decryptedBuffer)
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "OperationError") {
        throw new Error("Decryption failed - wrong key")
      }
      throw error
    }
  }
}

// For ES modules
export default CryptoUtils
export { CryptoUtils }
