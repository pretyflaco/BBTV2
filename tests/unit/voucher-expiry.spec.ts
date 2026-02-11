/**
 * @jest-environment node
 */

const {
  EXPIRY_PRESETS,
  DEFAULT_EXPIRY_ID,
  MAX_UNCLAIMED_PER_WALLET,
  CLAIMED_RETENTION_MS,
  CANCELLED_RETENTION_MS,
  EXPIRED_RETENTION_MS,
  getExpiryPreset,
  getExpiryMs,
  getDefaultExpiry,
  isValidExpiryId,
  formatExpiryDate,
  getVoucherStatus,
} = require("../../lib/voucher-expiry.js")

describe("Voucher Expiry", () => {
  describe("Constants", () => {
    it("should have correct number of expiry presets", () => {
      expect(EXPIRY_PRESETS.length).toBeGreaterThanOrEqual(6)
    })

    it("should have valid preset structure", () => {
      EXPIRY_PRESETS.forEach(
        (preset: { id: string; label: string; ms: number }) => {
          expect(preset).toHaveProperty("id")
          expect(preset).toHaveProperty("label")
          expect(preset).toHaveProperty("ms")
          expect(typeof preset.id).toBe("string")
          expect(typeof preset.label).toBe("string")
          expect(typeof preset.ms).toBe("number")
          expect(preset.ms).toBeGreaterThan(0)
        },
      )
    })

    it("should have valid default expiry ID", () => {
      expect(DEFAULT_EXPIRY_ID).toBe("24h")
    })

    it("should have reasonable max unclaimed limit", () => {
      expect(MAX_UNCLAIMED_PER_WALLET).toBe(1000)
    })

    it("should have retention periods in milliseconds", () => {
      // All retention periods should be at least 1 day
      const oneDayMs = 24 * 60 * 60 * 1000
      expect(CLAIMED_RETENTION_MS).toBeGreaterThanOrEqual(oneDayMs)
      expect(CANCELLED_RETENTION_MS).toBeGreaterThanOrEqual(oneDayMs)
      expect(EXPIRED_RETENTION_MS).toBeGreaterThanOrEqual(oneDayMs)
    })

    it("should have expected preset IDs", () => {
      const presetIds = EXPIRY_PRESETS.map(
        (p: { id: string }) => p.id,
      )
      expect(presetIds).toContain("24h")
      expect(presetIds).toContain("72h")
      expect(presetIds).toContain("7d")
      expect(presetIds).toContain("30d")
      expect(presetIds).toContain("90d")
      expect(presetIds).toContain("6mo")
    })

    it("should have increasing expiry times", () => {
      // Filter to only the standard options shown in UI (not legacy)
      const standardPresets = EXPIRY_PRESETS.filter(
        (p: { id: string }) => !["15m", "1h"].includes(p.id),
      )
      for (let i = 1; i < standardPresets.length; i++) {
        expect(standardPresets[i].ms).toBeGreaterThan(
          standardPresets[i - 1].ms,
        )
      }
    })
  })

  describe("getExpiryPreset()", () => {
    it("should return correct preset for valid ID", () => {
      const preset = getExpiryPreset("24h")
      expect(preset).not.toBeNull()
      expect(preset.id).toBe("24h")
      expect(preset.label).toBe("24 hours")
      expect(preset.ms).toBe(24 * 60 * 60 * 1000)
    })

    it("should return correct preset for 7d", () => {
      const preset = getExpiryPreset("7d")
      expect(preset).not.toBeNull()
      expect(preset.ms).toBe(7 * 24 * 60 * 60 * 1000)
    })

    it("should return correct preset for 6mo", () => {
      const preset = getExpiryPreset("6mo")
      expect(preset).not.toBeNull()
      expect(preset.ms).toBe(180 * 24 * 60 * 60 * 1000)
    })

    it("should return null for invalid ID", () => {
      expect(getExpiryPreset("invalid")).toBeNull()
      expect(getExpiryPreset("")).toBeNull()
      expect(getExpiryPreset(null)).toBeNull()
      expect(getExpiryPreset(undefined)).toBeNull()
    })
  })

  describe("getExpiryMs()", () => {
    it("should return correct milliseconds for valid ID", () => {
      expect(getExpiryMs("24h")).toBe(24 * 60 * 60 * 1000)
      expect(getExpiryMs("7d")).toBe(7 * 24 * 60 * 60 * 1000)
      expect(getExpiryMs("30d")).toBe(30 * 24 * 60 * 60 * 1000)
    })

    it("should return default (24h) for invalid ID", () => {
      const expected24h = 24 * 60 * 60 * 1000
      expect(getExpiryMs("invalid")).toBe(expected24h)
      expect(getExpiryMs("")).toBe(expected24h)
    })
  })

  describe("getDefaultExpiry()", () => {
    it("should return the default preset", () => {
      const defaultPreset = getDefaultExpiry()
      expect(defaultPreset).not.toBeNull()
      expect(defaultPreset.id).toBe(DEFAULT_EXPIRY_ID)
    })
  })

  describe("isValidExpiryId()", () => {
    it("should return true for valid IDs", () => {
      expect(isValidExpiryId("24h")).toBe(true)
      expect(isValidExpiryId("72h")).toBe(true)
      expect(isValidExpiryId("7d")).toBe(true)
      expect(isValidExpiryId("30d")).toBe(true)
      expect(isValidExpiryId("90d")).toBe(true)
      expect(isValidExpiryId("6mo")).toBe(true)
    })

    it("should return true for legacy IDs", () => {
      expect(isValidExpiryId("15m")).toBe(true)
      expect(isValidExpiryId("1h")).toBe(true)
    })

    it("should return false for invalid IDs", () => {
      expect(isValidExpiryId("invalid")).toBe(false)
      expect(isValidExpiryId("")).toBe(false)
      expect(isValidExpiryId("2h")).toBe(false)
      expect(isValidExpiryId("1d")).toBe(false)
    })
  })

  describe("formatExpiryDate()", () => {
    it("should format timestamp correctly", () => {
      const timestamp = new Date("2024-03-15T12:00:00Z").getTime()
      const result = formatExpiryDate(timestamp)
      expect(result).toContain("Mar")
      expect(result).toContain("15")
      expect(result).toContain("2024")
    })

    it("should return 'No expiry' for falsy values", () => {
      expect(formatExpiryDate(null)).toBe("No expiry")
      expect(formatExpiryDate(undefined)).toBe("No expiry")
      expect(formatExpiryDate(0)).toBe("No expiry")
    })
  })

  describe("getVoucherStatus()", () => {
    it("should return NOT_FOUND for null/undefined voucher", () => {
      expect(getVoucherStatus(null)).toBe("NOT_FOUND")
      expect(getVoucherStatus(undefined)).toBe("NOT_FOUND")
    })

    it("should return CLAIMED for claimed voucher", () => {
      const voucher = { claimed: true }
      expect(getVoucherStatus(voucher)).toBe("CLAIMED")
    })

    it("should return CANCELLED for cancelled voucher", () => {
      const voucher = { cancelledAt: Date.now() }
      expect(getVoucherStatus(voucher)).toBe("CANCELLED")
    })

    it("should return EXPIRED for expired voucher", () => {
      const voucher = { expiresAt: Date.now() - 1000 }
      expect(getVoucherStatus(voucher)).toBe("EXPIRED")
    })

    it("should return ACTIVE for active voucher", () => {
      const voucher = { expiresAt: Date.now() + 1000000 }
      expect(getVoucherStatus(voucher)).toBe("ACTIVE")
    })

    it("should return ACTIVE for voucher without expiry", () => {
      const voucher = {}
      expect(getVoucherStatus(voucher)).toBe("ACTIVE")
    })

    it("should prioritize CLAIMED over other statuses", () => {
      const voucher = {
        claimed: true,
        cancelledAt: Date.now(),
        expiresAt: Date.now() - 1000,
      }
      expect(getVoucherStatus(voucher)).toBe("CLAIMED")
    })

    it("should prioritize CANCELLED over EXPIRED", () => {
      const voucher = {
        cancelledAt: Date.now(),
        expiresAt: Date.now() - 1000,
      }
      expect(getVoucherStatus(voucher)).toBe("CANCELLED")
    })
  })
})
