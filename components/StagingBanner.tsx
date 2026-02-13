/**
 * StagingBanner - Visual indicator when app is running in staging mode
 *
 * Displays a prominent banner at the top of the screen to remind developers
 * that they're using the staging environment (signet, not real sats).
 */

import { useState, useEffect } from "react"

import { getEnvironment, type EnvironmentName } from "../lib/config/api"

export default function StagingBanner() {
  const [showBanner, setShowBanner] = useState<boolean>(false)
  const [_environment, setEnvironmentState] = useState<EnvironmentName>("production")

  useEffect(() => {
    // Check environment on client side only
    const env = getEnvironment()
    setEnvironmentState(env)
    setShowBanner(env === "staging")
  }, [])

  if (!showBanner) {
    return null
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center text-xs py-1 z-[100] font-medium"
      data-testid="staging-banner"
    >
      <span className="mr-2">🧪</span>
      STAGING ENVIRONMENT (Signet) - Not real sats!
      <button
        onClick={() => setShowBanner(false)}
        className="ml-3 px-2 py-0.5 bg-amber-600 hover:bg-amber-700 rounded text-white text-xs"
        aria-label="Dismiss staging banner"
      >
        ×
      </button>
    </div>
  )
}
