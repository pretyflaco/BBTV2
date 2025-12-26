const voucherStore = require('../../../lib/voucher-store');

/**
 * API endpoint to create a new voucher charge
 * 
 * POST /api/voucher/create
 * Body: { amount: number (sats), apiKey: string, walletId: string }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, apiKey, walletId } = req.body;

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

    // Create voucher charge
    const voucher = voucherStore.createVoucher(amountNum, apiKey, walletId);

    console.log('✅ Voucher created successfully:', {
      chargeId: voucher.id,
      amount: voucher.amount,
      timestamp: new Date(voucher.createdAt).toISOString()
    });

    res.status(200).json({
      success: true,
      voucher: {
        id: voucher.id,
        amount: voucher.amount,
        createdAt: voucher.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Voucher creation error:', error);
    
    res.status(500).json({ 
      error: 'Failed to create voucher',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

