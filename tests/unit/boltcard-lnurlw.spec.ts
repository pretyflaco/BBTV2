/**
 * Tests for lib/boltcard/lnurlw.js
 * LNURL-withdraw for Boltcard spending functionality
 */

// Mock the dependencies before importing
jest.mock("../../lib/boltcard/store", () => ({
  getCard: jest.fn(),
  updateLastCounter: jest.fn(),
  incrementDailySpent: jest.fn(),
  rollbackSpend: jest.fn(),
  recordTransaction: jest.fn(),
  CardStatus: {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    DISABLED: "DISABLED",
  },
  TxType: {
    TOPUP: "TOPUP",
    WITHDRAW: "WITHDRAW",
    PAYMENT: "PAYMENT",
  },
}))

jest.mock("../../lib/boltcard/crypto", () => ({
  verifyCardTap: jest.fn(),
}))

jest.mock("../../lib/blink-api", () => {
  const MockBlinkAPI = jest.fn()
  MockBlinkAPI.getExchangeRatePublic = jest.fn()
  MockBlinkAPI.default = MockBlinkAPI
  return MockBlinkAPI
})

import { bech32 } from "bech32"
import * as lnurlw from "../../lib/boltcard/lnurlw"

const boltcardStore = require("../../lib/boltcard/store")
const boltcardCrypto = require("../../lib/boltcard/crypto")
const BlinkAPI = require("../../lib/blink-api")

