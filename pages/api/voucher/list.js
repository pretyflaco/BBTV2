const voucherStore = require('../../../lib/voucher-store');

/**
 * API endpoint to list all vouchers
 * 
 * GET /api/voucher/list
 * Returns all vouchers with status information (ACTIVE, CLAIMED, CANCELLED, EXPIRED)
 * 
 * Query params:
 * - status: Filter by status (optional): 'ACTIVE', 'CLAIMED', 'CANCELLED', 'EXPIRED', 'all'
 *   Default: returns all vouchers
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
    const { status: filterStatus } = req.query;
    const now = Date.now();
    
    // Get all vouchers with status from the store
    const allVouchers = voucherStore.getAllVouchers();
    
    // Format vouchers for response
    let vouchers = allVouchers.map(voucher => {
      // Calculate time remaining for active vouchers
      let timeRemaining = null;
      if (voucher.status === 'ACTIVE' && voucher.expiresAt) {
        timeRemaining = Math.max(0, voucher.expiresAt - now);
      }
      
      return {
        id: voucher.id,
        shortId: voucher.id.substring(0, 8).toUpperCase(),
        amount: voucher.amount,
        claimed: voucher.claimed,
        createdAt: voucher.createdAt,
        claimedAt: voucher.claimedAt,
        expiresAt: voucher.expiresAt,
        expiryId: voucher.expiryId,
        cancelledAt: voucher.cancelledAt,
        displayAmount: voucher.displayAmount,
        displayCurrency: voucher.displayCurrency,
        commissionPercent: voucher.commissionPercent || 0,
        timeRemaining: timeRemaining,
        status: voucher.status
      };
    });
    
    // Filter by status if requested
    if (filterStatus && filterStatus !== 'all') {
      const validStatuses = ['ACTIVE', 'CLAIMED', 'CANCELLED', 'EXPIRED'];
      const normalizedFilter = filterStatus.toUpperCase();
      
      if (validStatuses.includes(normalizedFilter)) {
        vouchers = vouchers.filter(v => v.status === normalizedFilter);
      }
    }
    
    // Calculate summary stats
    const stats = {
      total: allVouchers.length,
      active: allVouchers.filter(v => v.status === 'ACTIVE').length,
      claimed: allVouchers.filter(v => v.status === 'CLAIMED').length,
      cancelled: allVouchers.filter(v => v.status === 'CANCELLED').length,
      expired: allVouchers.filter(v => v.status === 'EXPIRED').length,
      // Count vouchers expiring within 24 hours
      expiringSoon: allVouchers.filter(v => 
        v.status === 'ACTIVE' && 
        v.expiresAt && 
        (v.expiresAt - now) < 24 * 60 * 60 * 1000
      ).length
    };

    return res.status(200).json({
      success: true,
      vouchers: vouchers,
      count: vouchers.length,
      stats: stats
    });

  } catch (error) {
    console.error('❌ Voucher list error:', error);
    
    res.status(500).json({ 
      error: 'Failed to list vouchers',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
