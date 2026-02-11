/**
 * Unit Tests for lib/blink-api.js
 *
 * Tests the Blink API client class.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const BlinkAPI = require("../../lib/blink-api.js")

describe("BlinkAPI", () => {
  let api: InstanceType<typeof BlinkAPI>

  beforeEach(() => {
    jest.resetAllMocks()
    api = new BlinkAPI("test-api-key")
  })

  describe("constructor", () => {
    it("should initialize with API key", () => {
      expect(api.apiKey).toBe("test-api-key")
    })

    it("should set baseUrl from config", () => {
      expect(api.baseUrl).toBeDefined()
      expect(api.baseUrl).toContain("blink.sv")
    })
  })

  describe("query()", () => {
    it("should make POST request with correct headers", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: { test: "value" } }),
        headers: new Map([["content-type", "application/json"]]),
      }
      global.fetch = jest.fn().mockResolvedValue(mockResponse)

      const result = await api.query("query { test }")

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": "test-api-key",
          },
          body: expect.stringContaining("query { test }"),
        }),
      )
      expect(result).toEqual({ test: "value" })
    })

    it("should pass variables in request body", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: {} }),
        headers: new Map([["content-type", "application/json"]]),
      }
      global.fetch = jest.fn().mockResolvedValue(mockResponse)

      await api.query("query Test($var: String!)", { var: "testValue" })

      const [, options] = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.variables).toEqual({ var: "testValue" })
    })

    it("should throw on HTTP error", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => "text/html" },
        text: jest.fn().mockResolvedValue("Server Error"),
      })

      await expect(api.query("query { test }")).rejects.toThrow("500")
    })

    it("should throw on GraphQL errors", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          errors: [{ message: "Invalid query" }],
        }),
        headers: { get: () => "application/json" },
      })

      await expect(api.query("query { test }")).rejects.toThrow("Invalid query")
    })
  })

  describe("getBalance()", () => {
    it("should return wallets array", async () => {
      const mockWallets = [
        { id: "wallet1", walletCurrency: "BTC", balance: 100000 },
        { id: "wallet2", walletCurrency: "USD", balance: 5000 },
      ]

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            me: {
              defaultAccount: {
                wallets: mockWallets,
              },
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      const result = await api.getBalance()

      expect(result).toEqual(mockWallets)
      expect(result).toHaveLength(2)
    })

    it("should return empty array when no wallets", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: { me: null },
        }),
        headers: { get: () => "application/json" },
      })

      const result = await api.getBalance()
      expect(result).toEqual([])
    })
  })

  describe("getWalletInfo()", () => {
    it("should return wallet info", async () => {
      const mockWallets = [
        { id: "btc-wallet", walletCurrency: "BTC", balance: 50000 },
      ]

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            me: {
              defaultAccount: {
                wallets: mockWallets,
              },
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      const result = await api.getWalletInfo()

      expect(result).toEqual(mockWallets)
    })
  })

  describe("createLnInvoice()", () => {
    it("should create Lightning invoice", async () => {
      const mockInvoice = {
        paymentRequest: "lnbc...",
        paymentHash: "abc123",
        paymentSecret: "secret",
        satoshis: 1000,
      }

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            lnInvoiceCreate: {
              invoice: mockInvoice,
              errors: [],
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      const result = await api.createLnInvoice("wallet-id", 1000, "Test memo")

      expect(result).toEqual(mockInvoice)

      const [, options] = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.variables.input).toEqual({
        walletId: "wallet-id",
        amount: 1000,
        memo: "Test memo",
      })
    })

    it("should throw on invoice creation error", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            lnInvoiceCreate: {
              invoice: null,
              errors: [{ message: "Insufficient balance" }],
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      await expect(api.createLnInvoice("wallet-id", 1000)).rejects.toThrow(
        "Insufficient balance",
      )
    })
  })

  describe("createLnUsdInvoice()", () => {
    it("should create USD Lightning invoice", async () => {
      const mockInvoice = {
        paymentRequest: "lnbc...",
        paymentHash: "abc123",
        satoshis: 1000,
      }

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            lnUsdInvoiceCreate: {
              invoice: mockInvoice,
              errors: [],
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      const result = await api.createLnUsdInvoice(
        "usd-wallet-id",
        500,
        "USD payment",
      )

      expect(result).toEqual(mockInvoice)
    })
  })

  describe("payLnInvoice()", () => {
    it("should pay Lightning invoice", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            lnInvoicePaymentSend: {
              status: "SUCCESS",
              errors: [],
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      const result = await api.payLnInvoice("wallet-id", "lnbc...", "Payment memo")

      expect(result.status).toBe("SUCCESS")
    })

    it("should include memo in payment request", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            lnInvoicePaymentSend: {
              status: "SUCCESS",
              errors: [],
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      await api.payLnInvoice("wallet-id", "lnbc...", "Test memo")

      const [, options] = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.variables.input.memo).toBe("Test memo")
    })

    it("should not include memo when empty", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            lnInvoicePaymentSend: {
              status: "SUCCESS",
              errors: [],
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      await api.payLnInvoice("wallet-id", "lnbc...")

      const [, options] = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.variables.input.memo).toBeUndefined()
    })
  })

  describe("getExchangeRate()", () => {
    it("should return 1:1 rate for BTC", async () => {
      const result = await api.getExchangeRate("BTC")

      expect(result.satPriceInCurrency).toBe(1)
    })

    it("should calculate sat price for fiat currencies", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            realtimePrice: {
              btcSatPrice: {
                base: 45,
                offset: 6, // 45 / 10^6 = 0.000045 USD per sat
              },
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      const result = await api.getExchangeRate("USD")

      expect(result.satPriceInCurrency).toBeCloseTo(0.000045)
      expect(result.currency).toBe("USD")
    })

    it("should throw when rate not available", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: { realtimePrice: null },
        }),
        headers: { get: () => "application/json" },
      })

      await expect(api.getExchangeRate("XYZ")).rejects.toThrow("not available")
    })
  })

  describe("convertToSatoshis()", () => {
    it("should return amount as-is for BTC", () => {
      const result = api.convertToSatoshis(1000, "BTC", null)
      expect(result).toBe(1000)
    })

    it("should convert fiat to sats", () => {
      const exchangeRate = { satPriceInCurrency: 0.0005 } // $0.0005 per sat = $50,000/BTC

      const result = api.convertToSatoshis(10, "USD", exchangeRate, 2)

      // $10 = 1000 cents, 1000 / 0.0005 = 2,000,000 sats
      expect(result).toBe(2000000)
    })

    it("should handle zero fraction digits (JPY, KRW)", () => {
      const exchangeRate = { satPriceInCurrency: 0.05 } // 0.05 JPY per sat

      const result = api.convertToSatoshis(1000, "JPY", exchangeRate, 0)

      // 1000 JPY / 0.05 = 20,000 sats
      expect(result).toBe(20000)
    })

    it("should throw when exchange rate not available", () => {
      expect(() => api.convertToSatoshis(10, "USD", null)).toThrow(
        "not available",
      )
    })
  })

  describe("static formatAmount()", () => {
    it("should format BTC amounts as sats", () => {
      expect(BlinkAPI.formatAmount(1000, "BTC")).toBe("1,000 sats")
      expect(BlinkAPI.formatAmount(1234567, "BTC")).toBe("1,234,567 sats")
    })

    it("should format USD amounts from cents to dollars", () => {
      expect(BlinkAPI.formatAmount(500, "USD")).toBe("5.00 USD")
      expect(BlinkAPI.formatAmount(12345, "USD")).toBe("123.45 USD")
    })

    it("should format other currencies with amount", () => {
      expect(BlinkAPI.formatAmount(100, "EUR")).toBe("100 EUR")
    })
  })

  describe("static formatDate()", () => {
    it("should format ISO date strings", () => {
      const result = BlinkAPI.formatDate("2024-01-15T10:30:00Z")
      expect(result).toContain("Jan")
      expect(result).toContain("2024")
    })

    it("should format Unix timestamps (seconds)", () => {
      const result = BlinkAPI.formatDate(1705313400) // Jan 15, 2024
      expect(result).toContain("Jan")
      expect(result).toContain("2024")
    })

    it("should format Unix timestamps (milliseconds)", () => {
      // Using a large number that's clearly milliseconds
      const result = BlinkAPI.formatDate("1705313400000") // As string
      expect(result).toContain("Jan")
      expect(result).toContain("2024")
    })

    it("should return original on invalid date", () => {
      const result = BlinkAPI.formatDate("invalid-date")
      expect(result).toBe("invalid-date")
    })
  })

  describe("static getTransactionAmount()", () => {
    it("should return positive amount for RECEIVE", () => {
      const tx = {
        direction: "RECEIVE",
        settlementAmount: 1000,
        settlementCurrency: "BTC",
      }

      const result = BlinkAPI.getTransactionAmount(tx)
      expect(result).toBe("+1,000 sats")
    })

    it("should return negative amount for SEND", () => {
      const tx = {
        direction: "SEND",
        settlementAmount: -1000,
        settlementCurrency: "BTC",
      }

      const result = BlinkAPI.getTransactionAmount(tx)
      expect(result).toBe("-1,000 sats")
    })
  })

  describe("static getExchangeRatePublic()", () => {
    it("should return 1:1 for BTC", async () => {
      const result = await BlinkAPI.getExchangeRatePublic("BTC")
      expect(result.satPriceInCurrency).toBe(1)
    })

    it("should return 1:1 for SAT", async () => {
      const result = await BlinkAPI.getExchangeRatePublic("SAT")
      expect(result.satPriceInCurrency).toBe(1)
    })

    it("should always use mainnet for public queries", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            realtimePrice: {
              btcSatPrice: { base: 45, offset: 6 },
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      await BlinkAPI.getExchangeRatePublic("USD")

      const [url] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe("https://api.blink.sv/graphql")
    })

    it("should throw on HTTP error", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue("Server Error"),
      })

      await expect(BlinkAPI.getExchangeRatePublic("USD")).rejects.toThrow("500")
    })

    it("should throw on GraphQL errors", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          errors: [{ message: "Invalid currency" }],
        }),
      })

      await expect(BlinkAPI.getExchangeRatePublic("XYZ")).rejects.toThrow(
        "Invalid currency",
      )
    })

    it("should throw when rate data is missing", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: { realtimePrice: null },
        }),
      })

      await expect(BlinkAPI.getExchangeRatePublic("USD")).rejects.toThrow(
        "not available",
      )
    })
  })

  describe("getMe()", () => {
    it("should return user info", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            me: {
              username: "testuser",
              defaultAccount: {
                displayCurrency: "USD",
              },
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      const result = await api.getMe()

      expect(result.username).toBe("testuser")
      expect(result.defaultAccount.displayCurrency).toBe("USD")
    })
  })

  describe("getTransactions()", () => {
    it("should return transactions with pagination", async () => {
      const mockTx = {
        id: "tx-123",
        direction: "RECEIVE",
        status: "SUCCESS",
        settlementAmount: 1000,
        settlementCurrency: "BTC",
        createdAt: "2024-01-15T10:00:00Z",
      }

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            me: {
              defaultAccount: {
                id: "account-123",
                transactions: {
                  edges: [{ cursor: "cursor1", node: mockTx }],
                  pageInfo: { hasNextPage: true, endCursor: "cursor1" },
                },
              },
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      const result = await api.getTransactions(10, null)

      expect(result.edges).toHaveLength(1)
      expect(result.edges[0].node.id).toBe("tx-123")
      expect(result.edges[0].node.walletId).toBe("account-123")
      expect(result.pageInfo.hasNextPage).toBe(true)
    })

    it("should return empty transactions when no account", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: { me: null },
        }),
        headers: { get: () => "application/json" },
      })

      const result = await api.getTransactions()

      expect(result.edges).toEqual([])
    })
  })

  describe("getUserInfo()", () => {
    it("should return user info with account ID", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            me: {
              id: "user-123",
              username: "testuser",
              defaultAccount: { id: "account-123" },
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      const result = await api.getUserInfo()

      expect(result.me.id).toBe("user-123")
      expect(result.me.username).toBe("testuser")
    })
  })

  describe("getCsvTransactions()", () => {
    it("should return CSV data for wallet IDs", async () => {
      const csvData = "id,amount,currency\ntx1,1000,BTC"

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            me: {
              id: "user-123",
              defaultAccount: {
                id: "account-123",
                csvTransactions: csvData,
              },
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      const result = await api.getCsvTransactions(["wallet-1", "wallet-2"])

      expect(result).toBe(csvData)
    })
  })

  describe("createLnUsdInvoice()", () => {
    it("should throw on invoice creation error", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            lnUsdInvoiceCreate: {
              invoice: null,
              errors: [{ message: "Invalid amount" }],
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      await expect(
        api.createLnUsdInvoice("usd-wallet", 0, "Test"),
      ).rejects.toThrow("Invalid amount")
    })
  })

  describe("intraLedgerPaymentSend()", () => {
    it("should send intra-ledger payment", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            intraLedgerPaymentSend: {
              status: "SUCCESS",
              errors: [],
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      const result = await api.intraLedgerPaymentSend(
        "btc-wallet",
        "usd-wallet",
        1000,
        "Transfer memo",
      )

      expect(result.status).toBe("SUCCESS")

      const [, options] = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.variables.input.walletId).toBe("btc-wallet")
      expect(body.variables.input.recipientWalletId).toBe("usd-wallet")
      expect(body.variables.input.amount).toBe(1000)
      expect(body.variables.input.memo).toBe("Transfer memo")
    })

    it("should send without memo when empty", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            intraLedgerPaymentSend: {
              status: "SUCCESS",
              errors: [],
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      await api.intraLedgerPaymentSend("btc-wallet", "usd-wallet", 1000)

      const [, options] = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.variables.input.memo).toBeUndefined()
    })

    it("should throw on payment error", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            intraLedgerPaymentSend: {
              status: "FAILURE",
              errors: [{ message: "Insufficient balance" }],
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      await expect(
        api.intraLedgerPaymentSend("btc-wallet", "usd-wallet", 1000000000),
      ).rejects.toThrow("Insufficient balance")
    })
  })

  describe("payLnInvoice()", () => {
    it("should throw on payment error", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            lnInvoicePaymentSend: {
              status: "FAILURE",
              errors: [{ message: "Invoice expired" }],
            },
          },
        }),
        headers: { get: () => "application/json" },
      })

      await expect(
        api.payLnInvoice("wallet-id", "lnbc1expired..."),
      ).rejects.toThrow("Invoice expired")
    })
  })

  describe("static getWalletByUsername()", () => {
    it("should return wallet info for username", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            accountDefaultWallet: {
              id: "wallet-123",
              currency: "BTC",
            },
          },
        }),
      })

      const result = await BlinkAPI.getWalletByUsername("testuser")

      expect(result.id).toBe("wallet-123")
      expect(result.currency).toBe("BTC")
    })

    it("should throw on GraphQL errors", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          errors: [{ message: "User not found" }],
        }),
      })

      await expect(BlinkAPI.getWalletByUsername("nonexistent")).rejects.toThrow(
        "User not found",
      )
    })
  })

  describe("static getBtcWalletByUsername()", () => {
    it("should return BTC wallet for username", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            accountDefaultWallet: {
              id: "btc-wallet-123",
              currency: "BTC",
            },
          },
        }),
      })

      const result = await BlinkAPI.getBtcWalletByUsername("testuser")

      expect(result.id).toBe("btc-wallet-123")
      expect(result.currency).toBe("BTC")

      const [, options] = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.variables.walletCurrency).toBe("BTC")
    })

    it("should throw when no wallet found", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            accountDefaultWallet: null,
          },
        }),
      })

      await expect(
        BlinkAPI.getBtcWalletByUsername("nowalletuser"),
      ).rejects.toThrow("No BTC wallet found")
    })

    it("should throw when wallet is not BTC", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            accountDefaultWallet: {
              id: "usd-wallet-123",
              currency: "USD",
            },
          },
        }),
      })

      await expect(BlinkAPI.getBtcWalletByUsername("usduser")).rejects.toThrow(
        "Expected BTC wallet but got USD",
      )
    })

    it("should throw on GraphQL errors", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          errors: [{ message: "Account not found" }],
        }),
      })

      await expect(
        BlinkAPI.getBtcWalletByUsername("nonexistent"),
      ).rejects.toThrow("Account not found")
    })
  })

  describe("static createInvoiceOnBehalfOfRecipient()", () => {
    it("should create invoice for recipient", async () => {
      const mockInvoice = {
        paymentRequest: "lnbc1000n1...",
        paymentHash: "hash123",
        satoshis: 1000,
      }

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            lnInvoiceCreateOnBehalfOfRecipient: {
              invoice: mockInvoice,
            },
          },
        }),
      })

      const result = await BlinkAPI.createInvoiceOnBehalfOfRecipient(
        "wallet-123",
        1000,
        "Tip from user",
        15,
      )

      expect(result).toEqual(mockInvoice)

      const [, options] = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.variables.input.recipientWalletId).toBe("wallet-123")
      expect(body.variables.input.amount).toBe("1000")
      expect(body.variables.input.memo).toBe("Tip from user")
      expect(body.variables.input.expiresIn).toBe("15")
    })

    it("should throw on GraphQL errors", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          errors: [{ message: "Invalid wallet" }],
        }),
      })

      await expect(
        BlinkAPI.createInvoiceOnBehalfOfRecipient("bad-wallet", 1000, "Test"),
      ).rejects.toThrow("Invalid wallet")
    })
  })

  describe("sendTipViaInvoice()", () => {
    it("should send tip via invoice creation", async () => {
      // Mock getBtcWalletByUsername
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              accountDefaultWallet: {
                id: "recipient-wallet",
                currency: "BTC",
              },
            },
          }),
        })
        // Mock createInvoiceOnBehalfOfRecipient
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              lnInvoiceCreateOnBehalfOfRecipient: {
                invoice: {
                  paymentRequest: "lnbc1000n1...",
                  paymentHash: "hash123",
                  satoshis: 1000,
                },
              },
            },
          }),
        })
        // Mock payLnInvoice
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              lnInvoicePaymentSend: {
                status: "SUCCESS",
                errors: [],
              },
            },
          }),
          headers: { get: () => "application/json" },
        })

      const result = await api.sendTipViaInvoice(
        "sender-wallet",
        "recipient",
        1000,
        "Tip memo",
      )

      expect(result.status).toBe("SUCCESS")
      expect(result.paymentHash).toBe("hash123")
      expect(result.satoshis).toBe(1000)
      expect(result.memo).toBe("Tip memo")
    })

    it("should throw when recipient has no BTC wallet", async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            accountDefaultWallet: null,
          },
        }),
      })

      await expect(
        api.sendTipViaInvoice("sender-wallet", "nowalletuser", 1000, "Tip"),
      ).rejects.toThrow("No BTC wallet found")
    })

    it("should throw when invoice creation fails", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              accountDefaultWallet: {
                id: "recipient-wallet",
                currency: "BTC",
              },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            data: {
              lnInvoiceCreateOnBehalfOfRecipient: {
                invoice: null,
              },
            },
          }),
        })

      await expect(
        api.sendTipViaInvoice("sender-wallet", "recipient", 1000, "Tip"),
      ).rejects.toThrow("Failed to create invoice")
    })
  })

  describe("query() error handling", () => {
    it("should handle JSON error responses", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: () => "application/json" },
        json: jest.fn().mockResolvedValue({
          message: "Bad request: invalid API key",
        }),
      })

      await expect(api.query("query { test }")).rejects.toThrow(
        "Bad request: invalid API key",
      )
    })

    it("should handle JSON error with error field", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => "application/json" },
        json: jest.fn().mockResolvedValue({
          error: "Unauthorized access",
        }),
      })

      await expect(api.query("query { test }")).rejects.toThrow(
        "Unauthorized access",
      )
    })
  })
})
