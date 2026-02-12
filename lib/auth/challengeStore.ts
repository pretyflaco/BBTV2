/**
 * Challenge Store for Pubkey Ownership Verification
 *
 * Shared module for generating, storing, and verifying challenges.
 * Used by both /api/auth/challenge and /api/auth/verify-ownership
 *
 * In production, consider Redis for multi-instance deployments.
 */

import crypto from "crypto"

// ---------- Type Definitions ----------

interface ChallengeData {
  createdAt: number
  expiresAt: number
  used: boolean
}

interface ChallengeVerifyResult {
  valid: boolean
  error?: string
}

// ---------- In-memory challenge store ----------

const challengeStore: Map<string, ChallengeData> = new Map()

// Clean up expired challenges periodically (every 5 minutes)
setInterval(
  (): void => {
    const now: number = Date.now()
    for (const [key, data] of challengeStore.entries()) {
      if (data.expiresAt < now) {
        challengeStore.delete(key)
      }
    }
  },
  5 * 60 * 1000,
)

/**
 * Generate a cryptographically secure challenge
 * Format: blinkpos:{timestamp}:{random_nonce}
 */
function generateChallenge(): string {
  const timestamp: number = Math.floor(Date.now() / 1000)
  const nonce: string = crypto.randomBytes(16).toString("hex")
  return `blinkpos:${timestamp}:${nonce}`
}

/**
 * Store a challenge for later verification
 * @param challenge - The challenge string
 * @param ttlSeconds - Time to live in seconds (default: 300)
 */
function storeChallenge(challenge: string, ttlSeconds: number = 300): void {
  const expiresAt: number = Date.now() + ttlSeconds * 1000
  challengeStore.set(challenge, {
    createdAt: Date.now(),
    expiresAt,
    used: false,
  })
}

/**
 * Verify and consume a challenge
 * @param challenge - The challenge to verify
 * @returns An object indicating validity, with an optional error message
 */
function verifyChallenge(challenge: string): ChallengeVerifyResult {
  const data: ChallengeData | undefined = challengeStore.get(challenge)

  if (!data) {
    return { valid: false, error: "Challenge not found or expired" }
  }

  if (data.expiresAt < Date.now()) {
    challengeStore.delete(challenge)
    return { valid: false, error: "Challenge expired" }
  }

  if (data.used) {
    return { valid: false, error: "Challenge already used" }
  }

  // Mark as used (one-time use)
  data.used = true

  // Delete after short grace period (in case of retries)
  setTimeout((): void => {
    challengeStore.delete(challenge)
  }, 30000)

  return { valid: true }
}

export { generateChallenge, storeChallenge, verifyChallenge }
export type { ChallengeData, ChallengeVerifyResult }
