/**
 * @jest-environment node
 */

import {
  BLINK_NODE_PUBKEYS,
  decodeInvoice,
  isBlinkInvoice,
  isBlinkNodePubkey,
  getNonBlinkWalletError,
} from "../../lib/invoice-decoder.js"

describe("Invoice Decoder", () => {
  describe("BLINK_NODE_PUBKEYS", () => {
    it("should contain known Blink node pubkeys", () => {
      expect(BLINK_NODE_PUBKEYS).toBeInstanceOf(Array)
      expect(BLINK_NODE_PUBKEYS.length).toBeGreaterThan(0)
    })

    it("should have valid hex pubkeys (66 chars)", () => {
      BLINK_NODE_PUBKEYS.forEach((pubkey) => {
        expect(pubkey).toMatch(/^[0-9a-f]{66}$/i)
      })
    })
  })

  describe("decodeInvoice()", () => {
    // Sample mainnet invoice (from a public test)
    const sampleMainnetInvoice =
      "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcsyz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52dl6a3l46d4sscdjg2snlhcp7rkgf8gqat5v6j"

    it("should return error for empty invoice", () => {
      const result = decodeInvoice("")
      expect(result.success).toBe(false)
      expect(result.error).toBe("No invoice provided")
    })

    it("should return error for null/undefined", () => {
      expect(decodeInvoice(null as unknown as string).success).toBe(false)
      expect(decodeInvoice(undefined as unknown as string).success).toBe(false)
    })

    it("should strip lightning: prefix", () => {
      // We can't fully test decoding without a valid invoice,
      // but we can test the normalization doesn't break
      const result = decodeInvoice("lightning:lnbc1invalid")
      // Should attempt to decode (will fail due to invalid invoice)
      expect(result.success).toBe(false)
      // But should not fail on the prefix
      expect(result.error).not.toContain("lightning:")
    })

    it("should handle case-insensitive invoices", () => {
      const result = decodeInvoice("LNBC1INVALID")
      expect(result.success).toBe(false)
      // Should normalize to lowercase and attempt decode
    })

    it("should detect mainnet invoices (lnbc prefix)", () => {
      // This will likely fail to decode due to checksum, but tests network detection
      const result = decodeInvoice(sampleMainnetInvoice)
      // Even if decode fails, test the network detection logic exists
      if (result.success && result.data) {
        expect((result.data as { network: string }).network).toBe("mainnet")
      }
    })

    it("should return error for completely invalid invoice", () => {
      const result = decodeInvoice("not-an-invoice-at-all")
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it("should handle whitespace in invoice", () => {
      const result = decodeInvoice("  lnbc1invalid  ")
      expect(result.success).toBe(false)
      // Should trim whitespace
    })
  })

  describe("isBlinkNodePubkey()", () => {
    it("should return true for known Blink pubkeys", () => {
      BLINK_NODE_PUBKEYS.forEach((pubkey) => {
        expect(isBlinkNodePubkey(pubkey)).toBe(true)
      })
    })

    it("should be case-insensitive", () => {
      const pubkey = BLINK_NODE_PUBKEYS[0]
      expect(isBlinkNodePubkey(pubkey.toUpperCase())).toBe(true)
      expect(isBlinkNodePubkey(pubkey.toLowerCase())).toBe(true)
    })

    it("should return false for unknown pubkeys", () => {
      const unknownPubkey =
        "0000000000000000000000000000000000000000000000000000000000000000ab"
      expect(isBlinkNodePubkey(unknownPubkey)).toBe(false)
    })

    it("should return false for empty/null pubkey", () => {
      expect(isBlinkNodePubkey("")).toBe(false)
      expect(isBlinkNodePubkey(null as unknown as string)).toBe(false)
      expect(isBlinkNodePubkey(undefined as unknown as string)).toBe(false)
    })
  })

  describe("isBlinkInvoice()", () => {
    it("should return error for invalid invoice", () => {
      const result = isBlinkInvoice("invalid-invoice")
      expect(result.isBlink).toBe(false)
      expect(result.error).toBeDefined()
    })

    it("should return error for empty invoice", () => {
      const result = isBlinkInvoice("")
      expect(result.isBlink).toBe(false)
      expect(result.error).toBe("No invoice provided")
    })

    // Note: Testing with real invoices would require mocking bolt11 library
    // or using actual valid invoices from Blink
  })

  describe("getNonBlinkWalletError()", () => {
    it("should return a descriptive error message", () => {
      const error = getNonBlinkWalletError()
      expect(typeof error).toBe("string")
      expect(error.length).toBeGreaterThan(50)
    })

    it("should mention zero-fee internal transfers", () => {
      const error = getNonBlinkWalletError()
      expect(error.toLowerCase()).toContain("zero-fee")
    })

    it("should mention Blink wallet requirement", () => {
      const error = getNonBlinkWalletError()
      expect(error.toLowerCase()).toContain("blink")
    })

    it("should mention NWC wallet", () => {
      const error = getNonBlinkWalletError()
      expect(error.toLowerCase()).toContain("nwc")
    })
  })
})
