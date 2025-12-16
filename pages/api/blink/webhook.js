/**
 * Blink Webhook Handler for BlinkPOS
 * 
 * This endpoint receives webhook events from Blink (via Svix) when payments
 * are received on the BlinkPOS wallet. It automatically forwards payments
 * to the appropriate user wallet based on stored forwarding data.
 * 
 * This provides reliable payment forwarding even when the client is disconnected.
 * 
 * Supported events:
 * - receive.lightning: Lightning payment received
 * - receive.intraledger: Intraledger payment received
 * 
 * @see https://dev.blink.sv/api/webhooks
 */

import BlinkAPI from '../../../lib/blink-api';
import { verifyWebhookSignature } from '../../../lib/webhook-verify';
import { getInvoiceFromLightningAddress } from '../../../lib/lnurl';
const { getHybridStore } = require('../../../lib/storage/hybrid-store');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  let paymentHash = null;
  let hybridStore = null;

  try {
    // Step 1: Verify webhook signature (if secret is configured)
    const webhookSecret = process.env.BLINK_WEBHOOK_SECRET;
    
    if (webhookSecret) {
      const isValid = verifyWebhookSignature(req, webhookSecret);
      if (!isValid) {
        console.error('🚫 [Webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
      console.log('✅ [Webhook] Signature verified');
    } else {
      console.warn('⚠️ [Webhook] No BLINK_WEBHOOK_SECRET configured - skipping signature verification');
    }

    // Step 2: Parse the webhook payload
    const payload = req.body;
    
    console.log('📥 [Webhook] Received event:', {
      eventType: payload.eventType,
      transactionId: payload.transaction?.id,
      amount: payload.transaction?.settlementAmount,
      status: payload.transaction?.status
    });

    // Only process receive events
    if (!payload.eventType?.startsWith('receive.')) {
      console.log('ℹ️ [Webhook] Ignoring non-receive event:', payload.eventType);
      return res.status(200).json({ status: 'ignored', reason: 'Not a receive event' });
    }

    // Only process successful transactions
    if (payload.transaction?.status !== 'success') {
      console.log('ℹ️ [Webhook] Ignoring non-success transaction:', payload.transaction?.status);
      return res.status(200).json({ status: 'ignored', reason: 'Transaction not successful' });
    }

    // Extract payment hash from the transaction
    const transaction = payload.transaction;
    paymentHash = transaction.initiationVia?.paymentHash;
    
    if (!paymentHash) {
      console.log('ℹ️ [Webhook] No payment hash in transaction - may be on-chain or intraledger without hash');
      return res.status(200).json({ status: 'ignored', reason: 'No payment hash' });
    }

    console.log('🔍 [Webhook] Processing payment:', {
      paymentHash: paymentHash.substring(0, 16) + '...',
      amount: transaction.settlementAmount,
      eventType: payload.eventType
    });

    // Step 3: Try to claim the payment for processing (atomic deduplication)
    // This prevents duplicate forwarding if both webhook and client try to process
    hybridStore = await getHybridStore();
    const claimResult = await hybridStore.claimPaymentForProcessing(paymentHash);
    
    if (!claimResult.claimed) {
      console.log(`ℹ️ [Webhook] Payment not claimed: ${claimResult.reason}`);
      return res.status(200).json({ 
        status: claimResult.reason === 'not_found' ? 'ignored' : 'already_claimed', 
        reason: claimResult.reason 
      });
    }

    const forwardingData = claimResult.paymentData;
    
    // Extract additional fields from metadata (they're stored in JSONB)
    if (forwardingData.metadata) {
      forwardingData.nwcActive = forwardingData.metadata.nwcActive || false;
      forwardingData.blinkLnAddress = forwardingData.metadata.blinkLnAddress || false;
      forwardingData.blinkLnAddressWalletId = forwardingData.metadata.blinkLnAddressWalletId || null;
      forwardingData.blinkLnAddressUsername = forwardingData.metadata.blinkLnAddressUsername || null;
      forwardingData.npubCashActive = forwardingData.metadata.npubCashActive || false;
      forwardingData.npubCashLightningAddress = forwardingData.metadata.npubCashLightningAddress || null;
    }

    console.log('📄 [Webhook] Forwarding data found:', {
      nwcActive: forwardingData.nwcActive,
      blinkLnAddress: forwardingData.blinkLnAddress,
      blinkLnAddressUsername: forwardingData.blinkLnAddressUsername,
      npubCashActive: forwardingData.npubCashActive,
      hasUserApiKey: !!forwardingData.userApiKey,
      baseAmount: forwardingData.baseAmount,
      tipAmount: forwardingData.tipAmount
    });

    console.log('✅ [Webhook] Payment claimed for forwarding');

    // Step 5: Forward the payment based on the forwarding type
    let forwardResult;
    const amount = transaction.settlementAmount;

    try {
      if (forwardingData.blinkLnAddress && forwardingData.blinkLnAddressUsername) {
        // Forward to Blink Lightning Address
        console.log('⚡ [Webhook] Forwarding to Blink Lightning Address:', forwardingData.blinkLnAddressUsername);
        forwardResult = await forwardToLnAddress(paymentHash, amount, forwardingData, hybridStore);
      } 
      else if (forwardingData.npubCashActive && forwardingData.npubCashLightningAddress) {
        // Forward to npub.cash
        console.log('🥜 [Webhook] Forwarding to npub.cash:', forwardingData.npubCashLightningAddress);
        forwardResult = await forwardToNpubCash(paymentHash, amount, forwardingData, hybridStore);
      }
      else if (forwardingData.nwcActive) {
        // NWC forwarding requires client-side action (we can't initiate NWC from server)
        console.log('⚠️ [Webhook] NWC payment - cannot forward from server, client must handle');
        // Release the claim so client can try
        await hybridStore.releaseFailedClaim(paymentHash, 'NWC requires client-side forwarding');
        return res.status(200).json({ 
          status: 'nwc_requires_client', 
          reason: 'NWC forwarding requires client WebSocket' 
        });
      }
      else if (forwardingData.userApiKey && forwardingData.userWalletId) {
        // Forward to user's Blink wallet via API key
        console.log('🔑 [Webhook] Forwarding to user Blink wallet');
        forwardResult = await forwardToUserWallet(paymentHash, amount, forwardingData, hybridStore);
      }
      else {
        console.warn('⚠️ [Webhook] No valid forwarding destination found');
        await hybridStore.releaseFailedClaim(paymentHash, 'No valid forwarding destination');
        return res.status(200).json({ status: 'no_destination', reason: 'No valid forwarding destination' });
      }

      const elapsed = Date.now() - startTime;
      console.log(`✅ [Webhook] Forwarding completed in ${elapsed}ms:`, forwardResult);

      // Log success event
      await hybridStore.logEvent(paymentHash, 'webhook_forward', 'success', {
        forwardType: forwardResult.type,
        amount,
        elapsed
      });

      return res.status(200).json({
        status: 'forwarded',
        ...forwardResult
      });

    } catch (forwardError) {
      console.error('❌ [Webhook] Forwarding failed:', forwardError);
      
      // Release the claim so it can be retried
      await hybridStore.releaseFailedClaim(paymentHash, forwardError.message);
      
      // Log failure event
      await hybridStore.logEvent(paymentHash, 'webhook_forward', 'failed', {
        error: forwardError.message
      });

      // Return 500 so Svix will retry
      return res.status(500).json({ 
        error: 'Forwarding failed', 
        details: forwardError.message 
      });
    }

  } catch (error) {
    console.error('❌ [Webhook] Handler error:', error);
    
    // Release claim if we have one
    if (hybridStore && paymentHash) {
      try {
        await hybridStore.releaseFailedClaim(paymentHash, error.message);
      } catch (releaseError) {
        console.error('❌ [Webhook] Failed to release claim:', releaseError);
      }
    }

    // Return 500 so Svix will retry
    return res.status(500).json({ 
      error: 'Webhook handler error', 
      details: error.message 
    });
  }
}

/**
 * Forward payment to a Blink Lightning Address wallet
 */
async function forwardToLnAddress(paymentHash, amount, forwardingData, hybridStore) {
  const blinkposApiKey = process.env.BLINKPOS_API_KEY;
  const blinkposBtcWalletId = process.env.BLINKPOS_BTC_WALLET_ID;
  const blinkposAPI = new BlinkAPI(blinkposApiKey);

  const recipientUsername = forwardingData.blinkLnAddressUsername;
  const baseAmount = forwardingData.baseAmount || amount;
  const tipAmount = forwardingData.tipAmount || 0;
  const tipRecipients = forwardingData.tipRecipients || [];
  const memo = forwardingData.memo || `${baseAmount} sats`;
  const forwardingMemo = memo.startsWith('BlinkPOS:') ? memo : `BlinkPOS: ${memo}`;

  // Look up recipient's BTC wallet
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: walletLookupQuery,
      variables: { username: recipientUsername }
    })
  });

  const walletLookupData = await walletLookupResponse.json();
  const btcWalletId = walletLookupData.data?.accountDefaultWallet?.id || forwardingData.blinkLnAddressWalletId;

  if (!btcWalletId) {
    throw new Error(`Could not find BTC wallet for ${recipientUsername}`);
  }

  // Create invoice on behalf of recipient
  const createInvoiceQuery = `
    mutation lnInvoiceCreateOnBehalfOfRecipient($input: LnInvoiceCreateOnBehalfOfRecipientInput!) {
      lnInvoiceCreateOnBehalfOfRecipient(input: $input) {
        errors { message }
        invoice {
          paymentHash
          paymentRequest
          satoshis
        }
      }
    }
  `;

  const invoiceResponse = await fetch('https://api.blink.sv/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
                     invoiceData.data?.lnInvoiceCreateOnBehalfOfRecipient?.errors?.[0]?.message;
    throw new Error(`Failed to create invoice: ${errorMsg}`);
  }

  const recipientInvoice = invoiceData.data?.lnInvoiceCreateOnBehalfOfRecipient?.invoice;
  if (!recipientInvoice?.paymentRequest) {
    throw new Error('No invoice returned from recipient wallet');
  }

  // Pay the invoice from BlinkPOS
  const paymentResult = await blinkposAPI.payLnInvoice(
    blinkposBtcWalletId,
    recipientInvoice.paymentRequest,
    forwardingMemo
  );

  if (paymentResult.status !== 'SUCCESS') {
    throw new Error(`Payment failed: ${paymentResult.status}`);
  }

  // Send tips if applicable
  let tipResult = null;
  if (tipAmount > 0 && tipRecipients.length > 0) {
    tipResult = await sendTips(blinkposAPI, blinkposBtcWalletId, tipAmount, tipRecipients, forwardingData);
  }

  // Clean up forwarding data
  await hybridStore.removeTipData(paymentHash);

  return {
    type: 'ln_address',
    recipientUsername,
    baseAmount,
    tipAmount,
    tipResult
  };
}

