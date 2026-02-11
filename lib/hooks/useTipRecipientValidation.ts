import { useEffect, useCallback } from "react"
import { getApiUrl, getAllValidDomains } from "../config/api"

// ─── Types ────────────────────────────────────────────────────────

export interface UsernameValidation {
  status: "success" | "error" | null
  message: string
  isValidating: boolean
}

export interface UseTipRecipientValidationParams {
  tipRecipient: string
  setUsernameValidation: (v: UsernameValidation) => void
  setTipsEnabled: (v: boolean) => void
  usernameValidation: UsernameValidation
}

export interface UseTipRecipientValidationReturn {
  validateBlinkUsername: (username: string) => Promise<void>
}

// ─── Hook ─────────────────────────────────────────────────────────

/**
 * Hook for validating tip recipient usernames against the Blink API.
 *
 * Extracted from Dashboard.js — contains:
 * - validateBlinkUsername async function
 * - Debounced validation useEffect (500ms)
 * - Auto-enable tipsEnabled when a valid recipient is set
 *
 * @param {Object} params
 * @param {string} params.tipRecipient - Current tip recipient username
 * @param {Function} params.setUsernameValidation - Setter for validation state
 * @param {Function} params.setTipsEnabled - Setter for tipsEnabled
 * @param {Object} params.usernameValidation - Current validation state
 * @returns {Object} { validateBlinkUsername }
 */
export function useTipRecipientValidation({
  tipRecipient,
  setUsernameValidation,
  setTipsEnabled,
  usernameValidation,
}: UseTipRecipientValidationParams): UseTipRecipientValidationReturn {
  // Validate Blink username function
  const validateBlinkUsername = useCallback(
    async (username: string): Promise<void> => {
      if (!username || username.trim() === "") {
        setUsernameValidation({
          status: null,
          message: "",
          isValidating: false,
        })
        return
      }

      // Clean username input - strip @domain.sv if user enters full Lightning Address
      let cleanedUsername = username.trim()
      // Remove any Blink domain suffix (production or staging)
      const allDomains: string[] = getAllValidDomains()
      for (const domain of allDomains) {
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

      setUsernameValidation({
        status: null,
        message: "",
        isValidating: true,
      })

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
          body: JSON.stringify({
            query: query,
            variables: variables,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        if (data.errors) {
          const errorMessage: string = data.errors[0].message
          if (errorMessage.includes("Invalid value for Username")) {
            setUsernameValidation({
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
        const usernameExists: boolean = !data.data.usernameAvailable

        if (usernameExists) {
          setUsernameValidation({
            status: "success",
            message: "Blink username found",
            isValidating: false,
          })
        } else {
          setUsernameValidation({
            status: "error",
            message: "This Blink username does not exist yet",
            isValidating: false,
          })
        }
      } catch (error: unknown) {
        console.error("Error checking username:", error)
        setUsernameValidation({
          status: "error",
          message: "Error checking username. Please try again.",
          isValidating: false,
        })
      }
    },
    [setUsernameValidation],
  )

  // Debounced username validation
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      validateBlinkUsername(tipRecipient)
    }, 500) // 500ms delay

    return () => clearTimeout(timeoutId)
  }, [tipRecipient, validateBlinkUsername])

  // Auto-enable tipsEnabled when a valid recipient is set
  useEffect(() => {
    if (tipRecipient && usernameValidation.status === "success") {
      setTipsEnabled(true)
    }
  }, [tipRecipient, usernameValidation.status, setTipsEnabled])

  return {
    validateBlinkUsername,
  }
}

export default useTipRecipientValidation
