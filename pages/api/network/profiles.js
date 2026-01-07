/**
 * Leader Profiles API - Get Nostr profiles for community leaders
 * 
 * GET: Get Nostr profile for a specific npub
 * 
 * This endpoint is used to fetch profile pictures and metadata for community leaders.
 * Uses server-side caching to avoid repeated relay queries.
 */

import { bech32 } from 'bech32';

// Default relays to query
const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://purplepag.es'
];

// Server-side cache for profiles
if (!global._networkProfileCache) {
  global._networkProfileCache = new Map();
}
const profileCache = global._networkProfileCache;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Convert npub to hex pubkey
 */
function npubToHex(npub) {
  if (!npub || !npub.startsWith('npub1')) {
    return null;
  }
  
  try {
    const decoded = bech32.decode(npub);
    const pubkeyBytes = bech32.fromWords(decoded.words);
    return Buffer.from(pubkeyBytes).toString('hex');
  } catch (e) {
    console.error('[Profiles] Failed to decode npub:', e);
    return null;
  }
}

/**
 * Fetch profile from Nostr relay
 */
async function fetchProfileFromRelay(pubkeyHex, relayUrl, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let ws;
    const timeout = setTimeout(() => {
      if (ws) ws.close();
      resolve(null);
    }, timeoutMs);
    
    try {
      // Dynamic import for WebSocket in Node.js
      const WebSocket = require('ws');
      ws = new WebSocket(relayUrl);
      
      ws.on('open', () => {
        // Subscribe to kind 0 (metadata) events for this pubkey
        const subId = `profile_${Date.now()}`;
        const filter = {
          kinds: [0],
          authors: [pubkeyHex],
          limit: 1
        };
        ws.send(JSON.stringify(['REQ', subId, filter]));
      });
      
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg[0] === 'EVENT' && msg[2]?.kind === 0) {
            const content = JSON.parse(msg[2].content);
            clearTimeout(timeout);
            ws.close();
            resolve(content);
          } else if (msg[0] === 'EOSE') {
            // End of stored events - no profile found
            clearTimeout(timeout);
            ws.close();
            resolve(null);
          }
        } catch (e) {
          // Ignore parse errors
        }
      });
      
      ws.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });
      
    } catch (e) {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

/**
 * Fetch profile from multiple relays
 */
async function fetchProfile(pubkeyHex) {
  // Try relays in sequence, return first success
  for (const relay of RELAYS) {
    try {
      const profile = await fetchProfileFromRelay(pubkeyHex, relay, 3000);
      if (profile) {
        return profile;
      }
    } catch (e) {
      // Continue to next relay
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { npub } = req.query;
  
  if (!npub) {
    return res.status(400).json({
      success: false,
      error: 'npub parameter is required'
    });
  }

  try {
    // Check cache first
    const cached = profileCache.get(npub);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.status(200).json({
        success: true,
        profile: cached.profile,
        cached: true
      });
    }

    // Convert npub to hex
    const pubkeyHex = npubToHex(npub);
    if (!pubkeyHex) {
      return res.status(400).json({
        success: false,
        error: 'Invalid npub format'
      });
    }

    console.log(`[Profiles] Fetching profile for ${npub.substring(0, 20)}...`);
    
    // Fetch from relays
    const profile = await fetchProfile(pubkeyHex);
    
    // Cache the result (even if null, to avoid repeated queries)
    profileCache.set(npub, {
      profile: profile || {},
      timestamp: Date.now()
    });

    return res.status(200).json({
      success: true,
      profile: profile || {},
      cached: false
    });

  } catch (error) {
    console.error('[Profiles] Error fetching profile:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch profile'
    });
  }
}
