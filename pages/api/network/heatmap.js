/**
 * Heatmap API - Get community data for map visualization
 * 
 * GET: Get all communities with coordinates and activity metrics
 */

import membershipStore from '../../../lib/network/membershipStore';
import consentStore from '../../../lib/network/consentStore';
import { calculateMetricsForPeriod } from '../../../lib/network/transactionStore';

// Community base data with coordinates
const COMMUNITIES = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567001',
    name: 'Bitcoin Ekasi',
    slug: 'bitcoin-ekasi',
    latitude: -34.1849,
    longitude: 22.1265,
    country_code: 'ZA',
    city: 'Mossel Bay',
    region: 'Western Cape'
  },
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567002',
    name: 'Bitcoin Victoria Falls',
    slug: 'bitcoin-victoria-falls',
    latitude: -17.9243,
    longitude: 25.8572,
    country_code: 'ZW',
    city: 'Victoria Falls',
    region: 'Matabeleland North'
  },
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567003',
    name: 'Test Community',
    slug: 'test-community',
    latitude: 40.7128,  // New York coordinates for testing
    longitude: -74.0060,
    country_code: 'US',
    city: 'New York',
    region: 'New York'
  }
];

/**
 * Calculate intensity score based on activity
 * Score from 0-100, used for marker size/color
 */
function calculateIntensity(metrics, memberCount) {
  let score = 0;
  
  // Base score for having members (0-20)
  score += Math.min(memberCount * 2, 20);
  
  // Transaction activity (0-30)
  if (metrics.transaction_count > 0) {
    score += Math.min(Math.log10(metrics.transaction_count) * 10, 30);
  }
  
  // Volume activity (0-30)
  if (metrics.total_volume_sats > 0) {
    score += Math.min(Math.log10(metrics.total_volume_sats) * 5, 30);
  }
  
  // Closed loop bonus (0-20)
  score += metrics.closed_loop_ratio * 0.2;
  
  return Math.round(Math.min(score, 100));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { period = 'current_month' } = req.query;

  try {
    // Build community data with real metrics
    const communities = COMMUNITIES.map(community => {
      // Get member count
      const dynamicMemberCount = membershipStore.getMemberCount(community.id);
      const memberCount = 1 + dynamicMemberCount;
      
      // Get member usernames for metrics
      const consents = consentStore.getCommunityConsents(community.id);
      const memberUsernames = consents.map(c => c.blink_username).filter(Boolean);
      
      // Calculate metrics
      const metrics = calculateMetricsForPeriod(community.id, memberUsernames, period);
      
      // Calculate intensity score
      const intensity = calculateIntensity(metrics, memberCount);
      
      return {
        id: community.id,
        name: community.name,
        slug: community.slug,
        latitude: community.latitude,
        longitude: community.longitude,
        country_code: community.country_code,
        city: community.city,
        region: community.region,
        member_count: memberCount,
        data_sharing_count: consents.length,
        transaction_count: metrics.transaction_count,
        volume_sats: metrics.total_volume_sats,
        closed_loop_ratio: metrics.closed_loop_ratio,
        intensity_score: intensity
      };
    });

    // Calculate bounds to fit all communities
    const lats = communities.map(c => c.latitude);
    const lngs = communities.map(c => c.longitude);
    
    const bounds = {
      north: Math.max(...lats) + 5,
      south: Math.min(...lats) - 5,
      east: Math.max(...lngs) + 5,
      west: Math.min(...lngs) - 5
    };

    return res.status(200).json({
      success: true,
      communities,
      bounds,
      period
    });

  } catch (error) {
    console.error('Error fetching heatmap data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch heatmap data'
    });
  }
}
