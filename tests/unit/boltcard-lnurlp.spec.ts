/**
 * Tests for lib/boltcard/lnurlp.js
 * LNURL-pay for Boltcard top-up functionality
 */

// Mock the dependencies before importing
jest.mock("../../lib/boltcard/store", () => ({
  getCard: jest.fn(),
  storePendingTopUp: jest.fn(),
  getPendingTopUp: jest.fn(),
  getAllPendingTopUps: jest.fn(),
  getPendingTopUpsForCard: jest.fn(),
  markTopUpProcessed: jest.fn(),
  topUpCard: jest.fn(),
  activateCard: jest.fn(),
  CardStatus: {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    DISABLED: "DISABLED",
  },
  TxType: {
    TOPUP: "TOPUP",
    PAYMENT: "PAYMENT",
  },
}))

jest.mock("../../lib/blink-api", () => {
  const MockBlinkAPI = jest.fn().mockImplementation(() => ({
    getWalletInfo: jest.fn(),
    intraLedgerPaymentSend: jest.fn(),
  }))
  MockBlinkAPI.getExchangeRatePublic = jest.fn()
  return MockBlinkAPI
})

jest.mock("../../lib/config/api", () => ({
  getApiUrlForEnvironment: jest.fn().mockReturnValue("https://api.blink.sv/graphql"),
}))

// Mock global fetch
const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

import { bech32 } from "bech32"
import * as lnurlp from "../../lib/boltcard/lnurlp"

const boltcardStore = require("../../lib/boltcard/store")
const BlinkAPI = require("../../lib/blink-api")
const { getApiUrlForEnvironment } = require("../../lib/config/api")

