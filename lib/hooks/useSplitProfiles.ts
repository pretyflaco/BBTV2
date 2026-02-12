import { useState, useCallback } from "react"

/**
 * Recipient type for split profiles
 */
export type RecipientType = "blink" | "lightning" | "onchain" | "npub_cash"

/**
 * Validation status for recipient input
 */
export type ValidationStatus = "success" | "error" | "validating" | null

/**
 * Recipient in a split profile
 */
export interface SplitRecipient {
  username: string
  validated?: boolean
  type: RecipientType
  weight: number
  share?: number
  locked?: boolean
}

/**
 * Split profile data structure
 */
export interface SplitProfile {
  id: string
  label: string
  recipients: SplitRecipient[]
  createdAt?: string
  updatedAt?: string
}

/**
 * Recipient validation state
 */
export interface RecipientValidationState {
  status: ValidationStatus
  message: string
  isValidating: boolean
  type?: RecipientType
  address?: string
}

/**
 * Return type for useSplitProfiles hook
 */
export interface UseSplitProfilesReturn {
  // Profile list state
  splitProfiles: SplitProfile[]
  setSplitProfiles: React.Dispatch<React.SetStateAction<SplitProfile[]>>
  activeSplitProfile: SplitProfile | null
  setActiveSplitProfile: React.Dispatch<React.SetStateAction<SplitProfile | null>>
  splitProfilesLoading: boolean
  setSplitProfilesLoading: React.Dispatch<React.SetStateAction<boolean>>

  // Profile creation/editing UI state
  showCreateSplitProfile: boolean
  setShowCreateSplitProfile: React.Dispatch<React.SetStateAction<boolean>>
  editingSplitProfile: SplitProfile | null
  setEditingSplitProfile: React.Dispatch<React.SetStateAction<SplitProfile | null>>

  // Form state
  newSplitProfileLabel: string
  setNewSplitProfileLabel: React.Dispatch<React.SetStateAction<string>>
  newSplitProfileRecipients: SplitRecipient[]
  setNewSplitProfileRecipients: React.Dispatch<React.SetStateAction<SplitRecipient[]>>
  newRecipientInput: string
  setNewRecipientInput: React.Dispatch<React.SetStateAction<string>>

  // Error state
  splitProfileError: string | null
  setSplitProfileError: React.Dispatch<React.SetStateAction<string | null>>

  // Recipient validation state
  recipientValidation: RecipientValidationState
  setRecipientValidation: React.Dispatch<React.SetStateAction<RecipientValidationState>>

  // Weight mode
  useCustomWeights: boolean
  setUseCustomWeights: React.Dispatch<React.SetStateAction<boolean>>

  // Utility functions
  resetSplitProfileForm: () => void
  startEditingProfile: (profile: SplitProfile) => void
  clearRecipientValidation: () => void
  addRecipientToList: (recipient: SplitRecipient) => void
  removeRecipientFromList: (username: string) => void
  updateRecipientWeight: (username: string, weight: number) => void
  toggleRecipientLock: (username: string) => void
}

/**
 * Default recipient validation state
 */
const DEFAULT_RECIPIENT_VALIDATION: RecipientValidationState = {
  status: null,
  message: "",
  isValidating: false,
}

/**
 * Hook for managing split payment profile state
 *
 * Extracted from Dashboard.js to manage:
 * - Profile list and active profile selection
 * - Profile creation/editing UI state
 * - Form fields for new profiles
 * - Recipient validation state
 * - Weight distribution mode
 */
