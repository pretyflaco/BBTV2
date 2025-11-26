import BlinkAPI from '../../../lib/blink-api';
const { getHybridStore } = require('../../../lib/storage/hybrid-store');
const { formatCurrencyServer } = require('../../../lib/currency-formatter-server');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let hybridStore = null;
  let paymentHash = null;
  let claimSucceeded = false;

  try {
    const { paymentHash: reqPaymentHash, totalAmount, memo = '' } = req.body;
    paymentHash = reqPaymentHash;
    
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

    // CRITICAL FIX: Use atomic claim to prevent duplicate payouts
    // This ensures only ONE request can process this payment
    hybridStore = await getHybridStore();
    const claimResult = await hybridStore.claimPaymentForProcessing(paymentHash);
    
    if (!claimResult.claimed) {
      // Payment already being processed or completed - this is NOT an error
      // Return success to prevent client retries (idempotent behavior)
      console.log(`🔒 DUPLICATE PREVENTION: Payment ${paymentHash?.substring(0, 16)}... ${claimResult.reason}`);
      
      if (claimResult.reason === 'already_completed') {
        // Already successfully processed - return success (idempotent)
        return res.status(200).json({
          success: true,
          message: 'Payment already processed',
          alreadyProcessed: true,
          details: { paymentHash, status: 'completed' }
        });
      } else if (claimResult.reason === 'already_processing') {
        // Another request is processing - client should wait
        return res.status(409).json({
          error: 'Payment is being processed by another request',
          retryable: false,
          details: { paymentHash, status: 'processing' }
        });
      } else {
        // Not found
        const stats = await hybridStore.getStats();
        console.log('📊 Current storage stats:', stats);
        return res.status(400).json({ 
          error: 'No tip data found for this payment',
          paymentHash: paymentHash,
          storageStats: stats
        });
      }
    }

    // Successfully claimed - we are the only process handling this payment
    claimSucceeded = true;
    const tipData = claimResult.paymentData;
    
    console.log(`✅ CLAIMED payment ${paymentHash?.substring(0, 16)}... for processing`);

    // CRITICAL: Validate tip data contains proper user credentials
    if (!tipData.userApiKey || !tipData.userWalletId) {
      console.error('❌ CRITICAL: Tip data missing user credentials:', {
        paymentHash: paymentHash?.substring(0, 16) + '...',
        hasUserApiKey: !!tipData.userApiKey,
        hasUserWalletId: !!tipData.userWalletId,
        userWalletId: tipData.userWalletId,
        timestamp: new Date().toISOString()
      });
      // Release the claim so it can be retried after fixing data
      await hybridStore.releaseFailedClaim(paymentHash, 'Missing user credentials');
      claimSucceeded = false;
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
    } else if (memo && tipData.tipRecipient && tipData.tipAmount === 0) {
      // Tips enabled but customer chose "No Tip" - still show proper memo with recipient info
      forwardingMemo = `BlinkPOS: ${memo} | No tip (recipient: ${tipData.tipRecipient})`;
    } else {
      // Standard payment without tip system or no memo provided
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
    // Ensure tipAmount is a proper number for comparison
    const tipAmountNum = Number(tipData.tipAmount) || 0;
    console.log('🎯 TIP CHECK:', {
      tipAmount: tipData.tipAmount,
      tipAmountNum,
      tipAmountType: typeof tipData.tipAmount,
      tipRecipient: tipData.tipRecipient,
      condition: tipAmountNum > 0 && tipData.tipRecipient
    });
    
    if (tipAmountNum > 0 && tipData.tipRecipient) {
      try {
        console.log('💡 Processing tip payment:', {
          tipAmount: tipData.tipAmount,
          tipRecipient: `${tipData.tipRecipient}@blink.sv`
        });

        // Generate tip memo based on display currency and amounts
        // Uses formatCurrencyServer which handles all currencies properly (including zero-decimal currencies)
        const generateTipMemo = (tipAmountInDisplayCurrency, tipAmountSats, displayCurrency) => {
          if (displayCurrency === 'BTC') {
            return `BlinkPOS Tip received: ${tipAmountSats} sats`;
          } else {
            const formattedAmount = formatCurrencyServer(tipAmountInDisplayCurrency, displayCurrency);
            return `BlinkPOS Tip received: ${formattedAmount} (${tipAmountSats} sats)`;
          }
        };

        // Get tip amounts - use stored display amounts if available
        // Ensure tipAmount is a number (PostgreSQL bigint might come as string)
        const tipAmountSats = Math.round(Number(tipData.tipAmount));
        const displayCurrency = tipData.displayCurrency || 'BTC';
        // Ensure tipAmountInDisplayCurrency is a number (JSONB stores as string)
        const tipAmountInDisplayCurrency = Number(tipData.tipAmountDisplay) || tipAmountSats;
        
        console.log('💡 Tip amount calculation:', {
          rawTipAmount: tipData.tipAmount,
          tipAmountSats,
          displayCurrency,
          tipAmountInDisplayCurrency
        });

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
          // Log successful tip event
          await hybridStore.logEvent(paymentHash, 'tip_sent', 'success', {
            tipAmount: tipData.tipAmount,
            tipRecipient: tipData.tipRecipient,
            paymentHash: tipPaymentResult.paymentHash
          });
        } else {
          console.error('❌ Tip payment failed:', tipPaymentResult.status);
          tipResult = {
            success: false,
            error: `Tip payment failed: ${tipPaymentResult.status}`
          };
          // Log failed tip event
          await hybridStore.logEvent(paymentHash, 'tip_sent', 'failure', {
            tipAmount: tipData.tipAmount,
            tipRecipient: tipData.tipRecipient,
            status: tipPaymentResult.status
          });
        }
      } catch (tipError) {
        console.error('❌ Tip payment error:', tipError);
        tipResult = {
          success: false,
          error: tipError.message
        };
        // Log tip error event
        await hybridStore.logEvent(paymentHash, 'tip_sent', 'failure', {
          tipAmount: tipData.tipAmount,
          tipRecipient: tipData.tipRecipient
        }, tipError.message);
      }
    } else {
      console.log('ℹ️ No tip to process:', {
        tipAmount: tipData.tipAmount,
        tipRecipient: tipData.tipRecipient,
        reason: !tipData.tipAmount ? 'no tip amount' : !tipData.tipRecipient ? 'no tip recipient' : 'unknown'
      });
    }

    // Step 4: Log forwarding event and mark as completed
    // Note: Status was already set to 'processing' by claimPaymentForProcessing()
    await hybridStore.logEvent(paymentHash, 'forwarded', 'success', {
      forwardedAmount: userAmount,
      tipAmount: tipData.tipAmount,
      tipRecipient: tipData.tipRecipient
    });
    
    // Mark as completed (removes from hot storage)
    await hybridStore.removeTipData(paymentHash);
    claimSucceeded = false; // Payment completed, no need to release on error

    console.log(`✅ COMPLETED payment ${paymentHash?.substring(0, 16)}... forwarding`);

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
    
    // CRITICAL: Release the claim if we claimed but failed before completing
    // This allows the payment to be retried
    if (claimSucceeded && hybridStore && paymentHash) {
      console.log(`🔓 Releasing claim for failed payment ${paymentHash?.substring(0, 16)}...`);
      await hybridStore.releaseFailedClaim(paymentHash, error.message);
    }
    
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
      retryable: claimSucceeded, // If we had the claim, it's now released and retryable
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
