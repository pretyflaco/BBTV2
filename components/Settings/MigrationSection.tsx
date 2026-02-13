/**
 * MigrationSection - UI for migrating legacy API key users to Nostr auth
 *
 * Displayed only for legacy (API key) authenticated users.
 * Allows them to link their Nostr identity and migrate their credentials.
 */

import { useState, useEffect } from "react"

import { useCombinedAuth } from "../../lib/hooks/useCombinedAuth"
import MigrationService, {
  type MigrationResult as MigrationResultType,
} from "../../lib/migration/MigrationService"
import type { StoredProfile, StoredPreferences } from "../../lib/storage/ProfileStorage"

export default function MigrationSection() {
  const { authMode, user, hasExtension: _hasExtension, isMobile } = useCombinedAuth()

  const [migrating, setMigrating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [extensionAvailable, setExtensionAvailable] = useState(false)

  // Check for Nostr extension on mount
  useEffect(() => {
    const checkExtension = () => {
      setExtensionAvailable(typeof window !== "undefined" && !!window.nostr)
    }

    checkExtension()
    // Re-check after a short delay (extension might load after page)
    const timeout = setTimeout(checkExtension, 1000)
    return () => clearTimeout(timeout)
  }, [])

  // Only show for legacy users
  if (authMode !== "legacy") {
    return null
  }

  const handleMigrate = async () => {
    setMigrating(true)
    setError(null)

    try {
      // Step 1: Start migration process
      MigrationService.startMigration((user as { username: string })?.username)

      // Step 2: Get public key from extension
      if (!window.nostr) {
        throw new Error(
          "No Nostr extension found. Please install keys.band or another NIP-07 extension.",
        )
      }

      const publicKey = await window.nostr.getPublicKey()

      if (!publicKey) {
        throw new Error("Failed to get public key from extension")
      }

      // Step 3: Complete migration (transfers credentials)
      const result: MigrationResultType =
        await MigrationService.completeMigration(publicKey)

      if (!result.success) {
        throw new Error(result.error || "Migration failed")
      }

      // Step 4: Store in Nostr profile
      // Import ProfileStorage dynamically to avoid SSR issues
      const ProfileStorage = (await import("../../lib/storage/ProfileStorage")).default

      // Create or update profile for this Nostr pubkey
      // signInMethod is 'extension' since migration uses browser extension
      let profile: StoredProfile | null = ProfileStorage.getProfileByPublicKey(publicKey)
      if (!profile) {
        profile = ProfileStorage.createProfile(publicKey, "extension")
      }

      // Add the Blink account to the profile
      // addBlinkAccount(profileId, label, apiKey, username, defaultCurrency)
      await ProfileStorage.addBlinkAccount(
        profile!.id,
        `Migrated from ${result.blinkUsername || "unknown"}`,
        result.apiKey || "",
        result.blinkUsername || "",
        (result.preferences?.preferredCurrency as string) || "BTC",
      )

      // Update preferences using profile.id, not publicKey
      if (result.preferences) {
        const prefs: Partial<StoredPreferences> = {}
        if (result.preferences.preferredCurrency) {
          prefs.defaultCurrency = result.preferences.preferredCurrency as string
        }
        ProfileStorage.updatePreferences(profile!.id, prefs)
      }

      setSuccess(true)

      // Reload page after short delay to switch to Nostr auth
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (err: unknown) {
      console.error("Migration failed:", err)
      setError((err as Error).message)
      MigrationService.clearMigration()
    } finally {
      setMigrating(false)
    }
  }

  const handleMigrateWithSigner = () => {
    // Store migration intent and redirect info
    MigrationService.startMigration((user as { username: string })?.username)

    // Store return path
    sessionStorage.setItem("migration_return", window.location.href)

    // For external signer, we'd need to implement a similar flow
    // This is a placeholder - full implementation would use NIP-55
    setError(
      "External signer migration coming soon. Please use a browser extension like keys.band for now.",
    )
  }

  if (success) {
    return (
      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
        <div className="flex items-center gap-3">
          <svg
            className="w-6 h-6 text-green-600 dark:text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
          <div>
            <h4 className="font-medium text-green-800 dark:text-green-200">
              Migration Complete!
            </h4>
            <p className="text-sm text-green-600 dark:text-green-400">
              Your account has been linked to Nostr. Reloading...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
          🔗 Link Your Nostr Identity
        </h4>
        <p className="text-sm text-blue-600 dark:text-blue-400 mb-4">
          Connect your Nostr identity to enable passwordless sign-in with your browser
          extension or mobile signer. Your Blink account and settings will be preserved.
        </p>

        <div className="space-y-3">
          {/* Browser Extension Option */}
          <button
            onClick={handleMigrate}
            disabled={migrating || !extensionAvailable}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
              extensionAvailable && !migrating
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
            }`}
          >
            {migrating ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Migrating...
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                Link with Browser Extension
              </>
            )}
          </button>

          {!extensionAvailable && (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              No Nostr extension detected. Install{" "}
              <a
                href="https://keys.band"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                keys.band
              </a>{" "}
              or another NIP-07 extension.
            </p>
          )}

          {/* External Signer Option (Mobile) */}
          {isMobile && (
            <button
              onClick={handleMigrateWithSigner}
              disabled={migrating}
              className="w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              Link with External Signer
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400">
        <p className="font-medium mb-1">Benefits of Nostr authentication:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Sign in without typing passwords</li>
          <li>Manage multiple Blink accounts</li>
          <li>Secure, encrypted local storage</li>
          <li>Works across devices with your Nostr key</li>
        </ul>
      </div>
    </div>
  )
}
