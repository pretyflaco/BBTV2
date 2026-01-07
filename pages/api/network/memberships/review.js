/**
 * Membership Review API - Approve or reject membership applications
 * 
 * POST: Review a membership application (approve/reject)
 */

import applicationStore from '../../../../lib/network/applicationStore';
import membershipStore from '../../../../lib/network/membershipStore';

// Community leader mappings
const LEADER_COMMUNITIES = {
  'npub1zkr064avsxmxzaasppamps86ge0npwvft9yu3ymgxmk9umx3xyeq9sk6ec': 'a1b2c3d4-e5f6-7890-abcd-ef1234567001', // Bitcoin Ekasi
  'npub1xxcyzef28e5qcjncwmn6z2nmwaezs2apxc2v2f7unnvxw3r5edfsactfly': 'a1b2c3d4-e5f6-7890-abcd-ef1234567002', // Bitcoin Victoria Falls
  'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6': 'a1b2c3d4-e5f6-7890-abcd-ef1234567003', // Test Community
};

// Community names for display
const COMMUNITY_NAMES = {
  'a1b2c3d4-e5f6-7890-abcd-ef1234567001': 'Bitcoin Ekasi',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567002': 'Bitcoin Victoria Falls',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567003': 'Test Community',
};

// Super admin can manage all communities
const SUPER_ADMIN_NPUB = 'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const reviewerNpub = req.headers['x-user-npub'];
  
  if (!reviewerNpub) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const { applicationId, action } = req.body;

  if (!applicationId) {
    return res.status(400).json({
      success: false,
      error: 'Application ID is required'
    });
  }

  if (!action || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({
      success: false,
      error: 'Action must be "approve" or "reject"'
    });
  }

  try {
    // Get the application
    const application = applicationStore.getApplication(applicationId);
    
    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Application has already been ${application.status}`
      });
    }

    // Check if reviewer has permission for this community
    const isSuperAdmin = reviewerNpub === SUPER_ADMIN_NPUB;
    const leaderCommunityId = LEADER_COMMUNITIES[reviewerNpub];
    const hasPermission = isSuperAdmin || leaderCommunityId === application.community_id;

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to review applications for this community'
      });
    }

    // Update application status
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const updatedApplication = applicationStore.updateApplicationStatus(
      applicationId,
      newStatus,
      reviewerNpub
    );

    // If approved, add to members
    let membership = null;
    if (action === 'approve') {
      const communityName = COMMUNITY_NAMES[application.community_id] || 'Unknown Community';
      membership = membershipStore.addMember(
        application.community_id,
        application.user_npub,
        reviewerNpub,
        communityName
      );
    }

    console.log(`[Review] Application ${applicationId} ${newStatus} by ${reviewerNpub.substring(0, 20)}...`);

    return res.status(200).json({
      success: true,
      message: action === 'approve' 
        ? 'Member approved successfully!' 
        : 'Application rejected',
      application: updatedApplication,
      membership: membership
    });

  } catch (error) {
    console.error('Error reviewing application:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to review application'
    });
  }
}