/**
 * Forward payment to npub.cash via LNURL-pay
 */
async function forwardToNpubCash(paymentHash, amount, forwardingData, hybridStore) {
  const blinkposApiKey = process.env.BLINKPOS_API_KEY;
  const blinkposBtcWalletId = process.env.BLINKPOS_BTC_WALLET_ID;
  const blinkposAPI = new BlinkAPI(blinkposApiKey);

  const recipientAddress = forwardingData.npubCashLightningAddress;
  const baseAmount = forwardingData.baseAmount || amount;
  const tipAmount = forwardingData.tipAmount || 0;
  const tipRecipients = forwardingData.tipRecipients || [];
  const memo = forwardingData.memo || `${baseAmount} sats`;
  const forwardingMemo = memo.startsWith('BlinkPOS:') ? memo : `BlinkPOS: ${memo}`;

  // Get invoice from npub.cash via LNURL-pay
  const invoiceResult = await getInvoiceFromLightningAddress(recipientAddress, baseAmount * 1000, forwardingMemo);
  
  if (!invoiceResult.success || !invoiceResult.invoice) {
    throw new Error(`Failed to get invoice from ${recipientAddress}: ${invoiceResult.error}`);
  }

  // Pay the invoice from BlinkPOS
  const paymentResult = await blinkposAPI.payLnInvoice(
    blinkposBtcWalletId,
    invoiceResult.invoice,
    forwardingMemo
  );

  if (paymentResult.status !== 'SUCCESS') {
    throw new Error(`Payment failed: ${paymentResult.status}`);
  }

  // Send tips if applicable
  let tipResult = null;
  if (tipAmount > 0 && tipRecipients.length > 0) {
    tipResult = await sendTips(blinkposAPI, blinkposBtcWalletId, tipAmount, tipRecipients, forwardingData);
  }

  // Clean up forwarding data
  await hybridStore.removeTipData(paymentHash);

  return {
    type: 'npub_cash',
    recipientAddress,
    baseAmount,
    tipAmount,
    tipResult
  };
}

