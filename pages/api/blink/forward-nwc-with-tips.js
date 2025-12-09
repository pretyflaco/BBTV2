import BlinkAPI from '../../../lib/blink-api';
const { getHybridStore } = require('../../../lib/storage/hybrid-store');
const { formatCurrencyServer } = require('../../../lib/currency-formatter-server');

/**
 * API endpoint for NWC tip-aware forwarding
 * 
 * This endpoint:
 * 1. Looks up tip data for the payment
 * 2. If deferTips=true: Returns tip data WITHOUT sending tips (for correct chronology)
 * 3. If deferTips=false (default): Sends tips to recipients, then returns base amount info
 * 
 * Correct NWC forwarding chronology (matches Blink):
 * 1. Call this endpoint with deferTips=true to get baseAmount and memo
 * 2. Forward baseAmount to NWC wallet FIRST
 * 3. Call /api/blink/send-nwc-tips to send tips SECOND
 * 
 * POST /api/blink/forward-nwc-with-tips
 * Body: { paymentHash: string, totalAmount: number, memo?: string, deferTips?: boolean }
 * 
 * Returns: { success: true, baseAmount: number, tipAmount: number, enhancedMemo: string, tipData?: object }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let hybridStore = null;
  let paymentHash = null;
  let claimSucceeded = false;

  try {
    const { paymentHash: reqPaymentHash, totalAmount, memo = '', deferTips = false } = req.body;
    paymentHash = reqPaymentHash;
    
    console.log('🎯 NWC TIP FORWARDING REQUEST:', {
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

    // Try to claim the payment for processing
    hybridStore = await getHybridStore();
    const claimResult = await hybridStore.claimPaymentForProcessing(paymentHash);
    
    if (!claimResult.claimed) {
      // No tip data found - this is expected for payments without tips
      console.log(`ℹ️ No tip data for NWC payment: ${paymentHash?.substring(0, 16)}... - ${claimResult.reason}`);
      
      if (claimResult.reason === 'already_completed') {
        return res.status(200).json({
          success: true,
          baseAmount: totalAmount,
          tipAmount: 0,
          enhancedMemo: memo ? `BlinkPOS: ${memo}` : `BlinkPOS: ${totalAmount} sats`,
          alreadyProcessed: true
        });
      }
      
      // No tip data - return full amount for NWC forwarding
      return res.status(404).json({ 
        error: 'No tip data found',
        reason: claimResult.reason
      });
    }

    claimSucceeded = true;
    const tipData = claimResult.paymentData;
    
    console.log(`✅ CLAIMED payment ${paymentHash?.substring(0, 16)}... for NWC tip processing`);

    // Support both old single tipRecipient and new tipRecipients array
    const tipRecipients = tipData.tipRecipients || (tipData.tipRecipient ? [{ username: tipData.tipRecipient, share: 100 }] : []);
    
    console.log('🔍 NWC TIP FORWARDING CONTEXT:', {
      paymentHash: paymentHash?.substring(0, 16) + '...',
      tipAmount: tipData.tipAmount,
      tipRecipientsCount: tipRecipients.length,
      tipRecipients: tipRecipients.map(r => r.username),
      timestamp: new Date().toISOString()
    });

    // Get BlinkPOS credentials from environment
    const blinkposApiKey = process.env.BLINKPOS_API_KEY;
    const blinkposBtcWalletId = process.env.BLINKPOS_BTC_WALLET_ID;

    if (!blinkposApiKey || !blinkposBtcWalletId) {
      console.error('Missing BlinkPOS environment variables');
      await hybridStore.releaseFailedClaim(paymentHash, 'Missing BlinkPOS config');
      claimSucceeded = false;
      return res.status(500).json({ error: 'BlinkPOS configuration missing' });
    }

    // Calculate base amount (total - tip)
    const tipAmountNum = Number(tipData.tipAmount) || 0;
    const baseAmount = totalAmount - tipAmountNum;

    // Generate enhanced memo
    let enhancedMemo;
    const recipientNames = tipRecipients.map(r => r.username).join(', ');
    
    if (memo && tipAmountNum > 0 && tipRecipients.length > 0) {
      const displayCurrency = tipData.displayCurrency || 'BTC';
      const tipAmountDisplay = tipData.tipAmountDisplay || tipAmountNum;
      
      let tipAmountText;
      if (displayCurrency === 'BTC') {
        tipAmountText = `${tipAmountNum} sat`;
      } else {
        const formattedAmount = formatCurrencyServer(tipAmountDisplay, displayCurrency);
        tipAmountText = `${formattedAmount} (${tipAmountNum} sat)`;
      }
      
      // Convert memo to enhanced format with tip info
      const enhancedMemoContent = memo.replace(
        /([^+]+?)\s*\+\s*(\d+)%\s*tip\s*=\s*(.+)/,
        (match, baseAmountStr, tipPercent, total) => {
          const cleanBaseAmount = baseAmountStr.trim();
          const splitText = tipRecipients.length > 1 ? 'split to' : 'to';
          return `${cleanBaseAmount} + ${tipPercent}% tip = ${total} | ${tipAmountText} tip ${splitText} ${recipientNames}`;
        }
      );
      
      enhancedMemo = `BlinkPOS: ${enhancedMemoContent !== memo ? enhancedMemoContent : memo}`;
    } else if (memo && tipRecipients.length > 0 && tipAmountNum === 0) {
      enhancedMemo = `BlinkPOS: ${memo} | No tip (recipients: ${recipientNames})`;
    } else {
      enhancedMemo = memo ? `BlinkPOS: ${memo}` : `BlinkPOS: ${totalAmount} sats`;
    }

    console.log('📝 Enhanced NWC memo:', {
      originalMemo: memo,
      enhancedMemo,
      baseAmount,
      tipAmount: tipAmountNum,
      deferTips
    });

    // If deferTips=true, return tip data without sending tips
    // This allows the caller to forward base amount FIRST, then send tips SECOND
    if (deferTips && tipAmountNum > 0 && tipRecipients.length > 0) {
      console.log('⏸️ Deferring tip sending (deferTips=true) - base amount will be forwarded first');
      
      // DON'T mark as completed yet - tips still need to be sent
      // But release the claim so send-nwc-tips can re-claim it
      // Actually, keep the claim active with a "tips_pending" status
      
      return res.status(200).json({
        success: true,
        baseAmount,
        tipAmount: tipAmountNum,
        enhancedMemo,
        tipsDeferred: true,
        tipData: {
          paymentHash,
          tipAmount: tipAmountNum,
          tipRecipients: tipRecipients.map(r => ({
            username: r.username,
            share: r.share
          })),
          displayCurrency: tipData.displayCurrency || 'BTC',
          tipAmountDisplay: tipData.tipAmountDisplay
        }
      });
    }

    // Send tips to recipients if there are any (when deferTips=false)
    let tipResult = null;
    
    if (tipAmountNum > 0 && tipRecipients.length > 0) {
      const blinkposAPI = new BlinkAPI(blinkposApiKey);
      
      try {
        const totalTipSats = Math.round(tipAmountNum);
        const tipPerRecipient = Math.floor(totalTipSats / tipRecipients.length);
        const remainder = totalTipSats - (tipPerRecipient * tipRecipients.length);
        
        console.log('💡 Processing tips for NWC payment:', {
          totalTipSats,
          recipientCount: tipRecipients.length,
          tipPerRecipient,
          remainder,
          recipients: tipRecipients.map(r => r.username)
        });

        const displayCurrency = tipData.displayCurrency || 'BTC';
        const tipAmountInDisplayCurrency = Number(tipData.tipAmountDisplay) || totalTipSats;
        const tipPerRecipientDisplay = tipAmountInDisplayCurrency / tipRecipients.length;
        
        const tipResults = [];
        const isMultiple = tipRecipients.length > 1;
        
        for (let i = 0; i < tipRecipients.length; i++) {
          const recipient = tipRecipients[i];
          const recipientTipAmount = i === 0 ? tipPerRecipient + remainder : tipPerRecipient;
          
          console.log(`💡 Sending tip to ${recipient.username}:`, {
            amount: recipientTipAmount,
            index: i + 1,
            total: tipRecipients.length
          });

          // Generate tip memo
          const splitInfo = isMultiple ? ` (${i + 1}/${tipRecipients.length})` : '';
          let tipMemo;
          if (displayCurrency === 'BTC') {
            tipMemo = `BlinkPOS Tip${splitInfo}: ${recipientTipAmount} sats`;
          } else {
            const formattedAmount = formatCurrencyServer(tipPerRecipientDisplay, displayCurrency);
            tipMemo = `BlinkPOS Tip${splitInfo}: ${formattedAmount} (${recipientTipAmount} sats)`;
          }

          try {
            const tipPaymentResult = await blinkposAPI.sendTipViaInvoice(
              blinkposBtcWalletId,
              recipient.username,
              recipientTipAmount,
              tipMemo
            );

            if (tipPaymentResult.status === 'SUCCESS') {
              console.log(`💰 Tip successfully sent to ${recipient.username}`);
              tipResults.push({
                success: true,
                amount: recipientTipAmount,
                recipient: `${recipient.username}@blink.sv`,
                status: tipPaymentResult.status
              });
              
              await hybridStore.logEvent(paymentHash, 'nwc_tip_sent', 'success', {
                tipAmount: recipientTipAmount,
                tipRecipient: recipient.username,
                paymentHash: tipPaymentResult.paymentHash,
                recipientIndex: i + 1,
                totalRecipients: tipRecipients.length
              });
            } else {
              console.error(`❌ Tip payment to ${recipient.username} failed:`, tipPaymentResult.status);
              tipResults.push({
                success: false,
                recipient: `${recipient.username}@blink.sv`,
                error: `Tip payment failed: ${tipPaymentResult.status}`
              });
            }
          } catch (recipientTipError) {
            console.error(`❌ Tip payment to ${recipient.username} error:`, recipientTipError);
            tipResults.push({
              success: false,
              recipient: `${recipient.username}@blink.sv`,
              error: recipientTipError.message
            });
          }
        }
        
        const successCount = tipResults.filter(r => r.success).length;
        tipResult = {
          success: successCount === tipRecipients.length,
          partialSuccess: successCount > 0 && successCount < tipRecipients.length,
          totalAmount: tipAmountNum,
          recipients: tipResults,
          successCount,
          totalCount: tipRecipients.length
        };
        
        console.log('💡 NWC tip distribution complete:', {
          successCount,
          totalCount: tipRecipients.length
        });
        
      } catch (tipError) {
        console.error('❌ NWC tip payment error:', tipError);
        tipResult = {
          success: false,
          error: tipError.message
        };
      }
    }

    // Log forwarding event and mark as completed
    await hybridStore.logEvent(paymentHash, 'nwc_forwarded', 'success', {
      baseAmount,
      tipAmount: tipAmountNum,
      tipRecipients: tipRecipients.map(r => r.username)
    });
    
    // Mark as completed
    await hybridStore.removeTipData(paymentHash);
    claimSucceeded = false;

    console.log(`✅ COMPLETED NWC payment ${paymentHash?.substring(0, 16)}... tip processing`);

    // Return success with base amount for NWC forwarding
    res.status(200).json({
      success: true,
      baseAmount,
      tipAmount: tipAmountNum,
      enhancedMemo,
      tipResult
    });

  } catch (error) {
    console.error('❌ NWC tip forwarding error:', error);
    
    if (claimSucceeded && hybridStore && paymentHash) {
      console.log(`🔓 Releasing claim for failed NWC payment ${paymentHash?.substring(0, 16)}...`);
      await hybridStore.releaseFailedClaim(paymentHash, error.message);
    }

    res.status(500).json({ 
      error: 'Failed to process NWC tips',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