describe("lnurlw (Boltcard LNURL-withdraw)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("encodeLnurl()", () => {
    it("should encode URL to LNURL-bech32 format", () => {
      const url = "https://example.com/api/boltcard/lnurlw/card123"
      const result = lnurlw.encodeLnurl(url)

      expect(result).toMatch(/^lnurl1/)
      
      // Decode and verify
      const decoded = bech32.decode(result, 2000)
      const decodedUrl = Buffer.from(bech32.fromWords(decoded.words)).toString("utf8")
      expect(decodedUrl).toBe(url)
    })

    it("should handle URLs with query parameters", () => {
      const url = "https://example.com/api?p=abc&c=def"
      const result = lnurlw.encodeLnurl(url)

      expect(result).toMatch(/^lnurl1/)
    })
  })

  describe("decodeLnurl()", () => {
    it("should decode LNURL-bech32 to URL", () => {
      const url = "https://example.com/api/test"
      const encoded = lnurlw.encodeLnurl(url)
      
      const result = lnurlw.decodeLnurl(encoded)
      
      expect(result).toBe(url)
    })

    it("should roundtrip encode/decode correctly", () => {
      const url = "https://pos.example.com/api/boltcard/lnurlw/card123?p=abcd&c=1234"
      const encoded = lnurlw.encodeLnurl(url)
      const decoded = lnurlw.decodeLnurl(encoded)
      
      expect(decoded).toBe(url)
    })
  })

  describe("generateCardUrl()", () => {
    it("should generate correct card URL", () => {
      const result = lnurlw.generateCardUrl("https://pos.example.com", "card123")
      expect(result).toBe("https://pos.example.com/api/boltcard/lnurlw/card123")
    })

    it("should remove trailing slash from server URL", () => {
      const result = lnurlw.generateCardUrl("https://pos.example.com/", "card456")
      expect(result).toBe("https://pos.example.com/api/boltcard/lnurlw/card456")
    })
  })

  describe("generateCardLnurl()", () => {
    it("should generate LNURL-bech32 for card URL", () => {
      const result = lnurlw.generateCardLnurl("https://pos.example.com", "card123")
      
      expect(result).toMatch(/^lnurl1/)
      
      // Decode and verify URL
      const decoded = bech32.decode(result, 2000)
      const decodedUrl = Buffer.from(bech32.fromWords(decoded.words)).toString("utf8")
      expect(decodedUrl).toBe("https://pos.example.com/api/boltcard/lnurlw/card123")
    })
  })

  describe("parseInvoiceAmount()", () => {
    it("should parse mainnet invoice with milli-bitcoin", () => {
      // 1m = 1 milli-BTC = 100,000 sats
      const result = lnurlw.parseInvoiceAmount("lnbc1m1pjtest")
      expect(result).toEqual({
        msats: 100000000,
        sats: 100000,
      })
    })

    it("should parse mainnet invoice with micro-bitcoin", () => {
      // 100u = 100 micro-BTC = 10,000 sats
      const result = lnurlw.parseInvoiceAmount("lnbc100u1pjtest")
      expect(result).toEqual({
        msats: 10000000,
        sats: 10000,
      })
    })

    it("should parse mainnet invoice with nano-bitcoin", () => {
      // 10000n = 10,000 nano-BTC = 1 sat
      const result = lnurlw.parseInvoiceAmount("lnbc10000n1pjtest")
      expect(result).toEqual({
        msats: 1000000,
        sats: 1000,
      })
    })

    it("should parse mainnet invoice with pico-bitcoin", () => {
      // 10000p = 10,000 pico-BTC = 1 msat = 0.001 sat
      const result = lnurlw.parseInvoiceAmount("lnbc10000p1pjtest")
      expect(result).toEqual({
        msats: 1000,
        sats: 1,
      })
    })

    it("should parse testnet invoice", () => {
      const result = lnurlw.parseInvoiceAmount("lntb500u1pjtest")
      expect(result).toEqual({
        msats: 50000000,
        sats: 50000,
      })
    })

    it("should parse signet invoice", () => {
      const result = lnurlw.parseInvoiceAmount("lntbs1000n1pjtest")
      expect(result).toEqual({
        msats: 100000,
        sats: 100,
      })
    })

    it("should parse invoice with pico-bitcoin (11p example)", () => {
      // lnbc11p... is interpreted as 11 pico-BTC
      // 11 pBTC = 1.1 msats, but truncated to 1 msat
      const result = lnurlw.parseInvoiceAmount("lnbc11pjtest")
      expect(result).toEqual({
        msats: 1,
        sats: 0,
      })
    })

    it("should parse invoice with 1 pico-bitcoin as minimum", () => {
      // 1p is parsed as "1" with "p" multiplier = 0.1 msats = 0
      const result = lnurlw.parseInvoiceAmount("lnbc1pjtest")
      expect(result).toEqual({
        msats: 0,
        sats: 0,
      })
    })

    it("should return null for invalid invoice", () => {
      const result = lnurlw.parseInvoiceAmount("invalid")
      expect(result).toBeNull()
    })

    it("should handle uppercase invoice", () => {
      const result = lnurlw.parseInvoiceAmount("LNBC100U1PJTEST")
      expect(result).toEqual({
        msats: 10000000,
        sats: 10000,
      })
    })
  })

  describe("handleWithdrawRequest()", () => {
    const callbackUrl = "https://pos.example.com/api/boltcard/lnurlw/card123/callback"

    it("should return error if card not found", async () => {
      boltcardStore.getCard.mockResolvedValue(null)

      const result = await lnurlw.handleWithdrawRequest("card123", "piccdata", "sunmac", callbackUrl)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Card not found",
      })
    })

    it("should return error for non-active card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "SUSPENDED",
      })

      const result = await lnurlw.handleWithdrawRequest("card123", "piccdata", "sunmac", callbackUrl)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Card is suspended",
      })
    })

    it("should return error for pending card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "PENDING",
      })

      const result = await lnurlw.handleWithdrawRequest("card123", "piccdata", "sunmac", callbackUrl)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Card is pending",
      })
    })

    it("should return error if card verification fails", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        k1: "key1",
        k2: "key2",
        cardUid: "uid123",
        lastCounter: 5,
      })
      boltcardCrypto.verifyCardTap.mockReturnValue({
        valid: false,
        error: "Invalid SunMAC",
      })

      const result = await lnurlw.handleWithdrawRequest("card123", "piccdata", "sunmac", callbackUrl)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Invalid SunMAC",
      })
    })

    it("should return error if card has no balance", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        balance: 0,
        walletCurrency: "BTC",
      })
      boltcardCrypto.verifyCardTap.mockReturnValue({
        valid: true,
        counter: 6,
      })
      boltcardStore.updateLastCounter.mockResolvedValue(true)

      const result = await lnurlw.handleWithdrawRequest("card123", "piccdata", "sunmac", callbackUrl)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Card has no balance",
      })
    })

    it("should return error if daily limit reached", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        balance: 10000,
        dailyLimit: 5000,
        dailySpent: 5000,
        walletCurrency: "BTC",
      })
      boltcardCrypto.verifyCardTap.mockReturnValue({
        valid: true,
        counter: 6,
      })
      boltcardStore.updateLastCounter.mockResolvedValue(true)

      const result = await lnurlw.handleWithdrawRequest("card123", "piccdata", "sunmac", callbackUrl)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Daily spending limit reached",
      })
    })

    it("should return withdraw response for BTC card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        name: "My BTC Card",
        status: "ACTIVE",
        balance: 50000,
        walletCurrency: "BTC",
        maxTxAmount: null,
        dailyLimit: null,
      })
      boltcardCrypto.verifyCardTap.mockReturnValue({
        valid: true,
        counter: 6,
      })
      boltcardStore.updateLastCounter.mockResolvedValue(true)

      const result = await lnurlw.handleWithdrawRequest("card123", "piccdata", "sunmac", callbackUrl)

      expect(result).toEqual({
        tag: "withdrawRequest",
        callback: callbackUrl,
        k1: "card123",
        defaultDescription: "Boltcard payment (My BTC Card)",
        minWithdrawable: 1000,
        maxWithdrawable: 50000000, // 50000 sats * 1000
        balanceCheck: "https://pos.example.com/api/boltcard/lnurlw/card123/balance",
        payLink: "https://pos.example.com/api/boltcard/lnurlp/card123/callback",
      })
    })

    it("should apply maxTxAmount limit", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        name: "Test Card",
        status: "ACTIVE",
        balance: 100000,
        walletCurrency: "BTC",
        maxTxAmount: 10000, // Limit per tx to 10k sats
        dailyLimit: null,
      })
      boltcardCrypto.verifyCardTap.mockReturnValue({
        valid: true,
        counter: 6,
      })
      boltcardStore.updateLastCounter.mockResolvedValue(true)

      const result = await lnurlw.handleWithdrawRequest("card123", "piccdata", "sunmac", callbackUrl)

      expect(result.maxWithdrawable).toBe(10000000) // 10000 sats * 1000
    })

    it("should apply daily limit", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        balance: 100000,
        walletCurrency: "BTC",
        maxTxAmount: null,
        dailyLimit: 50000,
        dailySpent: 30000,
      })
      boltcardCrypto.verifyCardTap.mockReturnValue({
        valid: true,
        counter: 6,
      })
      boltcardStore.updateLastCounter.mockResolvedValue(true)

      const result = await lnurlw.handleWithdrawRequest("card123", "piccdata", "sunmac", callbackUrl)

      // Remaining daily = 50000 - 30000 = 20000 sats
      expect(result.maxWithdrawable).toBe(20000000)
    })

    it("should return withdraw response for USD card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        name: "USD Card",
        status: "ACTIVE",
        balance: 1000, // 1000 cents = $10
        walletCurrency: "USD",
        maxTxAmount: null,
        dailyLimit: null,
      })
      boltcardCrypto.verifyCardTap.mockReturnValue({
        valid: true,
        counter: 6,
      })
      boltcardStore.updateLastCounter.mockResolvedValue(true)
      
      // Mock exchange rate: 0.069 cents/sat means $10 = ~14,492 sats
      BlinkAPI.getExchangeRatePublic.mockResolvedValue({
        satPriceInCurrency: 0.069,
      })

      const result = await lnurlw.handleWithdrawRequest("card123", "piccdata", "sunmac", callbackUrl)

      expect(result.tag).toBe("withdrawRequest")
      // 1000 cents / 0.069 cents/sat = ~14,492 sats
      expect(result.maxWithdrawable).toBe(14493000) // sats * 1000 (with rounding)
    })

    it("should return error if exchange rate fetch fails for USD card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        balance: 1000,
        walletCurrency: "USD",
      })
      boltcardCrypto.verifyCardTap.mockReturnValue({
        valid: true,
        counter: 6,
      })
      boltcardStore.updateLastCounter.mockResolvedValue(true)
      BlinkAPI.getExchangeRatePublic.mockRejectedValue(new Error("API error"))

      const result = await lnurlw.handleWithdrawRequest("card123", "piccdata", "sunmac", callbackUrl)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Failed to get exchange rate",
      })
    })

    it("should use card name in default description", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        name: null,
        status: "ACTIVE",
        balance: 5000,
        walletCurrency: "BTC",
      })
      boltcardCrypto.verifyCardTap.mockReturnValue({
        valid: true,
        counter: 6,
      })
      boltcardStore.updateLastCounter.mockResolvedValue(true)

      const result = await lnurlw.handleWithdrawRequest("card123", "piccdata", "sunmac", callbackUrl)

      expect(result.defaultDescription).toBe("Boltcard payment (Card)")
    })
  })

  describe("handleWithdrawCallback()", () => {
    const payInvoiceMock = jest.fn()

    beforeEach(() => {
      payInvoiceMock.mockReset()
    })

    it("should return error if card not found", async () => {
      boltcardStore.getCard.mockResolvedValue(null)

      const result = await lnurlw.handleWithdrawCallback("card123", "lnbc1000n1pjtest", payInvoiceMock)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Card not found",
      })
    })

    it("should return error for non-active card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "DISABLED",
      })

      const result = await lnurlw.handleWithdrawCallback("card123", "lnbc1000n1pjtest", payInvoiceMock)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Card is disabled",
      })
    })

    it("should return error for invalid invoice amount", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
      })

      const result = await lnurlw.handleWithdrawCallback("card123", "invalid", payInvoiceMock)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Invalid invoice amount",
      })
    })

    it("should return error if balance deduction fails", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "test-key",
        environment: "production",
      })
      boltcardStore.incrementDailySpent.mockResolvedValue({
        success: false,
        error: "Insufficient balance",
      })

      const result = await lnurlw.handleWithdrawCallback("card123", "lnbc1000n1pjtest", payInvoiceMock)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Insufficient balance",
      })
    })

    it("should pay invoice and record transaction for BTC card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "test-key",
        environment: "production",
      })
      boltcardStore.incrementDailySpent.mockResolvedValue({
        success: true,
        balance: 49000,
      })
      payInvoiceMock.mockResolvedValue({
        success: true,
        paymentHash: "hash123",
      })
      boltcardStore.recordTransaction.mockResolvedValue(true)

      // 1000n = 1000 nano-BTC = 100 sats
      const result = await lnurlw.handleWithdrawCallback("card123", "lnbc10000n1pjtest", payInvoiceMock)

      expect(payInvoiceMock).toHaveBeenCalledWith(
        1000, // sats
        "lnbc10000n1pjtest",
        "test-key",
        "production",
        "BTC"
      )
      expect(boltcardStore.incrementDailySpent).toHaveBeenCalledWith("card123", 1000)
      expect(boltcardStore.recordTransaction).toHaveBeenCalledWith("card123", {
        type: "WITHDRAW",
        amount: 1000,
        balanceAfter: 49000,
        paymentHash: "hash123",
        description: "Card payment",
      })
      expect(result).toEqual({
        status: "OK",
        paymentHash: "hash123",
      })
    })

    it("should convert sats to cents for USD card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "USD",
        apiKey: "test-key",
        environment: "production",
      })
      
      // Mock exchange rate: 0.069 cents/sat
      BlinkAPI.getExchangeRatePublic.mockResolvedValue({
        satPriceInCurrency: 0.069,
      })
      
      boltcardStore.incrementDailySpent.mockResolvedValue({
        success: true,
        balance: 310, // 1000 - 690 cents
      })
      payInvoiceMock.mockResolvedValue({
        success: true,
        paymentHash: "hash456",
      })
      boltcardStore.recordTransaction.mockResolvedValue(true)

      // 100000n = 100,000 nano-BTC = 10,000 sats (100 msats per nBTC, so 100000 * 100 = 10M msats = 10k sats)
      // 10,000 sats * 0.069 = 690 cents
      const result = await lnurlw.handleWithdrawCallback("card123", "lnbc100000n1pjtest", payInvoiceMock)

      expect(boltcardStore.incrementDailySpent).toHaveBeenCalledWith("card123", 690)
      expect(result.status).toBe("OK")
    })

    it("should return error if exchange rate fails for USD card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "USD",
        apiKey: "test-key",
        environment: "production",
      })
      BlinkAPI.getExchangeRatePublic.mockRejectedValue(new Error("API error"))

      const result = await lnurlw.handleWithdrawCallback("card123", "lnbc10000n1pjtest", payInvoiceMock)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Failed to get exchange rate",
      })
    })

    it("should rollback balance if payment fails", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "test-key",
        environment: "production",
      })
      boltcardStore.incrementDailySpent.mockResolvedValue({
        success: true,
        balance: 49000,
      })
      payInvoiceMock.mockResolvedValue({
        success: false,
        error: "Route not found",
      })
      boltcardStore.rollbackSpend.mockResolvedValue(true)

      const result = await lnurlw.handleWithdrawCallback("card123", "lnbc10000n1pjtest", payInvoiceMock)

      expect(boltcardStore.rollbackSpend).toHaveBeenCalledWith("card123", 1000)
      expect(result).toEqual({
        status: "ERROR",
        reason: "Route not found",
      })
    })

    it("should handle payment failure with no error message", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        status: "ACTIVE",
        walletCurrency: "BTC",
        apiKey: "test-key",
        environment: "production",
      })
      boltcardStore.incrementDailySpent.mockResolvedValue({
        success: true,
        balance: 49000,
      })
      payInvoiceMock.mockResolvedValue({
        success: false,
      })
      boltcardStore.rollbackSpend.mockResolvedValue(true)

      const result = await lnurlw.handleWithdrawCallback("card123", "lnbc10000n1pjtest", payInvoiceMock)

      expect(result).toEqual({
        status: "ERROR",
        reason: "Payment failed",
      })
    })
  })

  describe("getCardBalance()", () => {
    it("should return error if card not found", async () => {
      boltcardStore.getCard.mockResolvedValue(null)

      const result = await lnurlw.getCardBalance("nonexistent")

      expect(result).toEqual({ error: "Card not found" })
    })

    it("should return balance info for BTC card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card123",
        balance: 50000,
        walletCurrency: "BTC",
        dailyLimit: 100000,
        dailySpent: 20000,
        maxTxAmount: 25000,
      })

      const result = await lnurlw.getCardBalance("card123")

      expect(result).toEqual({
        balance: 50000,
        unit: "sats",
        currency: "BTC",
        dailyLimit: 100000,
        dailySpent: 20000,
        dailyRemaining: 80000,
        maxTxAmount: 25000,
      })
    })

    it("should return balance info for USD card", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card456",
        balance: 1000,
        walletCurrency: "USD",
        dailyLimit: 5000,
        dailySpent: 500,
        maxTxAmount: null,
      })

      const result = await lnurlw.getCardBalance("card456")

      expect(result).toEqual({
        balance: 1000,
        unit: "cents",
        currency: "USD",
        dailyLimit: 5000,
        dailySpent: 500,
        dailyRemaining: 4500,
        maxTxAmount: null,
      })
    })

    it("should handle card with no daily limit", async () => {
      boltcardStore.getCard.mockResolvedValue({
        id: "card789",
        balance: 10000,
        walletCurrency: "BTC",
        dailyLimit: null,
        dailySpent: 0,
        maxTxAmount: null,
      })

      const result = await lnurlw.getCardBalance("card789")

      expect(result.dailyRemaining).toBeNull()
    })
  })
})
