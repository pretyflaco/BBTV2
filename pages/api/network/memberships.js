/**
 * Memberships API - Get user's community memberships
 * 
 * GET: Get all memberships for the authenticated user
 */

import membershipStore from '../../../lib/network/membershipStore';

// Community leader mappings
const LEADER_COMMUNITIES = {
  'npub1zkr064avsxmxzaasppamps86ge0npwvft9yu3ymgxmk9umx3xyeq9sk6ec': {
    id: 1,
    community_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    community_name: 'Bitcoin Ekasi',
    community_slug: 'bitcoin-ekasi',
    role: 'leader',
    status: 'approved',
    member_count: 1,
    data_sharing_member_count: 0,
    consent_given: false,
    applied_at: '2025-12-31T00:00:00Z',
    approved_at: '2025-12-31T00:00:00Z'
  },
  'npub1xxcyzef28e5qcjncwmn6z2nmwaezs2apxc2v2f7unnvxw3r5edfsactfly': {
    id: 2,
    community_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567002',
    community_name: 'Bitcoin Victoria Falls',
    community_slug: 'bitcoin-victoria-falls',
    role: 'leader',
    status: 'approved',
    member_count: 1,
    data_sharing_member_count: 0,
    consent_given: false,
    applied_at: '2025-12-31T00:00:00Z',
    approved_at: '2025-12-31T00:00:00Z'
  },
  'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6': {
    id: 3,
    community_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567003',
    community_name: 'Test Community',
    community_slug: 'test-community',
    role: 'leader',
    status: 'approved',
    member_count: 1,
    data_sharing_member_count: 0,
    consent_given: false,
    applied_at: '2025-12-31T00:00:00Z',
    approved_at: '2025-12-31T00:00:00Z'
  }
};

// Super admin has access to all communities
const SUPER_ADMIN_NPUB = 'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userNpub = req.headers['x-user-npub'];
  
  if (!userNpub) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  try {
    // TODO: When database is connected, use:
    // const db = require('../../../lib/network/db');
    // const memberships = await db.getUserMemberships(userNpub);

    let memberships = [];

    // Check if user is a community leader (static data)
    if (LEADER_COMMUNITIES[userNpub]) {
      memberships.push({
        ...LEADER_COMMUNITIES[userNpub],
        user_npub: userNpub
      });
    }

    // Super admin can see all OTHER communities (as observer/admin)
    if (userNpub === SUPER_ADMIN_NPUB) {
      Object.entries(LEADER_COMMUNITIES).forEach(([leaderNpub, community]) => {
        // Skip communities where super admin is already the leader
        if (leaderNpub === userNpub) return;
        
        // Add as admin role for other communities
        memberships.push({
          ...community,
          id: community.id + 100, // Different ID for admin view
          user_npub: userNpub,
          role: 'admin'
        });
      });
    }

    // Also check dynamic memberships (from approved applications)
    const dynamicMemberships = membershipStore.getUserMemberships(userNpub);
    dynamicMemberships.forEach(dm => {
      // Avoid duplicates (user might already be listed as leader)
      const alreadyListed = memberships.some(m => m.community_id === dm.community_id);
      if (!alreadyListed) {
        memberships.push({
          ...dm,
          community_slug: dm.community_name?.toLowerCase().replace(/\s+/g, '-') || 'unknown'
        });
      }
    });

    return res.status(200).json({
      success: true,
      memberships
    });

  } catch (error) {
    console.error('Error fetching memberships:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch memberships'
    });
  }
}
