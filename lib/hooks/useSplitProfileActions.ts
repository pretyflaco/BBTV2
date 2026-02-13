import { useEffect, useCallback } from "react"

import { getApiUrl, getAllValidDomains } from "../config/api"
import {
  isNpubCashAddress,
  validateNpubCashAddress,
  probeNpubCashAddress,
} from "../lnurl"

import type { AuthMode } from "./useCombinedAuth"
import type {
  SplitRecipient,
  SplitProfile,
  RecipientValidationState,
  RecipientType,
} from "./useSplitProfiles"

/** @deprecated Use RecipientValidationState from useSplitProfiles instead */
export type RecipientValidation = RecipientValidationState

export type { SplitRecipient, SplitProfile }

/**
 * Parameters for the useSplitProfileActions hook.
 */
interface UseSplitProfileActionsParams {
  publicKey: string | null
  authMode: AuthMode | string
  splitProfiles: SplitProfile[]
  setSplitProfiles: (value: SplitProfile[]) => void
  setActiveSplitProfile: (value: SplitProfile | null) => void
  setSplitProfilesLoading: (value: boolean) => void
  setSplitProfileError: (value: string | null) => void
  setTipsEnabled: (value: boolean) => void
  setTipRecipient: (value: string) => void
  setRecipientValidation: (value: RecipientValidationState) => void
  recipientValidation: RecipientValidationState
  newRecipientInput: string
  setNewRecipientInput: (value: string) => void
  newSplitProfileRecipients: SplitRecipient[]
  setNewSplitProfileRecipients: (
    value: SplitRecipient[] | ((prev: SplitRecipient[]) => SplitRecipient[]),
  ) => void
  useCustomWeights: boolean
}

/**
 * Return type for the useSplitProfileActions hook.
 */
interface UseSplitProfileActionsReturn {
  fetchSplitProfiles: () => Promise<void>
  saveSplitProfile: (
    profile: SplitProfile,
    setActive?: boolean,
  ) => Promise<SplitProfile | null>
  deleteSplitProfile: (profileId: string) => Promise<boolean>
  setActiveSplitProfileById: (profileId: string | null) => Promise<void>
  validateRecipientUsername: (username: string) => Promise<void>
  addRecipientToProfile: () => void
  removeRecipientFromProfile: (username: string) => void
}

/**
 * Hook for split profile CRUD operations and recipient validation.
 *
 * Extracted from Dashboard.js — contains:
 * - fetchSplitProfiles, saveSplitProfile, deleteSplitProfile
 * - setActiveSplitProfileById
 * - validateRecipientUsername (Blink + npub.cash)
 * - Debounced recipient validation useEffect
 * - addRecipientToProfile, removeRecipientFromProfile
 * - Fetch on auth useEffect
 *
 * @param {Object} params - All required state and setters
 * @returns {Object} Action functions for split profile management
 */
