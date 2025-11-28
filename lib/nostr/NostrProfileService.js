/**
 * NostrProfileService - Fetches Nostr profile metadata from relays
 * 
 * Fetches kind 0 events (NIP-01 profile metadata) containing:
 * - name, display_name, about, picture, banner, nip05, lud16, etc.
 * 
 * @see https://github.com/nostr-protocol/nips/blob/master/01.md
 */

// Default relays to query for profile metadata
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://purplepag.es',
  'wss://relay.snort.social'
];

// Cache for profile data to avoid repeated fetches
const profileCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * @typedef {Object} NostrProfile
 * @property {string} [name]
 * @property {string} [display_name]
 * @property {string} [picture]
 * @property {string} [banner]
 * @property {string} [about]
 * @property {string} [nip05]
 * @property {string} [lud16]
 * @property {string} [website]
 */

class NostrProfileService {
  /**
   * Fetch profile metadata for a given public key
   * 
   * @param {string} pubkey - Hex-encoded public key
   * @param {string[]} [relays] - Optional list of relays to query
   * @returns {Promise<NostrProfile|null>}
   */
  static async fetchProfile(pubkey, relays = DEFAULT_RELAYS) {
    if (!pubkey || typeof pubkey !== 'string' || pubkey.length !== 64) {
      console.warn('[NostrProfile] Invalid pubkey:', pubkey);
      return null;
    }

    // Check cache first
    const cached = profileCache.get(pubkey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.profile;
    }

    try {
      // Query relays in parallel with timeout
      const profile = await this.queryRelays(pubkey, relays);
      
      // Cache the result
      if (profile) {
        profileCache.set(pubkey, {
          profile,
          timestamp: Date.now()
        });
      }
      
      return profile;
    } catch (error) {
      console.error('[NostrProfile] Failed to fetch profile:', error);
      return null;
    }
  }

  /**
   * Query multiple relays for profile metadata
   * Returns the first successful response
   * 
   * @param {string} pubkey
   * @param {string[]} relays
   * @returns {Promise<NostrProfile|null>}
   */
  static async queryRelays(pubkey, relays) {
    // Create a promise for each relay
    const relayPromises = relays.map(relay => 
      this.queryRelay(relay, pubkey).catch(() => null)
    );

    // Race with timeout
    const timeoutPromise = new Promise((resolve) => 
      setTimeout(() => resolve(null), 5000)
    );

    // Use Promise.race on all relay queries
    // But also collect all results for the best response
    const results = await Promise.race([
      Promise.all(relayPromises),
      timeoutPromise.then(() => [])
    ]);

    // Find the most complete profile (prefer one with picture)
    if (Array.isArray(results)) {
      const profiles = results.filter(p => p !== null);
      
      // Prefer profile with picture, then name
      return profiles.find(p => p.picture) || 
             profiles.find(p => p.display_name || p.name) ||
             profiles[0] || null;
    }

    return null;
  }

  /**
   * Query a single relay for profile metadata
   * 
   * @param {string} relayUrl
   * @param {string} pubkey
   * @returns {Promise<NostrProfile|null>}
   */
  static queryRelay(relayUrl, pubkey) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout'));
      }, 4000);

      let ws;
      try {
        ws = new WebSocket(relayUrl);
      } catch (e) {
        clearTimeout(timeout);
        reject(e);
        return;
      }

      ws.onopen = () => {
        // Send REQ for kind 0 (profile metadata)
        const subscriptionId = 'profile_' + Math.random().toString(36).slice(2);
        const req = JSON.stringify([
          'REQ',
          subscriptionId,
          {
            kinds: [0],
            authors: [pubkey],
            limit: 1
          }
        ]);
        ws.send(req);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle EVENT message
          if (data[0] === 'EVENT' && data[2]) {
            const nostrEvent = data[2];
            if (nostrEvent.kind === 0 && nostrEvent.content) {
              const profile = JSON.parse(nostrEvent.content);
              clearTimeout(timeout);
              ws.close();
              resolve(profile);
            }
          }
          
          // Handle EOSE (end of stored events)
          if (data[0] === 'EOSE') {
            // No profile found on this relay
            clearTimeout(timeout);
            ws.close();
            resolve(null);
          }
        } catch (e) {
          // Parsing error, continue waiting
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        ws.close();
        reject(new Error('WebSocket error'));
      };

      ws.onclose = () => {
        clearTimeout(timeout);
      };
    });
  }

  /**
   * Get the display name for a profile
   * Prefers display_name, falls back to name, then truncated pubkey
   * 
   * @param {NostrProfile|null} profile
   * @param {string} pubkey
   * @returns {string}
   */
  static getDisplayName(profile, pubkey) {
    if (profile?.display_name) return profile.display_name;
    if (profile?.name) return profile.name;
    if (pubkey) return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
    return 'Anonymous';
  }

  /**
   * Get the avatar URL for a profile
   * Returns a default avatar if none set
   * 
   * @param {NostrProfile|null} profile
   * @returns {string|null}
   */
  static getAvatarUrl(profile) {
    return profile?.picture || null;
  }

  /**
   * Clear the profile cache (useful after logout)
   */
  static clearCache() {
    profileCache.clear();
  }

  /**
   * Clear a specific profile from cache
   * @param {string} pubkey
   */
  static clearFromCache(pubkey) {
    profileCache.delete(pubkey);
  }
}

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NostrProfileService;
}

// For ES modules
export default NostrProfileService;
export { NostrProfileService };

