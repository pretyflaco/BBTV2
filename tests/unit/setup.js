/**
 * Unit Test Setup
 * 
 * Global setup for Vitest unit tests.
 * Mocks browser APIs and sets up common test utilities.
 */

import { vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value?.toString();
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index) => Object.keys(store)[index] || null),
    // Helper for tests to inspect store
    _getStore: () => store,
  };
})();

// Set up localStorage mock globally
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Create proper crypto.subtle mock that passes isSupported() check
const mockSubtle = {
  importKey: vi.fn().mockResolvedValue({ type: 'secret' }),
  deriveKey: vi.fn().mockResolvedValue({ type: 'secret' }),
  encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
  decrypt: vi.fn().mockImplementation(() => Promise.resolve(new TextEncoder().encode('decrypted-value').buffer)),
  digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
};

// Mock crypto API for tests - must have subtle as a truthy value
const mockCrypto = {
  getRandomValues: vi.fn((array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  }),
  randomUUID: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substring(7)),
  subtle: mockSubtle,
};

// Make sure window.crypto and global.crypto both point to mockCrypto
Object.defineProperty(global, 'crypto', {
  value: mockCrypto,
  writable: true,
  configurable: true,
});

// Also set on window for browser-like environment
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'crypto', {
    value: mockCrypto,
    writable: true,
    configurable: true,
  });
}

// Mock fetch globally
global.fetch = vi.fn();

// Mock TextEncoder/TextDecoder if not available
if (typeof TextEncoder === 'undefined') {
  global.TextEncoder = class {
    encode(str) {
      const arr = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        arr[i] = str.charCodeAt(i);
      }
      return arr;
    }
  };
}

if (typeof TextDecoder === 'undefined') {
  global.TextDecoder = class {
    decode(arr) {
      return String.fromCharCode.apply(null, new Uint8Array(arr));
    }
  };
}

// Mock btoa/atob if not available
if (typeof btoa === 'undefined') {
  global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
}

if (typeof atob === 'undefined') {
  global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
}

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks();
});

// Export utilities for tests
export { localStorageMock, mockCrypto, mockSubtle };
