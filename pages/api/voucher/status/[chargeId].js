const voucherStore = require('../../../../lib/voucher-store');

/**
 * API endpoint to check voucher status
 * Used for polling to detect when voucher has been redeemed
 * 
 * GET /api/voucher/status/[chargeId]
 */
export default async function handler(req, res) {
  // Add CORS headers for compatibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { chargeId } = req.query;

    if (!chargeId) {
      return res.status(400).json({ 
        error: 'Missing chargeId parameter' 
      });
    }

    // Get voucher from store (this reloads from file)
    const voucher = voucherStore.getVoucher(chargeId);

    if (!voucher) {
      // Voucher not found - might be expired or never existed
      return res.status(200).json({
        found: false,
        status: 'NOT_FOUND',
        claimed: false
      });
    }

    return res.status(200).json({
      found: true,
      status: voucher.claimed ? 'CLAIMED' : 'ACTIVE',
      claimed: voucher.claimed,
      amount: voucher.amount,
      createdAt: voucher.createdAt
    });

  } catch (error) {
    console.error('❌ Voucher status check error:', error);
    
    res.status(500).json({ 
      error: 'Failed to check voucher status',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

