/**
 * Memberships API - Get user's community memberships
 * 
 * GET: Get all memberships for the authenticated user
 */

const db = require('../../../lib/network/db');

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
    // Fetch memberships from database
    const memberships = await db.getUserMemberships(userNpub);
    
    // Check if user is super admin
    const isSuperAdmin = await db.isSuperAdmin(userNpub);
    
    // If super admin, also show all communities they don't already have membership in
    if (isSuperAdmin) {
      const allCommunities = await db.listCommunities();
      const memberCommunityIds = new Set(memberships.map(m => m.community_id));
      
      // Add admin view for communities they're not already a member of
      allCommunities.forEach(community => {
        if (!memberCommunityIds.has(community.id)) {
          memberships.push({
            id: null, // No membership record yet
            community_id: community.id,
            community_name: community.name,
            community_slug: community.slug,
            user_npub: userNpub,
            role: 'admin',
            status: 'approved',
            member_count: community.member_count || community.member_count_live || 0,
            data_sharing_member_count: community.data_sharing_member_count || 0,
            applied_at: null,
            approved_at: null,
            consent_given: false
          });
        }
      });
    }
    
    // Get consent status for each membership
    const membershipsWithConsent = await Promise.all(
      memberships.map(async (membership) => {
        if (!membership.id) {
          // Admin view without actual membership
          return membership;
        }
        
        const consent = await db.getConsent(membership.id);
        return {
          ...membership,
          consent_given: consent?.consent_given || false,
          sync_status: consent?.sync_status || null,
          last_sync_at: consent?.last_sync_at || null
        };
      })
    );

    return res.status(200).json({
      success: true,
      memberships: membershipsWithConsent
    });

  } catch (error) {
    console.error('Error fetching memberships:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch memberships'
    });
  }
}
