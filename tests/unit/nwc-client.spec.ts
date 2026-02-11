/**
 * @jest-environment node
 */

/**
 * Tests for lib/nwc/NWCClient.js
 *
 * Tests NWC (Nostr Wallet Connect) client:
 * - Connection string parsing
 * - Wallet info retrieval
 * - Invoice creation and payment
 * - Balance checking
 * - Blink wallet validation
 */

export {}

// Mock nostr-tools before importing
const mockNip04Encrypt = jest.fn()
const mockNip04Decrypt = jest.fn()
const mockNip19Decode = jest.fn()
const mockFinalizeEvent = jest.fn()
const mockGetPublicKey = jest.fn()

const mockPoolGet = jest.fn()
const mockPoolPublish = jest.fn()
const mockPoolSubscribe = jest.fn()
const mockPoolClose = jest.fn()

jest.mock("nostr-tools", () => ({
  nip04: {
    encrypt: (...args: unknown[]) => mockNip04Encrypt(...args),
    decrypt: (...args: unknown[]) => mockNip04Decrypt(...args),
  },
  nip19: {
    decode: (...args: unknown[]) => mockNip19Decode(...args),
  },
  finalizeEvent: (...args: unknown[]) => mockFinalizeEvent(...args),
  getPublicKey: (...args: unknown[]) => mockGetPublicKey(...args),
  SimplePool: jest.fn().mockImplementation(() => ({
    get: mockPoolGet,
    publish: mockPoolPublish,
    subscribe: mockPoolSubscribe,
    close: mockPoolClose,
  })),
}))

// Mock @noble/hashes/utils
jest.mock("@noble/hashes/utils", () => ({
  bytesToHex: jest.fn((bytes: Uint8Array) => Buffer.from(bytes).toString("hex")),
  hexToBytes: jest.fn((hex: string) => Buffer.from(hex, "hex")),
}))

// Mock invoice-decoder
const mockIsBlinkInvoice = jest.fn()
const mockGetNonBlinkWalletError = jest.fn()

jest.mock("../../lib/invoice-decoder", () => ({
  isBlinkInvoice: (...args: unknown[]) => mockIsBlinkInvoice(...args),
  getNonBlinkWalletError: (...args: unknown[]) => mockGetNonBlinkWalletError(...args),
  BLINK_NODE_PUBKEYS: ["blink-node-pubkey-1", "blink-node-pubkey-2"],
}))

// Now import the module
import NWCClient from "../../lib/nwc/NWCClient.js"

