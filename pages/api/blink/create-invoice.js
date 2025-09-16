import BlinkAPI from '../../../lib/blink-api';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, currency, memo, walletId, apiKey } = req.body;

    // Validate required fields
    if (!amount || !currency || !walletId || !apiKey) {
      return res.status(400).json({ 
        error: 'Missing required fields: amount, currency, walletId, apiKey' 
      });
    }

    // Validate amount
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ 
        error: 'Invalid amount: must be a positive number' 
      });
    }

    const blinkAPI = new BlinkAPI(apiKey);

    let invoice;
    let finalAmount;

    try {
      if (currency === 'BTC') {
        // For BTC, amount should be in satoshis
        finalAmount = Math.round(numericAmount);
        invoice = await blinkAPI.createLnInvoice(walletId, finalAmount, memo);
      } else if (currency === 'USD') {
        // For USD, amount should be in cents
        finalAmount = Math.round(numericAmount * 100);
        invoice = await blinkAPI.createLnUsdInvoice(walletId, finalAmount, memo);
      } else {
        return res.status(400).json({ 
          error: 'Unsupported currency. Only BTC and USD are supported.' 
        });
      }

      if (!invoice) {
        throw new Error('Failed to create invoice');
      }

      // Return invoice details
      res.status(200).json({
        success: true,
        invoice: {
          paymentRequest: invoice.paymentRequest,
          paymentHash: invoice.paymentHash,
          satoshis: invoice.satoshis,
          amount: numericAmount,
          currency: currency,
          memo: memo || '',
          walletId: walletId
        }
      });

    } catch (blinkError) {
      console.error('Blink API error:', blinkError);
      
      // Handle specific Blink API errors
      let errorMessage = 'Failed to create invoice';
      if (blinkError.message.includes('amount')) {
        errorMessage = 'Invalid amount for invoice creation';
      } else if (blinkError.message.includes('wallet')) {
        errorMessage = 'Invalid wallet selected';
      } else if (blinkError.message.includes('balance')) {
        errorMessage = 'Insufficient balance or wallet issue';
      }

      return res.status(400).json({ 
        error: errorMessage,
        details: blinkError.message 
      });
    }

  } catch (error) {
    console.error('Invoice creation error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
