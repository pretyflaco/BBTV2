import BlinkAPI from '../../../lib/blink-api';
import { getInvoiceFromLightningAddress, isNpubCashAddress } from '../../../lib/lnurl';
const { getHybridStore } = require('../../../lib/storage/hybrid-store');
const { formatCurrencyServer, isBitcoinCurrency } = require('../../../lib/currency-formatter-server');

/**
 * API endpoint for sending NWC tips AFTER base amount has been forwarded
 * 
 * This is called AFTER the base amount has been forwarded to NWC wallet,
 * ensuring correct chronology: base amount first, tips second.
 * 
 * POST /api/blink/send-nwc-tips
 * Body: { paymentHash: string, tipData: object }
 * 
 * Returns: { success: true, tipResult: object }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let hybridStore = null;

  try {
    const { paymentHash, tipData } = req.body;
    
    console.log('💡 SEND NWC TIPS REQUEST (after base amount forwarded):', {
      paymentHash: paymentHash?.substring(0, 16) + '...',
      tipAmount: tipData?.tipAmount,
      recipientCount: tipData?.tipRecipients?.length,
      timestamp: new Date().toISOString()
    });

    // Validate required fields
    if (!paymentHash || !tipData) {
      return res.status(400).json({ 
        error: 'Missing required fields: paymentHash, tipData' 
      });
    }

    const { tipAmount, tipRecipients, displayCurrency = 'BTC', tipAmountDisplay } = tipData;

    if (!tipAmount || tipAmount <= 0 || !tipRecipients || tipRecipients.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid tip data: no tip amount or recipients' 
      });
    }

    // Get BlinkPOS credentials from environment
    const blinkposApiKey = process.env.BLINKPOS_API_KEY;
    const blinkposBtcWalletId = process.env.BLINKPOS_BTC_WALLET_ID;

    if (!blinkposApiKey || !blinkposBtcWalletId) {
      console.error('Missing BlinkPOS environment variables');
      return res.status(500).json({ error: 'BlinkPOS configuration missing' });
    }

    hybridStore = await getHybridStore();
    const blinkposAPI = new BlinkAPI(blinkposApiKey);
    
    // Calculate weighted tip amounts based on share percentages
    const totalTipSats = Math.round(tipAmount);
    let distributedSats = 0;
    const recipientAmounts = tipRecipients.map((recipient, index) => {
      const sharePercent = recipient.share || (100 / tipRecipients.length);
      // For the last recipient, give them whatever is left to avoid rounding issues
      if (index === tipRecipients.length - 1) {
        return totalTipSats - distributedSats;
      }
      const amount = Math.floor(totalTipSats * sharePercent / 100);
      distributedSats += amount;
      return amount;
    });
    
    console.log('💡 Processing tips for NWC payment with weighted shares:', {
      totalTipSats,
      recipientCount: tipRecipients.length,
      distribution: tipRecipients.map((r, i) => `${r.username}: ${r.share || (100/tipRecipients.length)}% = ${recipientAmounts[i]} sats`)
    });

    const tipAmountInDisplayCurrency = Number(tipAmountDisplay) || totalTipSats;
    
    const tipResults = [];
    const isMultiple = tipRecipients.length > 1;
    
    for (let i = 0; i < tipRecipients.length; i++) {
      const recipient = tipRecipients[i];
      // Use the pre-calculated weighted amount for this recipient
      const recipientTipAmount = recipientAmounts[i];
      const sharePercent = recipient.share || (100 / tipRecipients.length);
      const recipientDisplayAmount = tipAmountInDisplayCurrency * sharePercent / 100;
      
      // Skip recipients who would receive 0 sats (cannot create 0-sat invoice)
      if (recipientTipAmount <= 0) {
        console.log(`⏭️ [NWC Tips] Skipping tip to ${recipient.username}: amount is ${recipientTipAmount} sats (minimum 1 sat required)`);
        tipResults.push({
          success: false,
          skipped: true,
          amount: 0,
          recipient: recipient.username,
          reason: 'Tip amount too small (0 sats)'
        });
        continue;
      }
      
      console.log(`💡 Sending tip to ${recipient.username}:`, {
        amount: recipientTipAmount,
        share: `${sharePercent}%`,
        index: i + 1,
        total: tipRecipients.length
      });

      // Generate tip memo (matching Blink format)
      const splitInfo = isMultiple ? ` (${i + 1}/${tipRecipients.length})` : '';
      let tipMemo;
      if (isBitcoinCurrency(displayCurrency)) {
        tipMemo = `BlinkPOS Tip${splitInfo}: ${recipientTipAmount} sats`;
      } else {
        const formattedAmount = formatCurrencyServer(recipientDisplayAmount, displayCurrency);
        tipMemo = `BlinkPOS Tip${splitInfo}: ${formattedAmount} (${recipientTipAmount} sats)`;
      }

      try {
        // Check if recipient is npub.cash address
        const recipientType = recipient.type || (isNpubCashAddress(recipient.username) ? 'npub_cash' : 'blink');
        let tipPaymentResult;

        if (recipientType === 'npub_cash') {
          // Send tip to npub.cash address via LNURL-pay
          console.log(`🥜 Sending NWC tip to npub.cash: ${recipient.username}`);
          
          const tipInvoiceData = await getInvoiceFromLightningAddress(
            recipient.username,
            recipientTipAmount,
            tipMemo
          );
          
          tipPaymentResult = await blinkposAPI.payLnInvoice(
            blinkposBtcWalletId,
            tipInvoiceData.paymentRequest,
            tipMemo
          );
        } else {
          // Send tip to Blink user (existing method)
          tipPaymentResult = await blinkposAPI.sendTipViaInvoice(
            blinkposBtcWalletId,
            recipient.username,
            recipientTipAmount,
            tipMemo
          );
        }

        const recipientDisplay = recipientType === 'npub_cash' 
          ? recipient.username 
          : `${recipient.username}@blink.sv`;

        if (tipPaymentResult.status === 'SUCCESS') {
          console.log(`💰 Tip successfully sent to ${recipient.username}`);
          tipResults.push({
            success: true,
            amount: recipientTipAmount,
            recipient: recipientDisplay,
            status: tipPaymentResult.status,
            type: recipientType
          });
          
          await hybridStore.logEvent(paymentHash, 'nwc_tip_sent', 'success', {
            tipAmount: recipientTipAmount,
            tipRecipient: recipient.username,
            paymentHash: tipPaymentResult.paymentHash,
            recipientIndex: i + 1,
            totalRecipients: tipRecipients.length,
            type: recipientType
          });
        } else {
          console.error(`❌ Tip payment to ${recipient.username} failed:`, tipPaymentResult.status);
          tipResults.push({
            success: false,
            recipient: recipientDisplay,
            error: `Tip payment failed: ${tipPaymentResult.status}`,
            type: recipientType
          });
        }
      } catch (recipientTipError) {
        console.error(`❌ Tip payment to ${recipient.username} error:`, recipientTipError);
        const recipientType = recipient.type || 'blink';
        tipResults.push({
          success: false,
          recipient: recipientType === 'npub_cash' ? recipient.username : `${recipient.username}@blink.sv`,
          error: recipientTipError.message,
          type: recipientType
        });
      }
    }
    
    const successCount = tipResults.filter(r => r.success).length;
    const tipResult = {
      success: successCount === tipRecipients.length,
      partialSuccess: successCount > 0 && successCount < tipRecipients.length,
      totalAmount: tipAmount,
      recipients: tipResults,
      successCount,
      totalCount: tipRecipients.length
    };
    
    console.log('💡 NWC tip distribution complete:', {
      successCount,
      totalCount: tipRecipients.length
    });

    // Log the NWC forwarding completion and clean up
    await hybridStore.logEvent(paymentHash, 'nwc_tips_completed', 'success', {
      tipAmount,
      tipRecipients: tipRecipients.map(r => r.username),
      tipResult
    });
    
    // Remove tip data now that everything is done
    await hybridStore.removeTipData(paymentHash);

    console.log(`✅ COMPLETED NWC tips for payment ${paymentHash?.substring(0, 16)}...`);

    res.status(200).json({
      success: true,
      tipResult
    });

  } catch (error) {
    console.error('❌ Send NWC tips error:', error);
    res.status(500).json({ 
      error: 'Failed to send NWC tips',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