/**
 * Forward payment to user's Blink wallet via their API key
 */
async function forwardToUserWallet(paymentHash, amount, forwardingData, hybridStore) {
  const blinkposApiKey = process.env.BLINKPOS_API_KEY;
  const blinkposBtcWalletId = process.env.BLINKPOS_BTC_WALLET_ID;
  const blinkposAPI = new BlinkAPI(blinkposApiKey);

  const userApiKey = forwardingData.userApiKey;
  const userWalletId = forwardingData.userWalletId;
  const baseAmount = forwardingData.baseAmount || amount;
  const tipAmount = forwardingData.tipAmount || 0;
  const tipRecipients = forwardingData.tipRecipients || [];
  const memo = forwardingData.memo || `${baseAmount} sats`;
  const forwardingMemo = memo.startsWith('BlinkPOS:') ? memo : `BlinkPOS: ${memo}`;

  // Create invoice on user's wallet
  const userAPI = new BlinkAPI(userApiKey);
  const userInvoice = await userAPI.createLnInvoice(userWalletId, Math.round(baseAmount), forwardingMemo);

  if (!userInvoice?.paymentRequest) {
    throw new Error('Failed to create invoice on user wallet');
  }

  // Pay the invoice from BlinkPOS
  const paymentResult = await blinkposAPI.payLnInvoice(
    blinkposBtcWalletId,
    userInvoice.paymentRequest,
    forwardingMemo
  );

  if (paymentResult.status !== 'SUCCESS') {
    throw new Error(`Payment failed: ${paymentResult.status}`);
  }

  // Send tips if applicable
  let tipResult = null;
  if (tipAmount > 0 && tipRecipients.length > 0) {
    tipResult = await sendTips(blinkposAPI, blinkposBtcWalletId, tipAmount, tipRecipients, forwardingData);
  }

  // Clean up forwarding data
  await hybridStore.removeTipData(paymentHash);

  return {
    type: 'user_wallet',
    baseAmount,
    tipAmount,
    tipResult
  };
}

