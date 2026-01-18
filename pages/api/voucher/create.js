const voucherStore = require('../../../lib/voucher-store');
const { isValidExpiryId, DEFAULT_EXPIRY_ID } = require('../../../lib/voucher-expiry');

/**
 * API endpoint to create a new voucher charge
 * 
 * POST /api/voucher/create
 * Body: { 
 *   amount: number (sats), 
 *   apiKey: string, 
 *   walletId: string,
 *   expiryId: string (optional, e.g., '6mo', '24h', '15m'),
 *   commissionPercent: number (optional),
 *   displayAmount: string (optional),
 *   displayCurrency: string (optional)
 * }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      amount, 
      apiKey, 
      walletId, 
      expiryId,
      commissionPercent, 
      displayAmount, 
      displayCurrency 
    } = req.body;

    // Validate required fields
    if (!amount || !apiKey || !walletId) {
      console.error('❌ Missing required fields for voucher creation');
      return res.status(400).json({ 
        error: 'Missing required fields: amount, apiKey, walletId' 
      });
    }

    // Validate amount
    const amountNum = parseInt(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      console.error('❌ Invalid amount for voucher:', amount);
      return res.status(400).json({ 
        error: 'Amount must be a positive number' 
      });
    }

    // Validate expiryId if provided
    const validExpiryId = expiryId && isValidExpiryId(expiryId) ? expiryId : DEFAULT_EXPIRY_ID;

    // Create voucher charge with optional commission, expiry, and display info (async)
    const voucher = await voucherStore.createVoucher(amountNum, apiKey, walletId, {
      expiryId: validExpiryId,
      commissionPercent: commissionPercent || 0,
      displayAmount: displayAmount || null,
      displayCurrency: displayCurrency || null
    });

    console.log('✅ Voucher created successfully:', {
      chargeId: voucher.id,
      amount: voucher.amount,
      expiryId: voucher.expiryId,
      expiresAt: new Date(voucher.expiresAt).toISOString(),
      commissionPercent: voucher.commissionPercent,
      displayAmount: voucher.displayAmount,
      displayCurrency: voucher.displayCurrency,
      timestamp: new Date(voucher.createdAt).toISOString()
    });

    res.status(200).json({
      success: true,
      voucher: {
        id: voucher.id,
        amount: voucher.amount,
        createdAt: voucher.createdAt,
        expiresAt: voucher.expiresAt,
        expiryId: voucher.expiryId
      }
    });

  } catch (error) {
    console.error('❌ Voucher creation error:', error);
    
    // Check for wallet limit error
    if (error.message && error.message.includes('Maximum unclaimed vouchers')) {
      return res.status(400).json({ 
        error: error.message
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create voucher',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
