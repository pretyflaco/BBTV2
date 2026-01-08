/**
 * Data Sharing Consent API
 * 
 * GET: Check user's consent status for a community
 * POST: Submit data sharing consent with API key
 * DELETE: Revoke consent
 */

const db = require('../../../lib/network/db');
import BlinkAPI from '../../../lib/blink-api';

// Simple encryption for API keys (in production, use proper encryption)
function encryptApiKey(apiKey) {
  // Base64 encode with a simple transform (NOT secure - use proper encryption in production)
  const encoded = Buffer.from(apiKey).toString('base64');
  return encoded.split('').reverse().join('');
}

/**
 * Fetch Blink username using the provided API key
 */
async function fetchBlinkUsername(apiKey) {
  try {
    const blinkApi = new BlinkAPI(apiKey);
    const me = await blinkApi.getMe();
    return me?.username || null;
  } catch (error) {
    console.error('Error fetching Blink username:', error);
    return null;
  }
}

/**
 * Check if user is a member of the community (from database)
 */
async function isUserMemberOfCommunity(userNpub, communityId) {
  try {
    // Check if user is the community leader
    const community = await db.getCommunityById(communityId);
    if (community && community.leader_npub === userNpub) {
      return true;
    }
    
    // Check if user has approved membership
    const membership = await db.getMembership(communityId, userNpub);
    return membership && membership.status === 'approved';
  } catch (error) {
    console.error('Error checking membership:', error);
    return false;
  }
}

export default async function handler(req, res) {
  const userNpub = req.headers['x-user-npub'];
  
  if (!userNpub) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  // GET - Check consent status
  if (req.method === 'GET') {
    const { communityId } = req.query;
    
    try {
      if (communityId) {
        // Check specific community
        const consent = await db.getConsent(communityId, userNpub);
        return res.status(200).json({
          success: true,
          hasConsent: consent?.status === 'active',
          consent: consent ? {
            id: consent.id,
            status: consent.status,
            blink_username: consent.blink_username,
            consented_at: consent.consented_at
          } : null
        });
      } else {
        // Get all user consents
        const consents = await db.getConsentByUser(userNpub);
        return res.status(200).json({
          success: true,
          consents: consents.map(c => ({
            id: c.id,
            community_id: c.community_id,
            status: c.status,
            blink_username: c.blink_username,
            consented_at: c.consented_at
          }))
        });
      }
    } catch (error) {
      console.error('Error checking consent:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to check consent status'
      });
    }
  }

  // POST - Submit consent
  if (req.method === 'POST') {
    const { communityId, apiKey } = req.body;
    
    if (!communityId) {
      return res.status(400).json({
        success: false,
        error: 'Community ID is required'
      });
    }
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required'
      });
    }

    // Validate API key format (Blink keys start with 'blink_')
    if (!apiKey.startsWith('blink_')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid API key format. Blink API keys start with "blink_"'
      });
    }

    try {
      // Verify user is a member of this community
      const isMember = await isUserMemberOfCommunity(userNpub, communityId);
      if (!isMember) {
        return res.status(403).json({
          success: false,
          error: 'You must be a member of this community to share data'
        });
      }

      // Check if already has consent
      const existing = await db.getConsent(communityId, userNpub);
      if (existing?.status === 'active') {
        return res.status(409).json({
          success: false,
          error: 'You have already opted in for data sharing',
          consent: {
            blink_username: existing.blink_username,
            consented_at: existing.consented_at
          }
        });
      }

      // Fetch Blink username to validate API key and get display name
      const blinkUsername = await fetchBlinkUsername(apiKey);
      if (!blinkUsername) {
        return res.status(400).json({
          success: false,
          error: 'Invalid API key. Could not verify with Blink API.'
        });
      }

      // Encrypt and store
      const encryptedKey = encryptApiKey(apiKey);
      
      const consent = await db.createOrUpdateConsent(
        communityId,
        userNpub,
        encryptedKey,
        blinkUsername,
        'active'
      );

      console.log(`[Consent] User ${userNpub.substring(0, 20)}... opted in for community ${communityId} as ${blinkUsername}`);

      return res.status(200).json({
        success: true,
        message: 'Data sharing enabled! Your transaction data will be included in community metrics.',
        consent: {
          id: consent.id,
          blink_username: consent.blink_username,
          consented_at: consent.consented_at
        }
      });

    } catch (error) {
      console.error('Error submitting consent:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to submit consent'
      });
    }
  }

  // DELETE - Revoke consent
  if (req.method === 'DELETE') {
    const { communityId } = req.query;
    
    if (!communityId) {
      return res.status(400).json({
        success: false,
        error: 'Community ID is required'
      });
    }

    try {
      // Revoke consent by setting status to 'revoked'
      const consent = await db.createOrUpdateConsent(
        communityId,
        userNpub,
        null, // Clear API key
        null, // Clear username
        'revoked'
      );
      
      if (!consent) {
        return res.status(404).json({
          success: false,
          error: 'No consent found to revoke'
        });
      }

      console.log(`[Consent] User ${userNpub.substring(0, 20)}... revoked consent for community ${communityId}`);

      return res.status(200).json({
        success: true,
        message: 'Data sharing disabled. Your API key has been removed.'
      });

    } catch (error) {
      console.error('Error revoking consent:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to revoke consent'
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
