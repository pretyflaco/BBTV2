import BlinkAPI from '../../../lib/blink-api';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, userApiKey, userWalletId, memo = '', tipAmount = 0, tipRecipient = null } = req.body;

    // Validate required fields
    if (!amount || !userApiKey || !userWalletId) {
      console.error('❌ CRITICAL: Missing required fields for payment forwarding:', {
        hasAmount: !!amount,
        hasUserApiKey: !!userApiKey,
        hasUserWalletId: !!userWalletId,
        userWalletId: userWalletId,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({ 
        error: 'Missing required fields: amount, userApiKey, userWalletId' 
      });
    }

    // CRITICAL SECURITY: Validate userWalletId format to prevent injection
    if (typeof userWalletId !== 'string' || userWalletId.length < 10) {
      console.error('❌ CRITICAL: Invalid userWalletId format:', {
        userWalletId,
        type: typeof userWalletId,
        length: userWalletId?.length,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({ 
        error: 'Invalid userWalletId format' 
      });
    }

    // Validate amount
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ 
        error: 'Invalid amount: must be a positive number' 
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

    // Calculate the amount to forward to user (base amount = total - tip)
    // The tip will be sent separately to the tip recipient
    const numericTipAmount = parseFloat(tipAmount) || 0;

    // Validate tip amount doesn't exceed total amount
    if (numericTipAmount >= numericAmount) {
      console.error('Invalid tip amount:', { tipAmount: numericTipAmount, totalAmount: numericAmount });
      return res.status(400).json({
        error: 'Invalid tip amount',
        message: 'Tip amount cannot be equal to or greater than the total payment amount',
        details: { tipAmount: numericTipAmount, totalAmount: numericAmount }
      });
    }

    const userAmount = numericAmount - numericTipAmount;

    console.log('🔄 Starting payment forwarding process:', {
      totalAmount: numericAmount,
      tipAmount: numericTipAmount,
      userAmount: userAmount,
      fromWallet: blinkposBtcWalletId,
      toUserWallet: userWalletId,
      tipRecipient: tipRecipient || 'none',
      userApiKeyPrefix: userApiKey?.substring(0, 10) + '...',
      timestamp: new Date().toISOString(),
      memo: memo
    });

    // Step 1: Create an invoice from the user's account for the BASE amount (not including tip)
    const userBlinkAPI = new BlinkAPI(userApiKey);
    const forwardingMemo = memo ? `BlinkPOS: ${memo}` : 'BlinkPOS: Payment forwarded';
    
    console.log('💳 Creating invoice from user account for base amount...');
    const userInvoice = await userBlinkAPI.createLnInvoice(userWalletId, Math.round(userAmount), forwardingMemo);
    
    if (!userInvoice || !userInvoice.paymentRequest) {
      throw new Error('Failed to create user invoice for forwarding');
    }

    console.log('📄 User invoice created:', { paymentHash: userInvoice.paymentHash });

    // Step 2: Pay the user's invoice from BlinkPOS account
    const blinkposAPI = new BlinkAPI(blinkposApiKey);
    
    console.log('💰 Paying user invoice from BlinkPOS...');
    // Pass the memo to the payment so it shows in the receiver's Blink wallet
    const paymentResult = await blinkposAPI.payLnInvoice(blinkposBtcWalletId, userInvoice.paymentRequest, forwardingMemo);
    
    if (paymentResult.status !== 'SUCCESS') {
      throw new Error(`Payment forwarding failed: ${paymentResult.status}`);
    }

    console.log('✅ Payment successfully forwarded to user account');

    // Handle tip splitting if there's a tip amount and recipient
    let tipResult = null;
    if (tipAmount > 0 && tipRecipient) {
      try {
        console.log('💡 Processing tip payment:', {
          tipAmount,
          tipRecipient: tipRecipient
        });

        // Send tip using invoice creation on behalf of recipient (supports custom memo)
        const tipPaymentResult = await blinkposAPI.sendTipViaInvoice(
          blinkposBtcWalletId,
          tipRecipient,
          Math.round(tipAmount),
          `Tip from BlinkPOS${memo ? ` - ${memo}` : ''}`
        );

        if (tipPaymentResult.status === 'SUCCESS') {
          console.log('💰 Tip successfully sent to recipient');
          tipResult = {
            success: true,
            amount: tipAmount,
            recipient: `${tipRecipient}@blink.sv`,
            status: tipPaymentResult.status
          };
        } else {
          console.error('❌ Tip payment failed:', tipPaymentResult.status);
          tipResult = {
            success: false,
            error: `Tip payment failed: ${tipPaymentResult.status}`
          };
        }
      } catch (tipError) {
        console.error('❌ Tip payment error:', tipError);
        tipResult = {
          success: false,
          error: tipError.message
        };
      }
    }

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Payment successfully forwarded to user account',
      details: {
        totalAmount: numericAmount,
        forwardedAmount: userAmount,
        tipAmount: numericTipAmount,
        userWalletId: userWalletId,
        paymentStatus: paymentResult.status,
        invoiceHash: userInvoice.paymentHash,
        tipResult: tipResult
      }
    });

  } catch (error) {
    console.error('❌ Payment forwarding error:', error);
    
    // Handle specific error cases
    let errorMessage = 'Failed to forward payment';
    if (error.message.includes('invoice')) {
      errorMessage = 'Failed to create invoice for payment forwarding';
    } else if (error.message.includes('payment')) {
      errorMessage = 'Payment forwarding transaction failed';
    } else if (error.message.includes('balance')) {
      errorMessage = 'Insufficient balance in BlinkPOS account';
    }

    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
