/**
 * useAccountManagement Hook
 *
 * Manages state for adding and editing wallet accounts in the Dashboard.
 * Handles Blink accounts, NWC connections, Lightning addresses, and npub.cash addresses.
 *
 * This hook extracts account-related state from Dashboard.js to reduce complexity.
 */

import { useState, useCallback } from "react"

export type AccountType = "blink" | "blink-ln-address" | "nwc" | "npub-cash" | null

export interface NwcValidation {
  walletPubkey: string
  relays: string[]
  capabilities: string[]
}

export interface LnAddressValidation {
  username: string
  walletId: string
  walletCurrency: string
  lightningAddress: string
}

export interface NpubCashValidation {
  lightningAddress: string
  minSendable: number
  maxSendable: number
}

export interface ConfirmDeleteWallet {
  type: "blink" | "nwc" | "npub-cash"
  id: string
}

export interface EditingWalletLabel {
  type: "sending" | "blink" | "nwc" | "npub-cash"
  id?: string
}

export interface AccountManagementState {
  // New account form
  newAccountApiKey: string
  newAccountLabel: string
  newAccountNwcUri: string
  newAccountType: AccountType
  newAccountLnAddress: string
  newNpubCashAddress: string

  // Loading/error states
  addAccountLoading: boolean
  addAccountError: string | null

  // NWC validation
  nwcValidating: boolean
  nwcValidated: NwcValidation | null

  // Lightning address validation
  lnAddressValidating: boolean
  lnAddressValidated: LnAddressValidation | null

  // npub.cash validation
  npubCashValidating: boolean
  npubCashValidated: NpubCashValidation | null

  // Delete/edit states
  confirmDeleteWallet: ConfirmDeleteWallet | null
  editingWalletLabel: EditingWalletLabel | null
  editedWalletLabel: string
}

export interface AccountManagementActions {
  // New account form setters
  setNewAccountApiKey: (key: string) => void
  setNewAccountLabel: (label: string) => void
  setNewAccountNwcUri: (uri: string) => void
  setNewAccountType: (type: AccountType) => void
  setNewAccountLnAddress: (address: string) => void
  setNewNpubCashAddress: (address: string) => void

  // Loading/error setters
  setAddAccountLoading: (loading: boolean) => void
  setAddAccountError: (error: string | null) => void

  // NWC validation setters
  setNwcValidating: (validating: boolean) => void
  setNwcValidated: (validated: NwcValidation | null) => void

  // Lightning address validation setters
  setLnAddressValidating: (validating: boolean) => void
  setLnAddressValidated: (validated: LnAddressValidation | null) => void

  // npub.cash validation setters
  setNpubCashValidating: (validating: boolean) => void
  setNpubCashValidated: (validated: NpubCashValidation | null) => void

  // Delete/edit setters
  setConfirmDeleteWallet: (wallet: ConfirmDeleteWallet | null) => void
  setEditingWalletLabel: (editing: EditingWalletLabel | null) => void
  setEditedWalletLabel: (label: string) => void

  // Utility actions
  resetNewAccountForm: () => void
  clearValidations: () => void
}

export type UseAccountManagementReturn = AccountManagementState & AccountManagementActions

/**
 * Hook for managing account addition and editing state
 *
 * @example
 * ```tsx
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
export function useAccountManagement(): UseAccountManagementReturn {
  // New account form state
  const [newAccountApiKey, setNewAccountApiKey] = useState("")
  const [newAccountLabel, setNewAccountLabel] = useState("")
  const [newAccountNwcUri, setNewAccountNwcUri] = useState("")
  const [newAccountType, setNewAccountType] = useState<AccountType>(null)
  const [newAccountLnAddress, setNewAccountLnAddress] = useState("")
  const [newNpubCashAddress, setNewNpubCashAddress] = useState("")

  // Loading/error states
  const [addAccountLoading, setAddAccountLoading] = useState(false)
  const [addAccountError, setAddAccountError] = useState<string | null>(null)

  // NWC validation state
  const [nwcValidating, setNwcValidating] = useState(false)
  const [nwcValidated, setNwcValidated] = useState<NwcValidation | null>(null)

  // Lightning address validation state
  const [lnAddressValidating, setLnAddressValidating] = useState(false)
  const [lnAddressValidated, setLnAddressValidated] =
    useState<LnAddressValidation | null>(null)

  // npub.cash validation state
  const [npubCashValidating, setNpubCashValidating] = useState(false)
  const [npubCashValidated, setNpubCashValidated] = useState<NpubCashValidation | null>(
    null,
  )

  // Delete/edit states
  const [confirmDeleteWallet, setConfirmDeleteWallet] =
    useState<ConfirmDeleteWallet | null>(null)
  const [editingWalletLabel, setEditingWalletLabel] = useState<EditingWalletLabel | null>(
    null,
  )
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
