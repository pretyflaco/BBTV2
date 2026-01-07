/**
 * Leaderboard API - Get community rankings
 * 
 * GET: Get the leaderboard of communities by various metrics
 * Query params:
 *   - sortBy: 'volume' | 'transactions' | 'members' | 'closed_loop' (default: 'volume')
 *   - period: 'current_week' | 'last_week' | 'current_month' | 'last_month' | 'all' (default: 'current_month')
 */

import membershipStore from '../../../lib/network/membershipStore';
import consentStore from '../../../lib/network/consentStore';
import { calculateMetricsForPeriod, getDateRange } from '../../../lib/network/transactionStore';

// Pioneer communities base data
const COMMUNITIES = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    name: 'Bitcoin Ekasi',
    slug: 'bitcoin-ekasi',
    country_code: 'ZA',
    city: 'Mossel Bay',
    leader_npub: 'npub1zkr064avsxmxzaasppamps86ge0npwvft9yu3ymgxmk9umx3xyeq9sk6ec'
  },
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567002',
    name: 'Bitcoin Victoria Falls',
    slug: 'bitcoin-victoria-falls',
    country_code: 'ZW',
    city: 'Victoria Falls',
    leader_npub: 'npub1xxcyzef28e5qcjncwmn6z2nmwaezs2apxc2v2f7unnvxw3r5edfsactfly'
  },
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567003',
    name: 'Test Community',
    slug: 'test-community',
    country_code: 'XX',
    city: 'Test City',
    leader_npub: 'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6'
  }
];

// Milestone definitions
const MILESTONES = {
  members: [
    { threshold: 10, badge: '🌱', label: '10 Members' },
    { threshold: 50, badge: '🌿', label: '50 Members' },
    { threshold: 100, badge: '🌳', label: '100 Members' },
    { threshold: 500, badge: '🏆', label: '500 Members' },
  ],
  transactions: [
    { threshold: 100, badge: '⚡', label: '100 Transactions' },
    { threshold: 1000, badge: '⚡⚡', label: '1K Transactions' },
    { threshold: 10000, badge: '⚡⚡⚡', label: '10K Transactions' },
  ],
  volume: [
    { threshold: 100000, badge: '💰', label: '100K sats' },
    { threshold: 1000000, badge: '💰💰', label: '1M sats' },
    { threshold: 10000000, badge: '💰💰💰', label: '10M sats' },
    { threshold: 100000000, badge: '₿', label: '1 BTC' },
  ],
  closed_loop: [
    { threshold: 10, badge: '🔄', label: '10% Closed Loop' },
    { threshold: 25, badge: '🔄🔄', label: '25% Closed Loop' },
    { threshold: 50, badge: '♻️', label: '50% Closed Loop' },
  ]
};

function getMilestones(community) {
  const badges = [];
  
  // Check member milestones
  for (const m of MILESTONES.members) {
    if (community.member_count >= m.threshold) {
      badges.push({ type: 'members', ...m });
    }
  }
  
  // Check transaction milestones
  for (const m of MILESTONES.transactions) {
    if (community.transaction_count >= m.threshold) {
      badges.push({ type: 'transactions', ...m });
    }
  }
  
  // Check volume milestones
  for (const m of MILESTONES.volume) {
    if (community.transaction_volume_sats >= m.threshold) {
      badges.push({ type: 'volume', ...m });
    }
  }
  
  // Check closed loop milestones
  for (const m of MILESTONES.closed_loop) {
    if (community.closed_loop_ratio >= m.threshold) {
      badges.push({ type: 'closed_loop', ...m });
    }
  }
  
  return badges;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sortBy = 'volume', period = 'current_month' } = req.query;

  try {
    // Build leaderboard with real metrics
    const leaderboard = COMMUNITIES.map(community => {
      // Get member count
      const dynamicMemberCount = membershipStore.getMemberCount(community.id);
      const memberCount = 1 + dynamicMemberCount; // Leader + members
      
      // Get data sharing count
      const dataSharingCount = consentStore.getConsentCount(community.id);
      
      // Get member usernames for metrics calculation
      const consents = consentStore.getCommunityConsents(community.id);
      const memberUsernames = consents.map(c => c.blink_username).filter(Boolean);
      
      // Calculate metrics for the period
      const metrics = calculateMetricsForPeriod(community.id, memberUsernames, period);
      
      return {
        id: community.id,
        name: community.name,
        slug: community.slug,
        country_code: community.country_code,
        city: community.city,
        member_count: memberCount,
        data_sharing_count: dataSharingCount,
        transaction_count: metrics.transaction_count,
        transaction_volume_sats: metrics.total_volume_sats,
        intra_community_count: metrics.intra_community_count,
        closed_loop_ratio: metrics.closed_loop_ratio,
        velocity: metrics.velocity,
        avg_tx_size: metrics.avg_tx_size
      };
    });
    
    // Add ranks and milestones
    leaderboard.forEach(c => {
      c.milestones = getMilestones(c);
    });
    
    // Sort based on sortBy parameter
    const sortFunctions = {
      volume: (a, b) => b.transaction_volume_sats - a.transaction_volume_sats,
      transactions: (a, b) => b.transaction_count - a.transaction_count,
      members: (a, b) => b.member_count - a.member_count,
      closed_loop: (a, b) => b.closed_loop_ratio - a.closed_loop_ratio
    };
    
    const sortFn = sortFunctions[sortBy] || sortFunctions.volume;
    leaderboard.sort(sortFn);
    
    // Add rank
    leaderboard.forEach((c, index) => {
      c.rank = index + 1;
    });
    
    // Get period info
    const periodRange = getDateRange(period);

    return res.status(200).json({
      success: true,
      leaderboard,
      period: {
        value: period,
        label: periodRange.label,
        start: periodRange.start.toISOString(),
        end: periodRange.end.toISOString()
      },
      sortBy,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard'
    });
  }
}
