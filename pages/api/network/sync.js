/**
 * Transaction Sync API
 * 
 * POST: Trigger sync for a community or all communities
 * GET: Get sync status and metrics
 */

import { syncCommunityTransactions, syncAllCommunities } from '../../../lib/network/syncService';
import transactionStore from '../../../lib/network/transactionStore';
import consentStore from '../../../lib/network/consentStore';

// Super admin npub (only super admin and leaders can trigger sync)
const SUPER_ADMIN_NPUB = 'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6';

// Leader mappings
const COMMUNITY_LEADERS = {
  'a1b2c3d4-e5f6-7890-abcd-ef1234567001': 'npub1zkr064avsxmxzaasppamps86ge0npwvft9yu3ymgxmk9umx3xyeq9sk6ec',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567002': 'npub1xxcyzef28e5qcjncwmn6z2nmwaezs2apxc2v2f7unnvxw3r5edfsactfly',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567003': 'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6',
};

function canTriggerSync(userNpub, communityId) {
  // Super admin can sync anything
  if (userNpub === SUPER_ADMIN_NPUB) return true;
  
  // Leaders can sync their own community
  if (communityId && COMMUNITY_LEADERS[communityId] === userNpub) return true;
  
  return false;
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
        // Get metrics for specific community
        const metrics = transactionStore.getCommunityMetrics(communityId);
        const consentCount = consentStore.getConsentCount(communityId);
        
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
        // Get metrics for all communities
        const allMetrics = transactionStore.getAllMetrics();
        const metricsArray = [];
        
        for (const [id, metrics] of allMetrics) {
          metricsArray.push({
            community_id: id,
            ...metrics
          });
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
        if (userNpub !== SUPER_ADMIN_NPUB) {
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
        if (!canTriggerSync(userNpub, communityId)) {
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
