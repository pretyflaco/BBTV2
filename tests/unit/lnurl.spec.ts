/**
 * @jest-environment jsdom
 */

import {
  parseLightningAddress,
  isNpubCashAddress,
  validateNpub,
  validateNpubCashAddress,
} from "../../lib/lnurl.js"

describe("LNURL Utilities", () => {
  describe("parseLightningAddress()", () => {
    it("should parse valid Lightning address", () => {
      const result = parseLightningAddress("user@domain.com")
      expect(result.localpart).toBe("user")
      expect(result.domain).toBe("domain.com")
      expect(result.lnurlEndpoint).toBe(
        "https://domain.com/.well-known/lnurlp/user",
      )
    })

    it("should handle complex usernames", () => {
      const result = parseLightningAddress("user.name+tag@example.org")
      expect(result.localpart).toBe("user.name+tag")
      expect(result.domain).toBe("example.org")
    })

    it("should handle subdomains", () => {
      const result = parseLightningAddress("user@sub.domain.com")
      expect(result.domain).toBe("sub.domain.com")
      expect(result.lnurlEndpoint).toBe(
        "https://sub.domain.com/.well-known/lnurlp/user",
      )
    })

    it("should throw for invalid address without @", () => {
      expect(() => parseLightningAddress("userwithoutat")).toThrow(
        "Invalid Lightning address format",
      )
    })

    it("should throw for address with multiple @", () => {
      expect(() => parseLightningAddress("user@domain@extra")).toThrow(
        "Invalid Lightning address format",
      )
    })

    it("should throw for empty string", () => {
      expect(() => parseLightningAddress("")).toThrow(
        "Invalid Lightning address: address is required",
      )
    })

    it("should throw for null/undefined", () => {
      expect(() => parseLightningAddress(null as unknown as string)).toThrow(
        "Invalid Lightning address: address is required",
      )
      expect(() =>
        parseLightningAddress(undefined as unknown as string),
      ).toThrow("Invalid Lightning address: address is required")
    })

    it("should throw for missing localpart", () => {
      expect(() => parseLightningAddress("@domain.com")).toThrow(
        "Invalid Lightning address: missing local part or domain",
      )
    })

    it("should throw for missing domain", () => {
      expect(() => parseLightningAddress("user@")).toThrow(
        "Invalid Lightning address: missing local part or domain",
      )
    })
  })

  describe("isNpubCashAddress()", () => {
    it("should return true for npub.cash addresses", () => {
      expect(isNpubCashAddress("user@npub.cash")).toBe(true)
      expect(isNpubCashAddress("npub1abc@npub.cash")).toBe(true)
    })

    it("should be case-insensitive", () => {
      expect(isNpubCashAddress("user@NPUB.CASH")).toBe(true)
      expect(isNpubCashAddress("user@Npub.Cash")).toBe(true)
    })

    it("should return false for non-npub.cash addresses", () => {
      expect(isNpubCashAddress("user@blink.sv")).toBe(false)
      expect(isNpubCashAddress("user@example.com")).toBe(false)
      expect(isNpubCashAddress("user@npub.com")).toBe(false)
    })

    it("should return false for invalid input", () => {
      expect(isNpubCashAddress("")).toBe(false)
      expect(isNpubCashAddress(null as unknown as string)).toBe(false)
      expect(isNpubCashAddress(undefined as unknown as string)).toBe(false)
      expect(isNpubCashAddress(123 as unknown as string)).toBe(false)
    })
  })

  describe("validateNpub()", () => {
    // Valid npub for testing (generated)
    const validNpub =
      "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3yfe9m"

    it("should validate correct npub format", () => {
      // Use a real npub that decodes properly
      const result = validateNpub(
        "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
      )
      expect(result.valid).toBe(true)
      expect(result.pubkey).toBeDefined()
      expect(result.pubkey).toHaveLength(64) // hex pubkey is 64 chars
    })

    it("should reject npub not starting with npub1", () => {
      const result = validateNpub("nsec1abc")
      expect(result.valid).toBe(false)
      expect(result.error).toContain("npub must start with npub1")
    })

    it("should reject empty npub", () => {
      const result = validateNpub("")
      expect(result.valid).toBe(false)
      expect(result.error).toContain("npub is required")
    })

    it("should reject null/undefined", () => {
      expect(validateNpub(null as unknown as string).valid).toBe(false)
      expect(validateNpub(undefined as unknown as string).valid).toBe(false)
    })

    it("should reject invalid npub encoding", () => {
      const result = validateNpub("npub1invalid")
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe("validateNpubCashAddress()", () => {
    it("should reject non-npub.cash addresses", () => {
      const result = validateNpubCashAddress("user@blink.sv")
      expect(result.valid).toBe(false)
      expect(result.error).toContain("@npub.cash")
    })

    it("should validate username-based addresses", () => {
      const result = validateNpubCashAddress("username@npub.cash")
      expect(result.valid).toBe(true)
      expect(result.localpart).toBe("username")
      expect(result.isNpub).toBe(false)
    })

    it("should validate npub-based addresses", () => {
      const validNpub =
        "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6"
      const result = validateNpubCashAddress(`${validNpub}@npub.cash`)
      expect(result.valid).toBe(true)
      expect(result.isNpub).toBe(true)
      expect(result.pubkey).toBeDefined()
    })

    it("should reject invalid npub in address", () => {
      const result = validateNpubCashAddress("npub1invalid@npub.cash")
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it("should reject empty username", () => {
      // validateNpubCashAddress calls parseLightningAddress which throws
      // for addresses with empty localpart like "@npub.cash"
      expect(() => validateNpubCashAddress("@npub.cash")).toThrow()
    })
  })

  describe("Integration: Lightning Address -> LNURL endpoint", () => {
    it("should construct correct LNURL-pay endpoint for blink.sv", () => {
      const result = parseLightningAddress("alice@blink.sv")
      expect(result.lnurlEndpoint).toBe(
        "https://blink.sv/.well-known/lnurlp/alice",
      )
    })

    it("should construct correct LNURL-pay endpoint for npub.cash", () => {
      const result = parseLightningAddress("myname@npub.cash")
      expect(result.lnurlEndpoint).toBe(
        "https://npub.cash/.well-known/lnurlp/myname",
      )
    })
  })
})