describe("NWCClient", () => {
  // Valid test connection string components
  const validWalletPubkey = "a".repeat(64)
  const validClientSecret = "b".repeat(64)
  const validRelay = "wss://relay.example.com"
  const validConnectionString = `nostr+walletconnect://${validWalletPubkey}?relay=${encodeURIComponent(validRelay)}&secret=${validClientSecret}`

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetPublicKey.mockReturnValue("c".repeat(64))
    mockFinalizeEvent.mockImplementation((template) => ({
      ...template,
      id: "event-id-123",
      pubkey: "c".repeat(64),
      sig: "signature",
    }))
  })

  describe("constructor", () => {
    it("should create client from valid connection string", () => {
      const client = new NWCClient(validConnectionString)

      expect(client.uri.walletPubkey).toBe(validWalletPubkey)
      expect(client.uri.relays).toContain(validRelay)
      expect(client.uri.clientSecretHex).toBe(validClientSecret)
    })

    it("should throw for invalid connection string", () => {
      expect(() => new NWCClient("invalid")).toThrow()
    })
  })

  describe("parseConnectionString()", () => {
    it("should parse nostr+walletconnect:// URI", () => {
      const client = new NWCClient(validConnectionString)

      expect(client.uri.walletPubkey).toBe(validWalletPubkey)
      expect(client.uri.relays).toEqual([validRelay])
      expect(client.uri.clientSecretHex).toBe(validClientSecret)
    })

    it("should parse nostrnwc:// URI", () => {
      const nwcUri = `nostrnwc://${validWalletPubkey}?relay=${encodeURIComponent(validRelay)}&secret=${validClientSecret}`
      const client = new NWCClient(nwcUri)

      expect(client.uri.walletPubkey).toBe(validWalletPubkey)
    })

    it("should handle multiple relays", () => {
      const relay1 = "wss://relay1.example.com"
      const relay2 = "wss://relay2.example.com"
      const uri = `nostr+walletconnect://${validWalletPubkey}?relay=${encodeURIComponent(relay1)}&relay=${encodeURIComponent(relay2)}&secret=${validClientSecret}`

      const client = new NWCClient(uri)

      expect(client.uri.relays).toHaveLength(2)
      expect(client.uri.relays).toContain(relay1)
      expect(client.uri.relays).toContain(relay2)
    })

    it("should handle comma-separated relays", () => {
      const relay1 = "wss://relay1.example.com"
      const relay2 = "wss://relay2.example.com"
      const uri = `nostr+walletconnect://${validWalletPubkey}?relay=${encodeURIComponent(`${relay1},${relay2}`)}&secret=${validClientSecret}`

      const client = new NWCClient(uri)

      expect(client.uri.relays).toHaveLength(2)
    })

    it("should handle nsec secret format", () => {
      const nsecSecret = "nsec1test"
      mockNip19Decode.mockReturnValue({ data: Buffer.from(validClientSecret, "hex") })

      const uri = `nostr+walletconnect://${validWalletPubkey}?relay=${encodeURIComponent(validRelay)}&secret=${nsecSecret}`

      const client = new NWCClient(uri)

      expect(mockNip19Decode).toHaveBeenCalledWith(nsecSecret)
    })

    it("should throw for missing wallet pubkey", () => {
      // When hostname is empty, URL parsing may fail with "Invalid URL" 
      // or validation fails with "missing required fields"
      const uri = `nostr+walletconnect://?relay=${encodeURIComponent(validRelay)}&secret=${validClientSecret}`

      expect(() => new NWCClient(uri)).toThrow()
    })

    it("should throw for missing secret", () => {
      const uri = `nostr+walletconnect://${validWalletPubkey}?relay=${encodeURIComponent(validRelay)}`

      expect(() => new NWCClient(uri)).toThrow("missing required fields")
    })

    it("should throw for missing relays", () => {
      const uri = `nostr+walletconnect://${validWalletPubkey}?secret=${validClientSecret}`

      expect(() => new NWCClient(uri)).toThrow("missing required fields")
    })
  })

  describe("getInfo()", () => {
    it("should return wallet info on success", async () => {
      mockPoolGet.mockResolvedValue({
        id: "event-id",
        content: "pay_invoice get_balance make_invoice",
        tags: [],
      })

      const client = new NWCClient(validConnectionString)
      const info = await client.getInfo()

      expect(info).not.toBeNull()
      expect(info!.methods).toContain("pay_invoice")
      expect(info!.methods).toContain("get_balance")
      expect(info!.methods).toContain("make_invoice")
    })

    it("should parse notifications tag", async () => {
      mockPoolGet.mockResolvedValue({
        id: "event-id",
        content: "pay_invoice",
        tags: [["notifications", "payment_received payment_sent"]],
      })

      const client = new NWCClient(validConnectionString)
      const info = await client.getInfo()

      expect(info!.notifications).toContain("payment_received")
      expect(info!.notifications).toContain("payment_sent")
    })

    it("should parse encryption tag", async () => {
      mockPoolGet.mockResolvedValue({
        id: "event-id",
        content: "pay_invoice",
        tags: [["encryption", "nip04 nip44"]],
      })

      const client = new NWCClient(validConnectionString)
      const info = await client.getInfo()

      expect(info!.encryption).toContain("nip04")
      expect(info!.encryption).toContain("nip44")
    })

    it("should return null on timeout", async () => {
      mockPoolGet.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(null), 15000))
      )

      const client = new NWCClient(validConnectionString)
      const info = await client.getInfo()

      expect(info).toBeNull()
    }, 15000)

    it("should return null when no event found", async () => {
      mockPoolGet.mockResolvedValue(null)

      const client = new NWCClient(validConnectionString)
      const info = await client.getInfo()

      expect(info).toBeNull()
    })

    it("should return null on error", async () => {
      mockPoolGet.mockRejectedValue(new Error("Connection failed"))

      const client = new NWCClient(validConnectionString)
      const info = await client.getInfo()

      expect(info).toBeNull()
    })

    it("should handle empty content", async () => {
      mockPoolGet.mockResolvedValue({
        id: "event-id",
        content: "",
        tags: [],
      })

      const client = new NWCClient(validConnectionString)
      const info = await client.getInfo()

      expect(info!.methods).toEqual([])
    })
  })

  describe("getDisplayName()", () => {
    it("should return truncated pubkey", () => {
      const client = new NWCClient(validConnectionString)
      const displayName = client.getDisplayName()

      expect(displayName).toBe(`${validWalletPubkey.slice(0, 8)}...${validWalletPubkey.slice(-8)}`)
    })
  })

  describe("getWalletPubkey()", () => {
    it("should return wallet pubkey", () => {
      const client = new NWCClient(validConnectionString)

      expect(client.getWalletPubkey()).toBe(validWalletPubkey)
    })
  })

  describe("getRelays()", () => {
    it("should return copy of relays array", () => {
      const client = new NWCClient(validConnectionString)
      const relays = client.getRelays()

      expect(relays).toContain(validRelay)
      // Verify it's a copy, not the original
      relays.push("wss://new.relay.com")
      expect(client.getRelays()).not.toContain("wss://new.relay.com")
    })
  })

  describe("close()", () => {
    it("should close the pool", () => {
      const client = new NWCClient(validConnectionString)
      client.close()

      expect(mockPoolClose).toHaveBeenCalled()
    })

    it("should not throw on close error", () => {
      mockPoolClose.mockImplementation(() => {
        throw new Error("Close failed")
      })

      const client = new NWCClient(validConnectionString)

      expect(() => client.close()).not.toThrow()
    })
  })

  describe("payInvoice()", () => {
    it("should send pay_invoice request", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockNip04Decrypt.mockResolvedValue(
        JSON.stringify({
          result_type: "pay_invoice",
          result: { preimage: "preimage123" },
          error: null,
        })
      )

      // Mock subscription to trigger response
      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(() => {
          handlers.onevent({
            id: "response-id",
            content: "encrypted-response",
          })
        }, 10)
        return { close: jest.fn() }
      })

      const client = new NWCClient(validConnectionString)
      const result = await client.payInvoice("lnbc1000...")

      expect(result.result_type).toBe("pay_invoice")
      expect(result.result?.preimage).toBe("preimage123")
    })

    it("should handle encryption failure", async () => {
      mockNip04Encrypt.mockRejectedValue(new Error("Encryption failed"))

      const client = new NWCClient(validConnectionString)
      const result = await client.payInvoice("lnbc1000...")

      expect(result.error?.code).toBe("encryption_failed")
    })

    it("should handle publish failure", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockRejectedValue(new Error("Publish failed"))

      const client = new NWCClient(validConnectionString)
      const result = await client.payInvoice("lnbc1000...")

      expect(result.error?.code).toBe("publish_failed")
    })

    it("should handle timeout", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockPoolSubscribe.mockImplementation(() => ({ close: jest.fn() }))

      const client = new NWCClient(validConnectionString)
      // Use a short timeout for testing - cast through unknown to access private method
      const result = await (client as unknown as { sendRequest: (req: object, timeout: number) => Promise<{ error?: { code: string } }> }).sendRequest(
        { method: "pay_invoice", params: { invoice: "lnbc..." } },
        100
      )

      expect(result.error?.code).toBe("timeout")
    })
  })

  describe("getBalance()", () => {
    it("should send get_balance request", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockNip04Decrypt.mockResolvedValue(
        JSON.stringify({
          result_type: "get_balance",
          result: { balance: 100000 },
          error: null,
        })
      )

      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(() => {
          handlers.onevent({ id: "response-id", content: "encrypted-response" })
        }, 10)
        return { close: jest.fn() }
      })

      const client = new NWCClient(validConnectionString)
      const result = await client.getBalance()

      expect(result.result_type).toBe("get_balance")
      expect(result.result?.balance).toBe(100000)
    })
  })

  describe("makeInvoice()", () => {
    it("should send make_invoice request", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockNip04Decrypt.mockResolvedValue(
        JSON.stringify({
          result_type: "make_invoice",
          result: { invoice: "lnbc...", payment_hash: "hash123" },
          error: null,
        })
      )

      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(() => {
          handlers.onevent({ id: "response-id", content: "encrypted-response" })
        }, 10)
        return { close: jest.fn() }
      })

      const client = new NWCClient(validConnectionString)
      const result = await client.makeInvoice({
        amount: 1000,
        description: "Test invoice",
      })

      expect(result.result_type).toBe("make_invoice")
      expect(result.result?.invoice).toBe("lnbc...")
    })
  })

  describe("lookupInvoice()", () => {
    it("should send lookup_invoice request", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockNip04Decrypt.mockResolvedValue(
        JSON.stringify({
          result_type: "lookup_invoice",
          result: { paid: true },
          error: null,
        })
      )

      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(() => {
          handlers.onevent({ id: "response-id", content: "encrypted-response" })
        }, 10)
        return { close: jest.fn() }
      })

      const client = new NWCClient(validConnectionString)
      const result = await client.lookupInvoice("payment-hash-123")

      expect(result.result_type).toBe("lookup_invoice")
    })
  })

  describe("listTransactions()", () => {
    it("should send list_transactions request", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockNip04Decrypt.mockResolvedValue(
        JSON.stringify({
          result_type: "list_transactions",
          result: { transactions: [] },
          error: null,
        })
      )

      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(() => {
          handlers.onevent({ id: "response-id", content: "encrypted-response" })
        }, 10)
        return { close: jest.fn() }
      })

      const client = new NWCClient(validConnectionString)
      const result = await client.listTransactions({ limit: 10 })

      expect(result.result_type).toBe("list_transactions")
    })
  })

  describe("validateBlinkWallet()", () => {
    it("should return valid for Blink wallet", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockNip04Decrypt.mockResolvedValue(
        JSON.stringify({
          result_type: "make_invoice",
          result: { invoice: "lnbc...", payment_hash: "hash" },
          error: null,
        })
      )

      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(() => {
          handlers.onevent({ id: "response-id", content: "encrypted-response" })
        }, 10)
        return { close: jest.fn() }
      })

      mockIsBlinkInvoice.mockReturnValue({ isBlink: true, nodePubkey: "blink-node" })

      const client = new NWCClient(validConnectionString)
      const result = await client.validateBlinkWallet()

      expect(result.valid).toBe(true)
      expect(result.nodePubkey).toBe("blink-node")
    })

    it("should return invalid for non-Blink wallet", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockNip04Decrypt.mockResolvedValue(
        JSON.stringify({
          result_type: "make_invoice",
          result: { invoice: "lnbc...", payment_hash: "hash" },
          error: null,
        })
      )

      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(() => {
          handlers.onevent({ id: "response-id", content: "encrypted-response" })
        }, 10)
        return { close: jest.fn() }
      })

      mockIsBlinkInvoice.mockReturnValue({ isBlink: false, nodePubkey: "other-node" })
      mockGetNonBlinkWalletError.mockReturnValue("Only Blink wallets supported")

      const client = new NWCClient(validConnectionString)
      const result = await client.validateBlinkWallet()

      expect(result.valid).toBe(false)
      expect(result.error).toContain("Blink")
    })

    it("should handle invoice creation error", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockNip04Decrypt.mockResolvedValue(
        JSON.stringify({
          result_type: "make_invoice",
          result: null,
          error: { code: "ERROR", message: "Failed to create invoice" },
        })
      )

      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(() => {
          handlers.onevent({ id: "response-id", content: "encrypted-response" })
        }, 10)
        return { close: jest.fn() }
      })

      const client = new NWCClient(validConnectionString)
      const result = await client.validateBlinkWallet()

      expect(result.valid).toBe(false)
      expect(result.error).toContain("Failed to create test invoice")
    })

    it("should handle missing invoice in response", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockNip04Decrypt.mockResolvedValue(
        JSON.stringify({
          result_type: "make_invoice",
          result: {},
          error: null,
        })
      )

      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(() => {
          handlers.onevent({ id: "response-id", content: "encrypted-response" })
        }, 10)
        return { close: jest.fn() }
      })

      const client = new NWCClient(validConnectionString)
      const result = await client.validateBlinkWallet()

      expect(result.valid).toBe(false)
      expect(result.error).toContain("did not return an invoice")
    })

    it("should handle invoice decode error", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockNip04Decrypt.mockResolvedValue(
        JSON.stringify({
          result_type: "make_invoice",
          result: { invoice: "lnbc..." },
          error: null,
        })
      )

      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(() => {
          handlers.onevent({ id: "response-id", content: "encrypted-response" })
        }, 10)
        return { close: jest.fn() }
      })

      mockIsBlinkInvoice.mockReturnValue({ error: "Invalid invoice format" })

      const client = new NWCClient(validConnectionString)
      const result = await client.validateBlinkWallet()

      expect(result.valid).toBe(false)
      expect(result.error).toContain("Failed to decode invoice")
    })
  })

  describe("static validate()", () => {
    it("should return valid for Blink wallet with make_invoice support", async () => {
      mockPoolGet.mockResolvedValue({
        id: "event-id",
        content: "pay_invoice get_balance make_invoice",
        tags: [],
      })

      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockNip04Decrypt.mockResolvedValue(
        JSON.stringify({
          result_type: "make_invoice",
          result: { invoice: "lnbc..." },
          error: null,
        })
      )

      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(() => {
          handlers.onevent({ id: "response-id", content: "encrypted-response" })
        }, 10)
        return { close: jest.fn() }
      })

      mockIsBlinkInvoice.mockReturnValue({ isBlink: true, nodePubkey: "blink-node" })

      const result = await NWCClient.validate(validConnectionString)

      expect(result.valid).toBe(true)
      expect(result.info).toBeDefined()
    })

    it("should return invalid when info cannot be fetched", async () => {
      mockPoolGet.mockResolvedValue(null)

      const result = await NWCClient.validate(validConnectionString)

      expect(result.valid).toBe(false)
      expect(result.error).toContain("capabilities")
    })

    it("should return invalid when make_invoice not supported", async () => {
      mockPoolGet.mockResolvedValue({
        id: "event-id",
        content: "pay_invoice get_balance",
        tags: [],
      })

      const result = await NWCClient.validate(validConnectionString)

      expect(result.valid).toBe(false)
      expect(result.error).toContain("make_invoice")
    })

    it("should handle invalid connection string", async () => {
      const result = await NWCClient.validate("invalid-string")

      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe("sendRequest() - subscription handling", () => {
    it("should handle subscription closed event", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)

      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(() => {
          handlers.onclose("relay disconnected")
        }, 10)
        return { close: jest.fn() }
      })

      const client = new NWCClient(validConnectionString)
      const result = await client.payInvoice("lnbc...")

      expect(result.error?.code).toBe("subscription_closed")
    })

    it("should handle oneose event", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockNip04Decrypt.mockResolvedValue(
        JSON.stringify({
          result_type: "pay_invoice",
          result: { preimage: "test" },
          error: null,
        })
      )

      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(() => handlers.oneose(), 5)
        setTimeout(() => {
          handlers.onevent({ id: "response-id", content: "encrypted-response" })
        }, 10)
        return { close: jest.fn() }
      })

      const client = new NWCClient(validConnectionString)
      const result = await client.payInvoice("lnbc...")

      // Should still get the response after oneose
      expect(result.result_type).toBe("pay_invoice")
    })

    it("should handle decryption failure", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockNip04Decrypt.mockRejectedValue(new Error("Decryption failed"))

      let resolveTimeout: () => void
      const timeoutPromise = new Promise<void>((resolve) => {
        resolveTimeout = resolve
      })

      mockPoolSubscribe.mockImplementation((relays, filter, handlers) => {
        setTimeout(async () => {
          await handlers.onevent({ id: "response-id", content: "bad-content" })
          // After decryption fails, trigger timeout
          resolveTimeout()
        }, 10)
        return { close: jest.fn() }
      })

      const client = new NWCClient(validConnectionString)
      // Cast through unknown to access private method for testing
      const resultPromise = (client as unknown as { sendRequest: (req: object, timeout: number) => Promise<{ error?: { code: string } }> }).sendRequest(
        { method: "pay_invoice", params: { invoice: "lnbc..." } },
        200 // Short timeout
      )

      await timeoutPromise
      const result = await resultPromise

      expect(result.error?.code).toBe("timeout")
    })

    it("should handle subscription creation failure", async () => {
      mockNip04Encrypt.mockResolvedValue("encrypted")
      mockPoolPublish.mockResolvedValue(undefined)
      mockPoolSubscribe.mockImplementation(() => {
        throw new Error("Failed to create subscription")
      })

      const client = new NWCClient(validConnectionString)
      const result = await client.payInvoice("lnbc...")

      expect(result.error?.code).toBe("subscription_failed")
    })
  })
})
