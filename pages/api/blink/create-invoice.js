import BlinkAPI from '../../../lib/blink-api';
const { getHybridStore } = require('../../../lib/storage/hybrid-store');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, currency, memo, walletId, apiKey, userWalletId, displayCurrency, baseAmount, tipAmount, tipPercent, tipRecipients = [], baseAmountDisplay, tipAmountDisplay } = req.body;

    console.log('📥 Create invoice request received:', {
      amount,
      currency,
      displayCurrency,
      tipAmount,
      tipRecipients: tipRecipients?.length || 0,
      hasBaseAmountDisplay: !!baseAmountDisplay,
      hasTipAmountDisplay: !!tipAmountDisplay
    });

    // Validate required fields - note we now need both blinkpos credentials and user credentials
    if (!amount || !currency || !apiKey) {
      return res.status(400).json({ 
        error: 'Missing required fields: amount, currency, apiKey' 
      });
    }

    // Get BlinkPOS credentials from environment
    const blinkposApiKey = process.env.BLINKPOS_API_KEY;
    const blinkposBtcWalletId = process.env.BLINKPOS_BTC_WALLET_ID;

    console.log('🔐 BlinkPOS credentials check:', {
      hasApiKey: !!blinkposApiKey,
      apiKeyLength: blinkposApiKey ? blinkposApiKey.length : 0,
      hasWalletId: !!blinkposBtcWalletId,
      walletIdLength: blinkposBtcWalletId ? blinkposBtcWalletId.length : 0
    });

    if (!blinkposApiKey || !blinkposBtcWalletId) {
      console.error('Missing BlinkPOS environment variables');
      return res.status(500).json({ 
        error: 'BlinkPOS configuration missing' 
      });
    }

    // Validate amount
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ 
        error: 'Invalid amount: must be a positive number' 
      });
    }

    console.log('Creating invoice with BlinkPOS credentials:', {
      amount: numericAmount,
      currency,
      blinkposWallet: blinkposBtcWalletId,
      userWallet: userWalletId,
      hasTip: tipAmount > 0,
      tipRecipientsCount: tipRecipients?.length || 0
    });

    // Always use BlinkPOS API and BTC wallet for invoice creation
    const blinkAPI = new BlinkAPI(blinkposApiKey);

    let invoice;
    
    try {
      // Always create BTC invoice from BlinkPOS wallet (even for USD payments)
      if (currency === 'BTC' || currency === 'USD') {
        invoice = await blinkAPI.createLnInvoice(blinkposBtcWalletId, Math.round(numericAmount), memo);
      } else {
        return res.status(400).json({ 
          error: 'Unsupported currency. Only BTC is supported through BlinkPOS.' 
        });
      }

      if (!invoice) {
        throw new Error('Failed to create invoice');
      }

      // Store tip metadata if there's a tip (using hybrid storage)
      if (tipAmount > 0 && tipRecipients && tipRecipients.length > 0) {
        const hybridStore = await getHybridStore();
        await hybridStore.storeTipData(invoice.paymentHash, {
          baseAmount: baseAmount || numericAmount,
          tipAmount: tipAmount,
          tipPercent: tipPercent,
          tipRecipients: tipRecipients, // Array of { username, share }
          userApiKey: apiKey,
          userWalletId: userWalletId || walletId,
          displayCurrency: displayCurrency || 'BTC', // Store display currency for tip memo
          baseAmountDisplay: baseAmountDisplay, // Base amount in display currency
          tipAmountDisplay: tipAmountDisplay, // Tip amount in display currency
          memo: memo
        });
      }

      // Return invoice details with additional metadata for payment forwarding
      res.status(200).json({
        success: true,
        invoice: {
          paymentRequest: invoice.paymentRequest,
          paymentHash: invoice.paymentHash,
          satoshis: invoice.satoshis,
          amount: numericAmount,
          currency: currency,
          memo: memo || '',
          walletId: blinkposBtcWalletId, // This is now the BlinkPOS wallet
          userApiKey: apiKey, // Store user's API key for payment forwarding
          userWalletId: userWalletId || walletId, // Store user's wallet for forwarding
          hasTip: tipAmount > 0,
          tipAmount: tipAmount || 0,
          tipRecipients: tipRecipients || []
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
