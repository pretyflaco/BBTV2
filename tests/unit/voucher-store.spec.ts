/**
 * @jest-environment node
 */

/**
 * Tests for lib/voucher-store.js
 *
 * Tests PostgreSQL-backed voucher storage:
 * - Creating vouchers
 * - Retrieving vouchers
 * - Claiming/unclaiming vouchers
 * - Cancelling vouchers
 * - Statistics and cleanup
 */

export {}

// Mock pg Pool before importing voucher-store
const mockQuery = jest.fn()
const mockPoolOn = jest.fn()

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockQuery,
    on: mockPoolOn,
  })),
}))

// Mock AuthManager
jest.mock("../../lib/auth", () => ({
  encryptApiKey: jest.fn((key: string) => `encrypted_${key}`),
  decryptApiKey: jest.fn((encrypted: string) => encrypted.replace("encrypted_", "")),
}))

// Mock voucher-expiry
jest.mock("../../lib/voucher-expiry", () => ({
  MAX_UNCLAIMED_PER_WALLET: 100,
  getExpiryMs: jest.fn(() => 6 * 30 * 24 * 60 * 60 * 1000), // 6 months
  DEFAULT_EXPIRY_ID: "6mo",
  getVoucherStatus: jest.fn((voucher: { claimed: boolean; cancelledAt: number | null; expiresAt: number }) => {
    if (voucher.claimed) return "CLAIMED"
    if (voucher.cancelledAt) return "CANCELLED"
    if (voucher.expiresAt < Date.now()) return "EXPIRED"
    return "ACTIVE"
  }),
}))

// Now import the module
import voucherStore from "../../lib/voucher-store.js"
import { MAX_UNCLAIMED_PER_WALLET } from "../../lib/voucher-expiry"

