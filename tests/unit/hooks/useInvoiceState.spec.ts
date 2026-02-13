/**
 * Tests for useInvoiceState hook
 *
 * Tests the simplified raw state hook that provides currentInvoice,
 * setCurrentInvoice, and clearInvoice. Polling logic remains in Dashboard.js.
 */

import { renderHook, act } from "@testing-library/react"

import { useInvoiceState, type InvoiceData } from "../../../lib/hooks/useInvoiceState"

describe("useInvoiceState", () => {
  // Helper to create mock invoice
  const createMockInvoice = (overrides: Partial<InvoiceData> = {}): InvoiceData => ({
    paymentRequest: "lnbc100n1p0...",
    paymentHash: "abc123def456",
    satoshis: 1000,
    memo: "Test payment",
    ...overrides,
  })

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================

  describe("Initial State", () => {
    it("should initialize with null currentInvoice", () => {
      const { result } = renderHook(() => useInvoiceState())
      expect(result.current.currentInvoice).toBeNull()
    })

    it("should initialize hasInvoice as false", () => {
      const { result } = renderHook(() => useInvoiceState())
      expect(result.current.hasInvoice).toBe(false)
    })
  })

  // ===========================================================================
  // setCurrentInvoice Tests
  // ===========================================================================

  describe("setCurrentInvoice", () => {
    it("should set current invoice", () => {
      const { result } = renderHook(() => useInvoiceState())
      const invoice = createMockInvoice()

      act(() => {
        result.current.setCurrentInvoice(invoice)
      })

      expect(result.current.currentInvoice).toEqual(invoice)
    })

    it("should update hasInvoice to true when invoice is set", () => {
      const { result } = renderHook(() => useInvoiceState())

      act(() => {
        result.current.setCurrentInvoice(createMockInvoice())
      })

      expect(result.current.hasInvoice).toBe(true)
    })

    it("should set invoice to null", () => {
      const { result } = renderHook(() => useInvoiceState())

      act(() => {
        result.current.setCurrentInvoice(createMockInvoice())
      })

      act(() => {
        result.current.setCurrentInvoice(null)
      })

      expect(result.current.currentInvoice).toBeNull()
      expect(result.current.hasInvoice).toBe(false)
    })

    it("should handle invoice with only required fields", () => {
      const { result } = renderHook(() => useInvoiceState())

      act(() => {
        result.current.setCurrentInvoice({
          paymentRequest: "lnbc...",
          paymentHash: "hash123",
        })
      })

      expect(result.current.currentInvoice?.paymentRequest).toBe("lnbc...")
      expect(result.current.currentInvoice?.paymentHash).toBe("hash123")
      expect(result.current.currentInvoice?.satoshis).toBeUndefined()
    })

    it("should handle invoice with amount instead of satoshis", () => {
      const { result } = renderHook(() => useInvoiceState())

      act(() => {
        result.current.setCurrentInvoice({
          paymentRequest: "lnbc...",
          paymentHash: "hash123",
          amount: 5000,
        })
      })

      expect(result.current.currentInvoice?.amount).toBe(5000)
    })

    it("should replace existing invoice", () => {
      const { result } = renderHook(() => useInvoiceState())

      act(() => {
        result.current.setCurrentInvoice(createMockInvoice({ satoshis: 1000 }))
      })

      act(() => {
        result.current.setCurrentInvoice(
          createMockInvoice({ satoshis: 2000, paymentHash: "newhash" }),
        )
      })

      expect(result.current.currentInvoice?.satoshis).toBe(2000)
      expect(result.current.currentInvoice?.paymentHash).toBe("newhash")
    })
  })

  // ===========================================================================
  // clearInvoice Tests
  // ===========================================================================

  describe("clearInvoice", () => {
    it("should clear current invoice to null", () => {
      const { result } = renderHook(() => useInvoiceState())

      act(() => {
        result.current.setCurrentInvoice(createMockInvoice())
      })

      act(() => {
        result.current.clearInvoice()
      })

      expect(result.current.currentInvoice).toBeNull()
      expect(result.current.hasInvoice).toBe(false)
    })

    it("should be safe to call when already null", () => {
      const { result } = renderHook(() => useInvoiceState())

      act(() => {
        result.current.clearInvoice()
      })

      expect(result.current.currentInvoice).toBeNull()
    })
  })

  // ===========================================================================
  // Callback Stability Tests
  // ===========================================================================

  describe("Callback Stability", () => {
    it("should maintain stable clearInvoice reference", () => {
      const { result, rerender } = renderHook(() => useInvoiceState())
      const initial = result.current.clearInvoice

      rerender()

      expect(result.current.clearInvoice).toBe(initial)
    })
  })

  // ===========================================================================
  // Workflow Tests
  // ===========================================================================

  describe("Workflow: POS payment flow", () => {
    it("should handle create -> poll -> clear flow", () => {
      const { result } = renderHook(() => useInvoiceState())

      // POS creates invoice
      const invoice = createMockInvoice()
      act(() => {
        result.current.setCurrentInvoice(invoice)
      })

      expect(result.current.hasInvoice).toBe(true)
      expect(result.current.currentInvoice?.paymentHash).toBe("abc123def456")

      // Dashboard uses paymentHash for polling (external to hook)
      // Payment detected -> clear invoice
      act(() => {
        result.current.clearInvoice()
      })

      expect(result.current.hasInvoice).toBe(false)
    })
  })

  describe("Workflow: NFC payment", () => {
    it("should provide paymentRequest for NFC hook", () => {
      const { result } = renderHook(() => useInvoiceState())

      act(() => {
        result.current.setCurrentInvoice(
          createMockInvoice({
            paymentRequest: "lnbc500n1p0nfc...",
          }),
        )
      })

      // NFC hook reads currentInvoice.paymentRequest
      expect(result.current.currentInvoice?.paymentRequest).toBe("lnbc500n1p0nfc...")
    })
  })

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    it("should handle rapid invoice changes", () => {
      const { result } = renderHook(() => useInvoiceState())

      act(() => {
        result.current.setCurrentInvoice(createMockInvoice({ paymentHash: "hash1" }))
        result.current.setCurrentInvoice(createMockInvoice({ paymentHash: "hash2" }))
        result.current.setCurrentInvoice(createMockInvoice({ paymentHash: "hash3" }))
      })

      expect(result.current.currentInvoice?.paymentHash).toBe("hash3")
    })

    it("should handle set then immediate clear", () => {
      const { result } = renderHook(() => useInvoiceState())

      act(() => {
        result.current.setCurrentInvoice(createMockInvoice())
        result.current.clearInvoice()
      })

      expect(result.current.currentInvoice).toBeNull()
    })
  })
})