export function useSplitProfileActions({
  publicKey,
  authMode,
  splitProfiles,
  setSplitProfiles,
  setActiveSplitProfile,
  setSplitProfilesLoading,
  setSplitProfileError,
  setTipsEnabled,
  setTipRecipient,
  setRecipientValidation,
  recipientValidation,
  newRecipientInput,
  setNewRecipientInput,
  newSplitProfileRecipients,
  setNewSplitProfileRecipients,
  useCustomWeights,
}: UseSplitProfileActionsParams): UseSplitProfileActionsReturn {
  // Fetch split profiles from server
  const fetchSplitProfiles = useCallback(async () => {
    if (!publicKey) {
      console.log("[SplitProfiles] No public key available")
      return
    }

    setSplitProfilesLoading(true)
    try {
      console.log("[SplitProfiles] Fetching profiles for:", publicKey)
      // Use session-based authentication (no pubkey query param needed)
      const response = await fetch("/api/split-profiles", {
        credentials: "include", // Include session cookie
      })

      if (response.ok) {
        const data = await response.json()
        setSplitProfiles(data.splitProfiles || [])

        // Set active profile
        if (data.activeSplitProfileId && data.splitProfiles) {
          const active = (data.splitProfiles as SplitProfile[]).find(
            (p: SplitProfile) => p.id === data.activeSplitProfileId,
          )
          setActiveSplitProfile(active || null)

          // If we have an active profile, enable tips and set the recipient
          if (active && active.recipients?.length > 0) {
            setTipsEnabled(true)
            setTipRecipient(active.recipients[0].username)
          }
        } else {
          setActiveSplitProfile(null)
        }

        console.log("[SplitProfiles] Loaded", data.splitProfiles?.length || 0, "profiles")
      } else if (response.status === 401) {
        // No session - this is expected for external signers without challenge auth
        console.log(
          "[SplitProfiles] No session available, split profiles require authentication",
        )
        setSplitProfiles([])
      } else {
        console.error("[SplitProfiles] Failed to fetch:", response.status)
      }
    } catch (err: unknown) {
      console.error("[SplitProfiles] Error:", err)
    } finally {
      setSplitProfilesLoading(false)
    }
  }, [publicKey])

  // Save split profile to server
  const saveSplitProfile = async (
    profile: SplitProfile,
    setActive: boolean = false,
  ): Promise<SplitProfile | null> => {
    if (!publicKey) return null

    setSplitProfileError(null)
    try {
      const response = await fetch("/api/split-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include session cookie
        body: JSON.stringify({
          profile,
          setActive,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        await fetchSplitProfiles() // Refresh the list
        return data.profile as SplitProfile
      } else if (response.status === 401) {
        setSplitProfileError("Please sign in again to save split profiles")
        return null
      } else {
        const error = await response.json()
        setSplitProfileError(error.error || "Failed to save profile")
        return null
      }
    } catch (err: unknown) {
      console.error("[SplitProfiles] Save error:", err)
      setSplitProfileError("Failed to save profile")
      return null
    }
  }

  // Delete split profile
  const deleteSplitProfile = async (profileId: string): Promise<boolean> => {
    if (!publicKey) return false

    try {
      const response = await fetch("/api/split-profiles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Include session cookie
        body: JSON.stringify({
          profileId,
        }),
      })

      if (response.ok) {
        await fetchSplitProfiles() // Refresh the list
        return true
      }
      return false
    } catch (err: unknown) {
      console.error("[SplitProfiles] Delete error:", err)
      return false
    }
  }

  // Set active split profile
  const setActiveSplitProfileById = async (profileId: string | null): Promise<void> => {
    if (!publicKey) return

    if (!profileId) {
      // Deactivate - set to None
      setActiveSplitProfile(null)
      setTipsEnabled(false)
      setTipRecipient("")

      // Save null active profile to server (if we have profiles)
      if (splitProfiles.length > 0) {
        await fetch("/api/split-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include", // Include session cookie
          body: JSON.stringify({
            profile: splitProfiles[0], // Need at least one profile to update activeSplitProfileId
            setActive: false,
          }),
        })
      }
      return
    }

    const profile = splitProfiles.find((p) => p.id === profileId)
    if (profile) {
      // Update server with new active profile
      await saveSplitProfile(profile, true)

      // Local state update will happen via fetchSplitProfiles in saveSplitProfile
    }
  }

  // Validate recipient username (Blink username or npub.cash address)
  const validateRecipientUsername = useCallback(async (username: string) => {
    if (!username || username.trim() === "") {
      setRecipientValidation({ status: null, message: "", isValidating: false })
      return
    }

    const input = username.trim()

    // Check if this is an npub.cash address
    if (isNpubCashAddress(input)) {
      setRecipientValidation({ status: null, message: "", isValidating: true })

      try {
        // Validate the npub.cash address format
        const validation = validateNpubCashAddress(input)
        if (!validation.valid) {
          setRecipientValidation({
            status: "error",
            message: validation.error || "Invalid npub.cash address",
            isValidating: false,
          })
          return
        }

        // Probe the endpoint to confirm it responds
        const probeResult = await probeNpubCashAddress(input)

        if (probeResult.valid) {
          setRecipientValidation({
            status: "success",
            message: `Valid npub.cash address (${probeResult.minSats}-${probeResult.maxSats?.toLocaleString()} sats)`,
            isValidating: false,
            type: "npub_cash",
            address: input,
          })
        } else {
          setRecipientValidation({
            status: "error",
            message: probeResult.error || "Could not reach npub.cash endpoint",
            isValidating: false,
          })
        }
      } catch (err: unknown) {
        console.error("npub.cash validation error:", err)
        setRecipientValidation({
          status: "error",
          message: (err as Error).message || "Failed to validate npub.cash address",
          isValidating: false,
        })
      }
      return
    }

    // Otherwise, validate as Blink username
    // Clean username input - strip @domain if user enters full Lightning Address
    let cleanedUsername = input
    // Remove any Blink domain suffix (production or staging)
    const allDomainsForRecipient = getAllValidDomains()
    for (const domain of allDomainsForRecipient) {
      if (cleanedUsername.toLowerCase().includes(`@${domain}`)) {
        cleanedUsername = cleanedUsername
          .replace(new RegExp(`@${domain}`, "i"), "")
          .trim()
        break
      }
    }
    if (cleanedUsername.includes("@")) {
      cleanedUsername = cleanedUsername.split("@")[0].trim()
    }

    setRecipientValidation({ status: null, message: "", isValidating: true })

    const query = `
      query Query($username: Username!) {
        usernameAvailable(username: $username)
      }
    `

    const variables = {
      username: cleanedUsername,
    }

    try {
      const response = await fetch(getApiUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      if (data.errors) {
        const errorMessage = data.errors[0].message
        if (errorMessage.includes("Invalid value for Username")) {
          setRecipientValidation({
            status: "error",
            message: "Invalid username format",
            isValidating: false,
          })
          return
        }
        throw new Error(errorMessage)
      }

      // usernameAvailable: true means username does NOT exist
      // usernameAvailable: false means username DOES exist
      const usernameExists = !data.data.usernameAvailable

      if (usernameExists) {
        setRecipientValidation({
          status: "success",
          message: "Blink user found",
          isValidating: false,
          type: "blink",
        })
      } else {
        setRecipientValidation({
          status: "error",
          message:
            "Blink username not found. For npub.cash, enter full address (e.g., npub1xxx@npub.cash)",
          isValidating: false,
        })
      }
    } catch (err: unknown) {
      console.error("Recipient validation error:", err)
      setRecipientValidation({
        status: "error",
        message: "Validation failed",
        isValidating: false,
      })
    }
  }, [])

  // Debounced recipient username validation for current input
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      validateRecipientUsername(newRecipientInput)
    }, 500) // 500ms delay

    return () => clearTimeout(timeoutId)
  }, [newRecipientInput, validateRecipientUsername])

  // Add a validated recipient to the list
  const addRecipientToProfile = useCallback(() => {
    if (recipientValidation.status !== "success" || !newRecipientInput.trim()) return

    // Use the address from validation for npub.cash, or cleaned username for Blink
    const recipientType: RecipientType = recipientValidation.type || "blink"
    let recipientAddress: string =
      recipientType === "npub_cash"
        ? recipientValidation.address || newRecipientInput.trim().toLowerCase()
        : newRecipientInput.trim().toLowerCase()

    // Remove any Blink domain suffix for Blink users
    if (recipientType !== "npub_cash") {
      const domainsToRemove = getAllValidDomains()
      for (const domain of domainsToRemove) {
        recipientAddress = recipientAddress.replace(new RegExp(`@${domain}`, "i"), "")
      }
    }

    // Check if already added
    if (newSplitProfileRecipients.some((r) => r.username === recipientAddress)) {
      setSplitProfileError("This recipient is already added")
      return
    }

    setNewSplitProfileRecipients((prev: SplitRecipient[]) => {
      const newRecipients: SplitRecipient[] = [
        ...prev,
        {
          username: recipientAddress,
          validated: true,
          type: recipientType, // 'blink' or 'npub_cash'
          weight: 100 / (prev.length + 1), // Default even weight
        },
      ]
      // Redistribute weights evenly when not using custom weights
      if (!useCustomWeights) {
        const evenWeight = 100 / newRecipients.length
        return newRecipients.map((r) => ({ ...r, weight: evenWeight }))
      }
      return newRecipients
    })
    setNewRecipientInput("")
    setRecipientValidation({ status: null, message: "", isValidating: false })
    setSplitProfileError(null)
  }, [
    recipientValidation.status,
    recipientValidation.type,
    recipientValidation.address,
    newRecipientInput,
    newSplitProfileRecipients,
    useCustomWeights,
  ])

  // Remove a recipient from the list
  const removeRecipientFromProfile = useCallback(
    (username: string) => {
      setNewSplitProfileRecipients((prev: SplitRecipient[]) => {
        const filtered = prev.filter((r) => r.username !== username)
        // Redistribute weights evenly when not using custom weights
        if (!useCustomWeights && filtered.length > 0) {
          const evenWeight = 100 / filtered.length
          return filtered.map((r) => ({ ...r, weight: evenWeight }))
        }
        return filtered
      })
    },
    [useCustomWeights],
  )

  // Fetch split profiles when user is authenticated
  useEffect(() => {
    if (publicKey && authMode === "nostr") {
      fetchSplitProfiles()
    }
  }, [publicKey, authMode, fetchSplitProfiles])

  return {
    fetchSplitProfiles,
    saveSplitProfile,
    deleteSplitProfile,
    setActiveSplitProfileById,
    validateRecipientUsername,
    addRecipientToProfile,
    removeRecipientFromProfile,
  }
}

export default useSplitProfileActions
