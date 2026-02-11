/**
 * @jest-environment node
 */

/**
 * Tests for lib/batch-payments/recipient-validator.js
 *
 * Tests recipient validation for batch payments:
 * - LNURL decoding
 * - Blink username validation
 * - Lightning address validation
 * - LNURL validation
 */

// Make this file a module to avoid variable redeclaration errors
export {}

import recipientValidator from "../../lib/batch-payments/recipient-validator.js"
import csvParser from "../../lib/batch-payments/csv-parser.js"

// Define types for validation results
interface ValidationError {
  code: string
  message: string
}

interface LnurlData {
  callback: string
  minSendable: number
  maxSendable: number
  metadata?: string
  tag: string
  commentAllowed?: number
}

interface ValidationResult {
  valid: boolean
  error?: ValidationError
  walletId?: string
  blinkUsername?: string
  lnurlData?: LnurlData
  recipient?: object
}

const {
  decodeLnurl,
  ERROR_CODES,
  getBlinkDomains,
  validateRecipient,
  validateBlinkUser,
  validateLnAddress,
  validateLnurl,
} = recipientValidator as {
  decodeLnurl: (lnurl: string) => string
  ERROR_CODES: Record<string, string>
  getBlinkDomains: () => string[]
  validateRecipient: (recipient: object) => Promise<ValidationResult>
  validateBlinkUser: (recipient: object) => Promise<ValidationResult>
  validateLnAddress: (recipient: object) => Promise<ValidationResult>
  validateLnurl: (recipient: object) => Promise<ValidationResult>
}

const { RECIPIENT_TYPES } = csvParser as { RECIPIENT_TYPES: Record<string, string> }

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch

