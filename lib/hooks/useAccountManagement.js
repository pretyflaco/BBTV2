/**
 * useAccountManagement Hook
 *
 * Manages state for adding and editing wallet accounts in the Dashboard.
 * Handles Blink accounts, NWC connections, Lightning addresses, and npub.cash addresses.
 *
 * This hook extracts account-related state from Dashboard.js to reduce complexity.
 */

import { useState, useCallback } from "react"

/**
 * Hook for managing account addition and editing state
 *
 * @example
 * ```jsx
 * const {
 *   newAccountApiKey,
 *   setNewAccountApiKey,
 *   newAccountType,
 *   setNewAccountType,
 *   addAccountLoading,
 *   resetNewAccountForm
 * } = useAccountManagement()
 *
 * // Start adding a Blink account
 * setNewAccountType('blink')
 *
 * // Set the API key
 * setNewAccountApiKey('my-api-key')
 *
 * // Reset after submission
 * resetNewAccountForm()
 * ```
 */
export function useAccountManagement() {
  // New account form state
  const [newAccountApiKey, setNewAccountApiKey] = useState("")
  const [newAccountLabel, setNewAccountLabel] = useState("")
  const [newAccountNwcUri, setNewAccountNwcUri] = useState("")
  const [newAccountType, setNewAccountType] = useState(null) // null | 'blink' | 'blink-ln-address' | 'nwc' | 'npub-cash'
  const [newAccountLnAddress, setNewAccountLnAddress] = useState("")
  const [newNpubCashAddress, setNewNpubCashAddress] = useState("")

  // Loading/error states
  const [addAccountLoading, setAddAccountLoading] = useState(false)
  const [addAccountError, setAddAccountError] = useState(null)

  // NWC validation state
  const [nwcValidating, setNwcValidating] = useState(false)
  const [nwcValidated, setNwcValidated] = useState(null) // { walletPubkey, relays, capabilities }

  // Lightning address validation state
  const [lnAddressValidating, setLnAddressValidating] = useState(false)
  const [lnAddressValidated, setLnAddressValidated] = useState(null) // { username, walletId, walletCurrency, lightningAddress }

  // npub.cash validation state
  const [npubCashValidating, setNpubCashValidating] = useState(false)
  const [npubCashValidated, setNpubCashValidated] = useState(null) // { lightningAddress, minSendable, maxSendable }

  // Delete/edit states
  const [confirmDeleteWallet, setConfirmDeleteWallet] = useState(null) // { type: 'blink'|'nwc'|'npub-cash', id: string }
  const [editingWalletLabel, setEditingWalletLabel] = useState(null) // { type: 'sending'|'blink'|'nwc'|'npub-cash', id?: string }
  const [editedWalletLabel, setEditedWalletLabel] = useState("")

  /**
   * Reset the new account form to initial state
   */
  const resetNewAccountForm = useCallback(() => {
    setNewAccountApiKey("")
    setNewAccountLabel("")
    setNewAccountNwcUri("")
    setNewAccountType(null)
    setNewAccountLnAddress("")
    setNewNpubCashAddress("")
    setAddAccountLoading(false)
    setAddAccountError(null)
    setNwcValidating(false)
    setNwcValidated(null)
    setLnAddressValidating(false)
    setLnAddressValidated(null)
    setNpubCashValidating(false)
    setNpubCashValidated(null)
  }, [])

  /**
   * Clear all validation states without resetting form inputs
   */
  const clearValidations = useCallback(() => {
    setNwcValidating(false)
    setNwcValidated(null)
    setLnAddressValidating(false)
    setLnAddressValidated(null)
    setNpubCashValidating(false)
    setNpubCashValidated(null)
    setAddAccountError(null)
  }, [])

  return {
    // State
    newAccountApiKey,
    newAccountLabel,
    newAccountNwcUri,
    newAccountType,
    newAccountLnAddress,
    newNpubCashAddress,
    addAccountLoading,
    addAccountError,
    nwcValidating,
    nwcValidated,
    lnAddressValidating,
    lnAddressValidated,
    npubCashValidating,
    npubCashValidated,
    confirmDeleteWallet,
    editingWalletLabel,
    editedWalletLabel,

    // Actions
    setNewAccountApiKey,
    setNewAccountLabel,
    setNewAccountNwcUri,
    setNewAccountType,
    setNewAccountLnAddress,
    setNewNpubCashAddress,
    setAddAccountLoading,
    setAddAccountError,
    setNwcValidating,
    setNwcValidated,
    setLnAddressValidating,
    setLnAddressValidated,
    setNpubCashValidating,
    setNpubCashValidated,
    setConfirmDeleteWallet,
    setEditingWalletLabel,
    setEditedWalletLabel,
    resetNewAccountForm,
    clearValidations,
  }
}

export default useAccountManagement
