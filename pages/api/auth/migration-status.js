/**
 * Migration Status API - Check if a Nostr user has migrated from legacy auth
 * 
 * This endpoint checks if there's an existing link between a Nostr public key
 * and a legacy account, allowing seamless login for migrated users.
 */

const StorageManager = require('../../../lib/storage');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { publicKey } = req.query;

    if (!publicKey) {
      return res.status(400).json({ error: 'Public key is required' });
    }

    const normalizedKey = publicKey.toLowerCase();

    // Check if there's a Nostr-keyed entry
    const nostrLink = await StorageManager.loadUserData(`nostr_${normalizedKey}`);

    if (nostrLink && nostrLink.legacyUsername) {
      // Load the legacy user data
      const userData = await StorageManager.loadUserData(nostrLink.legacyUsername);

      if (userData && userData.migratedToNostr) {
        return res.status(200).json({
          migrated: true,
          legacyUsername: nostrLink.legacyUsername,
          linkedAt: nostrLink.linkedAt,
          hasApiKey: !!userData.apiKey
        });
      }
    }

    return res.status(200).json({
      migrated: false
    });

  } catch (error) {
    console.error('Migration status check error:', error);
    return res.status(500).json({ 
      error: 'Failed to check migration status',
      migrated: false 
    });
  }
}