describe("lnurlp (Boltcard LNURL-pay)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
  })

  describe("encodeLnurl()", () => {
    it("should encode URL to LNURL-bech32 format", () => {
      const url = "https://example.com/api/boltcard/lnurlp/card123"
      const result = lnurlp.encodeLnurl(url)

      expect(result).toMatch(/^lnurl1/)
      
      // Decode and verify
      const decoded = bech32.decode(result, 2000)
      const decodedUrl = Buffer.from(bech32.fromWords(decoded.words)).toString("utf8")
      expect(decodedUrl).toBe(url)
    })

    it("should handle URLs with query parameters", () => {
      const url = "https://example.com/api?foo=bar&baz=qux"
      const result = lnurlp.encodeLnurl(url)

      expect(result).toMatch(/^lnurl1/)
      
      const decoded = bech32.decode(result, 2000)
      const decodedUrl = Buffer.from(bech32.fromWords(decoded.words)).toString("utf8")
      expect(decodedUrl).toBe(url)
    })
  })

  describe("generateTopUpUrl()", () => {
    it("should generate correct top-up URL", () => {
      const result = lnurlp.generateTopUpUrl("https://pos.example.com", "card123")
      expect(result).toBe("https://pos.example.com/api/boltcard/lnurlp/card123")
    })

    it("should remove trailing slash from server URL", () => {
      const result = lnurlp.generateTopUpUrl("https://pos.example.com/", "card456")
      expect(result).toBe("https://pos.example.com/api/boltcard/lnurlp/card456")
    })
  })

  describe("generateTopUpLnurl()", () => {
    it("should generate LNURL-bech32 for top-up URL", () => {
      const result = lnurlp.generateTopUpLnurl("https://pos.example.com", "card123")
      
      expect(result).toMatch(/^lnurl1/)
      
      // Decode and verify URL
      const decoded = bech32.decode(result, 2000)
      const decodedUrl = Buffer.from(bech32.fromWords(decoded.words)).toString("utf8")
      expect(decodedUrl).toBe("https://pos.example.com/api/boltcard/lnurlp/card123")
    })
  })

  describe("TopUpLimits", () => {
    it("should have correct BTC limits", () => {
      expect(lnurlp.TopUpLimits.BTC).toEqual({
        min: 100,
        max: 10000000,
      })
    })

    it("should have correct USD limits", () => {
      expect(lnurlp.TopUpLimits.USD).toEqual({
        min: 10,
        max: 100000,
      })
    })
  })

  describe("handleTopUpRequest()", () => {
    const serverUrl = "https://pos.example.com"

    it("should return error if card not found", async () => {
      boltcardStore.getCard.mockResolvedValue(null)

      const result = await lnurlp.handleTopUpRequest("nonexistent", serverUrl)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Card not found",
      })
    })

    it("should return error for suspended card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "SUSPENDED",
        walletCurrency: "BTC",
      })

      const result = await lnurlp.handleTopUpRequest("card123", serverUrl)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Card is suspended",
      })
    })

    it("should return error for disabled card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "DISABLED",
        walletCurrency: "BTC",
      })

      const result = await lnurlp.handleTopUpRequest("card123", serverUrl)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Card is disabled",
      })
    })

    it("should return LNURL-pay response for active BTC card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        name: "My Card",
        status: "ACTIVE",
        walletCurrency: "BTC",
        balance: 50000,
      })

      const result = await lnurlp.handleTopUpRequest("card123", serverUrl)

      expect(result).toEqual({
        tag: "payRequest",
        callback: "https://pos.example.com/api/boltcard/lnurlp/card123/callback",
        minSendable: 100000, // 100 sats * 1000
        maxSendable: 10000000000, // 10M sats * 1000
        metadata: expect.any(String),
        commentAllowed: 100,
      })

      // Verify metadata format
      const metadata = JSON.parse(result.metadata)
      expect(metadata).toHaveLength(2)
      expect(metadata[0][0]).toBe("text/plain")
      expect(metadata[0][1]).toContain("My Card")
      expect(metadata[1][0]).toBe("text/identifier")
    })

    it("should return LNURL-pay response for active USD card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card456",
        name: "USD Card",
        status: "ACTIVE",
        walletCurrency: "USD",
        balance: 1000,
      })

      const result = await lnurlp.handleTopUpRequest("card456", serverUrl)

      expect(result.minSendable).toBe(10000) // 10 cents * 1000
      expect(result.maxSendable).toBe(100000000) // $1000 * 1000
    })

    it("should allow top-up for PENDING cards", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card789",
        status: "PENDING",
        walletCurrency: "BTC",
        balance: 0,
      })

      const result = await lnurlp.handleTopUpRequest("card789", serverUrl)

      expect(result.tag).toBe("payRequest")
      expect(result).not.toHaveProperty("status")
    })

    it("should use card ID in metadata if no name", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123abc456",
        status: "ACTIVE",
        walletCurrency: "BTC",
        balance: 0,
      })

      const result = await lnurlp.handleTopUpRequest("card123abc456", serverUrl)

      const metadata = JSON.parse(result.metadata)
      expect(metadata[0][1]).toContain("Boltcard")
      expect(metadata[1][1]).toBe("card:card123a") // First 8 chars
    })
  })

  describe("handleTopUpCallback()", () => {
    const createInvoiceMock = jest.fn()

    beforeEach(() => {
      createInvoiceMock.mockReset()
    })

    it("should return error if card not found", async () => {
      boltcardStore.getCard.mockResolvedValue(null)

      const result = await lnurlp.handleTopUpCallback("nonexistent", 100000, "", createInvoiceMock)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Card not found",
      })
      expect(createInvoiceMock).not.toHaveBeenCalled()
    })

    it("should return error for suspended card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "SUSPENDED",
        walletCurrency: "BTC",
      })

      const result = await lnurlp.handleTopUpCallback("card123", 100000, "", createInvoiceMock)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Card is suspended",
      })
    })

    it("should return error for amount below minimum (BTC)", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "test-key",
        walletId: "wallet123",
        environment: "production",
      })

      // 50 sats = 50000 msats (below 100 sats minimum)
      const result = await lnurlp.handleTopUpCallback("card123", 50000, "", createInvoiceMock)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Minimum top-up is 100 sats",
      })
    })

    it("should return error for amount above maximum (BTC)", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "test-key",
      })

      // 20M sats (above 10M max)
      const result = await lnurlp.handleTopUpCallback("card123", 20000000000000, "", createInvoiceMock)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Maximum top-up is 10000000 sats",
      })
    })

    it("should return error for amount below minimum (USD)", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "USD",
        apiKey: "test-key",
      })

      // 5 cents = 5000 msats (below 10 cents)
      const result = await lnurlp.handleTopUpCallback("card123", 5000, "", createInvoiceMock)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Minimum top-up is 10 cents",
      })
    })

    it("should create invoice and return payment request", async () => {
      const card = {
        id: "card123",
        name: "Test Card",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "test-key",
        walletId: "wallet123",
        environment: "production",
      }
      boltcardStore.getCard.mockResolvedValue(card)
      boltcardStore.storePendingTopUp.mockResolvedValue(true)
      
      createInvoiceMock.mockResolvedValue({
        invoice: "lnbc1000...",
        paymentHash: "hash123",
      })

      const result = await lnurlp.handleTopUpCallback("card123", 1000000, "", createInvoiceMock)

      expect(createInvoiceMock).toHaveBeenCalledWith(
        1000, // 1000 sats (1000000 msats / 1000)
        "Top up Test Card",
        "wallet123",
        "test-key",
        "production",
        "BTC"
      )

      expect(result).toEqual({
        pr: "lnbc1000...",
        successAction: {
          tag: "message",
          message: "Card topped up with 1000 sats!",
        },
        routes: [],
      })
    })

    it("should include comment in memo if provided", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        name: "Test Card",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "test-key",
        walletId: "wallet123",
        environment: "production",
      })
      boltcardStore.storePendingTopUp.mockResolvedValue(true)
      
      createInvoiceMock.mockResolvedValue({
        invoice: "lnbc1000...",
        paymentHash: "hash123",
      })

      await lnurlp.handleTopUpCallback("card123", 1000000, "Birthday gift", createInvoiceMock)

      expect(createInvoiceMock).toHaveBeenCalledWith(
        1000,
        "Boltcard top-up: Birthday gift",
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      )
    })

    it("should return error if invoice creation fails", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "test-key",
        walletId: "wallet123",
        environment: "production",
      })
      
      createInvoiceMock.mockResolvedValue({
        error: "Invoice creation failed",
      })

      const result = await lnurlp.handleTopUpCallback("card123", 1000000, "", createInvoiceMock)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Invoice creation failed",
      })
    })

    it("should store pending top-up after invoice creation", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "test-key",
        walletId: "wallet123",
        environment: "production",
      })
      boltcardStore.storePendingTopUp.mockResolvedValue(true)
      
      createInvoiceMock.mockResolvedValue({
        invoice: "lnbc1000...",
        paymentHash: "hash456",
      })

      await lnurlp.handleTopUpCallback("card123", 5000000, "", createInvoiceMock)

      expect(boltcardStore.storePendingTopUp).toHaveBeenCalledWith(
        "card123",
        "hash456",
        5000, // sats
        "BTC"
      )
    })

    it("should work for PENDING cards", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "PENDING",
        walletCurrency: "BTC",
        apiKey: "test-key",
        walletId: "wallet123",
        environment: "production",
      })
      boltcardStore.storePendingTopUp.mockResolvedValue(true)
      
      createInvoiceMock.mockResolvedValue({
        invoice: "lnbc...",
        paymentHash: "hash789",
      })

      const result = await lnurlp.handleTopUpCallback("card123", 100000, "", createInvoiceMock)

      expect(result.pr).toBe("lnbc...")
    })
  })

  describe("processTopUpPayment()", () => {
    it("should return error if no pending top-up found", async () => {
      boltcardStore.getPendingTopUp.mockResolvedValue(null)

      const result = await lnurlp.processTopUpPayment("unknown-hash")

      expect(result).toEqual({
        success: false,
        error: "No pending top-up found",
      })
    })

    it("should return error if card not found", async () => {
      boltcardStore.getPendingTopUp.mockResolvedValue({
        cardId: "card123",
        amount: 1000,
        currency: "BTC",
      })
      boltcardStore.getCard.mockResolvedValue(null)

      const result = await lnurlp.processTopUpPayment("hash123")

      expect(result).toEqual({
        success: false,
        error: "Card not found",
      })
    })

    it("should credit BTC card balance", async () => {
      boltcardStore.getPendingTopUp.mockResolvedValue({
        cardId: "card123",
        amount: 5000,
        currency: "BTC",
      })
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "test-key",
      })
      boltcardStore.topUpCard.mockResolvedValue({
        success: true,
        balance: 15000,
      })
      boltcardStore.markTopUpProcessed.mockResolvedValue(true)

      // Use unique hash to avoid cache from previous tests
      const result = await lnurlp.processTopUpPayment("unique-btc-credit-hash")

      expect(boltcardStore.topUpCard).toHaveBeenCalledWith(
        "card123",
        5000,
        "unique-btc-credit-hash",
        "Top-up via LNURL-pay (5000 sats)"
      )
      expect(boltcardStore.markTopUpProcessed).toHaveBeenCalledWith("unique-btc-credit-hash")
      expect(result).toEqual({
        success: true,
        cardId: "card123",
        amount: 5000,
        amountSats: 5000,
        balance: 15000,
      })
    })

    it("should activate PENDING card on first top-up", async () => {
      boltcardStore.getPendingTopUp.mockResolvedValue({
        cardId: "card123",
        amount: 1000,
        currency: "BTC",
      })
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "PENDING",
        walletCurrency: "BTC",
        apiKey: "test-key",
      })
      boltcardStore.topUpCard.mockResolvedValue({
        success: true,
        balance: 1000,
      })
      boltcardStore.markTopUpProcessed.mockResolvedValue(true)
      boltcardStore.activateCard.mockResolvedValue(true)

      await lnurlp.processTopUpPayment("hash123")

      expect(boltcardStore.activateCard).toHaveBeenCalledWith("card123")
    })

    it("should not activate already ACTIVE card", async () => {
      boltcardStore.getPendingTopUp.mockResolvedValue({
        cardId: "card123",
        amount: 1000,
        currency: "BTC",
      })
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "test-key",
      })
      boltcardStore.topUpCard.mockResolvedValue({
        success: true,
        balance: 5000,
      })
      boltcardStore.markTopUpProcessed.mockResolvedValue(true)

      await lnurlp.processTopUpPayment("hash123")

      expect(boltcardStore.activateCard).not.toHaveBeenCalled()
    })

    it("should handle USD card top-up with transfer and conversion", async () => {
      boltcardStore.getPendingTopUp.mockResolvedValue({
        cardId: "card123",
        amount: 10000, // sats
        currency: "USD",
      })
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "USD",
        apiKey: "test-key",
        environment: "production",
      })

      const mockBlinkInstance = {
        getWalletInfo: jest.fn().mockResolvedValue([
          { id: "btc-wallet-id", walletCurrency: "BTC" },
          { id: "usd-wallet-id", walletCurrency: "USD" },
        ]),
        intraLedgerPaymentSend: jest.fn().mockResolvedValue({ status: "SUCCESS" }),
      }
      BlinkAPI.mockImplementation(() => mockBlinkInstance)
      BlinkAPI.getExchangeRatePublic.mockResolvedValue({
        satPriceInCurrency: 0.069, // ~$97k/BTC
      })

      boltcardStore.topUpCard.mockResolvedValue({
        success: true,
        balance: 690,
      })
      boltcardStore.markTopUpProcessed.mockResolvedValue(true)

      const result = await lnurlp.processTopUpPayment("hash123")

      // Verify transfer was initiated
      expect(mockBlinkInstance.intraLedgerPaymentSend).toHaveBeenCalledWith(
        "btc-wallet-id",
        "usd-wallet-id",
        10000,
        "Boltcard top-up transfer"
      )

      // Verify cents were credited (10000 * 0.069 = 690 cents)
      expect(boltcardStore.topUpCard).toHaveBeenCalledWith(
        "card123",
        690, // cents
        "hash123",
        "Top-up via LNURL-pay (10000 sats)"
      )

      expect(result.success).toBe(true)
      expect(result.amount).toBe(690)
      expect(result.amountSats).toBe(10000)
    })

    it("should return error if topUpCard fails", async () => {
      boltcardStore.getPendingTopUp.mockResolvedValue({
        cardId: "card123",
        amount: 1000,
        currency: "BTC",
      })
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "test-key",
      })
      boltcardStore.topUpCard.mockResolvedValue({
        success: false,
        error: "Database error",
      })

      const result = await lnurlp.processTopUpPayment("hash123")

      expect(result).toEqual({
        success: false,
        error: "Database error",
      })
    })

    it("should return error if USD transfer fails", async () => {
      boltcardStore.getPendingTopUp.mockResolvedValue({
        cardId: "card123",
        amount: 10000,
        currency: "USD",
      })
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "USD",
        apiKey: "test-key",
        environment: "production",
      })

      const mockBlinkInstance = {
        getWalletInfo: jest.fn().mockRejectedValue(new Error("API error")),
      }
      BlinkAPI.mockImplementation(() => mockBlinkInstance)

      const result = await lnurlp.processTopUpPayment("hash123")

      expect(result.success).toBe(false)
      expect(result.error).toContain("USD transfer failed")
    })
  })

  describe("getPendingTopUp()", () => {
    it("should return pending top-up from database", async () => {
      boltcardStore.getPendingTopUp.mockResolvedValue({
        cardId: "card123",
        amount: 5000,
        currency: "BTC",
      })

      const result = await lnurlp.getPendingTopUp("hash123")

      expect(result).toEqual({
        cardId: "card123",
        amount: 5000,
        currency: "BTC",
      })
    })

    it("should return null if not found", async () => {
      boltcardStore.getPendingTopUp.mockResolvedValue(null)

      const result = await lnurlp.getPendingTopUp("unknown")

      expect(result).toBeNull()
    })
  })

  describe("getAllPendingTopUps()", () => {
    it("should return all pending top-ups from database", async () => {
      const pending = [
        { cardId: "card1", amount: 1000 },
        { cardId: "card2", amount: 2000 },
      ]
      boltcardStore.getAllPendingTopUps.mockResolvedValue(pending)

      const result = await lnurlp.getAllPendingTopUps()

      expect(result).toEqual(pending)
    })
  })

  describe("checkInvoiceStatus()", () => {
    it("should return PAID for successful receive transaction", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            me: {
              defaultAccount: {
                walletById: {
                  transactionsByPaymentHash: [
                    {
                      id: "tx1",
                      status: "SUCCESS",
                      direction: "RECEIVE",
                      settlementAmount: 1000,
                    },
                  ],
                },
              },
            },
          },
        }),
      })

      const result = await lnurlp.checkInvoiceStatus("hash123", "api-key", "https://api.blink.sv/graphql", "wallet123")

      expect(result).toBe("PAID")
    })

    it("should return PENDING if no transactions found", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            me: {
              defaultAccount: {
                walletById: {
                  transactionsByPaymentHash: [],
                },
              },
            },
          },
        }),
      })

      const result = await lnurlp.checkInvoiceStatus("hash123", "api-key", "https://api.blink.sv/graphql", "wallet123")

      expect(result).toBe("PENDING")
    })

    it("should return EXPIRED for failed transaction", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            me: {
              defaultAccount: {
                walletById: {
                  transactionsByPaymentHash: [
                    {
                      id: "tx1",
                      status: "FAILED",
                      direction: "RECEIVE",
                    },
                  ],
                },
              },
            },
          },
        }),
      })

      const result = await lnurlp.checkInvoiceStatus("hash123", "api-key", "https://api.blink.sv/graphql", "wallet123")

      expect(result).toBe("EXPIRED")
    })

    it("should return ERROR for HTTP errors", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal server error"),
      })

      const result = await lnurlp.checkInvoiceStatus("hash123", "api-key", "https://api.blink.sv/graphql", "wallet123")

      expect(result).toBe("ERROR")
    })

    it("should return ERROR for GraphQL errors", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          errors: [{ message: "Unauthorized" }],
        }),
      })

      const result = await lnurlp.checkInvoiceStatus("hash123", "api-key", "https://api.blink.sv/graphql", "wallet123")

      expect(result).toBe("ERROR")
    })

    it("should return ERROR on fetch exception", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"))

      const result = await lnurlp.checkInvoiceStatus("hash123", "api-key", "https://api.blink.sv/graphql", "wallet123")

      expect(result).toBe("ERROR")
    })

    it("should return PENDING if only non-receive transactions exist", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            me: {
              defaultAccount: {
                walletById: {
                  transactionsByPaymentHash: [
                    {
                      id: "tx1",
                      status: "SUCCESS",
                      direction: "SEND", // Not RECEIVE
                    },
                  ],
                },
              },
            },
          },
        }),
      })

      const result = await lnurlp.checkInvoiceStatus("hash123", "api-key", "https://api.blink.sv/graphql", "wallet123")

      expect(result).toBe("PENDING")
    })
  })

  describe("checkAndProcessPendingTopUps()", () => {
    it("should return zeros if no pending top-ups", async () => {
      boltcardStore.getPendingTopUpsForCard.mockResolvedValue([])

      const result = await lnurlp.checkAndProcessPendingTopUps(
        "card123",
        "api-key",
        "production",
        "wallet123",
        "BTC"
      )

      expect(result).toEqual({ processed: 0, total: 0, errors: 0 })
    })

    it("should process paid invoices", async () => {
      boltcardStore.getPendingTopUpsForCard.mockResolvedValue([
        { paymentHash: "hash1", amount: 1000 },
      ])

      // Mock invoice check - PAID
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            me: {
              defaultAccount: {
                walletById: {
                  transactionsByPaymentHash: [
                    { status: "SUCCESS", direction: "RECEIVE", settlementAmount: 1000 },
                  ],
                },
              },
            },
          },
        }),
      })

      boltcardStore.getPendingTopUp.mockResolvedValue({
        cardId: "card123",
        amount: 1000,
        currency: "BTC",
      })
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "api-key",
      })
      boltcardStore.topUpCard.mockResolvedValue({ success: true, balance: 5000 })
      boltcardStore.markTopUpProcessed.mockResolvedValue(true)

      const result = await lnurlp.checkAndProcessPendingTopUps(
        "card123",
        "api-key",
        "production",
        "wallet123",
        "BTC"
      )

      expect(result.processed).toBe(1)
      expect(result.total).toBe(1)
      expect(result.errors).toBe(0)
    })

    it("should clean up expired invoices", async () => {
      boltcardStore.getPendingTopUpsForCard.mockResolvedValue([
        { paymentHash: "expired-hash", amount: 1000 },
      ])

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            me: {
              defaultAccount: {
                walletById: {
                  transactionsByPaymentHash: [
                    { status: "FAILED", direction: "RECEIVE" },
                  ],
                },
              },
            },
          },
        }),
      })

      const result = await lnurlp.checkAndProcessPendingTopUps(
        "card123",
        "api-key",
        "production",
        "wallet123",
        "BTC"
      )

      expect(boltcardStore.markTopUpProcessed).toHaveBeenCalledWith("expired-hash")
      expect(result.processed).toBe(0)
    })

    it("should use BTC wallet for USD card invoice checks", async () => {
      boltcardStore.getPendingTopUpsForCard.mockResolvedValue([
        { paymentHash: "hash1", amount: 100 },
      ])

      const mockBlinkInstance = {
        getWalletInfo: jest.fn().mockResolvedValue([
          { id: "btc-wallet", walletCurrency: "BTC" },
          { id: "usd-wallet", walletCurrency: "USD" },
        ]),
      }
      BlinkAPI.mockImplementation(() => mockBlinkInstance)

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            me: {
              defaultAccount: {
                walletById: {
                  transactionsByPaymentHash: [],
                },
              },
            },
          },
        }),
      })

      await lnurlp.checkAndProcessPendingTopUps(
        "card123",
        "api-key",
        "production",
        "usd-wallet",
        "USD"
      )

      // Verify the fetch was called with the BTC wallet ID
      expect(mockFetch).toHaveBeenCalled()
      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(fetchBody.variables.walletId).toBe("btc-wallet")
    })

    it("should handle errors and continue processing", async () => {
      boltcardStore.getPendingTopUpsForCard.mockResolvedValue([
        { paymentHash: "hash1", amount: 1000 },
        { paymentHash: "hash2", amount: 2000 },
      ])

      // First call returns ERROR status (caught inside checkInvoiceStatus), 
      // second succeeds. Note: ERROR status doesn't increment errors counter,
      // it just skips processing (leaves for next check).
      let callCount = 0
      mockFetch.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // This gets caught by checkInvoiceStatus and returns 'ERROR' status
          return Promise.reject(new Error("Network error"))
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: {
              me: {
                defaultAccount: {
                  walletById: {
                    transactionsByPaymentHash: [],
                  },
                },
              },
            },
          }),
        })
      })

      const result = await lnurlp.checkAndProcessPendingTopUps(
        "card123",
        "api-key",
        "production",
        "wallet123",
        "BTC"
      )

      // Both pending top-ups are checked
      expect(result.total).toBe(2)
      // First one returned ERROR status (skipped, not counted as error)
      // Second one returned PENDING status (skipped)
      expect(result.processed).toBe(0)
      expect(result.errors).toBe(0)
    })
  })

  describe("generateTopUpQR()", () => {
    it("should generate QR data with URL and LNURL", () => {
      const result = lnurlp.generateTopUpQR("https://pos.example.com", "card123")

      expect(result.url).toBe("https://pos.example.com/api/boltcard/lnurlp/card123")
      expect(result.lnurl).toMatch(/^lnurl1/)
      expect(result.qrData).toBe(result.lnurl.toUpperCase())
    })

    it("should generate uppercase qrData for better QR efficiency", () => {
      const result = lnurlp.generateTopUpQR("https://example.com", "abc")

      expect(result.qrData).toBe(result.qrData.toUpperCase())
      expect(result.qrData).toMatch(/^LNURL1/)
    })
  })
})
