import BlinkAPI from '../../../lib/blink-api';

/**
 * API endpoint to pay a lightning invoice from BlinkPOS account
 * Used for forwarding payments to NWC wallets
 * 
 * POST /api/blink/pay-invoice
 * Body: { invoice: string, memo?: string }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { invoice, memo = '' } = req.body;

    // Validate required fields
    if (!invoice) {
      console.error('❌ Missing invoice for payment');
      return res.status(400).json({ 
        error: 'Missing required field: invoice' 
      });
    }

    // Basic invoice validation (should start with lnbc)
    if (!invoice.toLowerCase().startsWith('lnbc')) {
      console.error('❌ Invalid invoice format');
      return res.status(400).json({ 
        error: 'Invalid invoice format' 
      });
    }

    // Get BlinkPOS credentials from environment
    const blinkposApiKey = process.env.BLINKPOS_API_KEY;
    const blinkposBtcWalletId = process.env.BLINKPOS_BTC_WALLET_ID;

    if (!blinkposApiKey || !blinkposBtcWalletId) {
      console.error('Missing BlinkPOS environment variables');
      return res.status(500).json({ 
        error: 'BlinkPOS configuration missing' 
      });
    }

    console.log('⚡ Paying invoice from BlinkPOS:', {
      invoicePrefix: invoice.substring(0, 50) + '...',
      memo: memo || 'NWC forwarding',
      timestamp: new Date().toISOString()
    });

    // Pay the invoice from BlinkPOS account
    // Pass memo for better transaction history visibility
    const blinkposAPI = new BlinkAPI(blinkposApiKey);
    
    const paymentResult = await blinkposAPI.payLnInvoice(blinkposBtcWalletId, invoice, memo || 'BlinkPOS: Payment forwarded');
    
    if (paymentResult.status !== 'SUCCESS') {
      throw new Error(`Payment failed: ${paymentResult.status}`);
    }

    console.log('✅ Invoice paid successfully from BlinkPOS');

    res.status(200).json({
      success: true,
      message: 'Invoice paid successfully',
      details: {
        status: paymentResult.status,
        preimage: paymentResult.preimage
      }
    });

  } catch (error) {
    console.error('❌ Pay invoice error:', error);
    
    let errorMessage = 'Failed to pay invoice';
    if (error.message.includes('balance')) {
      errorMessage = 'Insufficient balance in BlinkPOS account';
    } else if (error.message.includes('expired')) {
      errorMessage = 'Invoice has expired';
    } else if (error.message.includes('already paid')) {
      errorMessage = 'Invoice has already been paid';
    }

    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

