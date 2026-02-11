/**
 * MigrationService - Handles migration of legacy API key users to Nostr auth
 *
 * Migration flow:
 * 1. Legacy user is authenticated with API key
 * 2. User initiates migration by signing in with Nostr
 * 3. System links the Nostr identity to their existing Blink account
 * 4. Credentials are migrated to Nostr profile storage
 * 5. User can now sign in with Nostr and access their Blink account
 */

interface MigrationState {
  legacyUsername: string
  startedAt: number
  status: string
  completedAt?: number
  nostrPublicKey?: string
}

interface MigrationResult {
  success: boolean
  error?: string
  apiKey?: string
  blinkUsername?: string
  preferences?: Record<string, unknown>
}

interface MigrationStatus {
  migrated: boolean
  [key: string]: unknown
}

class MigrationService {
  static MIGRATION_STATE_KEY: string = "blinkpos_migration_state"

  /**
   * Check if current session is a legacy (API key) session
   */
  static isLegacySession(): boolean {
    // Check for auth-token cookie existence
    if (typeof document === "undefined") return false
    return document.cookie.includes("auth-token=")
  }

  /**
   * Start migration process
   * Stores the current legacy session info for later use
   */
  static startMigration(legacyUsername: string): boolean {
    if (typeof localStorage === "undefined") return false

    const migrationState: MigrationState = {
      legacyUsername,
      startedAt: Date.now(),
      status: "pending",
    }

    localStorage.setItem(this.MIGRATION_STATE_KEY, JSON.stringify(migrationState))
    return true
  }

  /**
   * Check if there's a pending migration
   */
  static getPendingMigration(): MigrationState | null {
    if (typeof localStorage === "undefined") return null

    try {
      const state: string | null = localStorage.getItem(this.MIGRATION_STATE_KEY)
      if (!state) return null

      const migrationState: MigrationState = JSON.parse(state) as MigrationState

      // Migration expires after 1 hour
      if (Date.now() - migrationState.startedAt > 60 * 60 * 1000) {
        this.clearMigration()
        return null
      }

      return migrationState
    } catch (error: unknown) {
      console.error("Failed to get migration state:", error)
      return null
    }
  }

  /**
   * Complete migration - called after Nostr sign-in
   * Links the Nostr identity to the legacy account
   */
  static async completeMigration(nostrPublicKey: string): Promise<MigrationResult> {
    const pending: MigrationState | null = this.getPendingMigration()
    if (!pending) {
      return { success: false, error: "No pending migration" }
    }

    try {
      // Call migration API to transfer credentials
      const response: Response = await fetch("/api/auth/migrate-to-nostr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nostrPublicKey,
          legacyUsername: pending.legacyUsername,
        }),
      })

      const data: Record<string, unknown> = (await response.json()) as Record<
        string,
        unknown
      >

      if (response.ok) {
        // Update migration state
        const updatedState: MigrationState = {
          ...pending,
          status: "completed",
          completedAt: Date.now(),
          nostrPublicKey,
        }
        localStorage.setItem(this.MIGRATION_STATE_KEY, JSON.stringify(updatedState))

        return {
          success: true,
          apiKey: data.apiKey as string | undefined,
          blinkUsername: data.blinkUsername as string | undefined,
          preferences: data.preferences as Record<string, unknown> | undefined,
        }
      } else {
        return { success: false, error: data.error as string | undefined }
      }
    } catch (error: unknown) {
      console.error("Migration failed:", error)
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Clear migration state
   */
  static clearMigration(): void {
    if (typeof localStorage === "undefined") return
    localStorage.removeItem(this.MIGRATION_STATE_KEY)
  }

  /**
   * Check if user has already migrated
   */
  static async checkMigrationStatus(nostrPublicKey: string): Promise<MigrationStatus> {
    try {
      const response: Response = await fetch(
        `/api/auth/migration-status?publicKey=${nostrPublicKey}`,
        {
          credentials: "include",
        },
      )

      if (response.ok) {
        const data: MigrationStatus = (await response.json()) as MigrationStatus
        return data
      }
      return { migrated: false }
    } catch (error: unknown) {
      console.error("Failed to check migration status:", error)
      return { migrated: false }
    }
  }
}

export default MigrationService
export { MigrationService }
export type { MigrationState, MigrationResult, MigrationStatus }
