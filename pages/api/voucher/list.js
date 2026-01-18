const voucherStore = require('../../../lib/voucher-store');

/**
 * API endpoint to list all vouchers
 * 
 * GET /api/voucher/list
 * Returns all active vouchers (both claimed and unclaimed)
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
    // Reload from file to get latest data
    voucherStore.loadFromFile();
    
    const now = Date.now();
    const VOUCHER_EXPIRY = 15 * 60 * 1000; // 15 minutes
    
    // Get all vouchers and format them
    const vouchers = [];
    for (const [id, voucher] of voucherStore.vouchers.entries()) {
      const age = now - voucher.createdAt;
      const isExpired = !voucher.claimed && age > VOUCHER_EXPIRY;
      
      // Skip expired unclaimed vouchers
      if (isExpired) continue;
      
      vouchers.push({
        id: id,
        shortId: id.substring(0, 8).toUpperCase(),
        amount: voucher.amount,
        claimed: voucher.claimed,
        createdAt: voucher.createdAt,
        displayAmount: voucher.displayAmount,
        displayCurrency: voucher.displayCurrency,
        commissionPercent: voucher.commissionPercent || 0,
        // Calculate time remaining for unclaimed vouchers
        timeRemaining: !voucher.claimed ? Math.max(0, VOUCHER_EXPIRY - age) : null,
        status: voucher.claimed ? 'CLAIMED' : 'ACTIVE'
      });
    }
    
    // Sort by creation time, newest first
    vouchers.sort((a, b) => b.createdAt - a.createdAt);

    return res.status(200).json({
      success: true,
      vouchers: vouchers,
      count: vouchers.length
    });

  } catch (error) {
    console.error('❌ Voucher list error:', error);
    
    res.status(500).json({ 
      error: 'Failed to list vouchers',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
