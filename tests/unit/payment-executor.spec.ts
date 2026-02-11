/**
 * @jest-environment node
 */

/**
 * Tests for lib/batch-payments/payment-executor.js
 *
 * Tests payment execution for batch payments:
 * - Intra-ledger payments (Blink to Blink)
 * - Lightning Address payments
 * - LNURL payments
 * - Batch payment execution
 */

export {}

import paymentExecutor from "../../lib/batch-payments/payment-executor.js"
import csvParser from "../../lib/batch-payments/csv-parser.js"

const {
  executeIntraLedgerPayment,
  executeLnAddressPayment,
  executeLnurlPayment,
  processPayment,
  executeBatchPayments,
  PAYMENT_ERROR_CODES,
  PAYMENT_DELAY_MS,
} = paymentExecutor as {
  executeIntraLedgerPayment: (params: {
    apiKey: string
    senderWalletId: string
    recipientWalletId: string
    amountSats: number
    memo?: string
  }) => Promise<PaymentResult>
  executeLnAddressPayment: (params: {
    apiKey: string
    senderWalletId: string
    lnAddress: string
    amountSats: number
  }) => Promise<PaymentResult>
  executeLnurlPayment: (params: {
    apiKey: string
    senderWalletId: string
    lnurlData: { callback: string }
    amountSats: number
  }) => Promise<PaymentResult>
  processPayment: (params: {
    apiKey: string
    senderWalletId: string
    validationResult: ValidationResult
  }) => Promise<ProcessedPaymentResult>
  executeBatchPayments: (params: {
    apiKey: string
    senderWalletId: string
    validationResults: ValidationResult[]
    onProgress?: (progress: ProgressInfo) => void
  }) => Promise<BatchResult>
  PAYMENT_ERROR_CODES: Record<string, string>
  PAYMENT_DELAY_MS: number
}

const { RECIPIENT_TYPES } = csvParser as { RECIPIENT_TYPES: Record<string, string> }

interface PaymentError {
  code: string
  message: string
}

interface PaymentResult {
  success: boolean
  status?: string
  feeSats?: number
  error?: PaymentError
}

interface Recipient {
  rowNumber?: number
  original?: string
  type?: string
  normalized?: string
  amount?: number
  amountSats?: number
  currency?: string
  memo?: string
}

interface ProcessedPaymentResult extends PaymentResult {
  recipient: Recipient
}

interface ValidationResult {
  valid: boolean
  rowNumber?: number
  recipient?: string
  type?: string
  normalized?: string
  amount?: number
  amountSats?: number
  currency?: string
  memo?: string
  walletId?: string
  lnurlData?: { callback: string }
}

interface ProgressInfo {
  completed: number
  total: number
  successful: number
  failed: number
  percent: number
}

interface BatchResult {
  results: ProcessedPaymentResult[]
  summary: {
    totalRecipients: number
    successful: number
    failed: number
    totalSentSats: number
    totalFeesSats: number
  }
}

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch

