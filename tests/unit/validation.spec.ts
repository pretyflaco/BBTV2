/**
 * Unit Tests for lib/validation.ts
 *
 * Tests Zod schemas and the validateBody() helper.
 */

import type { NextApiRequest, NextApiResponse } from "next"

import {
  environmentSchema,
  currencySchema,
  satAmountSchema,
  optionalAmountSchema,
  paymentHashSchema,
  invoiceSchema,
  nostrPubkeySchema,
  createInvoiceSchema,
  payInvoiceSchema,
  checkPaymentSchema,
  verifyOwnershipSchema,
  nostrLoginSchema,
  createVoucherSchema,
  validateBody,
} from "../../lib/validation"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockReqRes(body: unknown): {
  req: NextApiRequest
  res: NextApiResponse & { _status: number | null; _json: unknown }
} {
  const req = { body } as NextApiRequest
  const res = {
    _status: null as number | null,
    _json: null as unknown,
    status(code: number) {
      res._status = code
      return res
    },
    json(data: unknown) {
      res._json = data
      return res
    },
  }
  return {
    req,
    res: res as unknown as NextApiResponse & {
      _status: number | null
      _json: unknown
    },
  }
}

// ---------------------------------------------------------------------------
// Shared field schemas
// ---------------------------------------------------------------------------

describe("lib/validation — shared schemas", () => {
  describe("environmentSchema", () => {
    it("should accept 'production'", () => {
      expect(environmentSchema.parse("production")).toBe("production")
    })

    it("should accept 'staging'", () => {
      expect(environmentSchema.parse("staging")).toBe("staging")
    })

    it("should default to 'production' when undefined", () => {
      expect(environmentSchema.parse(undefined)).toBe("production")
    })

    it("should reject invalid values", () => {
      expect(() => environmentSchema.parse("local")).toThrow()
    })
  })

  describe("currencySchema", () => {
    it("should accept valid currency codes", () => {
      expect(currencySchema.parse("BTC")).toBe("BTC")
      expect(currencySchema.parse("USD")).toBe("USD")
    })

    it("should reject empty string", () => {
      expect(() => currencySchema.parse("")).toThrow()
    })

    it("should reject strings longer than 10", () => {
      expect(() => currencySchema.parse("TOOLONGVALUE")).toThrow()
    })
  })

  describe("satAmountSchema", () => {
    it("should accept positive integers", () => {
      expect(satAmountSchema.parse(100)).toBe(100)
    })

    it("should coerce string numbers", () => {
      expect(satAmountSchema.parse("500")).toBe(500)
    })

    it("should reject zero", () => {
      expect(() => satAmountSchema.parse(0)).toThrow()
    })

    it("should reject negative numbers", () => {
      expect(() => satAmountSchema.parse(-10)).toThrow()
    })

    it("should reject floats", () => {
      expect(() => satAmountSchema.parse(1.5)).toThrow()
    })
  })

  describe("optionalAmountSchema", () => {
    it("should accept zero", () => {
      expect(optionalAmountSchema.parse(0)).toBe(0)
    })

    it("should accept positive numbers", () => {
      expect(optionalAmountSchema.parse(100)).toBe(100)
    })

    it("should accept undefined", () => {
      expect(optionalAmountSchema.parse(undefined)).toBeUndefined()
    })

    it("should reject negative numbers", () => {
      expect(() => optionalAmountSchema.parse(-1)).toThrow()
    })
  })

  describe("paymentHashSchema", () => {
    const validHash = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

    it("should accept a valid 64-char hex string", () => {
      expect(paymentHashSchema.parse(validHash)).toBe(validHash)
    })

    it("should be case-insensitive", () => {
      const upper = validHash.toUpperCase()
      expect(paymentHashSchema.parse(upper)).toBe(upper)
    })

    it("should reject short strings", () => {
      expect(() => paymentHashSchema.parse("abc123")).toThrow()
    })

    it("should reject non-hex characters", () => {
      const badHash = "g".repeat(64)
      expect(() => paymentHashSchema.parse(badHash)).toThrow()
    })
  })

  describe("invoiceSchema", () => {
    it("should accept non-empty strings", () => {
      expect(invoiceSchema.parse("lnbc123")).toBe("lnbc123")
    })

    it("should reject empty strings", () => {
      expect(() => invoiceSchema.parse("")).toThrow()
    })
  })

  describe("nostrPubkeySchema", () => {
    const validPubkey = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

    it("should accept a valid 64-char hex string", () => {
      expect(nostrPubkeySchema.parse(validPubkey)).toBe(validPubkey)
    })

    it("should reject invalid format", () => {
      expect(() => nostrPubkeySchema.parse("not-a-pubkey")).toThrow()
    })
  })
})

// ---------------------------------------------------------------------------
// Route-specific schemas
// ---------------------------------------------------------------------------

