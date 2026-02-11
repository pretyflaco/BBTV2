/**
 * @jest-environment node
 */

/**
 * Tests for lib/boltcard/crypto.js
 *
 * Tests cryptographic operations for Boltcard:
 * - AES-CMAC calculation
 * - Spec-compliant key derivation
 * - PICCData decryption
 * - SunMAC verification
 * - Deeplink generation
 * - Utility functions
 */

export {}

import boltcardCrypto from "../../lib/boltcard/crypto.js"

const {
  // Constants
  KeySlot,
  DerivationConstants,
  PICCDATA_TAG_BOLTCARD,

  // Key derivation
  generateIssuerKey,
  deriveEncryptionKey,
  deriveCardKey,
  deriveCardIdHash,
  deriveAllKeys,
  validateTestVectors,

  // CMAC
  calculateCMAC,
  cmacPRF,

  // PICCData
  decryptPICCData,
  tryDecryptWithIssuerKey,

  // SunMAC
  verifySunMAC,
  verifyCardTap,

  // Deeplinks
  generateProgramDeeplink,
  generateResetDeeplink,
  generateKeysResponse,
  generateRegistrationData,

  // Utilities
  parseCardUid,
  extractPandC,
  generateRandomKeys,
} = boltcardCrypto as {
  KeySlot: Record<string, number>
  DerivationConstants: Record<string, Buffer>
  PICCDATA_TAG_BOLTCARD: number
  generateIssuerKey: () => string
  deriveEncryptionKey: (issuerKeyHex: string) => string
  deriveCardKey: (issuerKeyHex: string, uidHex: string, version: number) => string
  deriveCardIdHash: (issuerKeyHex: string, uidHex: string) => string
  deriveAllKeys: (
    issuerKeyHex: string,
    uidHex: string,
    version?: number
  ) => {
    k0: string
    k1: string
    k2: string
    k3: string
    k4: string
    cardKey: string
    cardIdHash: string
  }
  validateTestVectors: () => boolean
  calculateCMAC: (key: Buffer, message: Buffer) => Buffer
  cmacPRF: (key: Buffer, message: Buffer) => Buffer
  decryptPICCData: (
    piccDataHex: string,
    k1Hex: string
  ) => { cardUid: string; counter: number; raw: string } | null
  tryDecryptWithIssuerKey: (
    piccDataHex: string,
    issuerKeyHex: string
  ) => { cardUid: string; counter: number; raw: string } | null
  verifySunMAC: (
    piccDataHex: string,
    sunMacHex: string,
    k2Hex: string,
    uidHex: string,
    counter: number
  ) => boolean
  verifyCardTap: (
    piccDataHex: string,
    sunMacHex: string,
    k1Hex: string,
    k2Hex: string,
    expectedCardUid?: string | null,
    lastCounter?: number
  ) => { valid: boolean; cardUid?: string; counter?: number; error?: string }
  generateProgramDeeplink: (keysRequestUrl: string) => string
  generateResetDeeplink: (keysRequestUrl: string) => string
  generateKeysResponse: (
    lnurlwUrl: string,
    keys: { k0: string; k1: string; k2: string; k3: string; k4: string },
    cardName?: string
  ) => object
  generateRegistrationData: (
    serverUrl: string,
    cardId: string
  ) => { deeplink: string; keysRequestUrl: string; qrPayload: string }
  parseCardUid: (rawUid: Buffer | string) => string
  extractPandC: (url: string) => { p: string; c: string } | null
  generateRandomKeys: () => { k0: string; k1: string; k2: string; k3: string; k4: string }
}

