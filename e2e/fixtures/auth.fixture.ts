/**
 * Auth Fixture - Injects authenticated state into localStorage
 *
 * This fixture allows tests to run with pre-authenticated state,
 * bypassing the interactive Nostr login flow.
 *
 * The encryption matches the app's CryptoUtils implementation:
 * - Uses AES-GCM encryption with a device-specific key
 * - Device key is stored in localStorage under '_blinkpos_dk'
 */

import { Page } from "@playwright/test"

import { TEST_CREDENTIALS } from "./test-data"

// Storage keys (must match ProfileStorage.js)
const PROFILES_STORAGE_KEY = "blinkpos_profiles"
const ACTIVE_PROFILE_KEY = "blinkpos_active_profile"
const DEVICE_KEY_STORAGE = "_blinkpos_dk"
const ENVIRONMENT_KEY = "blink_environment"

// Type definitions
interface EncryptedData {
  encrypted: string
  iv: string
  salt: string
  hasPassword: boolean
}

interface BlinkAccount {
  id: string
  label: string
  apiKey: EncryptedData
  username: string
  defaultCurrency: string
  isActive: boolean
  createdAt: number
  lastUsed: number | null
}

interface _Profile {
  id: string
  publicKey: string
  signInMethod: string
  createdAt: number
  lastLogin: number
  blinkAccounts: BlinkAccount[]
  nwcConnections: never[]
  tippingSettings: {
    enabled: boolean
    defaultPercentages: number[]
    customAmountEnabled: boolean
    forwardToNWC: boolean
    forwardNWCId: null
  }
  preferences: {
    defaultCurrency: string
    darkMode: boolean
    sounds: boolean
    language: string
    numberFormat: string
  }
}

export interface AuthSetupOptions {
  apiKey?: string
  username?: string
  publicKey?: string
  defaultCurrency?: "BTC" | "USD"
}

/**
 * Generate a random ID (matches CryptoUtils.generateId)
 */
function _generateId(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  )
}

/**
 * Generate a random hex public key (for testing, not a real Nostr key)
 */
function generateTestPublicKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Setup authenticated state in localStorage
 *
 * This function:
 * 1. Generates/retrieves a device key
 * 2. Encrypts the API key using AES-GCM (matching the app's encryption)
 * 3. Creates a valid profile structure
 * 4. Injects it into localStorage
 * 5. Sets the environment to staging
 *
 * @param page - Playwright page instance
 * @param options - Configuration options
 */
export async function setupAuthenticatedState(
  page: Page,
  options: AuthSetupOptions = {},
): Promise<{ profileId: string; publicKey: string }> {
  const {
    apiKey = TEST_CREDENTIALS.apiKeys.readReceiveWrite,
    username = "e2e-test",
    publicKey = generateTestPublicKey(),
    defaultCurrency = "BTC",
  } = options

  // Navigate to app first to establish the page context
  await page.goto("/")
  await page.waitForLoadState("domcontentloaded")

  // Execute encryption and localStorage setup in browser context
  const result = await page.evaluate(
    async ({
      apiKey,
      username,
      publicKey,
      defaultCurrency,
      PROFILES_STORAGE_KEY,
      ACTIVE_PROFILE_KEY,
      DEVICE_KEY_STORAGE,
      ENVIRONMENT_KEY,
    }) => {
      // Helper functions (must be defined inside evaluate)
      function _generateId(): string {
        return (
          Math.random().toString(36).substring(2, 15) +
          Math.random().toString(36).substring(2, 15)
        )
      }

      function bytesToBase64(bytes: Uint8Array): string {
        let binary = ""
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        return btoa(binary)
      }

      function base64ToBytes(base64: string): Uint8Array {
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        return bytes
      }

      // Get or create device key
      let deviceKey = localStorage.getItem(DEVICE_KEY_STORAGE)
      if (!deviceKey) {
        const keyBytes = crypto.getRandomValues(new Uint8Array(32))
        deviceKey = bytesToBase64(keyBytes)
        localStorage.setItem(DEVICE_KEY_STORAGE, deviceKey)
      }

      // Derive encryption key (matching CryptoUtils.deriveDeviceEncryptionKey)
      const deviceKeyBytes = base64ToBytes(deviceKey)
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        // @ts-expect-error - Uint8Array works at runtime in browser context
        deviceKeyBytes,
        { name: "PBKDF2" },
        false,
        ["deriveKey"],
      )

      const salt = new TextEncoder().encode("blinkpos-device-salt-v1")
      const encryptionKey = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: 100000,
          hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      )

      // Encrypt the API key
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encodedApiKey = new TextEncoder().encode(apiKey)
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        encryptionKey,
        encodedApiKey,
      )

      const encryptedApiKey: {
        encrypted: string
        iv: string
        salt: string
        hasPassword: boolean
      } = {
        encrypted: bytesToBase64(new Uint8Array(encryptedBuffer)),
        iv: bytesToBase64(iv),
        salt: "", // Device key mode uses fixed salt
        hasPassword: false,
      }

      // Create profile
      const profileId = _generateId()
      const accountId = _generateId()
      const now = Date.now()

      const profile = {
        id: profileId,
        publicKey: publicKey.toLowerCase(),
        signInMethod: "extension", // Simulate extension sign-in
        createdAt: now,
        lastLogin: now,
        blinkAccounts: [
          {
            id: accountId,
            label: "E2E Test Account",
            apiKey: encryptedApiKey,
            username: username,
            defaultCurrency: defaultCurrency,
            isActive: true,
            createdAt: now,
            lastUsed: now,
          },
        ],
        nwcConnections: [],
        tippingSettings: {
          enabled: true,
          defaultPercentages: [10, 15, 20],
          customAmountEnabled: true,
          forwardToNWC: false,
          forwardNWCId: null,
        },
        preferences: {
          defaultCurrency: defaultCurrency,
          darkMode: true,
          sounds: true,
          language: "en",
          numberFormat: "auto",
        },
      }

      // Save to localStorage
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([profile]))
      localStorage.setItem(ACTIVE_PROFILE_KEY, profileId)
      localStorage.setItem(ENVIRONMENT_KEY, "staging")

      return { profileId, publicKey: publicKey.toLowerCase() }
    },
    {
      apiKey,
      username,
      publicKey,
      defaultCurrency,
      PROFILES_STORAGE_KEY,
      ACTIVE_PROFILE_KEY,
      DEVICE_KEY_STORAGE,
      ENVIRONMENT_KEY,
    },
  )

  // Reload page to pick up the new auth state
  await page.reload()
  await page.waitForLoadState("domcontentloaded")

  return result
}

/**
 * Clear all authentication state from localStorage
 *
 * @param page - Playwright page instance
 */
export async function clearAuthState(page: Page): Promise<void> {
  await page.evaluate(
    ({
      PROFILES_STORAGE_KEY,
      ACTIVE_PROFILE_KEY,
      DEVICE_KEY_STORAGE,
      ENVIRONMENT_KEY,
    }) => {
      localStorage.removeItem(PROFILES_STORAGE_KEY)
      localStorage.removeItem(ACTIVE_PROFILE_KEY)
      localStorage.removeItem(DEVICE_KEY_STORAGE)
      localStorage.removeItem(ENVIRONMENT_KEY)
    },
    {
      PROFILES_STORAGE_KEY,
      ACTIVE_PROFILE_KEY,
      DEVICE_KEY_STORAGE,
      ENVIRONMENT_KEY,
    },
  )
}

/**
 * Check if the page has authenticated state
 *
 * @param page - Playwright page instance
 * @returns true if authenticated state exists
 */
export async function hasAuthState(page: Page): Promise<boolean> {
  return page.evaluate(
    ({ PROFILES_STORAGE_KEY, ACTIVE_PROFILE_KEY }) => {
      const profiles = localStorage.getItem(PROFILES_STORAGE_KEY)
      const activeProfile = localStorage.getItem(ACTIVE_PROFILE_KEY)
      return !!(profiles && activeProfile)
    },
    {
      PROFILES_STORAGE_KEY,
      ACTIVE_PROFILE_KEY,
    },
  )
}

/**
 * Set the environment (staging or production)
 *
 * @param page - Playwright page instance
 * @param environment - 'staging' or 'production'
 */
export async function setEnvironment(
  page: Page,
  environment: "staging" | "production",
): Promise<void> {
  await page.evaluate(
    ({ env, key }) => {
      localStorage.setItem(key, env)
    },
    { env: environment, key: ENVIRONMENT_KEY },
  )
}
