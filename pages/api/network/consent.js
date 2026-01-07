/**
 * Data Sharing Consent API
 * 
 * GET: Check user's consent status for a community
 * POST: Submit data sharing consent with API key
 * DELETE: Revoke consent
 */

import consentStore from '../../../lib/network/consentStore';
import membershipStore from '../../../lib/network/membershipStore';
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

// Leader mappings to verify membership
const LEADER_COMMUNITIES = {
  'npub1zkr064avsxmxzaasppamps86ge0npwvft9yu3ymgxmk9umx3xyeq9sk6ec': 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
  'npub1xxcyzef28e5qcjncwmn6z2nmwaezs2apxc2v2f7unnvxw3r5edfsactfly': 'a1b2c3d4-e5f6-7890-abcd-ef1234567002',
  'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6': 'a1b2c3d4-e5f6-7890-abcd-ef1234567003',
};

function isUserMemberOfCommunity(userNpub, communityId) {
  // Check if leader
  if (LEADER_COMMUNITIES[userNpub] === communityId) return true;
  
  // Check dynamic memberships
  return membershipStore.isMember(communityId, userNpub);
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
        const consent = consentStore.getConsent(userNpub, communityId);
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
        const consents = consentStore.getUserConsents(userNpub);
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
      if (!isUserMemberOfCommunity(userNpub, communityId)) {
        return res.status(403).json({
          success: false,
          error: 'You must be a member of this community to share data'
        });
      }

      // Check if already has consent
      const existing = consentStore.getConsent(userNpub, communityId);
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
      
      const consent = consentStore.addConsent(
        userNpub,
        communityId,
        encryptedKey,
        blinkUsername
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
      const consent = consentStore.revokeConsent(userNpub, communityId);
      
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
