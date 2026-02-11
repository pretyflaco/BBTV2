/**
 * @jest-environment jsdom
 */

import {
  parseLightningAddress,
  isNpubCashAddress,
  validateNpub,
  validateNpubCashAddress,
  fetchLnurlPayMetadata,
  requestInvoiceFromCallback,
  getInvoiceFromLightningAddress,
  probeNpubCashAddress,
} from "../../lib/lnurl.js"

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch

describe("LNURL Utilities", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })
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

  describe("fetchLnurlPayMetadata()", () => {
    const validLnurlPayResponse = {
      tag: "payRequest",
      callback: "https://example.com/lnurlp/callback",
      minSendable: 1000, // 1 sat in millisats
      maxSendable: 100000000, // 100k sats in millisats
      metadata: '[["text/plain", "Test payment"]]',
      commentAllowed: 100,
      allowsNostr: true,
      nostrPubkey: "abc123",
    }

    it("should fetch and parse valid LNURL-pay response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => validLnurlPayResponse,
      })

      const result = await fetchLnurlPayMetadata(
        "https://example.com/.well-known/lnurlp/user",
      )

      expect(result.callback).toBe("https://example.com/lnurlp/callback")
      expect(result.minSendable).toBe(1000)
      expect(result.maxSendable).toBe(100000000)
      expect(result.commentAllowed).toBe(100)
      expect(result.allowsNostr).toBe(true)
      expect(result.nostrPubkey).toBe("abc123")
    })

    it("should throw for non-OK response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      await expect(
        fetchLnurlPayMetadata("https://example.com/.well-known/lnurlp/user"),
      ).rejects.toThrow("LNURL endpoint returned 404: Not Found")
    })

    it("should throw for wrong tag", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...validLnurlPayResponse, tag: "withdrawRequest" }),
      })

      await expect(
        fetchLnurlPayMetadata("https://example.com/.well-known/lnurlp/user"),
      ).rejects.toThrow("Invalid LNURL tag: expected 'payRequest'")
    })

    it("should throw for missing callback", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tag: "payRequest",
          minSendable: 1000,
          maxSendable: 100000,
        }),
      })

      await expect(
        fetchLnurlPayMetadata("https://example.com/.well-known/lnurlp/user"),
      ).rejects.toThrow("LNURL response missing callback URL")
    })

    it("should throw for missing min/max sendable", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tag: "payRequest",
          callback: "https://example.com/callback",
        }),
      })

      await expect(
        fetchLnurlPayMetadata("https://example.com/.well-known/lnurlp/user"),
      ).rejects.toThrow("LNURL response missing min/max sendable amounts")
    })

    it("should default commentAllowed and allowsNostr to falsy values", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tag: "payRequest",
          callback: "https://example.com/callback",
          minSendable: 1000,
          maxSendable: 100000,
        }),
      })

      const result = await fetchLnurlPayMetadata(
        "https://example.com/.well-known/lnurlp/user",
      )

      expect(result.commentAllowed).toBe(0)
      expect(result.allowsNostr).toBe(false)
    })
  })

  describe("requestInvoiceFromCallback()", () => {
    it("should request invoice with amount", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pr: "lnbc1000n1...",
          paymentHash: "abc123",
          successAction: { tag: "message", message: "Thanks!" },
        }),
      })

      const result = await requestInvoiceFromCallback(
        "https://example.com/callback",
        1000000, // 1000 sats in millisats
      )

      expect(result.paymentRequest).toBe("lnbc1000n1...")
      expect(result.paymentHash).toBe("abc123")
      expect(result.successAction).toEqual({
        tag: "message",
        message: "Thanks!",
      })

      // Check that amount was added to URL
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("amount=1000000"),
        expect.any(Object),
      )
    })

    it("should include comment when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pr: "lnbc1000n1...",
        }),
      })

      await requestInvoiceFromCallback(
        "https://example.com/callback",
        1000000,
        "Test payment",
      )

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("comment=Test"),
        expect.any(Object),
      )
    })

    it("should throw for non-OK response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      })

      await expect(
        requestInvoiceFromCallback("https://example.com/callback", 1000000),
      ).rejects.toThrow("LNURL callback returned 500: Internal Server Error")
    })

    it("should throw for ERROR status in response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ERROR",
          reason: "Amount too low",
        }),
      })

      await expect(
        requestInvoiceFromCallback("https://example.com/callback", 1000),
      ).rejects.toThrow("LNURL error: Amount too low")
    })

    it("should throw for missing payment request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      await expect(
        requestInvoiceFromCallback("https://example.com/callback", 1000000),
      ).rejects.toThrow("LNURL callback did not return a payment request")
    })
  })

  describe("getInvoiceFromLightningAddress()", () => {
    const validLnurlPayResponse = {
      tag: "payRequest",
      callback: "https://example.com/lnurlp/callback",
      minSendable: 1000,
      maxSendable: 100000000,
      metadata: '[["text/plain", "Test"]]',
      commentAllowed: 50,
    }

    it("should get invoice for valid Lightning address", async () => {
      // First call: fetch metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => validLnurlPayResponse,
      })
      // Second call: request invoice
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pr: "lnbc1000n1...",
          paymentHash: "hash123",
        }),
      })

      const result = await getInvoiceFromLightningAddress(
        "user@example.com",
        1000, // 1000 sats
        "Test memo",
      )

      expect(result.paymentRequest).toBe("lnbc1000n1...")
      expect(result.paymentHash).toBe("hash123")
      expect(result.metadata).toBeDefined()
    })

    it("should throw for amount below minimum", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...validLnurlPayResponse,
          minSendable: 10000, // 10 sats min
        }),
      })

      await expect(
        getInvoiceFromLightningAddress("user@example.com", 5), // Only 5 sats
      ).rejects.toThrow("below minimum")
    })

    it("should throw for amount above maximum", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...validLnurlPayResponse,
          maxSendable: 10000, // 10 sats max
        }),
      })

      await expect(
        getInvoiceFromLightningAddress("user@example.com", 100), // 100 sats
      ).rejects.toThrow("exceeds maximum")
    })

    it("should truncate comment if too long", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...validLnurlPayResponse,
          commentAllowed: 10, // Only 10 chars allowed
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pr: "lnbc1..." }),
      })

      await getInvoiceFromLightningAddress(
        "user@example.com",
        100,
        "This is a very long comment that should be truncated",
      )

      // Check that comment was truncated to 10 chars
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("comment=This+is+a+"),
        expect.any(Object),
      )
    })

    it("should omit comment if not allowed", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...validLnurlPayResponse,
          commentAllowed: 0, // Comments not allowed
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pr: "lnbc1..." }),
      })

      await getInvoiceFromLightningAddress(
        "user@example.com",
        100,
        "This comment should be ignored",
      )

      // Check that no comment parameter was sent
      const callUrl = mockFetch.mock.calls[1][0] as string
      expect(callUrl).not.toContain("comment=")
    })
  })

  describe("probeNpubCashAddress()", () => {
    it("should return valid for working npub.cash address", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tag: "payRequest",
          callback: "https://npub.cash/callback",
          minSendable: 1000,
          maxSendable: 100000000,
          allowsNostr: true,
        }),
      })

      const result = await probeNpubCashAddress("username@npub.cash")

      expect(result.valid).toBe(true)
      expect(result.minSats).toBe(1)
      expect(result.maxSats).toBe(100000)
      expect(result.allowsNostr).toBe(true)
    })

    it("should return invalid for non-npub.cash address", async () => {
      const result = await probeNpubCashAddress("user@blink.sv")

      expect(result.valid).toBe(false)
      expect(result.error).toContain("@npub.cash")
    })

    it("should return invalid with error for failed fetch", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await probeNpubCashAddress("nonexistent@npub.cash")

      expect(result.valid).toBe(false)
      expect(result.error).toContain("404")
    })

    it("should handle network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await probeNpubCashAddress("user@npub.cash")

      expect(result.valid).toBe(false)
      expect(result.error).toContain("Network error")
    })
  })
})
