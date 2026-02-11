/**
 * In-memory consent store for development
 * Tracks data sharing consents from community members
 * In production, this would be replaced with database operations
 *
 * Uses global singleton to persist across Next.js hot reloads
 */

export interface DataConsent {
  id: string
  user_npub: string
  community_id: string
  encrypted_api_key: string | null
  blink_username: string
  status: string
  consented_at: string
  revoked_at?: string
}

declare global {
  // eslint-disable-next-line no-var
  var _networkConsentStore: Map<string, DataConsent> | undefined
}

// Use global to persist across hot reloads in development
if (!global._networkConsentStore) {
  global._networkConsentStore = new Map<string, DataConsent>()
}
const consents: Map<string, DataConsent> = global._networkConsentStore

/**
 * Create a consent key for lookup
 */
export function getConsentKey(userNpub: string, communityId: string): string {
  return `${userNpub}:${communityId}`
}

/**
 * Add or update data sharing consent
 * @param userNpub - User's npub
 * @param communityId - Community ID
 * @param encryptedApiKey - Already encrypted API key
 * @param blinkUsername - Blink username associated with the API key
 * @returns The consent record
 */
export function addConsent(
  userNpub: string,
  communityId: string,
  encryptedApiKey: string,
  blinkUsername: string,
): DataConsent {
  const key = getConsentKey(userNpub, communityId)

  const consent: DataConsent = {
    id: `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    user_npub: userNpub,
    community_id: communityId,
    encrypted_api_key: encryptedApiKey,
    blink_username: blinkUsername,
    status: "active",
    consented_at: new Date().toISOString(),
  }

  consents.set(key, consent)
  console.log(
    "[ConsentStore] Added consent for",
    userNpub.substring(0, 20),
    "in community",
    communityId,
    "with Blink username:",
    blinkUsername,
  )
  return consent
}

/**
 * Get consent for a user in a community
 * @param userNpub - User's npub
 * @param communityId - Community ID
 * @returns The consent or null
 */
export function getConsent(userNpub: string, communityId: string): DataConsent | null {
  const key = getConsentKey(userNpub, communityId)
  return consents.get(key) || null
}

/**
 * Check if user has active consent for a community
 * @param userNpub - User's npub
 * @param communityId - Community ID
 * @returns Whether the user has active consent
 */
export function hasActiveConsent(userNpub: string, communityId: string): boolean {
  const consent = getConsent(userNpub, communityId)
  return consent?.status === "active"
}

/**
 * Get all consents for a user
 * @param userNpub - User's npub
 * @returns List of user's consents
 */
export function getUserConsents(userNpub: string): DataConsent[] {
  const userConsents: DataConsent[] = []
  for (const consent of consents.values()) {
    if (consent.user_npub === userNpub) {
      userConsents.push(consent)
    }
  }
  return userConsents
}

/**
 * Get all active consents for a community
 * @param communityId - Community ID
 * @returns List of active consents for the community
 */
export function getCommunityConsents(communityId: string): DataConsent[] {
  const communityConsents: DataConsent[] = []
  for (const consent of consents.values()) {
    if (consent.community_id === communityId && consent.status === "active") {
      communityConsents.push(consent)
    }
  }
  return communityConsents
}

/**
 * Count active consents for a community
 * @param communityId - Community ID
 * @returns Number of active consents
 */
export function getConsentCount(communityId: string): number {
  return getCommunityConsents(communityId).length
}

/**
 * Revoke consent
 * @param userNpub - User's npub
 * @param communityId - Community ID
 * @returns The revoked consent or null
 */
export function revokeConsent(userNpub: string, communityId: string): DataConsent | null {
  const key = getConsentKey(userNpub, communityId)
  const consent = consents.get(key)

  if (!consent) return null

  consent.status = "revoked"
  consent.revoked_at = new Date().toISOString()
  consent.encrypted_api_key = null // Clear the key

  consents.set(key, consent)
  console.log(
    "[ConsentStore] Revoked consent for",
    userNpub.substring(0, 20),
    "in community",
    communityId,
  )
  return consent
}
