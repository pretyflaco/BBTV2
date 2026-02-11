/**
 * @jest-environment node
 */

const feeCalculator = require("../../lib/batch-payments/fee-calculator.js")
const csvParser = require("../../lib/batch-payments/csv-parser.js")

const {
  estimateFee,
  calculateFeeSummary,
  validateBalance,
  DEFAULT_FEE_RATE,
  MIN_FEE_SATS,
  MAX_FEE_RATE,
} = feeCalculator

const { RECIPIENT_TYPES } = csvParser

describe("Fee Calculator", () => {
  describe("Constants", () => {
    it("should have reasonable default fee rate", () => {
      expect(DEFAULT_FEE_RATE).toBe(0.003) // 0.3%
    })

    it("should have minimum fee of 1 sat", () => {
      expect(MIN_FEE_SATS).toBe(1)
    })

    it("should cap fee rate at 1%", () => {
      expect(MAX_FEE_RATE).toBe(0.01)
    })
  })

  describe("estimateFee()", () => {
    it("should return zero fee for Blink recipients (intra-ledger)", () => {
      const validationResult = {
        recipient: {
          type: RECIPIENT_TYPES.BLINK,
          normalized: "alice",
          amountSats: 10000,
        },
        valid: true,
        walletId: "wallet-123",
      }

      const result = estimateFee(validationResult)
      expect(result.success).toBe(true)
      expect(result.isIntraLedger).toBe(true)
      expect(result.fee.sats).toBe(0)
      expect(result.fee.percentage).toBe(0)
    })

    it("should estimate fee for external recipients", () => {
      const validationResult = {
        recipient: {
          type: RECIPIENT_TYPES.LN_ADDRESS,
          normalized: "user@example.com",
          amountSats: 10000,
        },
        valid: true,
        lnurlData: { callback: "https://example.com/callback" },
      }

      const result = estimateFee(validationResult)
      expect(result.success).toBe(true)
      expect(result.isIntraLedger).toBe(false)
      expect(result.fee.sats).toBeGreaterThan(0)
      expect(result.estimated).toBe(true)
    })

    it("should apply minimum fee for small amounts", () => {
      const validationResult = {
        recipient: {
          type: RECIPIENT_TYPES.LN_ADDRESS,
          normalized: "user@example.com",
          amountSats: 10, // Very small amount
        },
        valid: true,
        lnurlData: {},
      }

      const result = estimateFee(validationResult)
      expect(result.fee.sats).toBe(MIN_FEE_SATS) // At least 1 sat
    })

    it("should cap fee at max rate for large amounts", () => {
      const validationResult = {
        recipient: {
          type: RECIPIENT_TYPES.LN_ADDRESS,
          normalized: "user@example.com",
          amountSats: 1000000, // 10,000 sats
        },
        valid: true,
        lnurlData: {},
      }

      const result = estimateFee(validationResult)
      const maxFee = Math.ceil(1000000 * MAX_FEE_RATE)
      expect(result.fee.sats).toBeLessThanOrEqual(maxFee)
    })

    it("should return error for invalid recipient", () => {
      const validationResult = {
        recipient: {
          type: RECIPIENT_TYPES.BLINK,
          normalized: "invalid",
          amountSats: 1000,
        },
        valid: false,
      }

      const result = estimateFee(validationResult)
      expect(result.success).toBe(false)
      expect(result.error).toBe("Recipient validation failed")
    })

    it("should treat recipients with walletId as intra-ledger", () => {
      const validationResult = {
        recipient: {
          type: RECIPIENT_TYPES.LN_ADDRESS, // Even if LN address
          normalized: "user@blink.sv",
          amountSats: 10000,
        },
        valid: true,
        walletId: "wallet-456", // Has walletId = Blink user
      }

      const result = estimateFee(validationResult)
      expect(result.isIntraLedger).toBe(true)
      expect(result.fee.sats).toBe(0)
    })
  })

  describe("calculateFeeSummary()", () => {
    const mockValidationResults = [
      {
        recipient: {
          type: RECIPIENT_TYPES.BLINK,
          normalized: "alice",
          amountSats: 10000,
        },
        valid: true,
        walletId: "wallet-1",
      },
      {
        recipient: {
          type: RECIPIENT_TYPES.BLINK,
          normalized: "bob",
          amountSats: 20000,
        },
        valid: true,
        walletId: "wallet-2",
      },
      {
        recipient: {
          type: RECIPIENT_TYPES.LN_ADDRESS,
          normalized: "user@example.com",
          amountSats: 5000,
        },
        valid: true,
        lnurlData: {},
      },
    ]

    it("should calculate total amounts correctly", () => {
      const summary = calculateFeeSummary(mockValidationResults)
      expect(summary.totalAmountSats).toBe(35000) // 10000 + 20000 + 5000
    })

    it("should separate intra-ledger and external recipients", () => {
      const summary = calculateFeeSummary(mockValidationResults)
      expect(summary.breakdown.intraLedger.count).toBe(2)
      expect(summary.breakdown.external.count).toBe(1)
    })

    it("should have zero fees for intra-ledger", () => {
      const summary = calculateFeeSummary(mockValidationResults)
      expect(summary.breakdown.intraLedger.feesSats).toBe(0)
    })

    it("should calculate external fees", () => {
      const summary = calculateFeeSummary(mockValidationResults)
      expect(summary.breakdown.external.feesSats).toBeGreaterThan(0)
    })

    it("should calculate grand total (amount + fees)", () => {
      const summary = calculateFeeSummary(mockValidationResults)
      expect(summary.grandTotalSats).toBe(
        summary.totalAmountSats + summary.totalFeesSats,
      )
    })

    it("should include fee details for each recipient", () => {
      const summary = calculateFeeSummary(mockValidationResults)
      expect(summary.details).toHaveLength(3)
    })

    it("should mark as estimate", () => {
      const summary = calculateFeeSummary(mockValidationResults)
      expect(summary.isEstimate).toBe(true)
    })

    it("should filter out invalid recipients", () => {
      const resultsWithInvalid = [
        ...mockValidationResults,
        {
          recipient: {
            type: RECIPIENT_TYPES.BLINK,
            normalized: "invalid",
            amountSats: 1000,
          },
          valid: false,
        },
      ]

      const summary = calculateFeeSummary(resultsWithInvalid)
      expect(summary.recipientsWithFees).toBe(3)
      expect(summary.recipientsFailed).toBe(0) // Invalid filtered before fee calc
    })

    it("should handle empty results", () => {
      const summary = calculateFeeSummary([])
      expect(summary.totalAmountSats).toBe(0)
      expect(summary.totalFeesSats).toBe(0)
      expect(summary.grandTotalSats).toBe(0)
    })
  })

  describe("validateBalance()", () => {
    const mockFeeSummary = {
      totalAmountSats: 50000,
      totalFeesSats: 150,
      grandTotalSats: 50150,
    }

    it("should pass when balance is sufficient", () => {
      const result = validateBalance(mockFeeSummary, 100000)
      expect(result.valid).toBe(true)
      expect(result.details.required).toBe(50150)
      expect(result.details.available).toBe(100000)
      expect(result.details.remaining).toBe(49850)
    })

    it("should pass when balance exactly matches", () => {
      const result = validateBalance(mockFeeSummary, 50150)
      expect(result.valid).toBe(true)
      expect(result.details.remaining).toBe(0)
    })

    it("should fail when balance is insufficient", () => {
      const result = validateBalance(mockFeeSummary, 40000)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe("INSUFFICIENT_BALANCE")
      expect(result.details.shortfall).toBe(10150)
    })

    it("should include descriptive error message", () => {
      const result = validateBalance(mockFeeSummary, 40000)
      expect(result.error.message).toContain("Insufficient balance")
      expect(result.error.message).toContain("50,150")
      expect(result.error.message).toContain("40,000")
    })

    it("should handle zero balance", () => {
      const result = validateBalance(mockFeeSummary, 0)
      expect(result.valid).toBe(false)
      expect(result.details.shortfall).toBe(50150)
    })
  })
})
