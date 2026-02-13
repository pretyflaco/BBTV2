import { useState, useEffect } from "react"

import { getApiUrl, getEnvironment } from "../config/api"

interface ValidationError {
  message: string
  suggestion: string
  environment: "production" | "staging"
  canSwitchEnv: boolean
}

interface UsePublicPOSValidationParams {
  username: string
}

interface UsePublicPOSValidationReturn {
  validationError: ValidationError | null
  validating: boolean
  validatedWalletCurrency: string
}

/**
 * usePublicPOSValidation - Validates a Blink username against the current environment
 *
 * On mount, queries the Blink GraphQL API (production or staging) to check if the
 * username has a default wallet. Sets validation error with environment info if not found.
 *
 * @param {Object} deps
 * @param {string} deps.username - The Blink username to validate
 * @returns {Object} { validationError, validating, validatedWalletCurrency }
 */
export function usePublicPOSValidation({
  username,
}: UsePublicPOSValidationParams): UsePublicPOSValidationReturn {
  const [validationError, setValidationError] = useState<ValidationError | null>(null)
  const [validating, setValidating] = useState(true) // Start true - validate on mount
  const [validatedWalletCurrency, setValidatedWalletCurrency] = useState("BTC")

  useEffect(() => {
    const validateUser = async () => {
      setValidating(true)
      setValidationError(null)

      const currentEnv = getEnvironment()
      const apiUrl = getApiUrl()

      console.log(
        `[PublicPOS] Validating user '${username}' on ${currentEnv} (${apiUrl})`,
      )

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
              query AccountDefaultWallet($username: Username!) {
                accountDefaultWallet(username: $username) {
                  id
                  walletCurrency
                }
              }
            `,
            variables: { username },
          }),
        })

        const data = await response.json()

        if (data.errors || !data.data?.accountDefaultWallet?.id) {
          console.log(`[PublicPOS] User '${username}' not found on ${currentEnv}`)

          const envLabel =
            currentEnv === "staging" ? "staging/signet" : "production/mainnet"

          setValidationError({
            message: `User '${username}' does not exist on ${envLabel}.`,
            suggestion:
              currentEnv === "staging"
                ? `This username may exist on mainnet but not staging. Switch to production mode or use a staging username.`
                : `This username doesn't exist. Check spelling or try a different username.`,
            environment: currentEnv,
            canSwitchEnv: true,
          })
        } else {
          console.log(
            `[PublicPOS] User '${username}' validated on ${currentEnv}:`,
            data.data.accountDefaultWallet,
          )
          setValidatedWalletCurrency(
            data.data.accountDefaultWallet.walletCurrency || "BTC",
          )
          setValidationError(null)
        }
      } catch (error) {
        console.error("[PublicPOS] Error validating user:", error)
        setValidationError({
          message: `Failed to validate user '${username}'.`,
          suggestion: "Please check your internet connection and try again.",
          environment: currentEnv,
          canSwitchEnv: false,
        })
      } finally {
        setValidating(false)
      }
    }

    validateUser()
  }, [username])

  return { validationError, validating, validatedWalletCurrency }
}
