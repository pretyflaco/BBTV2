/**
 * Global augmentations for Node.js server-side code
 *
 * Extends the global namespace with properties used across API routes:
 * - _networkProfileCache: Server-side Nostr profile cache (survives hot reloads)
 */

/* eslint-disable no-var */

interface NetworkProfileCacheEntry {
  profile: Record<string, unknown>
  timestamp: number
}

declare global {
  var _networkProfileCache: Map<string, NetworkProfileCacheEntry> | undefined
}

export {}
