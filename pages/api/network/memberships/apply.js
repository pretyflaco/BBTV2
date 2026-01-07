/**
 * Membership Application API - Apply to join a community
 * 
 * POST: Submit an application to join a community
 */

import applicationStore from '../../../../lib/network/applicationStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userNpub = req.headers['x-user-npub'];
  
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
    // Check if user already has a pending application for this community
    const existingApp = applicationStore.getExistingApplication(userNpub, communityId);
    if (existingApp) {
      return res.status(409).json({
        success: false,
        error: 'You already have a pending application for this community',
        existingApplication: existingApp
      });
    }

    console.log('Membership application received:', {
      communityId,
      userNpub: userNpub.substring(0, 20) + '...',
      applicationNote: applicationNote?.substring(0, 50)
    });

    // Store the application
    const application = applicationStore.addApplication({
      community_id: communityId,
      user_npub: userNpub,
      application_note: applicationNote || ''
    });

    return res.status(200).json({
      success: true,
      message: 'Application submitted successfully. The community leader will review your request.',
      membership: {
        id: application.id,
        community_id: application.community_id,
        user_npub: application.user_npub,
        status: 'pending',
        application_note: application.application_note,
        applied_at: application.applied_at
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
