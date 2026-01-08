/**
 * Transaction Sync API
 * 
 * POST: Trigger sync for a community or all communities
 * GET: Get sync status and metrics
 */

import { syncCommunityTransactions, syncAllCommunities } from '../../../lib/network/syncService';
const db = require('../../../lib/network/db');

async function canTriggerSync(userNpub, communityId) {
  try {
    // Check if user is super admin
    const isSuperAdmin = await db.isSuperAdmin(userNpub);
    if (isSuperAdmin) return true;
    
    // Check if user is the community leader
    if (communityId) {
      const community = await db.getCommunityById(communityId);
      if (community && community.leader_npub === userNpub) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking sync permission:', error);
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

  // GET - Get sync status and metrics
  if (req.method === 'GET') {
    const { communityId } = req.query;
    
    try {
      if (communityId) {
        // Get metrics for specific community from database
        const metrics = await db.getLatestMetrics(communityId);
        
        // Count consents
        const consents = await db.query(
          `SELECT COUNT(*) as count FROM data_sharing_consents dsc
           JOIN community_memberships cm ON cm.id = dsc.membership_id
           WHERE cm.community_id = $1 AND dsc.consent_given = true`,
          [communityId]
        );
        const consentCount = parseInt(consents.rows[0]?.count || 0);
        
        return res.status(200).json({
          success: true,
          community_id: communityId,
          opted_in_members: consentCount,
          metrics: metrics || {
            transaction_count: 0,
            total_volume_sats: 0,
            intra_community_count: 0,
            unique_members: 0,
            velocity: 0,
            last_updated: null
          }
        });
      } else {
        // Get metrics for all communities from database
        const communities = await db.listCommunities();
        const metricsArray = [];
        
        for (const community of communities) {
          const metrics = await db.getLatestMetrics(community.id);
          if (metrics) {
            metricsArray.push({
              community_id: community.id,
              ...metrics
            });
          }
        }
        
        return res.status(200).json({
          success: true,
          metrics: metricsArray
        });
      }
    } catch (error) {
      console.error('Error getting sync status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get sync status'
      });
    }
  }

  // POST - Trigger sync
  if (req.method === 'POST') {
    const { communityId, syncAll } = req.body;
    
    try {
      // Check permissions
      if (syncAll) {
        // Only super admin can sync all
        const isSuperAdmin = await db.isSuperAdmin(userNpub);
        if (!isSuperAdmin) {
          return res.status(403).json({
            success: false,
            error: 'Only super admin can trigger full sync'
          });
        }
        
        console.log(`[Sync API] Super admin triggering full sync`);
        const result = await syncAllCommunities();
        
        return res.status(200).json({
          success: true,
          message: `Synced ${result.communities_synced} communities with ${result.total_transactions} transactions`,
          ...result
        });
        
      } else if (communityId) {
        // Check if user can sync this community
        const canSync = await canTriggerSync(userNpub, communityId);
        if (!canSync) {
          return res.status(403).json({
            success: false,
            error: 'You do not have permission to sync this community'
          });
        }
        
        console.log(`[Sync API] User ${userNpub.substring(0, 20)}... triggering sync for community ${communityId}`);
        const result = await syncCommunityTransactions(communityId);
        
        return res.status(200).json({
          success: true,
          message: `Synced ${result.members_synced} members with ${result.total_transactions} transactions`,
          ...result
        });
        
      } else {
        return res.status(400).json({
          success: false,
          error: 'Either communityId or syncAll is required'
        });
      }
      
    } catch (error) {
      console.error('Error triggering sync:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to trigger sync: ' + error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