describe("VoucherStore", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset the store's lastCleanup to allow cleanup to run
    ;(voucherStore as { lastCleanup: number }).lastCleanup = 0
  })

  describe("generateChargeId()", () => {
    it("should generate a 32-character hex string", () => {
      const chargeId = voucherStore.generateChargeId()
      expect(chargeId).toHaveLength(32)
      expect(/^[a-f0-9]+$/.test(chargeId)).toBe(true)
    })

    it("should generate unique IDs", () => {
      const id1 = voucherStore.generateChargeId()
      const id2 = voucherStore.generateChargeId()
      expect(id1).not.toBe(id2)
    })
  })

  describe("getUnclaimedCountByWallet()", () => {
    it("should return count of unclaimed vouchers", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: "5" }],
      })

      const count = await voucherStore.getUnclaimedCountByWallet("wallet-123")

      expect(count).toBe(5)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SELECT COUNT(*)"),
        ["wallet-123"]
      )
    })

    it("should return 0 on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Database error"))

      const count = await voucherStore.getUnclaimedCountByWallet("wallet-123")

      expect(count).toBe(0)
    })

    it("should return 0 when no rows returned", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
      })

      const count = await voucherStore.getUnclaimedCountByWallet("wallet-123")

      expect(count).toBe(0)
    })
  })

  describe("createVoucher()", () => {
    const mockRow = {
      id: "test-charge-id",
      amount_sats: "1000",
      wallet_id: "wallet-123",
      api_key_encrypted: "encrypted_test-api-key",
      status: "ACTIVE",
      claimed: false,
      created_at: "1700000000000",
      expires_at: "1715000000000",
      expiry_id: "6mo",
      display_amount: null,
      display_currency: null,
      commission_percent: "0",
      environment: "production",
      wallet_currency: "BTC",
      usd_amount_cents: null,
      claimed_at: null,
      cancelled_at: null,
    }

    it("should create a BTC voucher successfully", async () => {
      // Mock unclaimed count check
      mockQuery.mockResolvedValueOnce({ rows: [{ count: "0" }] })
      // Mock insert
      mockQuery.mockResolvedValueOnce({ rows: [mockRow] })

      const voucher = await voucherStore.createVoucher(1000, "test-api-key", "wallet-123")

      expect(voucher.amount).toBe(1000)
      expect(voucher.walletId).toBe("wallet-123")
      expect(voucher.status).toBe("ACTIVE")
      expect(voucher.walletCurrency).toBe("BTC")
    })

    it("should create a USD voucher with usdAmount", async () => {
      const usdRow = { ...mockRow, wallet_currency: "USD", usd_amount_cents: "500" }
      mockQuery.mockResolvedValueOnce({ rows: [{ count: "0" }] })
      mockQuery.mockResolvedValueOnce({ rows: [usdRow] })

      const voucher = await voucherStore.createVoucher(1000, "test-api-key", "wallet-123", {
        walletCurrency: "USD",
        usdAmount: 500,
      })

      expect(voucher.walletCurrency).toBe("USD")
      expect(voucher.usdAmountCents).toBe(500)
    })

    it("should throw error for USD voucher without usdAmount", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: "0" }] })

      await expect(
        voucherStore.createVoucher(1000, "test-api-key", "wallet-123", {
          walletCurrency: "USD",
        })
      ).rejects.toThrow("USD vouchers require usdAmount")
    })

    it("should throw error when wallet limit exceeded", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: String(MAX_UNCLAIMED_PER_WALLET) }] })

      await expect(
        voucherStore.createVoucher(1000, "test-api-key", "wallet-123")
      ).rejects.toThrow("Maximum unclaimed vouchers")
    })

    it("should include commission percent when provided", async () => {
      const rowWithCommission = { ...mockRow, commission_percent: "2.5" }
      mockQuery.mockResolvedValueOnce({ rows: [{ count: "0" }] })
      mockQuery.mockResolvedValueOnce({ rows: [rowWithCommission] })

      const voucher = await voucherStore.createVoucher(1000, "test-api-key", "wallet-123", {
        commissionPercent: 2.5,
      })

      expect(voucher.commissionPercent).toBe(2.5)
    })

    it("should include display amount and currency", async () => {
      const rowWithDisplay = { ...mockRow, display_amount: "10.00", display_currency: "USD" }
      mockQuery.mockResolvedValueOnce({ rows: [{ count: "0" }] })
      mockQuery.mockResolvedValueOnce({ rows: [rowWithDisplay] })

      const voucher = await voucherStore.createVoucher(1000, "test-api-key", "wallet-123", {
        displayAmount: "10.00",
        displayCurrency: "USD",
      })

      expect(voucher.displayAmount).toBe("10.00")
      expect(voucher.displayCurrency).toBe("USD")
    })

    it("should handle staging environment", async () => {
      const stagingRow = { ...mockRow, environment: "staging" }
      mockQuery.mockResolvedValueOnce({ rows: [{ count: "0" }] })
      mockQuery.mockResolvedValueOnce({ rows: [stagingRow] })

      const voucher = await voucherStore.createVoucher(1000, "test-api-key", "wallet-123", {
        environment: "staging",
      })

      expect(voucher.environment).toBe("staging")
    })

    it("should propagate database errors", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: "0" }] })
      mockQuery.mockRejectedValueOnce(new Error("Insert failed"))

      await expect(
        voucherStore.createVoucher(1000, "test-api-key", "wallet-123")
      ).rejects.toThrow("Insert failed")
    })
  })

  describe("getVoucher()", () => {
    const mockRow = {
      id: "test-charge-id",
      amount_sats: "1000",
      wallet_id: "wallet-123",
      api_key_encrypted: "encrypted_test-api-key",
      status: "ACTIVE",
      claimed: false,
      created_at: "1700000000000",
      expires_at: String(Date.now() + 1000000),
      expiry_id: "6mo",
      display_amount: null,
      display_currency: null,
      commission_percent: "0",
      environment: "production",
      wallet_currency: "BTC",
      usd_amount_cents: null,
      claimed_at: null,
      cancelled_at: null,
    }

    it("should return voucher when found", async () => {
      // Mock lazy cleanup calls
      mockQuery.mockResolvedValueOnce({ rows: [{ update_expired_vouchers: 0 }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ cleanup_old_vouchers: 0 }] })
      // Mock select
      mockQuery.mockResolvedValueOnce({ rows: [mockRow] })

      const voucher = await voucherStore.getVoucher("test-charge-id")

      expect(voucher).not.toBeNull()
      expect(voucher!.id).toBe("test-charge-id")
      expect(voucher!.amount).toBe(1000)
    })

    it("should return null when voucher not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ update_expired_vouchers: 0 }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ cleanup_old_vouchers: 0 }] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const voucher = await voucherStore.getVoucher("nonexistent")

      expect(voucher).toBeNull()
    })

    it("should return null on database error", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ update_expired_vouchers: 0 }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ cleanup_old_vouchers: 0 }] })
      mockQuery.mockRejectedValueOnce(new Error("Database error"))

      const voucher = await voucherStore.getVoucher("test-charge-id")

      expect(voucher).toBeNull()
    })
  })

  describe("getVoucherWithStatus()", () => {
    const mockRow = {
      id: "test-charge-id",
      amount_sats: "1000",
      wallet_id: "wallet-123",
      api_key_encrypted: "encrypted_test-api-key",
      status: "ACTIVE",
      claimed: false,
      created_at: "1700000000000",
      expires_at: String(Date.now() + 1000000),
      expiry_id: "6mo",
      display_amount: null,
      display_currency: null,
      commission_percent: "0",
      environment: "production",
      wallet_currency: "BTC",
      usd_amount_cents: null,
      claimed_at: null,
      cancelled_at: null,
    }

    it("should return voucher with recalculated status", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockRow] })

      const voucher = await voucherStore.getVoucherWithStatus("test-charge-id")

      expect(voucher).not.toBeNull()
      expect(voucher!.status).toBe("ACTIVE")
    })

    it("should return null when voucher not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const voucher = await voucherStore.getVoucherWithStatus("nonexistent")

      expect(voucher).toBeNull()
    })

    it("should return null on database error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Database error"))

      const voucher = await voucherStore.getVoucherWithStatus("test-charge-id")

      expect(voucher).toBeNull()
    })
  })

  describe("claimVoucher()", () => {
    it("should claim voucher successfully", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "test-charge-id" }] })

      const result = await voucherStore.claimVoucher("test-charge-id")

      expect(result).toBe(true)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE vouchers"),
        expect.arrayContaining(["test-charge-id"])
      )
    })

    it("should return false when voucher cannot be claimed", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] })

      const result = await voucherStore.claimVoucher("nonexistent")

      expect(result).toBe(false)
    })

    it("should return false on database error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Database error"))

      const result = await voucherStore.claimVoucher("test-charge-id")

      expect(result).toBe(false)
    })
  })

  describe("unclaimVoucher()", () => {
    it("should unclaim voucher successfully", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "test-charge-id" }] })

      const result = await voucherStore.unclaimVoucher("test-charge-id")

      expect(result).toBe(true)
    })

    it("should return false when voucher cannot be unclaimed", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] })

      const result = await voucherStore.unclaimVoucher("nonexistent")

      expect(result).toBe(false)
    })

    it("should return false on database error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Database error"))

      const result = await voucherStore.unclaimVoucher("test-charge-id")

      expect(result).toBe(false)
    })
  })

  describe("cancelVoucher()", () => {
    it("should cancel voucher successfully", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "test-charge-id" }] })

      const result = await voucherStore.cancelVoucher("test-charge-id")

      expect(result).toBe(true)
    })

    it("should return false when voucher cannot be cancelled", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] })

      const result = await voucherStore.cancelVoucher("nonexistent")

      expect(result).toBe(false)
    })

    it("should return false on database error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Database error"))

      const result = await voucherStore.cancelVoucher("test-charge-id")

      expect(result).toBe(false)
    })
  })

  describe("getAllVouchers()", () => {
    it("should return all vouchers with status", async () => {
      const mockRows = [
        {
          id: "voucher-1",
          amount_sats: "1000",
          wallet_id: "wallet-123",
          api_key_encrypted: "encrypted_key",
          status: "ACTIVE",
          claimed: false,
          created_at: "1700000000000",
          expires_at: String(Date.now() + 1000000),
          expiry_id: "6mo",
          display_amount: null,
          display_currency: null,
          commission_percent: "0",
          environment: "production",
          wallet_currency: "BTC",
          usd_amount_cents: null,
          claimed_at: null,
          cancelled_at: null,
        },
        {
          id: "voucher-2",
          amount_sats: "2000",
          wallet_id: "wallet-123",
          api_key_encrypted: "encrypted_key",
          status: "CLAIMED",
          claimed: true,
          created_at: "1700000000000",
          expires_at: String(Date.now() + 1000000),
          expiry_id: "6mo",
          display_amount: null,
          display_currency: null,
          commission_percent: "0",
          environment: "production",
          wallet_currency: "BTC",
          usd_amount_cents: null,
          claimed_at: "1700000001000",
          cancelled_at: null,
        },
      ]

      // Mock lazy cleanup calls
      mockQuery.mockResolvedValueOnce({ rows: [{ update_expired_vouchers: 0 }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ cleanup_old_vouchers: 0 }] })
      mockQuery.mockResolvedValueOnce({ rows: mockRows })

      const vouchers = await voucherStore.getAllVouchers()

      expect(vouchers).toHaveLength(2)
      expect(vouchers[0].id).toBe("voucher-1")
      expect(vouchers[1].id).toBe("voucher-2")
    })

    it("should return empty array on error", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ update_expired_vouchers: 0 }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ cleanup_old_vouchers: 0 }] })
      mockQuery.mockRejectedValueOnce(new Error("Database error"))

      const vouchers = await voucherStore.getAllVouchers()

      expect(vouchers).toEqual([])
    })
  })

  describe("getStats()", () => {
    it("should return voucher statistics", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ update_expired_vouchers: 0 }] })
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total: "100",
            active: "50",
            claimed: "30",
            cancelled: "10",
            expired: "10",
            expiring_soon: "5",
          },
        ],
      })

      const stats = await voucherStore.getStats()

      expect(stats.total).toBe(100)
      expect(stats.active).toBe(50)
      expect(stats.claimed).toBe(30)
      expect(stats.cancelled).toBe(10)
      expect(stats.expired).toBe(10)
      expect(stats.expiringSoon).toBe(5)
    })

    it("should return zeros when no stats available", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ update_expired_vouchers: 0 }] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const stats = await voucherStore.getStats()

      expect(stats).toEqual({
        total: 0,
        active: 0,
        claimed: 0,
        cancelled: 0,
        expired: 0,
        expiringSoon: 0,
      })
    })

    it("should return zeros on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Database error"))

      const stats = await voucherStore.getStats()

      expect(stats.total).toBe(0)
      expect(stats.active).toBe(0)
    })
  })

  describe("cleanup()", () => {
    it("should cleanup old vouchers", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ cleanup_old_vouchers: 5 }] })

      const cleaned = await voucherStore.cleanup()

      expect(cleaned).toBe(5)
    })

    it("should return 0 when no vouchers cleaned", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ cleanup_old_vouchers: 0 }] })

      const cleaned = await voucherStore.cleanup()

      expect(cleaned).toBe(0)
    })

    it("should return 0 on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Database error"))

      const cleaned = await voucherStore.cleanup()

      expect(cleaned).toBe(0)
    })
  })

  describe("lazyCleanup()", () => {
    it("should run cleanup when enough time has passed", async () => {
      // Force cleanup to run by setting lastCleanup to 0
      ;(voucherStore as { lastCleanup: number }).lastCleanup = 0

      mockQuery.mockResolvedValueOnce({ rows: [{ update_expired_vouchers: 2 }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ cleanup_old_vouchers: 3 }] })

      await voucherStore.lazyCleanup()

      expect(mockQuery).toHaveBeenCalledTimes(2)
    })

    it("should skip cleanup when run recently", async () => {
      // Set lastCleanup to current time
      ;(voucherStore as { lastCleanup: number }).lastCleanup = Date.now()

      await voucherStore.lazyCleanup()

      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("should handle cleanup errors gracefully", async () => {
      ;(voucherStore as { lastCleanup: number }).lastCleanup = 0

      mockQuery.mockRejectedValueOnce(new Error("Cleanup failed"))

      // Should not throw
      await expect(voucherStore.lazyCleanup()).resolves.not.toThrow()
    })
  })

  describe("_rowToVoucher()", () => {
    it("should return null for null row", () => {
      const voucher = (voucherStore as { _rowToVoucher: (row: null) => null })._rowToVoucher(null)
      expect(voucher).toBeNull()
    })

    it("should convert row to voucher object with all fields", () => {
      const row = {
        id: "test-id",
        amount_sats: "1500",
        wallet_id: "wallet-456",
        api_key_encrypted: "encrypted_api-key",
        status: "CLAIMED",
        claimed: true,
        created_at: "1700000000000",
        expires_at: "1715000000000",
        expiry_id: "1mo",
        display_amount: "15.00",
        display_currency: "EUR",
        commission_percent: "1.5",
        environment: "staging",
        wallet_currency: "USD",
        usd_amount_cents: "1500",
        claimed_at: "1700000001000",
        cancelled_at: null,
      }

      const voucher = (voucherStore as { _rowToVoucher: (row: typeof row, key?: string) => object })._rowToVoucher(row)

      expect(voucher).toMatchObject({
        id: "test-id",
        amount: 1500,
        walletId: "wallet-456",
        claimed: true,
        claimedAt: 1700000001000,
        createdAt: 1700000000000,
        expiresAt: 1715000000000,
        expiryId: "1mo",
        displayAmount: "15.00",
        displayCurrency: "EUR",
        commissionPercent: 1.5,
        environment: "staging",
        walletCurrency: "USD",
        usdAmountCents: 1500,
      })
    })

    it("should use provided decrypted API key", () => {
      const row = {
        id: "test-id",
        amount_sats: "1000",
        wallet_id: "wallet-123",
        api_key_encrypted: "encrypted_key",
        status: "ACTIVE",
        claimed: false,
        created_at: "1700000000000",
        expires_at: "1715000000000",
        expiry_id: "6mo",
        display_amount: null,
        display_currency: null,
        commission_percent: "0",
        environment: "production",
        wallet_currency: "BTC",
        usd_amount_cents: null,
        claimed_at: null,
        cancelled_at: null,
      }

      const voucher = (voucherStore as { _rowToVoucher: (row: typeof row, key?: string) => { apiKey: string } })._rowToVoucher(row, "my-api-key")

      expect(voucher.apiKey).toBe("my-api-key")
    })

    it("should handle null optional fields", () => {
      const row = {
        id: "test-id",
        amount_sats: "1000",
        wallet_id: "wallet-123",
        api_key_encrypted: "encrypted_key",
        status: "ACTIVE",
        claimed: false,
        created_at: "1700000000000",
        expires_at: "1715000000000",
        expiry_id: "6mo",
        display_amount: null,
        display_currency: null,
        commission_percent: null,
        environment: null,
        wallet_currency: null,
        usd_amount_cents: null,
        claimed_at: null,
        cancelled_at: null,
      }

      const voucher = (voucherStore as { _rowToVoucher: (row: typeof row) => {
        cancelledAt: null
        claimedAt: null
        commissionPercent: number
        environment: string
        walletCurrency: string
        usdAmountCents: null
      } })._rowToVoucher(row)

      expect(voucher.cancelledAt).toBeNull()
      expect(voucher.claimedAt).toBeNull()
      expect(voucher.commissionPercent).toBe(0)
      expect(voucher.environment).toBe("production")
      expect(voucher.walletCurrency).toBe("BTC")
      expect(voucher.usdAmountCents).toBeNull()
    })
  })
})
