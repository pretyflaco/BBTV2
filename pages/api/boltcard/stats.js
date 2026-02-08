const boltcard = require('../../../lib/boltcard');

/**
 * API endpoint for Boltcard statistics
 * 
 * GET /api/boltcard/stats
 * 
 * Returns aggregate statistics about all boltcards
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await boltcard.store.getStats();

    // Get pending top-ups count
    const pendingTopUps = boltcard.lnurlp.getAllPendingTopUps();

    res.status(200).json({
      success: true,
      stats: {
        ...stats,
        pendingTopUps: pendingTopUps.length,
      },
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('❌ Boltcard stats error:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
