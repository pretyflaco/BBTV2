/**
 * Communities API - List and create communities
 * 
 * GET: List all active communities
 * POST: Create a new community (super-admin only, assigns leader)
 */

import membershipStore from '../../../lib/network/membershipStore';
import consentStore from '../../../lib/network/consentStore';
import transactionStore from '../../../lib/network/transactionStore';

// Pioneer communities data (seeded in database)
const PIONEER_COMMUNITIES = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    name: 'Bitcoin Ekasi',
    slug: 'bitcoin-ekasi',
    description: 'South Africa\'s pioneering Bitcoin circular economy in Mossel Bay. Demonstrating how Bitcoin can transform township economies through merchant adoption, peer-to-peer transactions, and community education.',
    country_code: 'ZA',
    region: 'Western Cape',
    city: 'Mossel Bay',
    latitude: -34.1849,
    longitude: 22.1265,
    leader_npub: 'npub1zkr064avsxmxzaasppamps86ge0npwvft9yu3ymgxmk9umx3xyeq9sk6ec',
    member_count: 1, // Leader only initially
    data_sharing_member_count: 0,
    transaction_count: 0,
    transaction_volume_sats: 0,
    velocity: 0,
    tx_count_growth_percent: 0,
    status: 'active',
    created_at: '2025-12-31T00:00:00Z'
  },
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567002',
    name: 'Bitcoin Victoria Falls',
    slug: 'bitcoin-victoria-falls',
    description: 'Zimbabwe\'s Bitcoin circular economy centered around the majestic Victoria Falls. Building a sustainable Bitcoin ecosystem for tourism and local commerce.',
    country_code: 'ZW',
    region: 'Matabeleland North',
    city: 'Victoria Falls',
    latitude: -17.9243,
    longitude: 25.8572,
    leader_npub: 'npub1xxcyzef28e5qcjncwmn6z2nmwaezs2apxc2v2f7unnvxw3r5edfsactfly',
    member_count: 1, // Leader only initially
    data_sharing_member_count: 0,
    transaction_count: 0,
    transaction_volume_sats: 0,
    velocity: 0,
    tx_count_growth_percent: 0,
    status: 'active',
    created_at: '2025-12-31T00:00:00Z'
  },
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567003',
    name: 'Test Community',
    slug: 'test-community',
    description: 'A test community for exploring the leader dashboard experience. Use this to test membership approvals, data sharing opt-ins, and community metrics.',
    country_code: 'XX',
    region: 'Test Region',
    city: 'Test City',
    latitude: 0,
    longitude: 0,
    leader_npub: 'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6',
    member_count: 1, // Leader only initially
    data_sharing_member_count: 0,
    transaction_count: 0,
    transaction_volume_sats: 0,
    velocity: 0,
    tx_count_growth_percent: 0,
    status: 'active',
    created_at: '2025-12-31T00:00:00Z'
  }
];

// Super admin npub
const SUPER_ADMIN_NPUB = 'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      // TODO: When database is connected, use:
      // const db = require('../../../lib/network/db');
      // const communities = await db.listCommunities();
      
      // Add dynamic member counts and metrics from stores
      const communitiesWithCounts = PIONEER_COMMUNITIES.map(community => {
        // Base count is 1 (the leader)
        const dynamicMemberCount = membershipStore.getMemberCount(community.id);
        const totalMemberCount = 1 + dynamicMemberCount; // Leader + approved members
        
        // Get data sharing count
        const dataSharingCount = consentStore.getConsentCount(community.id);
        
        // Get real metrics from transaction store
        const metrics = transactionStore.getCommunityMetrics(community.id);
        
        return {
          ...community,
          member_count: totalMemberCount,
          data_sharing_member_count: dataSharingCount,
          transaction_count: metrics?.transaction_count || 0,
          transaction_volume_sats: metrics?.total_volume_sats || 0,
          intra_community_count: metrics?.intra_community_count || 0,
          intra_volume_sats: metrics?.intra_volume_sats || 0,
          closed_loop_ratio: metrics?.closed_loop_ratio || 0,
          velocity: metrics?.velocity || 0,
          avg_tx_size: metrics?.avg_tx_size || 0,
          oldest_tx_date: metrics?.oldest_tx_date || null,
          newest_tx_date: metrics?.newest_tx_date || null,
          period_days: metrics?.period_days || 0,
          metrics_last_updated: metrics?.last_updated || null
        };
      });
      
      return res.status(200).json({
        success: true,
        communities: communitiesWithCounts
      });

    } catch (error) {
      console.error('Error fetching communities:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch communities'
      });
    }
  }

  if (req.method === 'POST') {
    // Create community - SUPER ADMIN ONLY
    const userNpub = req.headers['x-user-npub'];
    
    if (!userNpub) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Only super admin can create communities
    if (userNpub !== SUPER_ADMIN_NPUB) {
      return res.status(403).json({
        success: false,
        error: 'Only super admin can create new communities'
      });
    }

    const { name, slug, description, countryCode, region, city, latitude, longitude, leaderNpub } = req.body;

    if (!name || !slug || !leaderNpub) {
      return res.status(400).json({
        success: false,
        error: 'Name, slug, and leader npub are required'
      });
    }

    // TODO: When database is connected:
    // 1. Add leader to whitelist
    // 2. Create community with leader
    // 3. Create leader membership

    return res.status(501).json({
      success: false,
      error: 'Community creation requires database connection. Run migrations first.'
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