describe("Payment Executor", () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  describe("PAYMENT_ERROR_CODES", () => {
    it("should have all expected error codes", () => {
      expect(PAYMENT_ERROR_CODES.INSUFFICIENT_BALANCE).toBe("INSUFFICIENT_BALANCE")
      expect(PAYMENT_ERROR_CODES.NO_ROUTE).toBe("NO_ROUTE")
      expect(PAYMENT_ERROR_CODES.INVOICE_EXPIRED).toBe("INVOICE_EXPIRED")
      expect(PAYMENT_ERROR_CODES.PAYMENT_FAILED).toBe("PAYMENT_FAILED")
      expect(PAYMENT_ERROR_CODES.TIMEOUT).toBe("TIMEOUT")
      expect(PAYMENT_ERROR_CODES.NETWORK_ERROR).toBe("NETWORK_ERROR")
    })
  })

  describe("PAYMENT_DELAY_MS", () => {
    it("should be a positive number", () => {
      expect(typeof PAYMENT_DELAY_MS).toBe("number")
      expect(PAYMENT_DELAY_MS).toBeGreaterThan(0)
    })
  })

  describe("executeIntraLedgerPayment()", () => {
    const baseParams = {
      apiKey: "test-api-key",
      senderWalletId: "sender-wallet-123",
      recipientWalletId: "recipient-wallet-456",
      amountSats: 1000,
    }

    it("should execute successful intra-ledger payment", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            intraLedgerPaymentSend: {
              status: "SUCCESS",
              errors: [],
            },
          },
        }),
      })

      const result = await executeIntraLedgerPayment(baseParams)

      expect(result.success).toBe(true)
      expect(result.status).toBe("SUCCESS")
      expect(result.feeSats).toBe(0)
    })

    it("should include memo when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            intraLedgerPaymentSend: {
              status: "SUCCESS",
              errors: [],
            },
          },
        }),
      })

      await executeIntraLedgerPayment({ ...baseParams, memo: "Test payment" })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.variables.input.memo).toBe("Test payment")
    })

    it("should handle HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await executeIntraLedgerPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.NETWORK_ERROR)
      expect(result.error?.message).toContain("500")
    })

    it("should handle GraphQL errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: "Authentication failed" }],
        }),
      })

      const result = await executeIntraLedgerPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.PAYMENT_FAILED)
      expect(result.error?.message).toBe("Authentication failed")
    })

    it("should handle mutation-level errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            intraLedgerPaymentSend: {
              status: "FAILURE",
              errors: [{ message: "Insufficient balance", code: "INSUFFICIENT_BALANCE" }],
            },
          },
        }),
      })

      const result = await executeIntraLedgerPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe("INSUFFICIENT_BALANCE")
      expect(result.error?.message).toBe("Insufficient balance")
    })

    it("should handle mutation-level errors without code", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            intraLedgerPaymentSend: {
              status: "FAILURE",
              errors: [{ message: "Unknown error" }],
            },
          },
        }),
      })

      const result = await executeIntraLedgerPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.PAYMENT_FAILED)
    })

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"))

      const result = await executeIntraLedgerPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.NETWORK_ERROR)
      expect(result.error?.message).toBe("Connection refused")
    })

    it("should handle missing status in response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            intraLedgerPaymentSend: {
              errors: [],
            },
          },
        }),
      })

      const result = await executeIntraLedgerPayment(baseParams)

      expect(result.success).toBe(true)
      expect(result.status).toBe("SUCCESS") // Default status
    })
  })

  describe("executeLnAddressPayment()", () => {
    const baseParams = {
      apiKey: "test-api-key",
      senderWalletId: "sender-wallet-123",
      lnAddress: "user@example.com",
      amountSats: 1000,
    }

    it("should execute successful LN address payment", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            lnAddressPaymentSend: {
              status: "SUCCESS",
              errors: [],
            },
          },
        }),
      })

      const result = await executeLnAddressPayment(baseParams)

      expect(result.success).toBe(true)
      expect(result.status).toBe("SUCCESS")
    })

    it("should handle HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      })

      const result = await executeLnAddressPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.NETWORK_ERROR)
    })

    it("should handle GraphQL errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: "Rate limited" }],
        }),
      })

      const result = await executeLnAddressPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.PAYMENT_FAILED)
    })

    it("should map ROUTE_FINDING_ERROR to NO_ROUTE", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            lnAddressPaymentSend: {
              status: "FAILURE",
              errors: [{ message: "Could not find route", code: "ROUTE_FINDING_ERROR" }],
            },
          },
        }),
      })

      const result = await executeLnAddressPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.NO_ROUTE)
    })

    it("should map route message to NO_ROUTE", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            lnAddressPaymentSend: {
              status: "FAILURE",
              errors: [{ message: "No route found to destination" }],
            },
          },
        }),
      })

      const result = await executeLnAddressPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.NO_ROUTE)
    })

    it("should map INSUFFICIENT_BALANCE error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            lnAddressPaymentSend: {
              status: "FAILURE",
              errors: [{ message: "Not enough funds", code: "INSUFFICIENT_BALANCE" }],
            },
          },
        }),
      })

      const result = await executeLnAddressPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.INSUFFICIENT_BALANCE)
    })

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("DNS resolution failed"))

      const result = await executeLnAddressPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.NETWORK_ERROR)
    })
  })

  describe("executeLnurlPayment()", () => {
    const baseParams = {
      apiKey: "test-api-key",
      senderWalletId: "sender-wallet-123",
      lnurlData: { callback: "https://example.com/lnurlp/callback" },
      amountSats: 1000,
    }

    it("should execute successful LNURL payment", async () => {
      // First call: LNURL callback returns invoice
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pr: "lnbc1000n1...",
        }),
      })

      // Second call: Pay the invoice
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            lnInvoicePaymentSend: {
              status: "SUCCESS",
              errors: [],
            },
          },
        }),
      })

      const result = await executeLnurlPayment(baseParams)

      expect(result.success).toBe(true)
      expect(result.status).toBe("SUCCESS")
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("should include amount in callback URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pr: "lnbc..." }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
        }),
      })

      await executeLnurlPayment(baseParams)

      const callbackUrl = mockFetch.mock.calls[0][0]
      expect(callbackUrl).toContain("amount=1000000") // 1000 sats = 1000000 msats
    })

    it("should handle LNURL callback HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await executeLnurlPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.PAYMENT_FAILED)
      expect(result.error?.message).toContain("404")
    })

    it("should handle LNURL callback ERROR response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ERROR",
          reason: "Amount too low",
        }),
      })

      const result = await executeLnurlPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.PAYMENT_FAILED)
      expect(result.error?.message).toBe("Amount too low")
    })

    it("should handle LNURL callback ERROR without reason", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ERROR",
        }),
      })

      const result = await executeLnurlPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe("LNURL callback error")
    })

    it("should handle missing invoice in callback response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })

      const result = await executeLnurlPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.PAYMENT_FAILED)
      expect(result.error?.message).toContain("No invoice returned")
    })

    it("should handle payment API HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pr: "lnbc..." }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await executeLnurlPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.NETWORK_ERROR)
    })

    it("should handle payment GraphQL errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pr: "lnbc..." }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: "Invalid API key" }],
        }),
      })

      const result = await executeLnurlPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.PAYMENT_FAILED)
    })

    it("should handle payment mutation errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pr: "lnbc..." }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            lnInvoicePaymentSend: {
              status: "FAILURE",
              errors: [{ message: "Invoice expired", code: "INVOICE_EXPIRED" }],
            },
          },
        }),
      })

      const result = await executeLnurlPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe("INVOICE_EXPIRED")
    })

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

      const result = await executeLnurlPayment(baseParams)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.NETWORK_ERROR)
    })
  })

  describe("processPayment()", () => {
    const baseParams = {
      apiKey: "test-api-key",
      senderWalletId: "sender-wallet-123",
    }

    it("should process intra-ledger payment when walletId is present", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { intraLedgerPaymentSend: { status: "SUCCESS", errors: [] } },
        }),
      })

      const validationResult = {
        valid: true,
        walletId: "recipient-wallet-456",
        type: RECIPIENT_TYPES.BLINK,
        normalized: "testuser",
        amountSats: 1000,
        rowNumber: 1,
        recipient: "testuser",
      }

      const result = await processPayment({ ...baseParams, validationResult })

      expect(result.success).toBe(true)
      expect(result.recipient.normalized).toBe("testuser")
    })

    it("should process Blink user payment via LN address when no walletId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { lnAddressPaymentSend: { status: "SUCCESS", errors: [] } },
        }),
      })

      const validationResult = {
        valid: true,
        type: RECIPIENT_TYPES.BLINK,
        normalized: "blinkuser",
        amountSats: 500,
        rowNumber: 2,
        recipient: "blinkuser",
      }

      const result = await processPayment({ ...baseParams, validationResult })

      expect(result.success).toBe(true)
      // Should use blinkuser@blink.sv
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.variables.input.lnAddress).toBe("blinkuser@blink.sv")
    })

    it("should process external LN address payment", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { lnAddressPaymentSend: { status: "SUCCESS", errors: [] } },
        }),
      })

      const validationResult = {
        valid: true,
        type: RECIPIENT_TYPES.LN_ADDRESS,
        normalized: "user@external.com",
        amountSats: 2000,
        rowNumber: 3,
        recipient: "user@external.com",
      }

      const result = await processPayment({ ...baseParams, validationResult })

      expect(result.success).toBe(true)
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.variables.input.lnAddress).toBe("user@external.com")
    })

    it("should process LNURL payment", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pr: "lnbc..." }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
        }),
      })

      const validationResult = {
        valid: true,
        type: RECIPIENT_TYPES.LNURL,
        normalized: "lnurl1...",
        amountSats: 3000,
        lnurlData: { callback: "https://example.com/callback" },
        rowNumber: 4,
        recipient: "lnurl1...",
      }

      const result = await processPayment({ ...baseParams, validationResult })

      expect(result.success).toBe(true)
    })

    it("should return error for unknown payment type", async () => {
      const validationResult = {
        valid: true,
        type: "UNKNOWN_TYPE",
        normalized: "something",
        amountSats: 1000,
        rowNumber: 5,
        recipient: "something",
      }

      const result = await processPayment({ ...baseParams, validationResult })

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.PAYMENT_FAILED)
      expect(result.error?.message).toContain("Unknown payment type")
    })

    it("should catch and return network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection failed"))

      const validationResult = {
        valid: true,
        walletId: "recipient-wallet",
        type: RECIPIENT_TYPES.BLINK,
        normalized: "testuser",
        amountSats: 1000,
        rowNumber: 6,
        recipient: "testuser",
      }

      const result = await processPayment({ ...baseParams, validationResult })

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe(PAYMENT_ERROR_CODES.NETWORK_ERROR)
    })

    it("should include all recipient details in result", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { intraLedgerPaymentSend: { status: "SUCCESS", errors: [] } },
        }),
      })

      const validationResult = {
        valid: true,
        walletId: "recipient-wallet",
        type: RECIPIENT_TYPES.BLINK,
        normalized: "testuser",
        amountSats: 1000,
        amount: 1000,
        currency: "SATS",
        memo: "Test memo",
        rowNumber: 7,
        recipient: "testuser@blink.sv",
      }

      const result = await processPayment({ ...baseParams, validationResult })

      expect(result.recipient.rowNumber).toBe(7)
      expect(result.recipient.original).toBe("testuser@blink.sv")
      expect(result.recipient.normalized).toBe("testuser")
      expect(result.recipient.amountSats).toBe(1000)
      expect(result.recipient.memo).toBe("Test memo")
    })
  })

  describe("executeBatchPayments()", () => {
    const baseParams = {
      apiKey: "test-api-key",
      senderWalletId: "sender-wallet-123",
    }

    it("should process all valid recipients", async () => {
      // Mock 3 successful payments
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { intraLedgerPaymentSend: { status: "SUCCESS", errors: [] } },
          }),
        })
      }

      const validationResults = [
        { valid: true, walletId: "w1", type: RECIPIENT_TYPES.BLINK, normalized: "user1", amountSats: 100, rowNumber: 1, recipient: "user1" },
        { valid: true, walletId: "w2", type: RECIPIENT_TYPES.BLINK, normalized: "user2", amountSats: 200, rowNumber: 2, recipient: "user2" },
        { valid: true, walletId: "w3", type: RECIPIENT_TYPES.BLINK, normalized: "user3", amountSats: 300, rowNumber: 3, recipient: "user3" },
      ]

      const result = await executeBatchPayments({ ...baseParams, validationResults })

      expect(result.results).toHaveLength(3)
      expect(result.summary.totalRecipients).toBe(3)
      expect(result.summary.successful).toBe(3)
      expect(result.summary.failed).toBe(0)
      expect(result.summary.totalSentSats).toBe(600)
    })

    it("should skip invalid recipients", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { intraLedgerPaymentSend: { status: "SUCCESS", errors: [] } },
        }),
      })

      const validationResults = [
        { valid: false, type: RECIPIENT_TYPES.BLINK, normalized: "invalid", amountSats: 100 },
        { valid: true, walletId: "w1", type: RECIPIENT_TYPES.BLINK, normalized: "valid", amountSats: 200, rowNumber: 2, recipient: "valid" },
        { valid: false, type: RECIPIENT_TYPES.BLINK, normalized: "also-invalid", amountSats: 300 },
      ]

      const result = await executeBatchPayments({ ...baseParams, validationResults })

      expect(result.results).toHaveLength(1)
      expect(result.summary.totalRecipients).toBe(1)
      expect(result.summary.successful).toBe(1)
    })

    it("should handle mixed success and failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { intraLedgerPaymentSend: { status: "SUCCESS", errors: [] } },
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            intraLedgerPaymentSend: {
              status: "FAILURE",
              errors: [{ message: "Insufficient balance" }],
            },
          },
        }),
      })

      const validationResults = [
        { valid: true, walletId: "w1", type: RECIPIENT_TYPES.BLINK, normalized: "user1", amountSats: 100, rowNumber: 1, recipient: "user1" },
        { valid: true, walletId: "w2", type: RECIPIENT_TYPES.BLINK, normalized: "user2", amountSats: 200, rowNumber: 2, recipient: "user2" },
      ]

      const result = await executeBatchPayments({ ...baseParams, validationResults })

      expect(result.summary.successful).toBe(1)
      expect(result.summary.failed).toBe(1)
      expect(result.summary.totalSentSats).toBe(100)
    })

    it("should call onProgress callback", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { intraLedgerPaymentSend: { status: "SUCCESS", errors: [] } },
        }),
      })

      const validationResults = [
        { valid: true, walletId: "w1", type: RECIPIENT_TYPES.BLINK, normalized: "user1", amountSats: 100, rowNumber: 1, recipient: "user1" },
        { valid: true, walletId: "w2", type: RECIPIENT_TYPES.BLINK, normalized: "user2", amountSats: 200, rowNumber: 2, recipient: "user2" },
      ]

      const progressCalls: ProgressInfo[] = []
      const onProgress = (progress: ProgressInfo) => progressCalls.push({ ...progress })

      await executeBatchPayments({ ...baseParams, validationResults, onProgress })

      expect(progressCalls.length).toBe(2)
      expect(progressCalls[0].completed).toBe(1)
      expect(progressCalls[0].percent).toBe(50)
      expect(progressCalls[1].completed).toBe(2)
      expect(progressCalls[1].percent).toBe(100)
    })

    it("should handle exceptions during payment processing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { intraLedgerPaymentSend: { status: "SUCCESS", errors: [] } },
        }),
      })
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const validationResults = [
        { valid: true, walletId: "w1", type: RECIPIENT_TYPES.BLINK, normalized: "user1", amountSats: 100, rowNumber: 1, recipient: "user1" },
        { valid: true, walletId: "w2", type: RECIPIENT_TYPES.BLINK, normalized: "user2", amountSats: 200, rowNumber: 2, recipient: "user2" },
      ]

      const result = await executeBatchPayments({ ...baseParams, validationResults })

      expect(result.summary.successful).toBe(1)
      expect(result.summary.failed).toBe(1)
    })

    it("should calculate total fees", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { intraLedgerPaymentSend: { status: "SUCCESS", errors: [] } },
        }),
      })

      const validationResults = [
        { valid: true, walletId: "w1", type: RECIPIENT_TYPES.BLINK, normalized: "user1", amountSats: 1000, rowNumber: 1, recipient: "user1" },
      ]

      const result = await executeBatchPayments({ ...baseParams, validationResults })

      // Intra-ledger payments have 0 fees
      expect(result.summary.totalFeesSats).toBe(0)
    })

    it("should return empty results for no valid recipients", async () => {
      const validationResults = [
        { valid: false, type: RECIPIENT_TYPES.BLINK, normalized: "invalid1", amountSats: 100 },
        { valid: false, type: RECIPIENT_TYPES.BLINK, normalized: "invalid2", amountSats: 200 },
      ]

      const result = await executeBatchPayments({ ...baseParams, validationResults })

      expect(result.results).toHaveLength(0)
      expect(result.summary.totalRecipients).toBe(0)
      expect(result.summary.successful).toBe(0)
      expect(result.summary.failed).toBe(0)
    })

    it("should use default onProgress when not provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { intraLedgerPaymentSend: { status: "SUCCESS", errors: [] } },
        }),
      })

      const validationResults = [
        { valid: true, walletId: "w1", type: RECIPIENT_TYPES.BLINK, normalized: "user1", amountSats: 100, rowNumber: 1, recipient: "user1" },
      ]

      // Should not throw when onProgress is not provided
      const result = await executeBatchPayments({ ...baseParams, validationResults })

      expect(result.summary.successful).toBe(1)
    })
  })
})
