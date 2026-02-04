/**
 * Unit Tests for lib/storage/CryptoUtils.js
 * 
 * Tests encryption utilities and encoding functions.
 * 
 * Note: Some encryption tests are skipped in CI as they require
 * full Web Crypto API support. These are tested manually or in
 * integration/E2E tests.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// We need to load this module dynamically due to mixed exports
let CryptoUtils;

beforeAll(async () => {
  // Dynamically import to avoid module system conflicts
  const mod = await import('../../lib/storage/CryptoUtils.js');
  CryptoUtils = mod.default || mod.CryptoUtils || mod;
});

// Check if real crypto API is available (not mocked)
const hasCryptoSupport = () => {
  return typeof window !== 'undefined' && 
         window.crypto && 
         window.crypto.subtle &&
         typeof window.crypto.subtle.encrypt === 'function';
};

describe('CryptoUtils', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('isSupported()', () => {
    it('should return truthy when crypto.subtle is available', () => {
      expect(CryptoUtils.isSupported()).toBeTruthy();
    });

    it('should return falsy when crypto is not available', () => {
      const originalCrypto = global.crypto;
      global.crypto = undefined;
      
      expect(CryptoUtils.isSupported()).toBeFalsy();
      
      global.crypto = originalCrypto;
    });
  });

  describe('generateId()', () => {
    it('should generate a UUID-like string', () => {
      const id = CryptoUtils.generateId();
      
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(10);
    });

    it('should generate unique IDs', () => {
      const id1 = CryptoUtils.generateId();
      const id2 = CryptoUtils.generateId();
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateRandomHex()', () => {
    // These tests require crypto.getRandomValues which isn't fully supported in happy-dom
    it.skip('should generate hex string of correct length (requires Web Crypto API)', () => {
      const hex = CryptoUtils.generateRandomHex(16);
      
      expect(hex).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
    });

    it.skip('should default to 32 bytes (requires Web Crypto API)', () => {
      const hex = CryptoUtils.generateRandomHex();
      
      expect(hex).toHaveLength(64); // 32 bytes = 64 hex chars
    });
  });

  describe('Encoding utilities', () => {
    describe('bytesToBase64() / base64ToBytes()', () => {
      it('should round-trip bytes correctly', () => {
        const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
        const base64 = CryptoUtils.bytesToBase64(original);
        const decoded = CryptoUtils.base64ToBytes(base64);
        
        expect(decoded).toEqual(original);
      });

      it('should produce valid base64 string', () => {
        const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
        const base64 = CryptoUtils.bytesToBase64(bytes);
        
        expect(base64).toBe('SGVsbG8=');
      });
    });

    describe('bytesToHex() / hexToBytes()', () => {
      it('should round-trip bytes correctly', () => {
        const original = new Uint8Array([0, 1, 15, 16, 255]);
        const hex = CryptoUtils.bytesToHex(original);
        const decoded = CryptoUtils.hexToBytes(hex);
        
        expect(decoded).toEqual(original);
      });

      it('should produce correct hex string', () => {
        const bytes = new Uint8Array([0, 15, 255]);
        const hex = CryptoUtils.bytesToHex(bytes);
        
        expect(hex).toBe('000fff');
      });

      it('should handle empty array', () => {
        const hex = CryptoUtils.bytesToHex(new Uint8Array(0));
        expect(hex).toBe('');
      });
    });
  });

  describe('Device Key Management', () => {
    describe('getOrCreateDeviceKey()', () => {
      // This test requires crypto.getRandomValues for key generation
      it.skip('should create a new device key if none exists (requires Web Crypto API)', async () => {
        const key = await CryptoUtils.getOrCreateDeviceKey();
        
        expect(key).toBeDefined();
        expect(typeof key).toBe('string');
        expect(localStorage.getItem('_blinkpos_dk')).toBe(key);
      });

      it('should return existing device key', async () => {
        const existingKey = 'existing-key-base64';
        localStorage.setItem('_blinkpos_dk', existingKey);
        
        const key = await CryptoUtils.getOrCreateDeviceKey();
        
        expect(key).toBe(existingKey);
      });
    });

    describe('hasDeviceKey()', () => {
      it('should return false when no key exists', () => {
        expect(CryptoUtils.hasDeviceKey()).toBe(false);
      });

      it('should return true when key exists', () => {
        localStorage.setItem('_blinkpos_dk', 'test-key');
        expect(CryptoUtils.hasDeviceKey()).toBe(true);
      });
    });

    describe('clearDeviceKey()', () => {
      it('should remove the device key', () => {
        localStorage.setItem('_blinkpos_dk', 'test-key');
        
        CryptoUtils.clearDeviceKey();
        
        expect(localStorage.getItem('_blinkpos_dk')).toBeNull();
      });
    });
  });

  describe('sha256()', () => {
    // This test requires crypto.subtle.digest which isn't fully supported in happy-dom
    it.skip('should return hex string of correct length (requires Web Crypto API)', async () => {
      const hash = await CryptoUtils.sha256('test input');
      
      expect(hash).toHaveLength(64); // SHA-256 = 32 bytes = 64 hex chars
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });
  });

  describe('Encryption/Decryption (Structure Tests)', () => {
    // Note: These tests require Web Crypto API
    // In environments without it, these are skipped
    // The actual crypto functionality is tested in E2E tests
    
    describe('encryptWithDeviceKey()', () => {
      it.skip('should return encrypted data structure (requires Web Crypto API)', async () => {
        const result = await CryptoUtils.encryptWithDeviceKey('test plaintext');
        
        expect(result).toHaveProperty('encrypted');
        expect(result).toHaveProperty('iv');
        expect(result).toHaveProperty('salt');
        expect(result).toHaveProperty('hasPassword', false);
      });

      it('should throw when crypto not supported', async () => {
        // Mock isSupported to return false
        const originalIsSupported = CryptoUtils.isSupported;
        CryptoUtils.isSupported = () => false;
        
        await expect(CryptoUtils.encryptWithDeviceKey('test')).rejects.toThrow('not supported');
        
        CryptoUtils.isSupported = originalIsSupported;
      });
    });

    describe('encryptWithPassword()', () => {
      it.skip('should return encrypted data with password flag (requires Web Crypto API)', async () => {
        const result = await CryptoUtils.encryptWithPassword('test plaintext', 'mypassword');
        
        expect(result).toHaveProperty('encrypted');
        expect(result).toHaveProperty('iv');
        expect(result).toHaveProperty('salt');
        expect(result).toHaveProperty('hasPassword', true);
      });
    });

    describe('encrypt() - auto mode', () => {
      it.skip('should use device key when no password provided (requires Web Crypto API)', async () => {
        const result = await CryptoUtils.encrypt('test');
        
        expect(result.hasPassword).toBe(false);
      });

      it.skip('should use password when provided (requires Web Crypto API)', async () => {
        const result = await CryptoUtils.encrypt('test', 'password');
        
        expect(result.hasPassword).toBe(true);
      });
    });

    describe('decrypt() - auto mode', () => {
      it('should require password for password-encrypted data', async () => {
        const encrypted = { hasPassword: true, encrypted: '', iv: '', salt: '' };
        
        await expect(CryptoUtils.decrypt(encrypted)).rejects.toThrow('Password is required');
      });

      it.skip('should not require password for device-key encrypted data (requires Web Crypto API)', async () => {
        const encrypted = { hasPassword: false, encrypted: 'YWJj', iv: 'ZGVm', salt: 'Z2hp' };
        
        // This should not throw (it will use device key)
        try {
          await CryptoUtils.decrypt(encrypted);
        } catch (e) {
          expect(e.message).not.toContain('Password is required');
        }
      });
    });
  });

  describe('Derived Key Encryption', () => {
    describe('encryptWithDerivedKey()', () => {
      it.skip('should return encrypted data structure (requires Web Crypto API)', async () => {
        const result = await CryptoUtils.encryptWithDerivedKey('test data', 'my-key-string');
        
        expect(result).toHaveProperty('encrypted');
        expect(result).toHaveProperty('iv');
        expect(result.salt).toBe(''); // Not used for derived key
        expect(result.hasPassword).toBe(false);
      });
    });
  });
});
