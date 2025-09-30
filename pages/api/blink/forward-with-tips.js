import BlinkAPI from '../../../lib/blink-api';
const tipStore = require('../../../lib/tip-store');
const { formatCurrencyServer } = require('../../../lib/currency-formatter-server');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paymentHash, totalAmount, memo = '' } = req.body;
    
    // CRITICAL: Log all tip forwarding attempts for security audit
    console.log('🎯 TIP FORWARDING REQUEST:', {
      paymentHash: paymentHash?.substring(0, 16) + '...',
      totalAmount,
      timestamp: new Date().toISOString(),
      memo: memo?.substring(0, 50) + '...'
    });

    // Validate required fields
    if (!paymentHash || !totalAmount) {
      return res.status(400).json({ 
        error: 'Missing required fields: paymentHash, totalAmount' 
      });
    }

    // Get tip metadata from store
    const tipData = tipStore.getTipData(paymentHash);
    
    if (!tipData) {
      console.log('❌ No tip data found for payment hash:', paymentHash);
      console.log('📊 Current tip store contents:', tipStore.getStats());
      return res.status(400).json({ 
        error: 'No tip data found for this payment',
        paymentHash: paymentHash,
        tipStoreStats: tipStore.getStats()
      });
    }

    // CRITICAL: Validate tip data contains proper user credentials
    if (!tipData.userApiKey || !tipData.userWalletId) {
      console.error('❌ CRITICAL: Tip data missing user credentials:', {
        paymentHash: paymentHash?.substring(0, 16) + '...',
        hasUserApiKey: !!tipData.userApiKey,
        hasUserWalletId: !!tipData.userWalletId,
        userWalletId: tipData.userWalletId,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({ 
        error: 'Invalid tip data: missing user credentials' 
      });
    }

    // CRITICAL: Log the user wallet being used for payment forwarding
    console.log('🔍 TIP FORWARDING USER CONTEXT:', {
      paymentHash: paymentHash?.substring(0, 16) + '...',
      userWalletId: tipData.userWalletId,
      apiKeyPrefix: tipData.userApiKey?.substring(0, 10) + '...',
      tipAmount: tipData.tipAmount,
      tipRecipient: tipData.tipRecipient,
      timestamp: new Date().toISOString()
    });

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
    
    // Enhanced memo with tip information
    let forwardingMemo;
    if (memo && tipData.tipAmount > 0 && tipData.tipRecipient) {
      // Extract the base amount and tip details for enhanced memo
      const displayCurrency = tipData.displayCurrency || 'BTC';
      const tipAmountDisplay = tipData.tipAmountDisplay || tipData.tipAmount;
      
      let tipAmountText;
      if (displayCurrency === 'BTC') {
        tipAmountText = `${tipData.tipAmount} sat`;
      } else {
        // Format the amount with dynamic currency formatting
        const formattedAmount = formatCurrencyServer(tipAmountDisplay, displayCurrency);
        tipAmountText = `${formattedAmount} (${tipData.tipAmount} sat)`;
      }
      
      // Convert original memo format to enhanced format
      // From: "$0.80 + 10% tip = $0.88 (757 sats)" 
      // To: "BlinkPOS: $0.80 + 10% tip = $0.88 (757 sats) | $0.08 (69 sat) tip received to username"
      const enhancedMemo = memo.replace(
        /([^+]+?)\s*\+\s*(\d+)%\s*tip\s*=\s*(.+)/,
        (match, baseAmount, tipPercent, total) => {
          // Clean up baseAmount - remove extra spaces and ensure proper formatting
          const cleanBaseAmount = baseAmount.trim();
          return `${cleanBaseAmount} + ${tipPercent}% tip = ${total} | ${tipAmountText} tip received to ${tipData.tipRecipient}`;
        }
      );
      
      forwardingMemo = `BlinkPOS: ${enhancedMemo !== memo ? enhancedMemo : memo}`;
    } else {
      forwardingMemo = memo ? `BlinkPOS: ${memo}` : 'BlinkPOS: Payment forwarded';
    }
    
    console.log('📝 Enhanced forwarding memo:', {
      originalMemo: memo,
      enhancedMemo: forwardingMemo,
      tipAmount: tipData.tipAmount,
      tipRecipient: tipData.tipRecipient
    });
    
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

        // Generate tip memo based on display currency and amounts
        const generateTipMemo = (tipAmountInDisplayCurrency, tipAmountSats, displayCurrency) => {
          if (displayCurrency === 'BTC') {
            return `BlinkPOS Tip received: ${tipAmountSats} sats`;
          } else {
            // Format the amount based on currency
            let formattedAmount;
            if (displayCurrency === 'USD') {
              formattedAmount = `$${tipAmountInDisplayCurrency.toFixed(2)}`;
            } else if (displayCurrency === 'KES') {
              formattedAmount = `${tipAmountInDisplayCurrency.toFixed(2)} Ksh`;
            } else {
              formattedAmount = `${tipAmountInDisplayCurrency.toFixed(2)} ${displayCurrency}`;
            }
            
            return `BlinkPOS Tip received: ${formattedAmount} (${tipAmountSats} sats)`;
          }
        };

        // Get tip amounts - use stored display amounts if available
        const tipAmountSats = Math.round(tipData.tipAmount);
        const displayCurrency = tipData.displayCurrency || 'BTC';
        const tipAmountInDisplayCurrency = tipData.tipAmountDisplay || tipAmountSats;

        const tipMemo = generateTipMemo(tipAmountInDisplayCurrency, tipAmountSats, displayCurrency);

        console.log('💡 Tip memo generated:', {
          displayCurrency,
          tipAmountInDisplayCurrency,
          tipAmountSats,
          tipMemo
        });

        // Send tip using invoice creation on behalf of recipient (supports custom memo)
        const tipPaymentResult = await blinkposAPI.sendTipViaInvoice(
          blinkposBtcWalletId,
          tipData.tipRecipient,
          tipAmountSats,
          tipMemo
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
