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
        // Check specific community - use getConsentByUser with correct params
        const consent = await db.getConsentByUser(communityId, userNpub);
        return res.status(200).json({
          success: true,
          hasConsent: consent?.consent_given === true,
          consent: consent ? {
            id: consent.id,
            status: consent.consent_given ? 'active' : 'inactive',
            blink_username: consent.blink_username,
            consented_at: consent.consented_at
          } : null
        });
      } else {
        // Get all user consents - need to query across all communities
        const memberships = await db.getUserMemberships(userNpub);
        const consents = [];
        
        for (const membership of memberships) {
          const consent = await db.getConsentByUser(membership.community_id, userNpub);
          if (consent) {
            consents.push({
              id: consent.id,
              community_id: membership.community_id,
              status: consent.consent_given ? 'active' : 'inactive',
              blink_username: consent.blink_username,
              consented_at: consent.consented_at
            });
          }
        }
        
        return res.status(200).json({
          success: true,
          consents
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

      // Get the membership to get the membershipId
      const membership = await db.getMembership(communityId, userNpub);
      if (!membership) {
        return res.status(404).json({
          success: false,
          error: 'Membership not found'
        });
      }

      // Check if already has consent
      const existing = await db.getConsentByUser(communityId, userNpub);
      if (existing?.consent_given === true) {
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
        membership.id, // membershipId
        userNpub,
        communityId,
        {
          consentGiven: true,
          blinkApiKeyEncrypted: encryptedKey,
          blinkWalletIds: null, // Will be populated during sync
          blinkUsername: blinkUsername,
          syncFromDate: null // Will use default (30 days ago)
        }
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
      // Get the membership to get the membershipId
      const membership = await db.getMembership(communityId, userNpub);
      if (!membership) {
        return res.status(404).json({
          success: false,
          error: 'Membership not found'
        });
      }

      // Revoke consent by setting consent_given to false
      const consent = await db.createOrUpdateConsent(
        membership.id, // membershipId
        userNpub,
        communityId,
        {
          consentGiven: false,
          blinkApiKeyEncrypted: null,
          blinkWalletIds: null,
          blinkUsername: null,
          syncFromDate: null
        }
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