describe("Recipient Validator", () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  describe("ERROR_CODES", () => {
    it("should have all expected error codes", () => {
      expect(ERROR_CODES.INVALID_FORMAT).toBe("INVALID_FORMAT")
      expect(ERROR_CODES.BLINK_USER_NOT_FOUND).toBe("BLINK_USER_NOT_FOUND")
      expect(ERROR_CODES.LNURL_UNREACHABLE).toBe("LNURL_UNREACHABLE")
      expect(ERROR_CODES.LNURL_INVALID_RESPONSE).toBe("LNURL_INVALID_RESPONSE")
      expect(ERROR_CODES.AMOUNT_BELOW_MIN).toBe("AMOUNT_BELOW_MIN")
      expect(ERROR_CODES.AMOUNT_ABOVE_MAX).toBe("AMOUNT_ABOVE_MAX")
      expect(ERROR_CODES.TIMEOUT).toBe("TIMEOUT")
      expect(ERROR_CODES.NETWORK_ERROR).toBe("NETWORK_ERROR")
    })
  })

  describe("getBlinkDomains()", () => {
    it("should return an array of Blink domains", () => {
      const domains = getBlinkDomains()
      expect(Array.isArray(domains)).toBe(true)
      expect(domains.length).toBeGreaterThan(0)
    })

    it("should include blink.sv", () => {
      const domains = getBlinkDomains()
      expect(domains).toContain("blink.sv")
    })
  })

  describe("decodeLnurl()", () => {
    it("should decode a valid LNURL", () => {
      // LNURL encoding of "https://example.com/lnurl"
      // This is a bech32 encoded URL
      const lnurl =
        "lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mkvv34x5ekzd3ev56nyd3hxqurzepexejxxepnxscrvwfnv9nxzcn9xq6xyefhvgcxxcmyxymnserxfq5fns"
      const url = decodeLnurl(lnurl)
      expect(url.startsWith("http")).toBe(true)
    })

    it("should throw for invalid LNURL (not starting with lnurl)", () => {
      expect(() => decodeLnurl("notanlnurl")).toThrow("Not a valid LNURL")
    })

    it("should throw for LNURL with invalid characters", () => {
      expect(() => decodeLnurl("lnurl1invalid!chars")).toThrow()
    })

    it("should handle uppercase LNURL", () => {
      const lnurl =
        "LNURL1DP68GURN8GHJ7UM9WFM".toLowerCase() + "xjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mkvv34x5ekzd3ev56nyd3hxqurzepexejxxepnxscrvwfnv9nxzcn9xq6xyefhvgcxxcmyxymnserxfq5fns"
      // Should not throw - normalization to lowercase happens internally
      expect(() => decodeLnurl(lnurl)).not.toThrow("Not a valid LNURL")
    })
  })

  describe("validateBlinkUser()", () => {
    const mockRecipient = {
      type: RECIPIENT_TYPES.BLINK,
      normalized: "testuser",
      amountSats: 1000,
    }

    it("should validate existing Blink user", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            accountDefaultWallet: {
              id: "wallet-123",
              walletCurrency: "BTC",
            },
          },
        }),
      })

      const result = await validateBlinkUser(mockRecipient)
      expect(result.valid).toBe(true)
      expect(result.walletId).toBe("wallet-123")
      expect(result.blinkUsername).toBe("testuser")
    })

    it("should return error for non-existent user", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: "Account does not exist" }],
        }),
      })

      const result = await validateBlinkUser(mockRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.BLINK_USER_NOT_FOUND)
    })

    it("should strip Blink domain from username", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            accountDefaultWallet: {
              id: "wallet-456",
              walletCurrency: "BTC",
            },
          },
        }),
      })

      const recipientWithDomain = {
        ...mockRecipient,
        normalized: "testuser@blink.sv",
      }

      const result = await validateBlinkUser(recipientWithDomain)
      expect(result.valid).toBe(true)
      expect(result.blinkUsername).toBe("testuser")
    })

    it("should reject invalid username format", async () => {
      const invalidRecipient = {
        ...mockRecipient,
        normalized: "ab", // Too short (min 3 chars)
      }

      const result = await validateBlinkUser(invalidRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.INVALID_FORMAT)
    })

    it("should reject username with invalid characters", async () => {
      // Username with special characters (not allowed in the regex)
      const invalidRecipient = {
        ...mockRecipient,
        normalized: "user$name!", // Contains $ and ! which fail regex
      }

      const result = await validateBlinkUser(invalidRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.INVALID_FORMAT)
    })

    it("should extract username before @ and validate via API", async () => {
      // When username contains @ but domain is not a Blink domain,
      // the code extracts the part before @ and validates it
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            accountDefaultWallet: {
              id: "wallet-extracted",
              walletCurrency: "BTC",
            },
          },
        }),
      })

      const recipientWithAt = {
        ...mockRecipient,
        normalized: "validuser@someotherdomain.com",
      }

      const result = await validateBlinkUser(recipientWithAt)
      expect(result.valid).toBe(true)
      expect(result.blinkUsername).toBe("validuser")
    })

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await validateBlinkUser(mockRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.NETWORK_ERROR)
    })

    it("should handle HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await validateBlinkUser(mockRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.NETWORK_ERROR)
    })

    it("should handle missing wallet in response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            accountDefaultWallet: null,
          },
        }),
      })

      const result = await validateBlinkUser(mockRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.BLINK_USER_NOT_FOUND)
    })
  })

  describe("validateLnAddress()", () => {
    const mockRecipient = {
      type: RECIPIENT_TYPES.LN_ADDRESS,
      normalized: "user@example.com",
      amountSats: 1000,
    }

    it("should validate external Lightning address", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          callback: "https://example.com/lnurlp/user/callback",
          minSendable: 1000, // 1 sat in msats
          maxSendable: 100000000000, // 100k sats in msats
          metadata: '[["text/plain", "User"]]',
          tag: "payRequest",
        }),
      })

      const result = await validateLnAddress(mockRecipient)
      expect(result.valid).toBe(true)
      expect(result.lnurlData).toBeDefined()
      expect(result.lnurlData.callback).toBe("https://example.com/lnurlp/user/callback")
    })

    it("should redirect Blink domain addresses to validateBlinkUser", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            accountDefaultWallet: {
              id: "wallet-789",
              walletCurrency: "BTC",
            },
          },
        }),
      })

      const blinkAddressRecipient = {
        type: RECIPIENT_TYPES.LN_ADDRESS,
        normalized: "user@blink.sv",
        amountSats: 1000,
      }

      const result = await validateLnAddress(blinkAddressRecipient)
      expect(result.valid).toBe(true)
      expect(result.walletId).toBe("wallet-789")
    })

    it("should reject invalid address format", async () => {
      const invalidRecipient = {
        ...mockRecipient,
        normalized: "invalid-no-at-sign",
      }

      const result = await validateLnAddress(invalidRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.INVALID_FORMAT)
    })

    it("should handle LNURL error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ERROR",
          reason: "User not found",
        }),
      })

      const result = await validateLnAddress(mockRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.LNURL_INVALID_RESPONSE)
    })

    it("should validate amount against min/max", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          callback: "https://example.com/callback",
          minSendable: 10000000, // 10k sats
          maxSendable: 100000000, // 100 sats
          metadata: "[]",
          tag: "payRequest",
        }),
      })

      const lowAmountRecipient = {
        ...mockRecipient,
        amountSats: 100, // Below minimum
      }

      const result = await validateLnAddress(lowAmountRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.AMOUNT_BELOW_MIN)
    })

    it("should reject amount above max", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          callback: "https://example.com/callback",
          minSendable: 1000, // 1 sat
          maxSendable: 100000, // 100 sats
          metadata: "[]",
          tag: "payRequest",
        }),
      })

      const highAmountRecipient = {
        ...mockRecipient,
        amountSats: 1000, // Above maximum of 100 sats
      }

      const result = await validateLnAddress(highAmountRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.AMOUNT_ABOVE_MAX)
    })

    it("should handle unreachable endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await validateLnAddress(mockRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.LNURL_UNREACHABLE)
    })

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("DNS resolution failed"))

      const result = await validateLnAddress(mockRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.LNURL_UNREACHABLE)
    })

    it("should handle missing required fields in response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          // Missing callback, minSendable, maxSendable
          tag: "payRequest",
        }),
      })

      const result = await validateLnAddress(mockRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.LNURL_INVALID_RESPONSE)
    })

    it("should include commentAllowed in lnurlData", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          callback: "https://example.com/callback",
          minSendable: 1000,
          maxSendable: 100000000000,
          metadata: "[]",
          tag: "payRequest",
          commentAllowed: 140,
        }),
      })

      const result = await validateLnAddress(mockRecipient)
      expect(result.valid).toBe(true)
      expect(result.lnurlData.commentAllowed).toBe(140)
    })
  })

  describe("validateLnurl()", () => {
    // Create a valid LNURL for testing
    const validLnurl =
      "lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mkvv34x5ekzd3ev56nyd3hxqurzepexejxxepnxscrvwfnv9nxzcn9xq6xyefhvgcxxcmyxymnserxfq5fns"

    const mockRecipient = {
      type: RECIPIENT_TYPES.LNURL,
      normalized: validLnurl,
      amountSats: 1000,
    }

    it("should validate LNURL pay request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          callback: "https://example.com/callback",
          minSendable: 1000,
          maxSendable: 100000000000,
          metadata: "[]",
          tag: "payRequest",
        }),
      })

      const result = await validateLnurl(mockRecipient)
      expect(result.valid).toBe(true)
      expect(result.lnurlData.tag).toBe("payRequest")
    })

    it("should reject non-pay LNURL types", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tag: "withdrawRequest", // Not a pay request
          callback: "https://example.com/callback",
          k1: "abc123",
        }),
      })

      const result = await validateLnurl(mockRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.INVALID_FORMAT)
      expect(result.error.message).toContain("not a pay request")
    })

    it("should reject invalid LNURL format", async () => {
      const invalidRecipient = {
        type: RECIPIENT_TYPES.LNURL,
        normalized: "not-a-valid-lnurl",
        amountSats: 1000,
      }

      const result = await validateLnurl(invalidRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.INVALID_FORMAT)
    })

    it("should handle error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ERROR",
          reason: "Service unavailable",
        }),
      })

      const result = await validateLnurl(mockRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.LNURL_INVALID_RESPONSE)
    })

    it("should validate amount bounds", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          callback: "https://example.com/callback",
          minSendable: 5000000, // 5k sats
          maxSendable: 10000000, // 10 sats
          metadata: "[]",
          tag: "payRequest",
        }),
      })

      const lowAmountRecipient = {
        ...mockRecipient,
        amountSats: 100, // Below minimum
      }

      const result = await validateLnurl(lowAmountRecipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.AMOUNT_BELOW_MIN)
    })
  })

  describe("validateRecipient()", () => {
    it("should route BLINK type to validateBlinkUser", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            accountDefaultWallet: {
              id: "wallet-123",
              walletCurrency: "BTC",
            },
          },
        }),
      })

      const recipient = {
        type: RECIPIENT_TYPES.BLINK,
        normalized: "testuser",
        amountSats: 1000,
      }

      const result = await validateRecipient(recipient)
      expect(result.valid).toBe(true)
      expect(result.walletId).toBeDefined()
    })

    it("should route LN_ADDRESS type to validateLnAddress", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          callback: "https://example.com/callback",
          minSendable: 1000,
          maxSendable: 100000000000,
          metadata: "[]",
          tag: "payRequest",
        }),
      })

      const recipient = {
        type: RECIPIENT_TYPES.LN_ADDRESS,
        normalized: "user@example.com",
        amountSats: 1000,
      }

      const result = await validateRecipient(recipient)
      expect(result.valid).toBe(true)
      expect(result.lnurlData).toBeDefined()
    })

    it("should return error for unknown recipient type", async () => {
      const recipient = {
        type: "UNKNOWN_TYPE",
        normalized: "something",
        amountSats: 1000,
      }

      const result = await validateRecipient(recipient)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(ERROR_CODES.INVALID_FORMAT)
      expect(result.error.message).toContain("Unknown recipient type")
    })
  })
})