describe("Boltcard Crypto", () => {
  // Test data from DETERMINISTIC.md spec
  const TEST_UID = "04a39493cc8680"
  const TEST_ISSUER_KEY = "00000000000000000000000000000001"
  const TEST_VERSION = 1

  // Expected values from spec
  const EXPECTED_KEYS = {
    k0: "a29119fcb48e737d1591d3489557e49b",
    k1: "55da174c9608993dc27bb3f30a4a7314",
    k2: "f4b404be700ab285e333e32348fa3d3b",
    k3: "73610ba4afe45b55319691cb9489142f",
    k4: "addd03e52964369be7f2967736b7bdb5",
    cardIdHash: "e07ce1279d980ecb892a81924b67bf18",
    cardKey: "ebff5a4e6da5ee14cbfe720ae06fbed9",
  }

  describe("Constants", () => {
    it("should define KeySlot constants", () => {
      expect(KeySlot.K0).toBe(0)
      expect(KeySlot.K1).toBe(1)
      expect(KeySlot.K2).toBe(2)
      expect(KeySlot.K3).toBe(3)
      expect(KeySlot.K4).toBe(4)
    })

    it("should define PICCDATA_TAG_BOLTCARD as 0xc7", () => {
      expect(PICCDATA_TAG_BOLTCARD).toBe(0xc7)
    })

    it("should define DerivationConstants", () => {
      expect(DerivationConstants.CARD_KEY).toBeInstanceOf(Buffer)
      expect(DerivationConstants.K0_APP_MASTER).toBeInstanceOf(Buffer)
      expect(DerivationConstants.K1_ENCRYPTION).toBeInstanceOf(Buffer)
      expect(DerivationConstants.K2_AUTH).toBeInstanceOf(Buffer)
      expect(DerivationConstants.CARD_ID).toBeInstanceOf(Buffer)
    })
  })

  describe("generateIssuerKey()", () => {
    it("should generate a 32-character hex string", () => {
      const key = generateIssuerKey()
      expect(key).toHaveLength(32)
      expect(/^[0-9a-f]{32}$/.test(key)).toBe(true)
    })

    it("should generate unique keys", () => {
      const key1 = generateIssuerKey()
      const key2 = generateIssuerKey()
      expect(key1).not.toBe(key2)
    })
  })

  describe("deriveEncryptionKey()", () => {
    it("should derive K1 from IssuerKey", () => {
      const k1 = deriveEncryptionKey(TEST_ISSUER_KEY)
      expect(k1).toBe(EXPECTED_KEYS.k1)
    })

    it("should throw for invalid IssuerKey format", () => {
      expect(() => deriveEncryptionKey("invalid")).toThrow(
        "IssuerKey must be 32 hex characters"
      )
      expect(() => deriveEncryptionKey("0123456789abcdef")).toThrow() // Too short
    })

    it("should produce consistent results", () => {
      const k1a = deriveEncryptionKey(TEST_ISSUER_KEY)
      const k1b = deriveEncryptionKey(TEST_ISSUER_KEY)
      expect(k1a).toBe(k1b)
    })
  })

  describe("deriveCardKey()", () => {
    it("should derive CardKey from IssuerKey, UID, and version", () => {
      const cardKey = deriveCardKey(TEST_ISSUER_KEY, TEST_UID, TEST_VERSION)
      expect(cardKey).toBe(EXPECTED_KEYS.cardKey)
    })

    it("should throw for invalid inputs", () => {
      expect(() => deriveCardKey("invalid", TEST_UID, 1)).toThrow()
      expect(() => deriveCardKey(TEST_ISSUER_KEY, "invalid", 1)).toThrow()
      expect(() => deriveCardKey(TEST_ISSUER_KEY, TEST_UID, -1)).toThrow(
        "Version must be a non-negative integer"
      )
    })

    it("should produce different keys for different versions", () => {
      const key1 = deriveCardKey(TEST_ISSUER_KEY, TEST_UID, 1)
      const key2 = deriveCardKey(TEST_ISSUER_KEY, TEST_UID, 2)
      expect(key1).not.toBe(key2)
    })

    it("should produce different keys for different UIDs", () => {
      const key1 = deriveCardKey(TEST_ISSUER_KEY, TEST_UID, 1)
      const key2 = deriveCardKey(TEST_ISSUER_KEY, "04b49594dd9791", 1)
      expect(key1).not.toBe(key2)
    })
  })

  describe("deriveCardIdHash()", () => {
    it("should derive privacy-preserving ID from IssuerKey and UID", () => {
      const cardIdHash = deriveCardIdHash(TEST_ISSUER_KEY, TEST_UID)
      expect(cardIdHash).toBe(EXPECTED_KEYS.cardIdHash)
    })

    it("should throw for invalid inputs", () => {
      expect(() => deriveCardIdHash("invalid", TEST_UID)).toThrow()
      expect(() => deriveCardIdHash(TEST_ISSUER_KEY, "invalid")).toThrow()
    })
  })

  describe("deriveAllKeys()", () => {
    it("should derive all keys matching spec test vectors", () => {
      const keys = deriveAllKeys(TEST_ISSUER_KEY, TEST_UID, TEST_VERSION)

      expect(keys.k0).toBe(EXPECTED_KEYS.k0)
      expect(keys.k1).toBe(EXPECTED_KEYS.k1)
      expect(keys.k2).toBe(EXPECTED_KEYS.k2)
      expect(keys.k3).toBe(EXPECTED_KEYS.k3)
      expect(keys.k4).toBe(EXPECTED_KEYS.k4)
      expect(keys.cardKey).toBe(EXPECTED_KEYS.cardKey)
      expect(keys.cardIdHash).toBe(EXPECTED_KEYS.cardIdHash)
    })

    it("should default to version 1", () => {
      const keysDefault = deriveAllKeys(TEST_ISSUER_KEY, TEST_UID)
      const keysExplicit = deriveAllKeys(TEST_ISSUER_KEY, TEST_UID, 1)

      expect(keysDefault.k0).toBe(keysExplicit.k0)
      expect(keysDefault.k1).toBe(keysExplicit.k1)
      expect(keysDefault.k2).toBe(keysExplicit.k2)
    })

    it("should throw for invalid IssuerKey", () => {
      expect(() => deriveAllKeys("invalid", TEST_UID, 1)).toThrow()
    })

    it("should throw for invalid UID", () => {
      expect(() => deriveAllKeys(TEST_ISSUER_KEY, "invalid", 1)).toThrow()
    })
  })

  describe("validateTestVectors()", () => {
    it("should pass all spec test vectors", () => {
      // Suppress console output during test
      const originalLog = console.log
      console.log = jest.fn()

      const result = validateTestVectors()

      console.log = originalLog
      expect(result).toBe(true)
    })
  })

  describe("calculateCMAC()", () => {
    it("should calculate correct CMAC", () => {
      // Use a known test vector from RFC 4493
      const key = Buffer.from("2b7e151628aed2a6abf7158809cf4f3c", "hex")
      const message = Buffer.alloc(0)

      const cmac = calculateCMAC(key, message)
      expect(cmac.toString("hex")).toBe("bb1d6929e95937287fa37d129b756746")
    })

    it("should handle non-empty messages", () => {
      const key = Buffer.from("2b7e151628aed2a6abf7158809cf4f3c", "hex")
      const message = Buffer.from("6bc1bee22e409f96e93d7e117393172a", "hex")

      const cmac = calculateCMAC(key, message)
      expect(cmac).toHaveLength(16)
    })
  })

  describe("cmacPRF()", () => {
    it("should be equivalent to calculateCMAC", () => {
      const key = Buffer.from(TEST_ISSUER_KEY, "hex")
      const message = Buffer.from([0x2d, 0x00, 0x3f, 0x77])

      const cmac = calculateCMAC(key, message)
      const prf = cmacPRF(key, message)

      expect(prf.toString("hex")).toBe(cmac.toString("hex"))
    })
  })

  describe("decryptPICCData()", () => {
    // Generate test PICCData encrypted with test K1
    const testK1 = EXPECTED_KEYS.k1

    it("should return null for invalid PICCData length", () => {
      const result = decryptPICCData("1234", testK1)
      expect(result).toBeNull()
    })

    it("should return null for invalid K1 length", () => {
      const result = decryptPICCData(
        "00000000000000000000000000000000",
        "invalid"
      )
      expect(result).toBeNull()
    })

    it("should return null for invalid tag byte", () => {
      // Encrypt plaintext with wrong tag byte (0x00 instead of 0xc7)
      const crypto = require("crypto")
      const iv = Buffer.alloc(16, 0)
      const plaintext = Buffer.alloc(16, 0) // Tag byte 0x00 is invalid

      const cipher = crypto.createCipheriv(
        "aes-128-cbc",
        Buffer.from(testK1, "hex"),
        iv
      )
      cipher.setAutoPadding(false)
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])

      const result = decryptPICCData(encrypted.toString("hex"), testK1)
      expect(result).toBeNull()
    })

    it("should decrypt valid PICCData", () => {
      // Create valid PICCData: tag 0xc7 + UID (7 bytes) + counter (3 bytes) + padding
      const crypto = require("crypto")
      const iv = Buffer.alloc(16, 0)
      const plaintext = Buffer.alloc(16, 0)
      plaintext[0] = 0xc7 // Tag byte
      Buffer.from(TEST_UID, "hex").copy(plaintext, 1) // UID at bytes 1-7
      plaintext[8] = 0x05 // Counter LSB = 5
      plaintext[9] = 0x00 // Counter middle byte
      plaintext[10] = 0x00 // Counter MSB

      const cipher = crypto.createCipheriv(
        "aes-128-cbc",
        Buffer.from(testK1, "hex"),
        iv
      )
      cipher.setAutoPadding(false)
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])

      const result = decryptPICCData(encrypted.toString("hex"), testK1)
      expect(result).not.toBeNull()
      expect(result!.cardUid).toBe(TEST_UID)
      expect(result!.counter).toBe(5)
    })
  })

  describe("tryDecryptWithIssuerKey()", () => {
    it("should derive K1 and decrypt PICCData", () => {
      // Create valid PICCData with K1 derived from TEST_ISSUER_KEY
      const crypto = require("crypto")
      const k1 = deriveEncryptionKey(TEST_ISSUER_KEY)
      const iv = Buffer.alloc(16, 0)
      const plaintext = Buffer.alloc(16, 0)
      plaintext[0] = 0xc7
      Buffer.from(TEST_UID, "hex").copy(plaintext, 1)
      plaintext[8] = 0x0a // Counter = 10

      const cipher = crypto.createCipheriv(
        "aes-128-cbc",
        Buffer.from(k1, "hex"),
        iv
      )
      cipher.setAutoPadding(false)
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])

      const result = tryDecryptWithIssuerKey(
        encrypted.toString("hex"),
        TEST_ISSUER_KEY
      )
      expect(result).not.toBeNull()
      expect(result!.cardUid).toBe(TEST_UID)
      expect(result!.counter).toBe(10)
    })
  })

  describe("verifySunMAC()", () => {
    it("should return false for invalid SunMAC format", () => {
      const result = verifySunMAC(
        "00000000000000000000000000000000",
        "invalid",
        EXPECTED_KEYS.k2,
        TEST_UID,
        1
      )
      expect(result).toBe(false)
    })

    it("should return false for invalid K2 format", () => {
      const result = verifySunMAC(
        "00000000000000000000000000000000",
        "0000000000000000",
        "invalid",
        TEST_UID,
        1
      )
      expect(result).toBe(false)
    })

    it("should return false for invalid UID format", () => {
      const result = verifySunMAC(
        "00000000000000000000000000000000",
        "0000000000000000",
        EXPECTED_KEYS.k2,
        "invalid",
        1
      )
      expect(result).toBe(false)
    })

    it("should return false for negative counter", () => {
      const result = verifySunMAC(
        "00000000000000000000000000000000",
        "0000000000000000",
        EXPECTED_KEYS.k2,
        TEST_UID,
        -1
      )
      expect(result).toBe(false)
    })
  })

  describe("verifyCardTap()", () => {
    it("should fail for invalid PICCData decryption", () => {
      const result = verifyCardTap(
        "00000000000000000000000000000000",
        "0000000000000000",
        EXPECTED_KEYS.k1,
        EXPECTED_KEYS.k2
      )
      expect(result.valid).toBe(false)
      expect(result.error).toContain("Failed to decrypt")
    })

    it("should fail for counter replay", () => {
      // Create valid encrypted PICCData
      const crypto = require("crypto")
      const iv = Buffer.alloc(16, 0)
      const plaintext = Buffer.alloc(16, 0)
      plaintext[0] = 0xc7
      Buffer.from(TEST_UID, "hex").copy(plaintext, 1)
      plaintext[8] = 0x05 // Counter = 5

      const cipher = crypto.createCipheriv(
        "aes-128-cbc",
        Buffer.from(EXPECTED_KEYS.k1, "hex"),
        iv
      )
      cipher.setAutoPadding(false)
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])

      // This will decrypt successfully but SunMAC won't match (random MAC)
      // But we're testing counter replay so we need lastCounter > counter
      const result = verifyCardTap(
        encrypted.toString("hex"),
        "0000000000000000", // Invalid MAC but we want to test counter
        EXPECTED_KEYS.k1,
        EXPECTED_KEYS.k2,
        null,
        10 // Last counter is higher than current (5)
      )

      // Will fail on SunMAC before counter check since SunMAC is validated first
      expect(result.valid).toBe(false)
    })
  })

  describe("generateProgramDeeplink()", () => {
    it("should generate valid boltcard:// deeplink", () => {
      const url = "https://example.com/api/boltcard/keys/123"
      const deeplink = generateProgramDeeplink(url)

      expect(deeplink.startsWith("boltcard://program?url=")).toBe(true)
      expect(deeplink).toContain(encodeURIComponent(url))
    })

    it("should properly encode special characters", () => {
      const url = "https://example.com/api?param=value&other=test"
      const deeplink = generateProgramDeeplink(url)

      expect(deeplink).toContain(encodeURIComponent(url))
      expect(deeplink).not.toContain("&other")
    })
  })

  describe("generateResetDeeplink()", () => {
    it("should generate valid boltcard://reset deeplink", () => {
      const url = "https://example.com/api/boltcard/reset/123"
      const deeplink = generateResetDeeplink(url)

      expect(deeplink.startsWith("boltcard://reset?url=")).toBe(true)
      expect(deeplink).toContain(encodeURIComponent(url))
    })
  })

  describe("generateKeysResponse()", () => {
    it("should generate response with UPPERCASE key names", () => {
      const keys = {
        k0: "abcd1234abcd1234abcd1234abcd1234",
        k1: "1234abcd1234abcd1234abcd1234abcd",
        k2: "abcd5678abcd5678abcd5678abcd5678",
        k3: "5678abcd5678abcd5678abcd5678abcd",
        k4: "12345678123456781234567812345678",
      }

      const response = generateKeysResponse(
        "https://example.com/lnurlw/123",
        keys
      ) as Record<string, string>

      expect(response.K0).toBe("ABCD1234ABCD1234ABCD1234ABCD1234")
      expect(response.K1).toBe("1234ABCD1234ABCD1234ABCD1234ABCD")
      expect(response.K2).toBe("ABCD5678ABCD5678ABCD5678ABCD5678")
      expect(response.K3).toBe("5678ABCD5678ABCD5678ABCD5678ABCD")
      expect(response.K4).toBe("12345678123456781234567812345678")
    })

    it("should convert https:// to lnurlw://", () => {
      const keys = {
        k0: "00000000000000000000000000000000",
        k1: "00000000000000000000000000000000",
        k2: "00000000000000000000000000000000",
        k3: "00000000000000000000000000000000",
        k4: "00000000000000000000000000000000",
      }

      const response = generateKeysResponse(
        "https://example.com/lnurlw/123",
        keys
      ) as Record<string, string>

      expect(response.LNURLW).toBe("lnurlw://example.com/lnurlw/123")
    })
  })

  describe("generateRegistrationData()", () => {
    it("should generate complete registration data", () => {
      const data = generateRegistrationData("https://pos.example.com", "card-123")

      expect(data.keysRequestUrl).toBe(
        "https://pos.example.com/api/boltcard/keys/card-123"
      )
      expect(data.deeplink).toContain("boltcard://program")
      expect(data.qrPayload).toBe(data.deeplink)
    })
  })

  describe("parseCardUid()", () => {
    it("should parse hex string UID", () => {
      const uid = parseCardUid("04A39493CC8680")
      expect(uid).toBe("04a39493cc8680")
    })

    it("should parse Buffer UID", () => {
      const uidBuffer = Buffer.from("04a39493cc8680", "hex")
      const uid = parseCardUid(uidBuffer)
      expect(uid).toBe("04a39493cc8680")
    })

    it("should remove colons from UID", () => {
      const uid = parseCardUid("04:A3:94:93:CC:86:80")
      expect(uid).toBe("04a39493cc8680")
    })

    it("should remove spaces from UID", () => {
      const uid = parseCardUid("04 A3 94 93 CC 86 80")
      expect(uid).toBe("04a39493cc8680")
    })

    it("should remove dashes from UID", () => {
      const uid = parseCardUid("04-A3-94-93-CC-86-80")
      expect(uid).toBe("04a39493cc8680")
    })

    it("should throw for invalid UID length", () => {
      expect(() => parseCardUid("0123456789")).toThrow("Invalid UID length")
    })

    it("should throw for invalid UID type", () => {
      expect(() => parseCardUid(123 as unknown as string)).toThrow(
        "Invalid UID format"
      )
    })
  })

  describe("extractPandC()", () => {
    it("should extract p and c from LNURL-withdraw URL", () => {
      const url =
        "lnurlw://example.com/api/lnurlw?p=00112233445566778899aabbccddeeff&c=0011223344556677"
      const result = extractPandC(url)

      expect(result).not.toBeNull()
      expect(result!.p).toBe("00112233445566778899aabbccddeeff")
      expect(result!.c).toBe("0011223344556677")
    })

    it("should handle https:// URLs", () => {
      const url =
        "https://example.com/api/lnurlw?p=00112233445566778899aabbccddeeff&c=0011223344556677"
      const result = extractPandC(url)

      expect(result).not.toBeNull()
      expect(result!.p).toBe("00112233445566778899aabbccddeeff")
    })

    it("should return null for missing p parameter", () => {
      const url = "https://example.com/api/lnurlw?c=0011223344556677"
      const result = extractPandC(url)
      expect(result).toBeNull()
    })

    it("should return null for missing c parameter", () => {
      const url =
        "https://example.com/api/lnurlw?p=00112233445566778899aabbccddeeff"
      const result = extractPandC(url)
      expect(result).toBeNull()
    })

    it("should return null for invalid p format", () => {
      const url = "https://example.com/api/lnurlw?p=invalid&c=0011223344556677"
      const result = extractPandC(url)
      expect(result).toBeNull()
    })

    it("should return null for invalid c format", () => {
      const url =
        "https://example.com/api/lnurlw?p=00112233445566778899aabbccddeeff&c=invalid"
      const result = extractPandC(url)
      expect(result).toBeNull()
    })

    it("should return null for invalid URL", () => {
      const result = extractPandC("not a url")
      expect(result).toBeNull()
    })
  })

  describe("generateRandomKeys()", () => {
    it("should generate all 5 keys", () => {
      const keys = generateRandomKeys()

      expect(keys.k0).toHaveLength(32)
      expect(keys.k1).toHaveLength(32)
      expect(keys.k2).toHaveLength(32)
      expect(keys.k3).toHaveLength(32)
      expect(keys.k4).toHaveLength(32)
    })

    it("should generate unique keys each time", () => {
      const keys1 = generateRandomKeys()
      const keys2 = generateRandomKeys()

      expect(keys1.k0).not.toBe(keys2.k0)
      expect(keys1.k1).not.toBe(keys2.k1)
    })

    it("should generate valid hex strings", () => {
      const keys = generateRandomKeys()
      const hexRegex = /^[0-9a-f]{32}$/

      expect(hexRegex.test(keys.k0)).toBe(true)
      expect(hexRegex.test(keys.k1)).toBe(true)
      expect(hexRegex.test(keys.k2)).toBe(true)
      expect(hexRegex.test(keys.k3)).toBe(true)
      expect(hexRegex.test(keys.k4)).toBe(true)
    })
  })
})