/**
 * Send tips to recipients
 */
async function sendTips(blinkposAPI, blinkposBtcWalletId, tipAmount, tipRecipients, forwardingData) {
  const { formatCurrencyServer } = require('../../../lib/currency-formatter-server');
  
  const displayCurrency = forwardingData.displayCurrency || 'BTC';
  const tipAmountDisplay = forwardingData.tipAmountDisplay || tipAmount;
  
  const tipPerRecipient = Math.floor(tipAmount / tipRecipients.length);
  const remainder = tipAmount - (tipPerRecipient * tipRecipients.length);
  const tipPerRecipientDisplay = tipAmountDisplay / tipRecipients.length;
  
  const tipResults = [];
  const isMultiple = tipRecipients.length > 1;

  for (let i = 0; i < tipRecipients.length; i++) {
    const recipient = tipRecipients[i];
    const recipientTipAmount = i === 0 ? tipPerRecipient + remainder : tipPerRecipient;

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
        tipResults.push({ success: true, amount: recipientTipAmount, recipient: `${recipient.username}@blink.sv` });
      } else {
        tipResults.push({ success: false, recipient: `${recipient.username}@blink.sv`, error: `Failed: ${tipPaymentResult.status}` });
      }
    } catch (tipError) {
      tipResults.push({ success: false, recipient: `${recipient.username}@blink.sv`, error: tipError.message });
    }
  }

  const successCount = tipResults.filter(r => r.success).length;
  return {
    success: successCount === tipRecipients.length,
    partialSuccess: successCount > 0 && successCount < tipRecipients.length,
    totalAmount: tipAmount,
    recipients: tipResults,
    successCount,
    totalCount: tipRecipients.length
  };
}

// Disable body parsing so we can access raw body for signature verification
export const config = {
  api: {
    bodyParser: true,
  },
};
