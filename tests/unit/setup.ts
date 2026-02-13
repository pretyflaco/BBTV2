/**
 * Unit Test Setup
 *
 * Global setup for Jest unit tests.
 * Mocks browser APIs and sets up common test utilities.
 */

import "@testing-library/jest-dom"

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value?.toString()
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key]
    }),
    clear: jest.fn(() => {
      store = {}
    }),
    get length() {
      return Object.keys(store).length
    },
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
    // Helper for tests to inspect store
    _getStore: () => store,
  }
})()

// Set up localStorage mock globally
Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
  writable: true,
})

// Create proper crypto.subtle mock that passes isSupported() check
const mockSubtle = {
  importKey: jest.fn().mockResolvedValue({ type: "secret" }),
  deriveKey: jest.fn().mockResolvedValue({ type: "secret" }),
  encrypt: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
  decrypt: jest
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new TextEncoder().encode("decrypted-value").buffer),
    ),
  digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
}

// Mock crypto API for tests - must have subtle as a truthy value
const mockCrypto = {
  getRandomValues: jest.fn((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256)
    }
    return array
  }),
  randomUUID: jest.fn(() => "test-uuid-" + Math.random().toString(36).substring(7)),
  subtle: mockSubtle,
}

// Make sure window.crypto and global.crypto both point to mockCrypto
Object.defineProperty(global, "crypto", {
  value: mockCrypto,
  writable: true,
  configurable: true,
})

// Also set on window for browser-like environment
if (typeof window !== "undefined") {
  Object.defineProperty(window, "crypto", {
    value: mockCrypto,
    writable: true,
    configurable: true,
  })
}

// Mock fetch globally
global.fetch = jest.fn()

// Mock TextEncoder/TextDecoder if not available
if (typeof TextEncoder === "undefined") {
  ;(global as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = class {
    encode(str: string) {
      const arr = new Uint8Array(str.length)
      for (let i = 0; i < str.length; i++) {
        arr[i] = str.charCodeAt(i)
      }
      return arr
    }
  } as unknown as typeof TextEncoder
}

if (typeof TextDecoder === "undefined") {
  ;(global as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = class {
    decode(arr: ArrayBuffer) {
      return String.fromCharCode.apply(null, Array.from(new Uint8Array(arr)))
    }
  } as unknown as typeof TextDecoder
}

// Mock btoa/atob if not available
if (typeof btoa === "undefined") {
  ;(global as unknown as { btoa: typeof btoa }).btoa = (str: string) =>
    Buffer.from(str, "binary").toString("base64")
}

if (typeof atob === "undefined") {
  ;(global as unknown as { atob: typeof atob }).atob = (str: string) =>
    Buffer.from(str, "base64").toString("binary")
}

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
})

// Clean up after each test
afterEach(() => {
  jest.restoreAllMocks()
})

// Export utilities for tests
export { localStorageMock, mockCrypto, mockSubtle }
