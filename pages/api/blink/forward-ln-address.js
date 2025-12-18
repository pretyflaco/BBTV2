/**
 * API endpoint to forward payment to a Blink Lightning Address wallet
 * 
 * This endpoint creates an invoice on behalf of the recipient using the
 * public Blink API and pays it from BlinkPOS.
 * 
 * Used when the user's active wallet is connected via Lightning Address
 * (no API key required).
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
      recipientWalletId,
      recipientUsername
    } = req.body;
    
    paymentHash = reqPaymentHash;

    console.log('📥 Forward to LN Address request:', {
      paymentHash: paymentHash?.substring(0, 16) + '...',
      totalAmount,
      recipientUsername,
      recipientWalletId: recipientWalletId?.substring(0, 16) + '...'
    });

    if (!recipientWalletId || !recipientUsername) {
      return res.status(400).json({ error: 'Missing recipient wallet information' });
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
        console.log(`🔒 [LN Address] DUPLICATE PREVENTION: Payment ${paymentHash?.substring(0, 16)}... ${claimResult.reason}`);
        
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
          console.log('⚠️ [LN Address] No stored data found, proceeding without claim');
        }
      } else {
        claimSucceeded = true;
        console.log(`✅ [LN Address] CLAIMED payment ${paymentHash?.substring(0, 16)}... for processing`);
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

    // Step 1: Look up recipient's BTC wallet (required for lnInvoiceCreateOnBehalfOfRecipient)
    // The stored walletId might be a USD wallet, which doesn't support this operation
    console.log('🔍 Looking up BTC wallet for recipient:', recipientUsername);
    
    const walletLookupQuery = `
      query getRecipientBtcWallet($username: Username!) {
        accountDefaultWallet(username: $username, walletCurrency: BTC) {
          id
          walletCurrency
        }
      }
    `;

    const walletLookupResponse = await fetch('https://api.blink.sv/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: walletLookupQuery,
        variables: { username: recipientUsername }
      })
    });

    const walletLookupData = await walletLookupResponse.json();
    
    let btcWalletId = recipientWalletId; // Fallback to stored wallet
    
    if (walletLookupData.data?.accountDefaultWallet?.id && 
        walletLookupData.data?.accountDefaultWallet?.walletCurrency === 'BTC') {
      btcWalletId = walletLookupData.data.accountDefaultWallet.id;
      console.log('✅ Found BTC wallet:', btcWalletId.substring(0, 16) + '...');
    } else {
      console.log('⚠️ Could not find BTC wallet, using stored wallet:', recipientWalletId?.substring(0, 16) + '...');
    }

    // Step 2: Create invoice on behalf of recipient using public Blink API
    console.log('📝 Creating invoice on behalf of recipient:', recipientUsername);
    
    const createInvoiceQuery = `
      mutation lnInvoiceCreateOnBehalfOfRecipient($input: LnInvoiceCreateOnBehalfOfRecipientInput!) {
        lnInvoiceCreateOnBehalfOfRecipient(input: $input) {
          errors {
            message
          }
          invoice {
            paymentHash
            paymentRequest
            paymentSecret
            satoshis
          }
        }
      }
    `;

    const invoiceResponse = await fetch('https://api.blink.sv/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: createInvoiceQuery,
        variables: {
          input: {
            recipientWalletId: btcWalletId,
            amount: Math.round(baseAmount),
            memo: forwardingMemo
          }
        }
      })
    });

    const invoiceData = await invoiceResponse.json();

    if (invoiceData.errors || invoiceData.data?.lnInvoiceCreateOnBehalfOfRecipient?.errors?.length > 0) {
      const errorMsg = invoiceData.errors?.[0]?.message || 
                       invoiceData.data?.lnInvoiceCreateOnBehalfOfRecipient?.errors?.[0]?.message ||
                       'Failed to create invoice on behalf of recipient';
      console.error('❌ Failed to create invoice on behalf:', errorMsg);
      return res.status(400).json({ error: errorMsg });
    }

    const recipientInvoice = invoiceData.data?.lnInvoiceCreateOnBehalfOfRecipient?.invoice;
    if (!recipientInvoice?.paymentRequest) {
      return res.status(400).json({ error: 'No invoice returned from recipient wallet' });
    }

    console.log('✅ Invoice created on behalf of recipient:', {
      paymentHash: recipientInvoice.paymentHash?.substring(0, 16) + '...',
      satoshis: recipientInvoice.satoshis
    });

    // Step 2: Pay the invoice from BlinkPOS (base amount FIRST)
    console.log('💸 Paying invoice from BlinkPOS...');
    
    const paymentResult = await blinkposAPI.payLnInvoice(
      blinkposBtcWalletId,
      recipientInvoice.paymentRequest,
      forwardingMemo
    );

    if (paymentResult.status !== 'SUCCESS') {
      console.error('❌ Payment failed:', paymentResult);
      return res.status(400).json({ 
        error: 'Payment failed', 
        status: paymentResult.status 
      });
    }

    console.log('✅ Base amount forwarded successfully to', recipientUsername);

    // Log the forwarding event
    if (paymentHash) {
      await hybridStore.logEvent(paymentHash, 'ln_address_forward', 'success', {
        recipientUsername,
        baseAmount,
        memo: forwardingMemo
      });
    }

    // Step 3: Send tips AFTER base amount (TIPS SECOND)
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
          console.log(`⏭️ [LN Address] Skipping tip to ${recipient.username}: amount is ${recipientTipAmount} sats (minimum 1 sat required)`);
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
            console.log(`🥜 [LN Address] Sending tip to npub.cash: ${recipient.username}`);
            
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
              console.log(`💰 [LN Address] Tip successfully sent to ${recipient.username}`);
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
              console.log(`💰 [LN Address] Tip successfully sent to ${recipient.username}@blink.sv`);
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
          const recipientDisplay = recipientType === 'npub_cash' ? recipient.username : `${recipient.username}@blink.sv`;
          tipResults.push({ 
            success: false, 
            recipient: recipientDisplay, 
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
      message: 'Payment forwarded to Lightning Address wallet',
      baseAmount,
      tipAmount,
      tipResult,
      recipientUsername
    });

  } catch (error) {
    console.error('❌ Forward to LN Address error:', error);
    
    // Release claim if we claimed but failed to complete
    if (claimSucceeded && hybridStore && paymentHash) {
      try {
        await hybridStore.releaseFailedClaim(paymentHash, error.message);
        console.log(`🔓 [LN Address] Released claim for ${paymentHash?.substring(0, 16)}...`);
      } catch (releaseError) {
        console.error('❌ [LN Address] Failed to release claim:', releaseError);
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to forward payment', 
      details: error.message 
    });
  }
}

