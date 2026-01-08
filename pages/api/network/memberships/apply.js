/**
 * Membership Application API - Apply to join a community
 * 
 * POST: Submit an application to join a community
 */

const db = require('../../../../lib/network/db');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userNpub = req.headers['x-user-npub'];
  const userPubkeyHex = req.headers['x-user-pubkey'];
  
  if (!userNpub) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const { communityId, applicationNote } = req.body;

  if (!communityId) {
    return res.status(400).json({
      success: false,
      error: 'Community ID is required'
    });
  }

  try {
    // Check if user already has a membership for this community
    const existingMembership = await db.getMembership(communityId, userNpub);
    if (existingMembership && existingMembership.status === 'pending') {
      return res.status(409).json({
        success: false,
        error: 'You already have a pending application for this community',
        existingApplication: existingMembership
      });
    }
    
    if (existingMembership && existingMembership.status === 'approved') {
      return res.status(409).json({
        success: false,
        error: 'You are already a member of this community',
        membership: existingMembership
      });
    }

    console.log('Membership application received:', {
      communityId,
      userNpub: userNpub.substring(0, 20) + '...',
      applicationNote: applicationNote?.substring(0, 50)
    });

    // Create the application
    const membership = await db.applyToJoinCommunity(
      communityId,
      userNpub,
      userPubkeyHex,
      applicationNote
    );

    return res.status(200).json({
      success: true,
      message: 'Application submitted successfully. The community leader will review your request.',
      membership: {
        id: membership.id,
        community_id: membership.community_id,
        user_npub: membership.user_npub,
        status: membership.status,
        application_note: membership.application_note,
        applied_at: membership.applied_at
      }
    });

  } catch (error) {
    console.error('Error submitting application:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit application'
    });
  }
}