export function useSplitProfiles(): UseSplitProfilesReturn {
  // Profile list state
  const [splitProfiles, setSplitProfiles] = useState<SplitProfile[]>([])
  const [activeSplitProfile, setActiveSplitProfile] = useState<SplitProfile | null>(null)
  const [splitProfilesLoading, setSplitProfilesLoading] = useState<boolean>(false)

  // Profile creation/editing UI state
  const [showCreateSplitProfile, setShowCreateSplitProfile] = useState<boolean>(false)
  const [editingSplitProfile, setEditingSplitProfile] = useState<SplitProfile | null>(
    null,
  )

  // Form state
  const [newSplitProfileLabel, setNewSplitProfileLabel] = useState<string>("")
  const [newSplitProfileRecipients, setNewSplitProfileRecipients] = useState<
    SplitRecipient[]
  >([])
  const [newRecipientInput, setNewRecipientInput] = useState<string>("")

  // Error state
  const [splitProfileError, setSplitProfileError] = useState<string | null>(null)

  // Recipient validation state
  const [recipientValidation, setRecipientValidation] =
    useState<RecipientValidationState>(DEFAULT_RECIPIENT_VALIDATION)

  // Weight mode
  const [useCustomWeights, setUseCustomWeights] = useState<boolean>(false)

  /**
   * Reset the split profile form to initial state
   */
  const resetSplitProfileForm = useCallback((): void => {
    setNewSplitProfileLabel("")
    setNewSplitProfileRecipients([])
    setNewRecipientInput("")
    setSplitProfileError(null)
    setRecipientValidation(DEFAULT_RECIPIENT_VALIDATION)
    setUseCustomWeights(false)
    setEditingSplitProfile(null)
    setShowCreateSplitProfile(false)
  }, [])

  /**
   * Start editing an existing profile - populates form with profile data
   */
  const startEditingProfile = useCallback((profile: SplitProfile): void => {
    setEditingSplitProfile(profile)
    setNewSplitProfileLabel(profile.label)
    setNewSplitProfileRecipients([...profile.recipients])
    setNewRecipientInput("")
    setSplitProfileError(null)
    setRecipientValidation(DEFAULT_RECIPIENT_VALIDATION)
    // Check if any recipients have non-equal weights
    const hasCustomWeights = profile.recipients.some((r, i, arr) => {
      const equalWeight = 100 / arr.length
      return Math.abs(r.weight - equalWeight) > 0.01
    })
    setUseCustomWeights(hasCustomWeights)
    setShowCreateSplitProfile(true)
  }, [])

  /**
   * Clear recipient validation state
   */
  const clearRecipientValidation = useCallback((): void => {
    setRecipientValidation(DEFAULT_RECIPIENT_VALIDATION)
  }, [])

  /**
   * Add a validated recipient to the list
   */
  const addRecipientToList = useCallback((recipient: SplitRecipient): void => {
    setNewSplitProfileRecipients((prev) => {
      // Check for duplicates
      if (prev.some((r) => r.username === recipient.username)) {
        return prev
      }
      return [...prev, recipient]
    })
    setNewRecipientInput("")
    setRecipientValidation(DEFAULT_RECIPIENT_VALIDATION)
  }, [])

  /**
   * Remove a recipient from the list by username
   */
  const removeRecipientFromList = useCallback((username: string): void => {
    setNewSplitProfileRecipients((prev) => prev.filter((r) => r.username !== username))
  }, [])

  /**
   * Update a recipient's weight
   */
  const updateRecipientWeight = useCallback((username: string, weight: number): void => {
    setNewSplitProfileRecipients((prev) =>
      prev.map((r) => (r.username === username ? { ...r, weight } : r)),
    )
  }, [])

  /**
   * Toggle a recipient's locked state
   */
  const toggleRecipientLock = useCallback((username: string): void => {
    setNewSplitProfileRecipients((prev) =>
      prev.map((r) => (r.username === username ? { ...r, locked: !r.locked } : r)),
    )
  }, [])

  return {
    // Profile list state
    splitProfiles,
    setSplitProfiles,
    activeSplitProfile,
    setActiveSplitProfile,
    splitProfilesLoading,
    setSplitProfilesLoading,

    // Profile creation/editing UI state
    showCreateSplitProfile,
    setShowCreateSplitProfile,
    editingSplitProfile,
    setEditingSplitProfile,

    // Form state
    newSplitProfileLabel,
    setNewSplitProfileLabel,
    newSplitProfileRecipients,
    setNewSplitProfileRecipients,
    newRecipientInput,
    setNewRecipientInput,

    // Error state
    splitProfileError,
    setSplitProfileError,

    // Recipient validation state
    recipientValidation,
    setRecipientValidation,

    // Weight mode
    useCustomWeights,
    setUseCustomWeights,

    // Utility functions
    resetSplitProfileForm,
    startEditingProfile,
    clearRecipientValidation,
    addRecipientToList,
    removeRecipientFromList,
    updateRecipientWeight,
    toggleRecipientLock,
  }
}

export default useSplitProfiles
