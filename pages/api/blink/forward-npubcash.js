/**
 * API endpoint to forward payment to an npub.cash wallet
 * 
 * This endpoint resolves the npub.cash Lightning address via LNURL-pay,
 * gets an invoice from npub.cash, and pays it from BlinkPOS.
 * 
 * Since npub.cash uses Blink as their Lightning provider, these payments
 * are intraledger (ZERO FEE).
 * 
 * Used when the user's active wallet is connected via npub.cash address.
 */

import BlinkAPI from '../../../lib/blink-api';
import { getInvoiceFromLightningAddress } from '../../../lib/lnurl';
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
    const { 
      paymentHash: reqPaymentHash, 
      totalAmount, 
      memo,
      recipientAddress  // Full npub.cash address (e.g., "npub1xxx@npub.cash")
    } = req.body;
    
    paymentHash = reqPaymentHash;

    console.log('🥜 Forward to npub.cash request:', {
      paymentHash: paymentHash?.substring(0, 16) + '...',
      totalAmount,
      recipientAddress
    });

    if (!recipientAddress) {
      return res.status(400).json({ error: 'Missing recipient npub.cash address' });
    }

    if (!recipientAddress.endsWith('@npub.cash')) {
      return res.status(400).json({ error: 'Invalid npub.cash address format' });
    }

    if (!totalAmount) {
      return res.status(400).json({ error: 'Missing totalAmount' });
    }

    // Get BlinkPOS credentials
    const blinkposApiKey = process.env.BLINKPOS_API_KEY;
    const blinkposBtcWalletId = process.env.BLINKPOS_BTC_WALLET_ID;

    if (!blinkposApiKey || !blinkposBtcWalletId) {
      return res.status(500).json({ error: 'BlinkPOS configuration missing' });
    }

    const blinkposAPI = new BlinkAPI(blinkposApiKey);
    hybridStore = await getHybridStore();

    // CRITICAL: Use atomic claim to prevent duplicate payouts
    // This ensures only ONE request (client or webhook) can process this payment
    if (paymentHash) {
      const claimResult = await hybridStore.claimPaymentForProcessing(paymentHash);
      
      if (!claimResult.claimed) {
        // Payment already being processed or completed - return appropriate response
        console.log(`🔒 [npub.cash] DUPLICATE PREVENTION: Payment ${paymentHash?.substring(0, 16)}... ${claimResult.reason}`);
        
        if (claimResult.reason === 'already_completed') {
          // Already successfully processed - return success (idempotent)
          return res.status(200).json({
            success: true,
            message: 'Payment already processed',
            alreadyProcessed: true,
            details: { paymentHash, status: 'completed' }
          });
        } else if (claimResult.reason === 'already_processing') {
          // Another request (likely webhook) is processing - return 409
          return res.status(409).json({
            error: 'Payment is being processed by another request',
            retryable: false,
            details: { paymentHash, status: 'processing' }
          });
        } else {
          // Not found - continue without claim (legacy behavior for old payments)
          console.log('⚠️ [npub.cash] No stored data found, proceeding without claim');
        }
      } else {
        claimSucceeded = true;
        console.log(`✅ [npub.cash] CLAIMED payment ${paymentHash?.substring(0, 16)}... for processing`);
      }
    }

    // Check for tip data if we have a payment hash
    let baseAmount = totalAmount;
    let tipAmount = 0;
    let tipRecipients = [];
    let displayCurrency = 'BTC';
    let baseAmountDisplay = totalAmount;
    let tipAmountDisplay = 0;
    let storedMemo = memo;

    if (paymentHash) {
      const tipData = await hybridStore.getTipData(paymentHash);
      if (tipData) {
        baseAmount = tipData.baseAmount || totalAmount;
        tipAmount = tipData.tipAmount || 0;
        tipRecipients = tipData.tipRecipients || [];
        displayCurrency = tipData.displayCurrency || 'BTC';
        baseAmountDisplay = tipData.baseAmountDisplay || baseAmount;
        tipAmountDisplay = tipData.tipAmountDisplay || tipAmount;
        storedMemo = tipData.memo || memo;
        
        console.log('📄 Tip data found:', {
          baseAmount,
          tipAmount,
          tipRecipients: tipRecipients.length,
          displayCurrency
        });
      }
    }

    // Format the forwarding memo
    let forwardingMemo;
    if (storedMemo && storedMemo.startsWith('BlinkPOS:')) {
      forwardingMemo = storedMemo;
    } else if (storedMemo) {
      forwardingMemo = `BlinkPOS: ${storedMemo}`;
    } else {
      forwardingMemo = `BlinkPOS: ${baseAmount} sats`;
    }

    // Step 1: Get invoice from npub.cash via LNURL-pay
    console.log('🔍 Resolving npub.cash LNURL for:', recipientAddress);
    
    let invoiceData;
    try {
      invoiceData = await getInvoiceFromLightningAddress(
        recipientAddress,
        Math.round(baseAmount),
        forwardingMemo
      );
    } catch (lnurlError) {
      console.error('❌ LNURL resolution failed:', lnurlError);
      return res.status(400).json({ 
        error: 'Failed to get invoice from npub.cash', 
        details: lnurlError.message 
      });
    }

    if (!invoiceData?.paymentRequest) {
      return res.status(400).json({ error: 'No invoice returned from npub.cash' });
    }

    console.log('✅ Invoice received from npub.cash:', {
      hasPaymentRequest: !!invoiceData.paymentRequest,
      minSats: invoiceData.metadata?.minSendable / 1000,
      maxSats: invoiceData.metadata?.maxSendable / 1000
    });

    // Step 2: Pay the invoice from BlinkPOS (this will be intraledger since npub.cash uses Blink)
    console.log('💸 Paying npub.cash invoice from BlinkPOS (intraledger)...');
    
    const paymentResult = await blinkposAPI.payLnInvoice(
      blinkposBtcWalletId,
      invoiceData.paymentRequest,
      forwardingMemo
    );

    if (paymentResult.status !== 'SUCCESS') {
      console.error('❌ Payment failed:', paymentResult);
      return res.status(400).json({ 
        error: 'Payment failed', 
        status: paymentResult.status 
      });
    }

    console.log('✅ Base amount forwarded successfully to npub.cash:', recipientAddress);

    // Log the forwarding event
    if (paymentHash) {
      await hybridStore.logEvent(paymentHash, 'npubcash_forward', 'success', {
        recipientAddress,
        baseAmount,
        memo: forwardingMemo,
        intraledger: true  // Mark as intraledger (zero fee)
      });
    }

    // Step 3: Send tips AFTER base amount
    let tipResult = null;
    if (tipAmount > 0 && tipRecipients.length > 0) {
      console.log('💡 Sending tips to recipients...');
      
      const tipPerRecipient = Math.floor(tipAmount / tipRecipients.length);
      const remainder = tipAmount - (tipPerRecipient * tipRecipients.length);
      const tipPerRecipientDisplay = tipAmountDisplay / tipRecipients.length;
      
      const tipResults = [];
      const isMultiple = tipRecipients.length > 1;

      for (let i = 0; i < tipRecipients.length; i++) {
        const recipient = tipRecipients[i];
        // Distribute remainder evenly: first 'remainder' recipients get +1 sat each
        const recipientTipAmount = i < remainder ? tipPerRecipient + 1 : tipPerRecipient;

        // Skip recipients who would receive 0 sats (cannot create 0-sat invoice)
        if (recipientTipAmount <= 0) {
          console.log(`⏭️ [npub.cash] Skipping tip to ${recipient.username}: amount is ${recipientTipAmount} sats (minimum 1 sat required)`);
          tipResults.push({
            success: false,
            skipped: true,
            amount: 0,
            recipient: recipient.username,
            reason: 'Tip amount too small (0 sats)'
          });
          continue;
        }

        // Auto-detect npub.cash addresses by checking if username ends with @npub.cash
        const isNpubCash = recipient.username?.endsWith('@npub.cash') || recipient.type === 'npub_cash';
        const recipientType = isNpubCash ? 'npub_cash' : (recipient.type || 'blink');

        const splitInfo = isMultiple ? ` (${i + 1}/${tipRecipients.length})` : '';
        let tipMemo;
        if (displayCurrency === 'BTC') {
          tipMemo = `BlinkPOS Tip${splitInfo}: ${recipientTipAmount} sats`;
        } else {
          const formattedAmount = formatCurrencyServer(tipPerRecipientDisplay, displayCurrency);
          tipMemo = `BlinkPOS Tip${splitInfo}: ${formattedAmount} (${recipientTipAmount} sats)`;
        }

        try {
          if (recipientType === 'npub_cash') {
            // Send tip to npub.cash address via LNURL-pay
            console.log(`🥜 Sending tip to npub.cash: ${recipient.username}`);
            
            const tipInvoiceData = await getInvoiceFromLightningAddress(
              recipient.username,
              recipientTipAmount,
              tipMemo
            );
            
            const tipPaymentResult = await blinkposAPI.payLnInvoice(
              blinkposBtcWalletId,
              tipInvoiceData.paymentRequest,
              tipMemo
            );

            if (tipPaymentResult.status === 'SUCCESS') {
              tipResults.push({ 
                success: true, 
                amount: recipientTipAmount, 
                recipient: recipient.username,
                type: 'npub_cash'
              });
            } else {
              tipResults.push({ 
                success: false, 
                recipient: recipient.username, 
                error: `Failed: ${tipPaymentResult.status}`,
                type: 'npub_cash'
              });
            }
          } else {
            // Send tip to Blink user (existing method)
            const tipPaymentResult = await blinkposAPI.sendTipViaInvoice(
              blinkposBtcWalletId,
              recipient.username,
              recipientTipAmount,
              tipMemo
            );

            if (tipPaymentResult.status === 'SUCCESS') {
              tipResults.push({ 
                success: true, 
                amount: recipientTipAmount, 
                recipient: `${recipient.username}@blink.sv`,
                type: 'blink'
              });
            } else {
              tipResults.push({ 
                success: false, 
                recipient: `${recipient.username}@blink.sv`, 
                error: `Failed: ${tipPaymentResult.status}`,
                type: 'blink'
              });
            }
          }
        } catch (tipError) {
          console.error(`❌ Tip payment error for ${recipient.username}:`, tipError);
          tipResults.push({ 
            success: false, 
            recipient: recipient.username, 
            error: tipError.message,
            type: recipientType
          });
        }
      }

      const successCount = tipResults.filter(r => r.success).length;
      tipResult = {
        success: successCount === tipRecipients.length,
        partialSuccess: successCount > 0 && successCount < tipRecipients.length,
        totalAmount: tipAmount,
        recipients: tipResults,
        successCount,
        totalCount: tipRecipients.length
      };

      console.log('✅ Tips sent:', tipResult);

      // Remove tip data after processing (marks as completed)
      if (paymentHash) {
        await hybridStore.removeTipData(paymentHash);
        claimSucceeded = false; // Payment completed, no need to release on error
      }
    } else if (paymentHash && claimSucceeded) {
      // No tips, but we claimed - mark as completed
      await hybridStore.removeTipData(paymentHash);
      claimSucceeded = false;
    }

    res.status(200).json({
      success: true,
      message: 'Payment forwarded to npub.cash wallet',
      baseAmount,
      tipAmount,
      tipResult,
      recipientAddress,
      intraledger: true  // Confirm zero-fee intraledger payment
    });

  } catch (error) {
    console.error('❌ Forward to npub.cash error:', error);
    
    // Release claim if we claimed but failed to complete
    if (claimSucceeded && hybridStore && paymentHash) {
      try {
        await hybridStore.releaseFailedClaim(paymentHash, error.message);
        console.log(`🔓 [npub.cash] Released claim for ${paymentHash?.substring(0, 16)}...`);
      } catch (releaseError) {
        console.error('❌ [npub.cash] Failed to release claim:', releaseError);
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to forward payment to npub.cash', 
      details: error.message 
    });
  }
}

