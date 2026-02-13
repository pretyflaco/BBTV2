/**
 * Tests for useExchangeRate hook
 *
 * @module tests/unit/hooks/useExchangeRate.spec
 */

import { renderHook, act } from "@testing-library/react"

import {
  useExchangeRate,
  type ExchangeRateData,
} from "../../../lib/hooks/useExchangeRate"

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockRate = (overrides?: Partial<ExchangeRateData>): ExchangeRateData => ({
  satPriceInCurrency: 0.00065,
  currency: "USD",
  ...overrides,
})

// ============================================================================
// Tests
// ============================================================================

describe("useExchangeRate", () => {
  describe("initial state", () => {
    it("initializes exchangeRate as null", () => {
      const { result } = renderHook(() => useExchangeRate())
      expect(result.current.exchangeRate).toBeNull()
    })

    it("initializes loadingRate as false", () => {
      const { result } = renderHook(() => useExchangeRate())
      expect(result.current.loadingRate).toBe(false)
    })

    it("initializes hasRate as false", () => {
      const { result } = renderHook(() => useExchangeRate())
      expect(result.current.hasRate).toBe(false)
    })
  })

  describe("setExchangeRate", () => {
    it("sets exchange rate data", () => {
      const { result } = renderHook(() => useExchangeRate())
      const rate = createMockRate()

      act(() => {
        result.current.setExchangeRate(rate)
      })

      expect(result.current.exchangeRate).toEqual(rate)
      expect(result.current.hasRate).toBe(true)
    })

    it("sets rate with satPriceInCurrency and currency", () => {
      const { result } = renderHook(() => useExchangeRate())

      act(() => {
        result.current.setExchangeRate({
          satPriceInCurrency: 0.00065,
          currency: "USD",
        })
      })

      expect(result.current.exchangeRate?.satPriceInCurrency).toBe(0.00065)
      expect(result.current.exchangeRate?.currency).toBe("USD")
    })

    it("handles Bitcoin currency (satPriceInCurrency = 1)", () => {
      const { result } = renderHook(() => useExchangeRate())

      act(() => {
        result.current.setExchangeRate({ satPriceInCurrency: 1, currency: "BTC" })
      })

      expect(result.current.exchangeRate).toEqual({
        satPriceInCurrency: 1,
        currency: "BTC",
      })
    })

    it("can set exchange rate to null", () => {
      const { result } = renderHook(() => useExchangeRate())

      act(() => {
        result.current.setExchangeRate(createMockRate())
      })
      expect(result.current.hasRate).toBe(true)

      act(() => {
        result.current.setExchangeRate(null)
      })
      expect(result.current.exchangeRate).toBeNull()
      expect(result.current.hasRate).toBe(false)
    })

    it("accepts function updater", () => {
      const { result } = renderHook(() => useExchangeRate())

      act(() => {
        result.current.setExchangeRate(createMockRate({ currency: "EUR" }))
      })

      act(() => {
        result.current.setExchangeRate((prev) =>
          prev ? { ...prev, satPriceInCurrency: 0.0006 } : null,
        )
      })

      expect(result.current.exchangeRate?.satPriceInCurrency).toBe(0.0006)
      expect(result.current.exchangeRate?.currency).toBe("EUR")
    })
  })

  describe("clearExchangeRate", () => {
    it("clears the exchange rate", () => {
      const { result } = renderHook(() => useExchangeRate())

      act(() => {
        result.current.setExchangeRate(createMockRate())
      })
      expect(result.current.hasRate).toBe(true)

      act(() => {
        result.current.clearExchangeRate()
      })

      expect(result.current.exchangeRate).toBeNull()
      expect(result.current.hasRate).toBe(false)
    })

    it("is a no-op when already null", () => {
      const { result } = renderHook(() => useExchangeRate())

      act(() => {
        result.current.clearExchangeRate()
      })

      expect(result.current.exchangeRate).toBeNull()
    })
  })

  describe("loadingRate", () => {
    it("setLoadingRate sets loading to true", () => {
      const { result } = renderHook(() => useExchangeRate())

      act(() => {
        result.current.setLoadingRate(true)
      })

      expect(result.current.loadingRate).toBe(true)
    })

    it("setLoadingRate sets loading to false", () => {
      const { result } = renderHook(() => useExchangeRate())

      act(() => {
        result.current.setLoadingRate(true)
      })

      act(() => {
        result.current.setLoadingRate(false)
      })

      expect(result.current.loadingRate).toBe(false)
    })
  })

  describe("hasRate", () => {
    it("is false when exchangeRate is null", () => {
      const { result } = renderHook(() => useExchangeRate())
      expect(result.current.hasRate).toBe(false)
    })

    it("is true when exchangeRate is set", () => {
      const { result } = renderHook(() => useExchangeRate())

      act(() => {
        result.current.setExchangeRate(createMockRate())
      })

      expect(result.current.hasRate).toBe(true)
    })

    it("becomes false after clearing", () => {
      const { result } = renderHook(() => useExchangeRate())

      act(() => {
        result.current.setExchangeRate(createMockRate())
      })

      act(() => {
        result.current.clearExchangeRate()
      })

      expect(result.current.hasRate).toBe(false)
    })
  })

  describe("callback stability", () => {
    it("setExchangeRate maintains referential equality", () => {
      const { result, rerender } = renderHook(() => useExchangeRate())
      const ref = result.current.setExchangeRate
      rerender()
      // useState dispatch is always stable
      expect(result.current.setExchangeRate).toBe(ref)
    })

    it("setLoadingRate maintains referential equality", () => {
      const { result, rerender } = renderHook(() => useExchangeRate())
      const ref = result.current.setLoadingRate
      rerender()
      expect(result.current.setLoadingRate).toBe(ref)
    })

    it("clearExchangeRate maintains referential equality", () => {
      const { result, rerender } = renderHook(() => useExchangeRate())
      const ref = result.current.clearExchangeRate
      rerender()
      expect(result.current.clearExchangeRate).toBe(ref)
    })
  })

  describe("typical workflow scenarios", () => {
    it("handles fetch exchange rate workflow", () => {
      const { result } = renderHook(() => useExchangeRate())

      // Start loading
      act(() => {
        result.current.setLoadingRate(true)
      })
      expect(result.current.loadingRate).toBe(true)

      // Set rate on success
      act(() => {
        result.current.setExchangeRate({
          satPriceInCurrency: 0.00065,
          currency: "USD",
        })
        result.current.setLoadingRate(false)
      })

      expect(result.current.loadingRate).toBe(false)
      expect(result.current.exchangeRate?.satPriceInCurrency).toBe(0.00065)
      expect(result.current.hasRate).toBe(true)
    })

    it("handles currency change workflow (BTC)", () => {
      const { result } = renderHook(() => useExchangeRate())

      // When currency is Bitcoin, set satPriceInCurrency to 1
      act(() => {
        result.current.setExchangeRate({ satPriceInCurrency: 1, currency: "BTC" })
      })

      expect(result.current.exchangeRate).toEqual({
        satPriceInCurrency: 1,
        currency: "BTC",
      })
    })

    it("handles currency change workflow (fiat)", () => {
      const { result } = renderHook(() => useExchangeRate())

      // Set initial BTC rate
      act(() => {
        result.current.setExchangeRate({ satPriceInCurrency: 1, currency: "BTC" })
      })

      // Switch to fiat
      act(() => {
        result.current.setLoadingRate(true)
      })

      act(() => {
        result.current.setExchangeRate({
          satPriceInCurrency: 0.00065,
          currency: "USD",
        })
        result.current.setLoadingRate(false)
      })

      expect(result.current.exchangeRate?.currency).toBe("USD")
    })

    it("handles fetch error workflow", () => {
      const { result } = renderHook(() => useExchangeRate())

      // Start loading
      act(() => {
        result.current.setLoadingRate(true)
      })

      // Error occurs - stop loading, rate stays null
      act(() => {
        result.current.setLoadingRate(false)
      })

      expect(result.current.loadingRate).toBe(false)
      expect(result.current.exchangeRate).toBeNull()
      expect(result.current.hasRate).toBe(false)
    })
  })
})
