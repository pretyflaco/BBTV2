import BlinkAPI from '../../../lib/blink-api';
const tipStore = require('../../../lib/tip-store');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paymentHash, totalAmount, memo = '' } = req.body;

    // Validate required fields
    if (!paymentHash || !totalAmount) {
      return res.status(400).json({ 
        error: 'Missing required fields: paymentHash, totalAmount' 
      });
    }

    // Get tip metadata from store
    const tipData = tipStore.getTipData(paymentHash);
    
    if (!tipData) {
      console.log('⚠️ No tip data found for payment hash:', paymentHash);
      console.log('📊 Current tip store contents:', tipStore.getStats());
      return res.status(400).json({ 
        error: 'No tip data found for this payment',
        paymentHash: paymentHash,
        tipStoreStats: tipStore.getStats()
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

    console.log('🎯 Processing payment with tip splitting:', {
      paymentHash: paymentHash.substring(0, 8) + '...',
      totalAmount,
      baseAmount: tipData.baseAmount,
      tipAmount: tipData.tipAmount,
      tipRecipient: tipData.tipRecipient
    });

    // Calculate the amount to forward to user (total - tip)
    const userAmount = totalAmount - (tipData.tipAmount || 0);

    // Step 1: Forward base amount to user
    const userBlinkAPI = new BlinkAPI(tipData.userApiKey);
    const forwardingMemo = memo ? `BlinkPOS: ${memo}` : 'BlinkPOS: Payment forwarded';
    
    console.log('💳 Creating invoice from user account for base amount...');
    const userInvoice = await userBlinkAPI.createLnInvoice(
      tipData.userWalletId, 
      Math.round(userAmount), 
      forwardingMemo
    );
    
    if (!userInvoice || !userInvoice.paymentRequest) {
      throw new Error('Failed to create user invoice for forwarding');
    }

    console.log('📄 User invoice created:', { paymentHash: userInvoice.paymentHash });

    // Step 2: Pay the user's invoice from BlinkPOS
    const blinkposAPI = new BlinkAPI(blinkposApiKey);
    
    console.log('💰 Paying user invoice from BlinkPOS...');
    const paymentResult = await blinkposAPI.payLnInvoice(blinkposBtcWalletId, userInvoice.paymentRequest);
    
    if (paymentResult.status !== 'SUCCESS') {
      throw new Error(`Payment forwarding failed: ${paymentResult.status}`);
    }

    console.log('✅ Base amount successfully forwarded to user account');

    // Step 3: Send tip to tip recipient if there's a tip
    let tipResult = null;
    if (tipData.tipAmount > 0 && tipData.tipRecipient) {
      try {
        console.log('💡 Processing tip payment:', {
          tipAmount: tipData.tipAmount,
          tipRecipient: `${tipData.tipRecipient}@blink.sv`
        });

        // Send tip to the tip recipient using LN Address
        const tipPaymentResult = await blinkposAPI.payLnAddress(
          blinkposBtcWalletId,
          `${tipData.tipRecipient}@blink.sv`,
          Math.round(tipData.tipAmount),
          `Tip from BlinkPOS${memo ? ` - ${memo}` : ''}`
        );

        if (tipPaymentResult.status === 'SUCCESS') {
          console.log('💰 Tip successfully sent to recipient');
          tipResult = {
            success: true,
            amount: tipData.tipAmount,
            recipient: `${tipData.tipRecipient}@blink.sv`,
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

    // Step 4: Clean up tip data
    tipStore.removeTipData(paymentHash);

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Payment successfully processed with tip splitting',
      details: {
        paymentHash,
        totalAmount,
        forwardedAmount: userAmount,
        userWalletId: tipData.userWalletId,
        paymentStatus: paymentResult.status,
        invoiceHash: userInvoice.paymentHash,
        tipResult: tipResult,
        tipSplitting: {
          baseAmount: tipData.baseAmount,
          tipAmount: tipData.tipAmount,
          tipPercent: tipData.tipPercent,
          tipRecipient: tipData.tipRecipient
        }
      }
    });

  } catch (error) {
    console.error('❌ Payment forwarding with tips error:', error);
    
    // Handle specific error cases
    let errorMessage = 'Failed to forward payment with tips';
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
