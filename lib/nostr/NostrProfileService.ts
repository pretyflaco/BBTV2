/**
 * NostrProfileService - Fetches Nostr profile metadata from relays
 *
 * Fetches kind 0 events (NIP-01 profile metadata) containing:
 * - name, display_name, about, picture, banner, nip05, lud16, etc.
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/01.md
 */

// Default relays to query for profile metadata
const DEFAULT_RELAYS: string[] = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://purplepag.es",
  "wss://relay.snort.social",
]

/**
 * Nostr profile metadata (kind 0 event content).
 */
export interface NostrProfile {
  name?: string
  display_name?: string
  picture?: string
  banner?: string
  about?: string
  nip05?: string
  lud16?: string
  website?: string
  [key: string]: unknown
}

/**
 * Cache entry wrapping a profile with its fetch timestamp.
 */
interface CacheEntry {
  profile: NostrProfile
  timestamp: number
}

/**
 * A Nostr event as received from a relay.
 */
interface NostrEvent {
  kind: number
  content: string
  pubkey: string
  id: string
  sig: string
  created_at: number
  tags: string[][]
}

// Cache for profile data to avoid repeated fetches
const profileCache: Map<string, CacheEntry> = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

class NostrProfileService {
  /**
   * Fetch profile metadata for a given public key
   */
  static async fetchProfile(
    pubkey: string,
    relays: string[] = DEFAULT_RELAYS,
  ): Promise<NostrProfile | null> {
    if (!pubkey || typeof pubkey !== "string" || pubkey.length !== 64) {
      console.warn("[NostrProfile] Invalid pubkey:", pubkey)
      return null
    }

    // Check cache first
    const cached = profileCache.get(pubkey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.profile
    }

    try {
      // Query relays in parallel with timeout
      const profile = await this.queryRelays(pubkey, relays)

      // Cache the result
      if (profile) {
        profileCache.set(pubkey, {
          profile,
          timestamp: Date.now(),
        })
      }

      return profile
    } catch (err: unknown) {
      console.error("[NostrProfile] Failed to fetch profile:", err)
      return null
    }
  }

  /**
   * Query multiple relays for profile metadata
   * Returns the first successful response
   */
  static async queryRelays(
    pubkey: string,
    relays: string[],
  ): Promise<NostrProfile | null> {
    // Create a promise for each relay
    const relayPromises: Promise<NostrProfile | null>[] = relays.map((relay: string) =>
      this.queryRelay(relay, pubkey).catch(() => null),
    )

    // Race with timeout
    const timeoutPromise = new Promise<null>((resolve: (value: null) => void) =>
      setTimeout(() => resolve(null), 5000),
    )

    // Use Promise.race on all relay queries
    // But also collect all results for the best response
    const results: (NostrProfile | null)[] | null = await Promise.race([
      Promise.all(relayPromises),
      timeoutPromise.then((): (NostrProfile | null)[] => []),
    ])

    // Find the most complete profile (prefer one with picture)
    if (Array.isArray(results)) {
      const profiles: NostrProfile[] = results.filter(
        (p: NostrProfile | null): p is NostrProfile => p !== null,
      )

      // Prefer profile with picture, then name
      return (
        profiles.find((p: NostrProfile) => p.picture) ||
        profiles.find((p: NostrProfile) => p.display_name || p.name) ||
        profiles[0] ||
        null
      )
    }

    return null
  }

  /**
   * Query a single relay for profile metadata
   */
  static queryRelay(relayUrl: string, pubkey: string): Promise<NostrProfile | null> {
    return new Promise<NostrProfile | null>(
      (
        resolve: (value: NostrProfile | null) => void,
        reject: (reason: Error) => void,
      ) => {
        let ws: WebSocket

        const timeout: ReturnType<typeof setTimeout> = setTimeout(() => {
          ws.close()
          reject(new Error("Timeout"))
        }, 4000)

        try {
          ws = new WebSocket(relayUrl)
        } catch (err: unknown) {
          clearTimeout(timeout)
          reject(err instanceof Error ? err : new Error(String(err)))
          return
        }

        ws.onopen = (): void => {
          // Send REQ for kind 0 (profile metadata)
          const subscriptionId = "profile_" + Math.random().toString(36).slice(2)
          const req: string = JSON.stringify([
            "REQ",
            subscriptionId,
            {
              kinds: [0],
              authors: [pubkey],
              limit: 1,
            },
          ])
          ws.send(req)
        }

        ws.onmessage = (event: MessageEvent): void => {
          try {
            const data: unknown[] = JSON.parse(event.data as string) as unknown[]

            // Handle EVENT message
            if (data[0] === "EVENT" && data[2]) {
              const nostrEvent = data[2] as NostrEvent
              if (nostrEvent.kind === 0 && nostrEvent.content) {
                const profile: NostrProfile = JSON.parse(
                  nostrEvent.content,
                ) as NostrProfile
                clearTimeout(timeout)
                ws.close()
                resolve(profile)
              }
            }

            // Handle EOSE (end of stored events)
            if (data[0] === "EOSE") {
              // No profile found on this relay
              clearTimeout(timeout)
              ws.close()
              resolve(null)
            }
          } catch (_e: unknown) {
            // Parsing error, continue waiting
          }
        }

        ws.onerror = (): void => {
          clearTimeout(timeout)
          ws.close()
          reject(new Error("WebSocket error"))
        }

        ws.onclose = (): void => {
          clearTimeout(timeout)
        }
      },
    )
  }

  /**
   * Get the display name for a profile
   * Prefers display_name, falls back to name, then truncated pubkey
   */
  static getDisplayName(profile: NostrProfile | null, pubkey: string): string {
    if (profile?.display_name) return profile.display_name
    if (profile?.name) return profile.name
    if (pubkey) return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`
    return "Anonymous"
  }

  /**
   * Get the avatar URL for a profile
   * Returns a default avatar if none set
   */
  static getAvatarUrl(profile: NostrProfile | null): string | null {
    return profile?.picture || null
  }

  /**
   * Clear the profile cache (useful after logout)
   */
  static clearCache(): void {
    profileCache.clear()
  }

  /**
   * Clear a specific profile from cache
   */
  static clearFromCache(pubkey: string): void {
    profileCache.delete(pubkey)
  }
}

export default NostrProfileService
export { NostrProfileService }
