/**
 * Tests for useAccountManagement hook
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react"

import { useAccountManagement, type AccountType } from "@/lib/hooks/useAccountManagement"

describe("useAccountManagement", () => {
  describe("initial state", () => {
    it("initializes with empty new account form fields", () => {
      const { result } = renderHook(() => useAccountManagement())

      expect(result.current.newAccountApiKey).toBe("")
      expect(result.current.newAccountLabel).toBe("")
      expect(result.current.newAccountNwcUri).toBe("")
      expect(result.current.newAccountLnAddress).toBe("")
      expect(result.current.newNpubCashAddress).toBe("")
    })

    it("initializes with null account type", () => {
      const { result } = renderHook(() => useAccountManagement())
      expect(result.current.newAccountType).toBeNull()
    })

    it("initializes with loading and error states as false/null", () => {
      const { result } = renderHook(() => useAccountManagement())

      expect(result.current.addAccountLoading).toBe(false)
      expect(result.current.addAccountError).toBeNull()
    })

    it("initializes with all validation states as not validating", () => {
      const { result } = renderHook(() => useAccountManagement())

      expect(result.current.nwcValidating).toBe(false)
      expect(result.current.nwcValidated).toBeNull()
      expect(result.current.lnAddressValidating).toBe(false)
      expect(result.current.lnAddressValidated).toBeNull()
      expect(result.current.npubCashValidating).toBe(false)
      expect(result.current.npubCashValidated).toBeNull()
    })

    it("initializes with delete/edit states as null/empty", () => {
      const { result } = renderHook(() => useAccountManagement())

      expect(result.current.confirmDeleteWallet).toBeNull()
      expect(result.current.editingWalletLabel).toBeNull()
      expect(result.current.editedWalletLabel).toBe("")
    })
  })

  describe("new account form actions", () => {
    it("setNewAccountApiKey updates the API key", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setNewAccountApiKey("test-api-key-123")
      })

      expect(result.current.newAccountApiKey).toBe("test-api-key-123")
    })

    it("setNewAccountLabel updates the label", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setNewAccountLabel("My Business Wallet")
      })

      expect(result.current.newAccountLabel).toBe("My Business Wallet")
    })

    it("setNewAccountNwcUri updates the NWC URI", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setNewAccountNwcUri("nostr+walletconnect://...")
      })

      expect(result.current.newAccountNwcUri).toBe("nostr+walletconnect://...")
    })

    it("setNewAccountType updates account type", () => {
      const { result } = renderHook(() => useAccountManagement())
      const accountTypes: AccountType[] = [
        "blink",
        "blink-ln-address",
        "nwc",
        "npub-cash",
        null,
      ]

      accountTypes.forEach((type) => {
        act(() => {
          result.current.setNewAccountType(type)
        })
        expect(result.current.newAccountType).toBe(type)
      })
    })

    it("setNewAccountLnAddress updates the Lightning address", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setNewAccountLnAddress("user@blink.sv")
      })

      expect(result.current.newAccountLnAddress).toBe("user@blink.sv")
    })

    it("setNewNpubCashAddress updates the npub.cash address", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setNewNpubCashAddress("npub1...")
      })

      expect(result.current.newNpubCashAddress).toBe("npub1...")
    })
  })

  describe("loading and error actions", () => {
    it("setAddAccountLoading toggles loading state", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setAddAccountLoading(true)
      })

      expect(result.current.addAccountLoading).toBe(true)

      act(() => {
        result.current.setAddAccountLoading(false)
      })

      expect(result.current.addAccountLoading).toBe(false)
    })

    it("setAddAccountError sets error message", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setAddAccountError("Invalid API key")
      })

      expect(result.current.addAccountError).toBe("Invalid API key")

      act(() => {
        result.current.setAddAccountError(null)
      })

      expect(result.current.addAccountError).toBeNull()
    })
  })

  describe("NWC validation actions", () => {
    it("setNwcValidating toggles validating state", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setNwcValidating(true)
      })

      expect(result.current.nwcValidating).toBe(true)
    })

    it("setNwcValidated sets validation result", () => {
      const { result } = renderHook(() => useAccountManagement())
      const validationResult = {
        walletPubkey: "npub123...",
        relays: ["wss://relay1.com", "wss://relay2.com"],
        capabilities: ["pay_invoice", "get_balance"],
      }

      act(() => {
        result.current.setNwcValidated(validationResult)
      })

      expect(result.current.nwcValidated).toEqual(validationResult)
    })
  })

  describe("Lightning address validation actions", () => {
    it("setLnAddressValidating toggles validating state", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setLnAddressValidating(true)
      })

      expect(result.current.lnAddressValidating).toBe(true)
    })

    it("setLnAddressValidated sets validation result", () => {
      const { result } = renderHook(() => useAccountManagement())
      const validationResult = {
        username: "user",
        walletId: "wallet-123",
        walletCurrency: "BTC",
        lightningAddress: "user@blink.sv",
      }

      act(() => {
        result.current.setLnAddressValidated(validationResult)
      })

      expect(result.current.lnAddressValidated).toEqual(validationResult)
    })
  })

  describe("npub.cash validation actions", () => {
    it("setNpubCashValidating toggles validating state", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setNpubCashValidating(true)
      })

      expect(result.current.npubCashValidating).toBe(true)
    })

    it("setNpubCashValidated sets validation result", () => {
      const { result } = renderHook(() => useAccountManagement())
      const validationResult = {
        lightningAddress: "npub1...@npub.cash",
        minSendable: 1000,
        maxSendable: 100000000,
      }

      act(() => {
        result.current.setNpubCashValidated(validationResult)
      })

      expect(result.current.npubCashValidated).toEqual(validationResult)
    })
  })

  describe("delete and edit wallet actions", () => {
    it("setConfirmDeleteWallet sets wallet to delete", () => {
      const { result } = renderHook(() => useAccountManagement())
      const walletToDelete = { type: "blink" as const, id: "wallet-123" }

      act(() => {
        result.current.setConfirmDeleteWallet(walletToDelete)
      })

      expect(result.current.confirmDeleteWallet).toEqual(walletToDelete)
    })

    it("setConfirmDeleteWallet can clear deletion confirmation", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setConfirmDeleteWallet({ type: "nwc", id: "nwc-123" })
      })

      act(() => {
        result.current.setConfirmDeleteWallet(null)
      })

      expect(result.current.confirmDeleteWallet).toBeNull()
    })

    it("setEditingWalletLabel sets wallet being edited", () => {
      const { result } = renderHook(() => useAccountManagement())
      const editingWallet = { type: "blink" as const, id: "wallet-123" }

      act(() => {
        result.current.setEditingWalletLabel(editingWallet)
      })

      expect(result.current.editingWalletLabel).toEqual(editingWallet)
    })

    it("setEditedWalletLabel updates the edited label", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setEditedWalletLabel("New Wallet Name")
      })

      expect(result.current.editedWalletLabel).toBe("New Wallet Name")
    })
  })

  describe("resetNewAccountForm", () => {
    it("resets all form fields to initial state", () => {
      const { result } = renderHook(() => useAccountManagement())

      // Set various form values
      act(() => {
        result.current.setNewAccountApiKey("test-key")
        result.current.setNewAccountLabel("Test Label")
        result.current.setNewAccountNwcUri("nostr+walletconnect://...")
        result.current.setNewAccountType("blink")
        result.current.setNewAccountLnAddress("user@blink.sv")
        result.current.setNewNpubCashAddress("npub1...")
        result.current.setAddAccountLoading(true)
        result.current.setAddAccountError("Some error")
        result.current.setNwcValidating(true)
        result.current.setNwcValidated({
          walletPubkey: "pk",
          relays: [],
          capabilities: [],
        })
        result.current.setLnAddressValidating(true)
        result.current.setLnAddressValidated({
          username: "user",
          walletId: "id",
          walletCurrency: "BTC",
          lightningAddress: "user@blink.sv",
        })
        result.current.setNpubCashValidating(true)
        result.current.setNpubCashValidated({
          lightningAddress: "addr",
          minSendable: 1000,
          maxSendable: 100000,
        })
      })

      // Verify values are set
      expect(result.current.newAccountApiKey).toBe("test-key")
      expect(result.current.addAccountLoading).toBe(true)

      // Reset the form
      act(() => {
        result.current.resetNewAccountForm()
      })

      // Verify all values are reset
      expect(result.current.newAccountApiKey).toBe("")
      expect(result.current.newAccountLabel).toBe("")
      expect(result.current.newAccountNwcUri).toBe("")
      expect(result.current.newAccountType).toBeNull()
      expect(result.current.newAccountLnAddress).toBe("")
      expect(result.current.newNpubCashAddress).toBe("")
      expect(result.current.addAccountLoading).toBe(false)
      expect(result.current.addAccountError).toBeNull()
      expect(result.current.nwcValidating).toBe(false)
      expect(result.current.nwcValidated).toBeNull()
      expect(result.current.lnAddressValidating).toBe(false)
      expect(result.current.lnAddressValidated).toBeNull()
      expect(result.current.npubCashValidating).toBe(false)
      expect(result.current.npubCashValidated).toBeNull()
    })

    it("does not affect delete/edit states", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setConfirmDeleteWallet({ type: "blink", id: "123" })
        result.current.setEditingWalletLabel({ type: "nwc", id: "456" })
        result.current.setEditedWalletLabel("Edited Label")
      })

      act(() => {
        result.current.resetNewAccountForm()
      })

      // Delete/edit states should remain unchanged
      expect(result.current.confirmDeleteWallet).toEqual({ type: "blink", id: "123" })
      expect(result.current.editingWalletLabel).toEqual({ type: "nwc", id: "456" })
      expect(result.current.editedWalletLabel).toBe("Edited Label")
    })
  })

  describe("clearValidations", () => {
    it("clears all validation states", () => {
      const { result } = renderHook(() => useAccountManagement())

      // Set validation states
      act(() => {
        result.current.setNwcValidating(true)
        result.current.setNwcValidated({
          walletPubkey: "pk",
          relays: [],
          capabilities: [],
        })
        result.current.setLnAddressValidating(true)
        result.current.setLnAddressValidated({
          username: "user",
          walletId: "id",
          walletCurrency: "BTC",
          lightningAddress: "user@blink.sv",
        })
        result.current.setNpubCashValidating(true)
        result.current.setNpubCashValidated({
          lightningAddress: "addr",
          minSendable: 1000,
          maxSendable: 100000,
        })
        result.current.setAddAccountError("Some error")
      })

      // Clear validations
      act(() => {
        result.current.clearValidations()
      })

      expect(result.current.nwcValidating).toBe(false)
      expect(result.current.nwcValidated).toBeNull()
      expect(result.current.lnAddressValidating).toBe(false)
      expect(result.current.lnAddressValidated).toBeNull()
      expect(result.current.npubCashValidating).toBe(false)
      expect(result.current.npubCashValidated).toBeNull()
      expect(result.current.addAccountError).toBeNull()
    })

    it("does not affect form input values", () => {
      const { result } = renderHook(() => useAccountManagement())

      act(() => {
        result.current.setNewAccountApiKey("test-key")
        result.current.setNewAccountLabel("Test Label")
        result.current.setNewAccountType("blink")
        result.current.setNwcValidated({
          walletPubkey: "pk",
          relays: [],
          capabilities: [],
        })
      })

      act(() => {
        result.current.clearValidations()
      })

      // Form inputs should remain
      expect(result.current.newAccountApiKey).toBe("test-key")
      expect(result.current.newAccountLabel).toBe("Test Label")
      expect(result.current.newAccountType).toBe("blink")
    })
  })

  describe("callback stability", () => {
    it("resetNewAccountForm maintains referential equality", () => {
      const { result, rerender } = renderHook(() => useAccountManagement())

      const firstReset = result.current.resetNewAccountForm
      rerender()
      const secondReset = result.current.resetNewAccountForm

      expect(firstReset).toBe(secondReset)
    })

    it("clearValidations maintains referential equality", () => {
      const { result, rerender } = renderHook(() => useAccountManagement())

      const firstClear = result.current.clearValidations
      rerender()
      const secondClear = result.current.clearValidations

      expect(firstClear).toBe(secondClear)
    })
  })

  describe("typical workflow scenarios", () => {
    it("handles Blink account addition workflow", () => {
      const { result } = renderHook(() => useAccountManagement())

      // User starts adding a Blink account
      act(() => {
        result.current.setNewAccountType("blink")
      })

      // User enters API key
      act(() => {
        result.current.setNewAccountApiKey("blink-api-key-12345")
        result.current.setNewAccountLabel("My Store")
      })

      // Start validation
      act(() => {
        result.current.setAddAccountLoading(true)
      })

      expect(result.current.newAccountType).toBe("blink")
      expect(result.current.newAccountApiKey).toBe("blink-api-key-12345")
      expect(result.current.addAccountLoading).toBe(true)

      // Success - reset form
      act(() => {
        result.current.resetNewAccountForm()
      })

      expect(result.current.newAccountType).toBeNull()
      expect(result.current.newAccountApiKey).toBe("")
    })

    it("handles NWC connection workflow", () => {
      const { result } = renderHook(() => useAccountManagement())

      // User starts adding NWC
      act(() => {
        result.current.setNewAccountType("nwc")
        result.current.setNewAccountNwcUri(
          "nostr+walletconnect://pubkey?relay=wss://relay.com&secret=abc",
        )
      })

      // Start NWC validation
      act(() => {
        result.current.setNwcValidating(true)
      })

      expect(result.current.nwcValidating).toBe(true)

      // Validation complete
      act(() => {
        result.current.setNwcValidating(false)
        result.current.setNwcValidated({
          walletPubkey: "npub1abc...",
          relays: ["wss://relay.com"],
          capabilities: ["pay_invoice", "get_balance", "list_transactions"],
        })
      })

      expect(result.current.nwcValidating).toBe(false)
      expect(result.current.nwcValidated?.capabilities).toContain("pay_invoice")
    })

    it("handles validation error workflow", () => {
      const { result } = renderHook(() => useAccountManagement())

      // User enters invalid Lightning address
      act(() => {
        result.current.setNewAccountType("blink-ln-address")
        result.current.setNewAccountLnAddress("invalid-address")
        result.current.setLnAddressValidating(true)
      })

      // Validation fails
      act(() => {
        result.current.setLnAddressValidating(false)
        result.current.setAddAccountError("Invalid Lightning address format")
      })

      expect(result.current.lnAddressValidating).toBe(false)
      expect(result.current.addAccountError).toBe("Invalid Lightning address format")

      // User corrects and retries
      act(() => {
        result.current.clearValidations()
        result.current.setNewAccountLnAddress("valid@blink.sv")
      })

      expect(result.current.addAccountError).toBeNull()
      expect(result.current.newAccountLnAddress).toBe("valid@blink.sv")
    })

    it("handles wallet deletion confirmation workflow", () => {
      const { result } = renderHook(() => useAccountManagement())

      // User clicks delete on a wallet
      act(() => {
        result.current.setConfirmDeleteWallet({ type: "blink", id: "wallet-to-delete" })
      })

      expect(result.current.confirmDeleteWallet).toEqual({
        type: "blink",
        id: "wallet-to-delete",
      })

      // User cancels
      act(() => {
        result.current.setConfirmDeleteWallet(null)
      })

      expect(result.current.confirmDeleteWallet).toBeNull()
    })

    it("handles wallet label editing workflow", () => {
      const { result } = renderHook(() => useAccountManagement())

      // User starts editing a wallet label
      act(() => {
        result.current.setEditingWalletLabel({ type: "nwc", id: "nwc-wallet-123" })
        result.current.setEditedWalletLabel("Current Label")
      })

      // User changes the label
      act(() => {
        result.current.setEditedWalletLabel("New Label")
      })

      expect(result.current.editingWalletLabel).toEqual({
        type: "nwc",
        id: "nwc-wallet-123",
      })
      expect(result.current.editedWalletLabel).toBe("New Label")

      // Save complete, clear editing state
      act(() => {
        result.current.setEditingWalletLabel(null)
        result.current.setEditedWalletLabel("")
      })

      expect(result.current.editingWalletLabel).toBeNull()
      expect(result.current.editedWalletLabel).toBe("")
    })
  })
})
