/**
 * @jest-environment jsdom
 */

import {
  SAT_CURRENCY,
  BTC_BIP177_CURRENCY,
  STREET_RATE_CURRENCIES,
  isStreetRateCurrency,
  isCitrusrateAltCurrency,
  isCitrusrateCurrency,
  getBaseCurrencyId,
  getStreetRateCurrency,
  formatCurrencyAmount,
  getCurrencyById,
  formatDisplayAmount,
  createCurrencyOption,
  isBitcoinCurrency,
  parseAmountParts,
} from "../../lib/currency-utils.js"

// Type definitions for test helpers
interface Currency {
  id: string
  symbol: string
  name: string
  flag?: string
  fractionDigits: number
  isStreetRate?: boolean
}

interface CurrencyOption {
  value: string
  label: string
  currency: Currency
}

interface AmountParts {
  symbol: string
  value: string
  isBip177: boolean
}

describe("Currency Utils", () => {
  // Mock currency list similar to Blink API response
  const mockCurrencyList: Currency[] = [
    { id: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸", fractionDigits: 2 },
    { id: "EUR", symbol: "€", name: "Euro", flag: "🇪🇺", fractionDigits: 2 },
    { id: "JPY", symbol: "¥", name: "Japanese Yen", flag: "🇯🇵", fractionDigits: 0 },
    { id: "MZN", symbol: "MT", name: "Mozambican Metical", flag: "🇲🇿", fractionDigits: 2 },
    { id: "GHS", symbol: "₵", name: "Ghanaian Cedi", flag: "🇬🇭", fractionDigits: 2 },
    { id: "KES", symbol: "KSh", name: "Kenyan Shilling", flag: "🇰🇪", fractionDigits: 2 },
  ]

  describe("SAT_CURRENCY constant", () => {
    it("should have correct structure", () => {
      expect(SAT_CURRENCY.id).toBe("BTC")
      expect(SAT_CURRENCY.symbol).toBe("sats")
      expect(SAT_CURRENCY.fractionDigits).toBe(0)
    })
  })

  describe("BTC_BIP177_CURRENCY constant", () => {
    it("should have correct structure", () => {
      expect(BTC_BIP177_CURRENCY.id).toBe("BTC-BIP177")
      expect(BTC_BIP177_CURRENCY.symbol).toBe("₿")
      expect(BTC_BIP177_CURRENCY.fractionDigits).toBe(0)
    })
  })

  describe("isStreetRateCurrency()", () => {
    it("should return true for street rate currencies", () => {
      expect(isStreetRateCurrency("MZN_STREET")).toBe(true)
      expect(isStreetRateCurrency("NGN_STREET")).toBe(true)
    })

    it("should return false for regular currencies", () => {
      expect(isStreetRateCurrency("USD")).toBe(false)
      expect(isStreetRateCurrency("MZN")).toBe(false)
      expect(isStreetRateCurrency("BTC")).toBe(false)
    })

    it("should return falsy for null/undefined", () => {
      expect(isStreetRateCurrency(null as unknown as string)).toBeFalsy()
      expect(isStreetRateCurrency(undefined as unknown as string)).toBeFalsy()
    })
  })

  describe("isCitrusrateAltCurrency()", () => {
    it("should return true for citrus alt currencies", () => {
      expect(isCitrusrateAltCurrency("KES_CITRUS")).toBe(true)
      expect(isCitrusrateAltCurrency("GHS_CITRUS")).toBe(true)
    })

    it("should return false for regular currencies", () => {
      expect(isCitrusrateAltCurrency("USD")).toBe(false)
      expect(isCitrusrateAltCurrency("KES")).toBe(false)
    })

    it("should return false for street rate currencies", () => {
      expect(isCitrusrateAltCurrency("MZN_STREET")).toBe(false)
    })
  })

  describe("isCitrusrateCurrency()", () => {
    it("should return true for street rate currencies", () => {
      expect(isCitrusrateCurrency("MZN_STREET")).toBe(true)
    })

    it("should return true for citrus alt currencies", () => {
      expect(isCitrusrateCurrency("KES_CITRUS")).toBe(true)
    })

    it("should return false for regular currencies", () => {
      expect(isCitrusrateCurrency("USD")).toBe(false)
      expect(isCitrusrateCurrency("BTC")).toBe(false)
    })
  })

  describe("getBaseCurrencyId()", () => {
    it("should extract base from street rate currency", () => {
      expect(getBaseCurrencyId("MZN_STREET")).toBe("MZN")
      expect(getBaseCurrencyId("NGN_STREET")).toBe("NGN")
    })

    it("should extract base from citrus alt currency", () => {
      expect(getBaseCurrencyId("KES_CITRUS")).toBe("KES")
      expect(getBaseCurrencyId("GHS_CITRUS")).toBe("GHS")
    })

    it("should return original for regular currencies", () => {
      expect(getBaseCurrencyId("USD")).toBe("USD")
      expect(getBaseCurrencyId("BTC")).toBe("BTC")
    })
  })

  describe("getStreetRateCurrency()", () => {
    it("should return config for known street rate currency", () => {
      if (STREET_RATE_CURRENCIES.length > 0) {
        const streetCurrency = STREET_RATE_CURRENCIES[0] as Currency
        const result = getStreetRateCurrency(streetCurrency.id) as Currency | null
        expect(result).not.toBeNull()
        expect(result?.isStreetRate).toBe(true)
      }
    })

    it("should return null for unknown currency", () => {
      expect(getStreetRateCurrency("USD")).toBeNull()
      expect(getStreetRateCurrency("UNKNOWN_STREET")).toBeNull()
    })
  })

  describe("formatCurrencyAmount()", () => {
    it("should format USD correctly", () => {
      const usd = mockCurrencyList[0]
      const result = formatCurrencyAmount(1234.56, usd, "comma-period")
      expect(result).toBe("$1,234.56")
    })

    it("should format EUR correctly", () => {
      const eur = mockCurrencyList[1]
      const result = formatCurrencyAmount(1234.56, eur, "comma-period")
      expect(result).toBe("€1,234.56")
    })

    it("should format JPY with zero decimals", () => {
      const jpy = mockCurrencyList[2]
      const result = formatCurrencyAmount(1234, jpy, "comma-period")
      expect(result).toBe("¥1,234")
    })

    it("should format BTC with sats format", () => {
      const result = formatCurrencyAmount(21000, SAT_CURRENCY, "comma-period", "sats")
      expect(result).toBe("21,000 sats")
    })

    it("should format BTC with BIP-177 format", () => {
      const result = formatCurrencyAmount(21000, BTC_BIP177_CURRENCY, "comma-period", "bip177")
      expect(result).toBe("₿21,000")
    })

    it("should add space for text symbols", () => {
      const currency = { id: "MZN", symbol: "MT", fractionDigits: 2 }
      const result = formatCurrencyAmount(1000, currency, "comma-period")
      expect(result).toBe("MT 1,000.00")
    })

    it("should handle zero amounts", () => {
      const usd = mockCurrencyList[0]
      const result = formatCurrencyAmount(0, usd, "comma-period")
      expect(result).toBe("$0.00")
    })
  })

  describe("getCurrencyById()", () => {
    it("should return BTC for 'BTC' id", () => {
      const result = getCurrencyById("BTC", mockCurrencyList)
      expect(result).toEqual(SAT_CURRENCY)
    })

    it("should return BTC-BIP177 for 'BTC-BIP177' id", () => {
      const result = getCurrencyById("BTC-BIP177", mockCurrencyList)
      expect(result).toEqual(BTC_BIP177_CURRENCY)
    })

    it("should return currency from list", () => {
      const result = getCurrencyById("USD", mockCurrencyList) as Currency | null
      expect(result?.id).toBe("USD")
      expect(result?.symbol).toBe("$")
    })

    it("should return null for unknown currency", () => {
      const result = getCurrencyById("UNKNOWN", mockCurrencyList)
      expect(result).toBeNull()
    })

    it("should return null for null/undefined", () => {
      expect(getCurrencyById(null as unknown as string, mockCurrencyList)).toBeNull()
      expect(getCurrencyById("USD", null as unknown as [])).toBeNull()
    })

    it("should handle citrus alt currencies by returning base currency", () => {
      const result = getCurrencyById("KES_CITRUS", mockCurrencyList) as Currency | null
      // Should return the KES base currency for formatting
      expect(result?.id).toBe("KES")
    })
  })

  describe("formatDisplayAmount()", () => {
    it("should format known currency", () => {
      const result = formatDisplayAmount(100, "USD", mockCurrencyList, "comma-period")
      expect(result).toBe("$100.00")
    })

    it("should fallback for unknown currency", () => {
      const result = formatDisplayAmount(100, "UNKNOWN", mockCurrencyList, "comma-period")
      expect(result).toBe("100.00 UNKNOWN")
    })

    it("should format BTC correctly", () => {
      const result = formatDisplayAmount(21000, "BTC", mockCurrencyList, "comma-period", "sats")
      expect(result).toBe("21,000 sats")
    })
  })

  describe("createCurrencyOption()", () => {
    it("should create option object with flag", () => {
      const currency = mockCurrencyList[0]
      const result = createCurrencyOption(currency) as CurrencyOption
      expect(result.value).toBe("USD")
      expect(result.label).toContain("🇺🇸")
      expect(result.label).toContain("USD")
      expect(result.label).toContain("US Dollar")
      expect(result.currency).toBe(currency)
    })

    it("should handle currency without flag", () => {
      const currency = { id: "TEST", symbol: "T", name: "Test Currency" }
      const result = createCurrencyOption(currency) as CurrencyOption
      expect(result.label).toContain("TEST")
      expect(result.label).not.toContain("undefined")
    })
  })

  describe("isBitcoinCurrency()", () => {
    it("should return true for BTC", () => {
      expect(isBitcoinCurrency("BTC")).toBe(true)
    })

    it("should return true for BTC-BIP177", () => {
      expect(isBitcoinCurrency("BTC-BIP177")).toBe(true)
    })

    it("should return false for fiat currencies", () => {
      expect(isBitcoinCurrency("USD")).toBe(false)
      expect(isBitcoinCurrency("EUR")).toBe(false)
    })

    it("should return false for null/undefined", () => {
      expect(isBitcoinCurrency(null as unknown as string)).toBe(false)
      expect(isBitcoinCurrency(undefined as unknown as string)).toBe(false)
    })
  })

  describe("parseAmountParts()", () => {
    it("should parse BIP-177 format", () => {
      const result = parseAmountParts("₿21,000", "BTC", "bip177") as AmountParts
      expect(result.symbol).toBe("₿")
      expect(result.value).toBe("21,000")
      expect(result.isBip177).toBe(true)
    })

    it("should parse sats format", () => {
      const result = parseAmountParts("21,000 sats", "BTC", "sats") as AmountParts
      expect(result.symbol).toBe("")
      expect(result.value).toBe("21,000 sats")
      expect(result.isBip177).toBe(false)
    })

    it("should parse fiat format", () => {
      const result = parseAmountParts("$100.00", "USD", "sats") as AmountParts
      expect(result.symbol).toBe("$")
      expect(result.value).toBe("100.00")
      expect(result.isBip177).toBe(false)
    })

    it("should handle text symbol format", () => {
      const result = parseAmountParts("CHF 100.00", "CHF", "sats") as AmountParts
      expect(result.symbol).toBe("CHF ")
      expect(result.value).toBe("100.00")
    })
  })
})
