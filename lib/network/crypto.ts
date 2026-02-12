/**
 * Crypto utilities for Network module
 * Handles encryption/decryption of sensitive data like API keys
 */

import crypto from "crypto"

// Encryption configuration
const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const TAG_LENGTH = 16
const KEY_LENGTH = 32

/**
 * Get encryption key from environment
 * @returns The encryption key as a Buffer
 */
function getEncryptionKey(): Buffer {
  const key = process.env.NETWORK_ENCRYPTION_KEY

  if (!key) {
    throw new Error("NETWORK_ENCRYPTION_KEY environment variable is required")
  }

  // If key is provided as hex string, convert to buffer
  if (key.length === 64) {
    return Buffer.from(key, "hex")
  }

  // If key is a passphrase, derive a key using scrypt
  return crypto.scryptSync(key, "blinkpos-network-salt", KEY_LENGTH)
}

/**
 * Encrypt sensitive data (like API keys)
 * @param plaintext - The data to encrypt
 * @returns Base64-encoded encrypted data (iv:tag:ciphertext), or null if input is falsy
 */
export function encrypt(plaintext: string | null | undefined): string | null {
  if (!plaintext) {
    return null
  }

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, "utf8", "base64")
  encrypted += cipher.final("base64")

  const tag = cipher.getAuthTag()

  // Combine iv, tag, and ciphertext
  const combined = Buffer.concat([iv, tag, Buffer.from(encrypted, "base64")])

  return combined.toString("base64")
}

/**
 * Decrypt sensitive data
 * @param encryptedData - Base64-encoded encrypted data
 * @returns Decrypted plaintext, or null if input is falsy
 */
export function decrypt(encryptedData: string | null | undefined): string | null {
  if (!encryptedData) {
    return null
  }

  const key = getEncryptionKey()
  const combined = Buffer.from(encryptedData, "base64")

  // Extract iv, tag, and ciphertext
  const iv = combined.subarray(0, IV_LENGTH)
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(ciphertext, undefined, "utf8")
  decrypted += decipher.final("utf8")

  return decrypted
}

/**
 * Generate a new encryption key (for initial setup)
 * @returns Hex-encoded 256-bit key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString("hex")
}

/**
 * Hash sensitive data for lookups (one-way)
 * @param data - Data to hash
 * @returns SHA-256 hex hash, or null if input is falsy
 */
export function hash(data: string | null | undefined): string | null {
  if (!data) {
    return null
  }
  return crypto.createHash("sha256").update(data).digest("hex")
}
