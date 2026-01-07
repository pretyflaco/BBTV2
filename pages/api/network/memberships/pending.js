/**
 * Pending Applications API - Get pending applications for a community
 * 
 * GET: Get all pending applications for communities the user leads
 */

import applicationStore from '../../../../lib/network/applicationStore';

// Community leader mappings (same as memberships.js)
const LEADER_COMMUNITIES = {
  'npub1zkr064avsxmxzaasppamps86ge0npwvft9yu3ymgxmk9umx3xyeq9sk6ec': 'a1b2c3d4-e5f6-7890-abcd-ef1234567001', // Bitcoin Ekasi
  'npub1xxcyzef28e5qcjncwmn6z2nmwaezs2apxc2v2f7unnvxw3r5edfsactfly': 'a1b2c3d4-e5f6-7890-abcd-ef1234567002', // Bitcoin Victoria Falls
  'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6': 'a1b2c3d4-e5f6-7890-abcd-ef1234567003', // Test Community
};

// Super admin can see all communities
const SUPER_ADMIN_NPUB = 'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6';

// All community IDs
const ALL_COMMUNITY_IDS = [
  'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567002',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567003',
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userNpub = req.headers['x-user-npub'];
  const { communityId } = req.query;
  
  if (!userNpub) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  try {
    const isSuperAdmin = userNpub === SUPER_ADMIN_NPUB;
    const leaderCommunityId = LEADER_COMMUNITIES[userNpub];

    // If specific community requested
    if (communityId) {
      // Check if user has access to this community
      const hasAccess = isSuperAdmin || leaderCommunityId === communityId;
      
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to view applications for this community'
        });
      }

      const pending = applicationStore.getPendingApplicationsForCommunity(communityId);
      return res.status(200).json({
        success: true,
        applications: pending
      });
    }

    // No specific community - return all accessible applications
    let applications = [];
    
    if (isSuperAdmin) {
      // Super admin sees all pending applications
      ALL_COMMUNITY_IDS.forEach(id => {
        const pending = applicationStore.getPendingApplicationsForCommunity(id);
        applications = applications.concat(pending);
      });
    } else if (leaderCommunityId) {
      // Leader sees their community's applications
      applications = applicationStore.getPendingApplicationsForCommunity(leaderCommunityId);
    }

    return res.status(200).json({
      success: true,
      applications
    });

  } catch (error) {
    console.error('Error fetching pending applications:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch pending applications'
    });
  }
}
