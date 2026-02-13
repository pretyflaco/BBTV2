/**
 * Tests for useWalletState hook
 *
 * Tests the simplified raw state hook that provides apiKey, wallets,
 * and basic setters/clear actions. Fetch logic remains in Dashboard.js.
 */

import { renderHook, act } from "@testing-library/react"

import { useWalletState, type WalletInfo } from "../../../lib/hooks/useWalletState"

describe("useWalletState", () => {
  // Helper to create mock wallets
  const createMockWallets = (): WalletInfo[] => [
    { id: "btc-wallet-1", walletCurrency: "BTC", balance: 100000 },
    { id: "usd-wallet-1", walletCurrency: "USD", balance: 5000 },
  ]

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================

  describe("Initial State", () => {
    it("should initialize with null apiKey", () => {
      const { result } = renderHook(() => useWalletState())
      expect(result.current.apiKey).toBeNull()
    })

    it("should initialize with empty wallets array", () => {
      const { result } = renderHook(() => useWalletState())
      expect(result.current.wallets).toEqual([])
    })

    it("should initialize hasApiKey as false", () => {
      const { result } = renderHook(() => useWalletState())
      expect(result.current.hasApiKey).toBe(false)
    })

    it("should initialize hasWallets as false", () => {
      const { result } = renderHook(() => useWalletState())
      expect(result.current.hasWallets).toBe(false)
    })
  })

  // ===========================================================================
  // setApiKey Tests
  // ===========================================================================

  describe("setApiKey", () => {
    it("should set API key", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setApiKey("test-api-key")
      })

      expect(result.current.apiKey).toBe("test-api-key")
    })

    it("should update hasApiKey to true when key is set", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setApiKey("test-api-key")
      })

      expect(result.current.hasApiKey).toBe(true)
    })

    it("should set API key to null", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setApiKey("test-key")
      })

      act(() => {
        result.current.setApiKey(null)
      })

      expect(result.current.apiKey).toBeNull()
      expect(result.current.hasApiKey).toBe(false)
    })

    it("should handle empty string as falsy for hasApiKey", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setApiKey("")
      })

      expect(result.current.apiKey).toBe("")
      expect(result.current.hasApiKey).toBe(false)
    })
  })

  // ===========================================================================
  // setWallets Tests
  // ===========================================================================

  describe("setWallets", () => {
    it("should set wallets", () => {
      const { result } = renderHook(() => useWalletState())
      const wallets = createMockWallets()

      act(() => {
        result.current.setWallets(wallets)
      })

      expect(result.current.wallets).toEqual(wallets)
    })

    it("should update hasWallets to true when wallets are set", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setWallets(createMockWallets())
      })

      expect(result.current.hasWallets).toBe(true)
    })

    it("should set wallets to empty array", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setWallets(createMockWallets())
      })

      act(() => {
        result.current.setWallets([])
      })

      expect(result.current.wallets).toEqual([])
      expect(result.current.hasWallets).toBe(false)
    })

    it("should handle single wallet", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setWallets([
          { id: "btc-1", walletCurrency: "BTC", balance: 50000 },
        ])
      })

      expect(result.current.wallets).toHaveLength(1)
      expect(result.current.hasWallets).toBe(true)
    })

    it("should handle wallets with pendingIncomingBalance", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setWallets([
          {
            id: "btc-1",
            walletCurrency: "BTC",
            balance: 50000,
            pendingIncomingBalance: 1000,
          },
        ])
      })

      expect(result.current.wallets[0].pendingIncomingBalance).toBe(1000)
    })
  })

  // ===========================================================================
  // clearApiKey Tests
  // ===========================================================================

  describe("clearApiKey", () => {
    it("should clear API key to null", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setApiKey("test-key")
      })

      act(() => {
        result.current.clearApiKey()
      })

      expect(result.current.apiKey).toBeNull()
      expect(result.current.hasApiKey).toBe(false)
    })

    it("should be safe to call when already null", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.clearApiKey()
      })

      expect(result.current.apiKey).toBeNull()
    })
  })

  // ===========================================================================
  // clearWallets Tests
  // ===========================================================================

  describe("clearWallets", () => {
    it("should clear wallets to empty array", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setWallets(createMockWallets())
      })

      act(() => {
        result.current.clearWallets()
      })

      expect(result.current.wallets).toEqual([])
      expect(result.current.hasWallets).toBe(false)
    })

    it("should be safe to call when already empty", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.clearWallets()
      })

      expect(result.current.wallets).toEqual([])
    })
  })

  // ===========================================================================
  // clearAll Tests
  // ===========================================================================

  describe("clearAll", () => {
    it("should clear both apiKey and wallets", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setApiKey("test-key")
        result.current.setWallets(createMockWallets())
      })

      act(() => {
        result.current.clearAll()
      })

      expect(result.current.apiKey).toBeNull()
      expect(result.current.wallets).toEqual([])
      expect(result.current.hasApiKey).toBe(false)
      expect(result.current.hasWallets).toBe(false)
    })

    it("should be safe to call when already empty", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.clearAll()
      })

      expect(result.current.apiKey).toBeNull()
      expect(result.current.wallets).toEqual([])
    })
  })

  // ===========================================================================
  // Callback Stability Tests
  // ===========================================================================

  describe("Callback Stability", () => {
    it("should maintain stable clearApiKey reference", () => {
      const { result, rerender } = renderHook(() => useWalletState())
      const initial = result.current.clearApiKey

      rerender()

      expect(result.current.clearApiKey).toBe(initial)
    })

    it("should maintain stable clearWallets reference", () => {
      const { result, rerender } = renderHook(() => useWalletState())
      const initial = result.current.clearWallets

      rerender()

      expect(result.current.clearWallets).toBe(initial)
    })

    it("should maintain stable clearAll reference", () => {
      const { result, rerender } = renderHook(() => useWalletState())
      const initial = result.current.clearAll

      rerender()

      expect(result.current.clearAll).toBe(initial)
    })
  })

  // ===========================================================================
  // Workflow Tests
  // ===========================================================================

  describe("Workflow: Dashboard initialization", () => {
    it("should handle setting apiKey then wallets (typical Dashboard flow)", () => {
      const { result } = renderHook(() => useWalletState())

      // Dashboard fetches API key and sets it
      act(() => {
        result.current.setApiKey("dashboard-api-key")
      })

      expect(result.current.hasApiKey).toBe(true)
      expect(result.current.hasWallets).toBe(false)

      // Dashboard fetches wallets and sets them
      act(() => {
        result.current.setWallets(createMockWallets())
      })

      expect(result.current.hasApiKey).toBe(true)
      expect(result.current.hasWallets).toBe(true)
    })
  })

  describe("Workflow: Account switch", () => {
    it("should handle clearing and resetting for account switch", () => {
      const { result } = renderHook(() => useWalletState())

      // First account
      act(() => {
        result.current.setApiKey("account-1-key")
        result.current.setWallets([
          { id: "btc-1", walletCurrency: "BTC", balance: 10000 },
        ])
      })

      expect(result.current.apiKey).toBe("account-1-key")
      expect(result.current.wallets).toHaveLength(1)

      // Switch: clear and set new
      act(() => {
        result.current.clearAll()
      })

      expect(result.current.apiKey).toBeNull()
      expect(result.current.wallets).toEqual([])

      // Second account
      act(() => {
        result.current.setApiKey("account-2-key")
        result.current.setWallets([
          { id: "btc-2", walletCurrency: "BTC", balance: 50000 },
          { id: "usd-2", walletCurrency: "USD", balance: 2000 },
        ])
      })

      expect(result.current.apiKey).toBe("account-2-key")
      expect(result.current.wallets).toHaveLength(2)
    })
  })

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    it("should handle wallet with zero balance", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setWallets([{ id: "empty", walletCurrency: "BTC", balance: 0 }])
      })

      expect(result.current.wallets[0].balance).toBe(0)
      expect(result.current.hasWallets).toBe(true)
    })

    it("should handle rapid API key changes", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setApiKey("key-1")
        result.current.setApiKey("key-2")
        result.current.setApiKey("key-3")
      })

      expect(result.current.apiKey).toBe("key-3")
    })

    it("should handle overwriting wallets", () => {
      const { result } = renderHook(() => useWalletState())

      act(() => {
        result.current.setWallets([{ id: "btc-1", walletCurrency: "BTC", balance: 1000 }])
      })

      act(() => {
        result.current.setWallets([
          { id: "btc-2", walletCurrency: "BTC", balance: 2000 },
          { id: "usd-1", walletCurrency: "USD", balance: 500 },
        ])
      })

      expect(result.current.wallets).toHaveLength(2)
      expect(result.current.wallets[0].id).toBe("btc-2")
    })
  })
})
