import BlinkAPI from '../../../lib/blink-api';
const { getHybridStore } = require('../../../lib/storage/hybrid-store');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      amount, currency, memo, walletId, apiKey, userWalletId, displayCurrency, 
      baseAmount, tipAmount, tipPercent, tipRecipients = [], baseAmountDisplay, tipAmountDisplay, 
      nwcActive, 
      // Blink Lightning Address wallet fields (no API key required)
      blinkLnAddress, blinkLnAddressWalletId, blinkLnAddressUsername
    } = req.body;

    console.log('📥 Create invoice request received:', {
      amount,
      currency,
      displayCurrency,
      tipAmount,
      tipRecipients: tipRecipients?.length || 0,
      hasBaseAmountDisplay: !!baseAmountDisplay,
      hasTipAmountDisplay: !!tipAmountDisplay,
      nwcActive: !!nwcActive,
      hasApiKey: !!apiKey,
      blinkLnAddress: !!blinkLnAddress,
      blinkLnAddressUsername
    });

    // Validate required fields
    // For NWC-only or LN Address users, apiKey is not required
    if (!amount || !currency) {
      return res.status(400).json({ 
        error: 'Missing required fields: amount, currency' 
      });
    }
    
    // Either apiKey (for Blink API forwarding) OR nwcActive (for NWC forwarding) OR blinkLnAddress (for LN Address forwarding) must be present
    if (!apiKey && !nwcActive && !blinkLnAddress) {
      return res.status(400).json({ 
        error: 'Missing payment forwarding: either apiKey, nwcActive, or blinkLnAddress required' 
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
      tipRecipientsCount: tipRecipients?.length || 0,
      blinkLnAddress: !!blinkLnAddress,
      blinkLnAddressUsername
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

      // Store payment metadata (using hybrid storage)
      // For NWC-only or LN Address users, apiKey/userWalletId may be empty
      // Store for ALL NWC payments (even without tips) so forwarding can work
      const shouldStorePaymentData = (tipAmount > 0 && tipRecipients && tipRecipients.length > 0) || nwcActive;
      
      if (shouldStorePaymentData) {
        const hybridStore = await getHybridStore();
        await hybridStore.storeTipData(invoice.paymentHash, {
          baseAmount: baseAmount || numericAmount,
          tipAmount: tipAmount || 0,
          tipPercent: tipPercent || 0,
          tipRecipients: tipRecipients || [], // Array of { username, share }
          userApiKey: apiKey || null, // May be null for NWC-only or LN Address users
          userWalletId: userWalletId || walletId || null, // May be null for NWC-only or LN Address users
          displayCurrency: displayCurrency || 'BTC', // Store display currency for tip memo
          baseAmountDisplay: baseAmountDisplay, // Base amount in display currency
          tipAmountDisplay: tipAmountDisplay, // Tip amount in display currency
          memo: memo,
          nwcActive: !!nwcActive, // Flag for NWC forwarding
          // Lightning Address wallet info
          blinkLnAddress: !!blinkLnAddress,
          blinkLnAddressWalletId: blinkLnAddressWalletId || null,
          blinkLnAddressUsername: blinkLnAddressUsername || null
        });
        console.log(`✅ Stored payment data for ${invoice.paymentHash?.substring(0, 16)}... (nwcActive: ${!!nwcActive}, hasTip: ${tipAmount > 0})`);
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
          userApiKey: apiKey || null, // May be null for NWC-only or LN Address users
          userWalletId: userWalletId || walletId || null, // May be null for NWC-only or LN Address users
          hasTip: tipAmount > 0,
          tipAmount: tipAmount || 0,
          tipRecipients: tipRecipients || [],
          nwcActive: !!nwcActive, // Flag for NWC forwarding
          // Lightning Address wallet info
          blinkLnAddress: !!blinkLnAddress,
          blinkLnAddressWalletId: blinkLnAddressWalletId || null,
          blinkLnAddressUsername: blinkLnAddressUsername || null
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
