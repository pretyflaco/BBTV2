import BlinkAPI from '../../../lib/blink-api';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, userApiKey, userWalletId, memo = '', tipAmount = 0, tipRecipient = null } = req.body;

    // Validate required fields
    if (!amount || !userApiKey || !userWalletId) {
      return res.status(400).json({ 
        error: 'Missing required fields: amount, userApiKey, userWalletId' 
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

    console.log('🔄 Starting payment forwarding process:', {
      amount: numericAmount,
      fromWallet: blinkposBtcWalletId,
      toUserWallet: userWalletId
    });

    // Step 1: Create an invoice from the user's account for the amount
    const userBlinkAPI = new BlinkAPI(userApiKey);
    const forwardingMemo = memo ? `BlinkPOS: ${memo}` : 'BlinkPOS: Payment forwarded';
    
    console.log('💳 Creating invoice from user account...');
    const userInvoice = await userBlinkAPI.createLnInvoice(userWalletId, Math.round(numericAmount), forwardingMemo);
    
    if (!userInvoice || !userInvoice.paymentRequest) {
      throw new Error('Failed to create user invoice for forwarding');
    }

    console.log('📄 User invoice created:', { paymentHash: userInvoice.paymentHash });

    // Step 2: Pay the user's invoice from BlinkPOS account
    const blinkposAPI = new BlinkAPI(blinkposApiKey);
    
    console.log('💰 Paying user invoice from BlinkPOS...');
    const paymentResult = await blinkposAPI.payLnInvoice(blinkposBtcWalletId, userInvoice.paymentRequest);
    
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
          tipRecipient: `${tipRecipient}@blink.sv`
        });

        // Send tip to the tip recipient using LN Address
        const tipPaymentResult = await blinkposAPI.payLnAddress(
          blinkposBtcWalletId,
          `${tipRecipient}@blink.sv`,
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
        forwardedAmount: numericAmount,
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
