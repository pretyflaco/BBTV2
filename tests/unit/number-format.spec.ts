/**
 * @jest-environment jsdom
 */

import {
  FORMAT_LOCALES,
  FORMAT_LABELS,
  FORMAT_DESCRIPTIONS,
  FORMAT_OPTIONS,
  DEFAULT_FALLBACK_FORMAT,
  BITCOIN_FORMAT_OPTIONS,
  BITCOIN_FORMAT_LABELS,
  BITCOIN_FORMAT_DESCRIPTIONS,
  DEFAULT_BITCOIN_FORMAT,
  NUMPAD_LAYOUT_OPTIONS,
  NUMPAD_LAYOUT_LABELS,
  NUMPAD_LAYOUT_DESCRIPTIONS,
  DEFAULT_NUMPAD_LAYOUT,
  formatBitcoinAmount,
  getBitcoinFormatPreview,
  getLocaleForFormat,
  formatNumber,
  getFormatPreview,
} from "../../lib/number-format.js"

describe("Number Format Utilities", () => {
  describe("Constants", () => {
    it("should have correct FORMAT_LOCALES mapping", () => {
      expect(FORMAT_LOCALES["auto"]).toBeUndefined()
      expect(FORMAT_LOCALES["comma-period"]).toBe("en-US")
      expect(FORMAT_LOCALES["period-comma"]).toBe("de-DE")
      expect(FORMAT_LOCALES["space-comma"]).toBe("fr-FR")
    })

    it("should have FORMAT_LABELS for all options", () => {
      FORMAT_OPTIONS.forEach((option) => {
        expect(FORMAT_LABELS[option as keyof typeof FORMAT_LABELS]).toBeDefined()
      })
    })

    it("should have FORMAT_DESCRIPTIONS for all options", () => {
      FORMAT_OPTIONS.forEach((option) => {
        expect(FORMAT_DESCRIPTIONS[option as keyof typeof FORMAT_DESCRIPTIONS]).toBeDefined()
      })
    })

    it("should have correct default fallback format", () => {
      expect(DEFAULT_FALLBACK_FORMAT).toBe("comma-period")
    })

    it("should have correct Bitcoin format options", () => {
      expect(BITCOIN_FORMAT_OPTIONS).toContain("sats")
      expect(BITCOIN_FORMAT_OPTIONS).toContain("bip177")
      expect(BITCOIN_FORMAT_OPTIONS).toContain("sat")
    })

    it("should have BITCOIN_FORMAT_LABELS for all options", () => {
      BITCOIN_FORMAT_OPTIONS.forEach((option) => {
        expect(
          BITCOIN_FORMAT_LABELS[option as keyof typeof BITCOIN_FORMAT_LABELS],
        ).toBeDefined()
      })
    })

    it("should have BITCOIN_FORMAT_DESCRIPTIONS for all options", () => {
      BITCOIN_FORMAT_OPTIONS.forEach((option) => {
        expect(
          BITCOIN_FORMAT_DESCRIPTIONS[option as keyof typeof BITCOIN_FORMAT_DESCRIPTIONS],
        ).toBeDefined()
      })
    })

    it("should have correct default Bitcoin format", () => {
      expect(DEFAULT_BITCOIN_FORMAT).toBe("sats")
    })

    it("should have correct numpad layout options", () => {
      expect(NUMPAD_LAYOUT_OPTIONS).toContain("calculator")
      expect(NUMPAD_LAYOUT_OPTIONS).toContain("telephone")
    })

    it("should have NUMPAD_LAYOUT_LABELS for all options", () => {
      NUMPAD_LAYOUT_OPTIONS.forEach((option) => {
        expect(
          NUMPAD_LAYOUT_LABELS[option as keyof typeof NUMPAD_LAYOUT_LABELS],
        ).toBeDefined()
      })
    })

    it("should have NUMPAD_LAYOUT_DESCRIPTIONS for all options", () => {
      NUMPAD_LAYOUT_OPTIONS.forEach((option) => {
        expect(
          NUMPAD_LAYOUT_DESCRIPTIONS[option as keyof typeof NUMPAD_LAYOUT_DESCRIPTIONS],
        ).toBeDefined()
      })
    })

    it("should have correct default numpad layout", () => {
      expect(DEFAULT_NUMPAD_LAYOUT).toBe("calculator")
    })
  })

  describe("formatNumber()", () => {
    it("should format integer with comma-period locale (US)", () => {
      const result = formatNumber(1234567, "comma-period", 0)
      expect(result).toBe("1,234,567")
    })

    it("should format integer with period-comma locale (German)", () => {
      const result = formatNumber(1234567, "period-comma", 0)
      expect(result).toBe("1.234.567")
    })

    it("should format integer with space-comma locale (French)", () => {
      const result = formatNumber(1234567, "space-comma", 0)
      // French uses non-breaking space (U+00A0) or narrow no-break space (U+202F)
      expect(result.replace(/\s/g, " ")).toBe("1 234 567")
    })

    it("should format decimal numbers with specified decimals", () => {
      const result = formatNumber(1234.567, "comma-period", 2)
      expect(result).toBe("1,234.57")
    })

    it("should format decimal with period-comma locale", () => {
      const result = formatNumber(1234.567, "period-comma", 2)
      expect(result).toBe("1.234,57")
    })

    it("should handle zero decimals", () => {
      const result = formatNumber(1234.567, "comma-period", 0)
      expect(result).toBe("1,235")
    })

    it("should handle zero value", () => {
      const result = formatNumber(0, "comma-period", 2)
      expect(result).toBe("0.00")
    })

    it("should handle negative values", () => {
      const result = formatNumber(-1234.56, "comma-period", 2)
      expect(result).toBe("-1,234.56")
    })

    it("should handle NaN by treating as 0", () => {
      const result = formatNumber(NaN, "comma-period", 2)
      expect(result).toBe("0.00")
    })

    it("should handle undefined by treating as 0", () => {
      const result = formatNumber(undefined as unknown as number, "comma-period", 2)
      expect(result).toBe("0.00")
    })

    it("should handle string numbers", () => {
      const result = formatNumber("1234.56" as unknown as number, "comma-period", 2)
      expect(result).toBe("1,234.56")
    })

    it("should use auto format (browser default)", () => {
      // Auto format uses browser locale, just verify it doesn't throw
      const result = formatNumber(1234567, "auto", 0)
      expect(result).toBeTruthy()
      expect(result.replace(/\D/g, "")).toBe("1234567")
    })

    it("should fallback on invalid format", () => {
      const result = formatNumber(1234567, "invalid-format", 0)
      expect(result).toBeTruthy()
    })
  })

  describe("getLocaleForFormat()", () => {
    it("should return fallback locale for auto (uses default format)", () => {
      // "auto" maps to undefined in FORMAT_LOCALES, but getLocaleForFormat
      // uses || operator which falls back to DEFAULT_FALLBACK_FORMAT
      expect(getLocaleForFormat("auto")).toBe("en-US")
    })

    it("should return en-US for comma-period", () => {
      expect(getLocaleForFormat("comma-period")).toBe("en-US")
    })

    it("should return de-DE for period-comma", () => {
      expect(getLocaleForFormat("period-comma")).toBe("de-DE")
    })

    it("should return fr-FR for space-comma", () => {
      expect(getLocaleForFormat("space-comma")).toBe("fr-FR")
    })

    it("should return fallback locale for unknown format", () => {
      expect(getLocaleForFormat("unknown")).toBe("en-US")
    })
  })

  describe("formatBitcoinAmount()", () => {
    it("should format with sats suffix (default)", () => {
      const result = formatBitcoinAmount(21000, "sats", "comma-period")
      expect(result).toBe("21,000 sats")
    })

    it("should format with SAT suffix (legacy)", () => {
      const result = formatBitcoinAmount(21000, "sat", "comma-period")
      expect(result).toBe("21,000 SAT")
    })

    it("should format with BIP-177 prefix", () => {
      const result = formatBitcoinAmount(21000, "bip177", "comma-period")
      expect(result).toBe("₿21,000")
    })

    it("should default to BIP-177 for unknown format", () => {
      const result = formatBitcoinAmount(21000, "unknown" as any, "comma-period")
      expect(result).toBe("₿21,000")
    })

    it("should respect number format setting", () => {
      const result = formatBitcoinAmount(1234567, "sats", "period-comma")
      expect(result).toBe("1.234.567 sats")
    })

    it("should use default bitcoin format when not specified", () => {
      const result = formatBitcoinAmount(21000)
      expect(result).toContain("21")
      expect(result).toContain("000")
    })
  })

  describe("getBitcoinFormatPreview()", () => {
    it("should return preview with 21000 sats", () => {
      const result = getBitcoinFormatPreview("sats", "comma-period")
      expect(result).toBe("21,000 sats")
    })

    it("should return preview with BIP-177 format", () => {
      const result = getBitcoinFormatPreview("bip177", "comma-period")
      expect(result).toBe("₿21,000")
    })

    it("should return preview with SAT format", () => {
      const result = getBitcoinFormatPreview("sat", "comma-period")
      expect(result).toBe("21,000 SAT")
    })
  })

  describe("getFormatPreview()", () => {
    it("should return preview object with integer, decimal, and small", () => {
      const result = getFormatPreview("comma-period") as {
        integer: string
        decimal: string
        small: string
      }
      expect(result).toHaveProperty("integer")
      expect(result).toHaveProperty("decimal")
      expect(result).toHaveProperty("small")
    })

    it("should format integer correctly (comma-period)", () => {
      const result = getFormatPreview("comma-period") as { integer: string }
      expect(result.integer).toBe("1,234,567")
    })

    it("should format decimal correctly (comma-period)", () => {
      const result = getFormatPreview("comma-period") as { decimal: string }
      expect(result.decimal).toBe("1,234,567.89")
    })

    it("should format small correctly (comma-period)", () => {
      const result = getFormatPreview("comma-period") as { small: string }
      expect(result.small).toBe("42.50")
    })

    it("should format with period-comma locale", () => {
      const result = getFormatPreview("period-comma") as {
        integer: string
        decimal: string
      }
      expect(result.integer).toBe("1.234.567")
      expect(result.decimal).toBe("1.234.567,89")
    })
  })
})