describe("lib/validation — route schemas", () => {
  describe("createInvoiceSchema", () => {
    it("should parse a valid create-invoice body", () => {
      const input = {
        amount: 1000,
        currency: "BTC",
      }
      const result = createInvoiceSchema.parse(input)
      expect(result.amount).toBe(1000)
      expect(result.currency).toBe("BTC")
      expect(result.environment).toBe("production") // default
      expect(result.tipRecipients).toEqual([]) // default
    })

    it("should accept string amounts", () => {
      const input = { amount: "5000", currency: "USD" }
      const result = createInvoiceSchema.parse(input)
      expect(result.amount).toBe("5000")
    })

    it("should reject missing required fields", () => {
      expect(() => createInvoiceSchema.parse({})).toThrow()
    })

    it("should reject memo longer than 640 chars", () => {
      const input = {
        amount: 100,
        currency: "BTC",
        memo: "x".repeat(641),
      }
      expect(() => createInvoiceSchema.parse(input)).toThrow()
    })
  })

  describe("payInvoiceSchema", () => {
    const validHash = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

    it("should parse a valid pay-invoice body", () => {
      const input = { paymentHash: validHash }
      const result = payInvoiceSchema.parse(input)
      expect(result.paymentHash).toBe(validHash)
      expect(result.memo).toBe("") // default
      expect(result.environment).toBe("production") // default
    })

    it("should reject invalid payment hash", () => {
      expect(() => payInvoiceSchema.parse({ paymentHash: "bad" })).toThrow()
    })
  })

  describe("checkPaymentSchema", () => {
    const validHash = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

    it("should parse a valid check-payment body", () => {
      const result = checkPaymentSchema.parse({ paymentHash: validHash })
      expect(result.paymentHash).toBe(validHash)
      expect(result.environment).toBe("production")
    })

    it("should accept staging environment", () => {
      const result = checkPaymentSchema.parse({
        paymentHash: validHash,
        environment: "staging",
      })
      expect(result.environment).toBe("staging")
    })
  })

  describe("verifyOwnershipSchema", () => {
    const validPubkey = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

    it("should parse a valid verify-ownership body", () => {
      const input = {
        signedEvent: {
          kind: 1,
          content: "hello",
          tags: [["e", "abc"]],
          pubkey: validPubkey,
          sig: "deadbeef",
        },
      }
      const result = verifyOwnershipSchema.parse(input)
      expect(result.signedEvent.pubkey).toBe(validPubkey)
    })

    it("should reject missing sig", () => {
      const input = {
        signedEvent: {
          kind: 1,
          content: "hello",
          tags: [],
          pubkey: validPubkey,
          // sig missing
        },
      }
      expect(() => verifyOwnershipSchema.parse(input)).toThrow()
    })
  })

  describe("nostrLoginSchema", () => {
    const validPubkey = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

    it("should parse a valid nostr-login body", () => {
      const input = {
        event: {
          kind: 27235,
          content: "",
          tags: [["u", "https://example.com"]],
          pubkey: validPubkey,
          sig: "sigvalue",
          id: "eventid",
          created_at: 1700000000,
        },
      }
      const result = nostrLoginSchema.parse(input)
      expect(result.event.kind).toBe(27235)
    })

    it("should reject wrong kind", () => {
      const input = {
        event: {
          kind: 1, // wrong — must be 27235
          content: "",
          tags: [],
          pubkey: validPubkey,
          sig: "s",
          id: "i",
          created_at: 123,
        },
      }
      expect(() => nostrLoginSchema.parse(input)).toThrow()
    })
  })

  describe("createVoucherSchema", () => {
    it("should parse a valid voucher body", () => {
      const result = createVoucherSchema.parse({ amount: 1000 })
      expect(result.amount).toBe(1000)
      expect(result.currency).toBe("BTC") // default
    })

    it("should reject zero amount", () => {
      expect(() => createVoucherSchema.parse({ amount: 0 })).toThrow()
    })

    it("should reject expiresInHours > 8760", () => {
      expect(() =>
        createVoucherSchema.parse({ amount: 100, expiresInHours: 9000 }),
      ).toThrow()
    })
  })
})

// ---------------------------------------------------------------------------
// validateBody() helper
// ---------------------------------------------------------------------------

describe("lib/validation — validateBody()", () => {
  it("should return parsed data on valid input", () => {
    const { req, res } = mockReqRes({
      paymentHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    })

    const result = validateBody(req, res, checkPaymentSchema)
    expect(result).not.toBeNull()
    expect(result!.paymentHash).toBe(
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    )
    expect(res._status).toBeNull() // no error response sent
  })

  it("should return null and send 400 on invalid input", () => {
    const { req, res } = mockReqRes({ paymentHash: "bad" })

    const result = validateBody(req, res, checkPaymentSchema)
    expect(result).toBeNull()
    expect(res._status).toBe(400)
    expect((res._json as Record<string, unknown>).error).toBe("Validation failed")
    expect((res._json as Record<string, unknown>).details).toBeDefined()
  })

  it("should return null on empty body", () => {
    const { req, res } = mockReqRes({})

    const result = validateBody(req, res, checkPaymentSchema)
    expect(result).toBeNull()
    expect(res._status).toBe(400)
  })
})
