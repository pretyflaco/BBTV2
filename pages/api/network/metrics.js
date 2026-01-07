/**
 * Community Metrics API with Period Filtering
 * 
 * GET: Get metrics for a community with optional period filter
 */

import { calculateMetricsForPeriod, getDateRange, getDataCoverage } from '../../../lib/network/transactionStore';
import consentStore from '../../../lib/network/consentStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { communityId, period = 'current_week' } = req.query;

  if (!communityId) {
    return res.status(400).json({
      success: false,
      error: 'Community ID is required'
    });
  }

  // Validate period
  const validPeriods = ['current_week', 'last_week', 'current_month', 'last_month', 'all'];
  if (!validPeriods.includes(period)) {
    return res.status(400).json({
      success: false,
      error: `Invalid period. Valid options: ${validPeriods.join(', ')}`
    });
  }

  try {
    // Get member usernames for intra-community detection
    const consents = consentStore.getCommunityConsents(communityId);
    const memberUsernames = consents.map(c => c.blink_username).filter(Boolean);

    // Calculate metrics for the period
    const metrics = calculateMetricsForPeriod(communityId, memberUsernames, period);

    // Get data coverage info
    const dataCoverage = getDataCoverage(communityId);
    
    // Get selected period range
    const periodRange = getDateRange(period);
    
    // Check if selected period extends beyond our data coverage
    let coverageWarning = null;
    if (dataCoverage.oldest && dataCoverage.newest) {
      const dataStart = new Date(dataCoverage.oldest).getTime();
      const dataEnd = new Date(dataCoverage.newest).getTime();
      const periodStart = periodRange.start.getTime();
      const periodEnd = periodRange.end.getTime();
      
      // Check if period starts before our oldest data
      if (periodStart < dataStart) {
        coverageWarning = {
          type: 'incomplete',
          message: `Data only available from ${new Date(dataCoverage.oldest).toLocaleDateString()}`,
          data_starts: dataCoverage.oldest,
          period_starts: periodRange.start.toISOString()
        };
      }
      // Check if period ends after our newest data (and period is in the past)
      else if (periodEnd < Date.now() && periodEnd > dataEnd) {
        coverageWarning = {
          type: 'incomplete',
          message: `Data only available until ${new Date(dataCoverage.newest).toLocaleDateString()}`,
          data_ends: dataCoverage.newest,
          period_ends: periodRange.end.toISOString()
        };
      }
    } else if (period !== 'all') {
      coverageWarning = {
        type: 'no_data',
        message: 'No transaction data synced yet'
      };
    }

    // Get available periods info
    const periods = validPeriods.map(p => {
      const range = getDateRange(p);
      return {
        value: p,
        label: range.label,
        start: range.start.toISOString(),
        end: range.end.toISOString()
      };
    });

    return res.status(200).json({
      success: true,
      metrics,
      data_coverage: {
        oldest_transaction: dataCoverage.oldest,
        newest_transaction: dataCoverage.newest,
        total_synced_transactions: dataCoverage.total_transactions
      },
      coverage_warning: coverageWarning,
      available_periods: periods
    });

  } catch (error) {
    console.error('Error calculating metrics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to calculate metrics'
    });
  }
}
