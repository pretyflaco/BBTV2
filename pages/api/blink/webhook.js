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

// WebSocket polyfill for Node.js environment (required for NWCClient)
// nostr-tools uses WebSocket which is only available in browsers by default
import WebSocket from 'ws';
if (typeof global !== 'undefined' && !global.WebSocket) {
  global.WebSocket = WebSocket;
}

import BlinkAPI from '../../../lib/blink-api';
import { verifyWebhookSignature } from '../../../lib/webhook-verify';
import { getInvoiceFromLightningAddress } from '../../../lib/lnurl';
import NWCClient from '../../../lib/nwc/NWCClient';
const AuthManager = require('../../../lib/auth');
const { getHybridStore } = require('../../../lib/storage/hybrid-store');
const { formatCurrencyServer } = require('../../../lib/currency-formatter-server');

/**
 * Generate enhanced memo with tip split information
 * Format: "BlinkPOS: $X + Y% tip = $Z (N sats) | $A (M sat) tip split to recipient1, recipient2"
 */
function generateEnhancedMemo(memo, baseAmount, tipAmount, tipRecipients, displayCurrency, tipAmountDisplay) {
  const recipientNames = tipRecipients.map(r => r.username || r).join(', ');
  
  if (memo && tipAmount > 0 && tipRecipients.length > 0) {
    let tipAmountText;
    if (displayCurrency === 'BTC') {
      tipAmountText = `${tipAmount} sat`;
    } else {
      const formattedAmount = formatCurrencyServer(tipAmountDisplay || tipAmount, displayCurrency);
      tipAmountText = `${formattedAmount} (${tipAmount} sat)`;
    }
    
    // Try to enhance the memo with tip info
    const enhancedMemoContent = memo.replace(
      /([^+]+?)\s*\+\s*([\d.]+)%\s*tip\s*=\s*(.+)/,
      (match, baseAmountStr, tipPercent, total) => {
        const cleanBaseAmount = baseAmountStr.trim();
        const splitText = tipRecipients.length > 1 ? 'split to' : 'to';
        return `${cleanBaseAmount} + ${tipPercent}% tip = ${total} | ${tipAmountText} tip ${splitText} ${recipientNames}`;
      }
    );
    
    return `BlinkPOS: ${enhancedMemoContent !== memo ? enhancedMemoContent : memo}`;
  }
  
  // Fallback to basic memo
  return memo ? (memo.startsWith('BlinkPOS:') ? memo : `BlinkPOS: ${memo}`) : `BlinkPOS: ${baseAmount} sats`;
}

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
      forwardingData.nwcConnectionUri = forwardingData.metadata.nwcConnectionUri || null;
      forwardingData.blinkLnAddress = forwardingData.metadata.blinkLnAddress || false;
      forwardingData.blinkLnAddressWalletId = forwardingData.metadata.blinkLnAddressWalletId || null;
      forwardingData.blinkLnAddressUsername = forwardingData.metadata.blinkLnAddressUsername || null;
      forwardingData.npubCashActive = forwardingData.metadata.npubCashActive || false;
      forwardingData.npubCashLightningAddress = forwardingData.metadata.npubCashLightningAddress || null;
      forwardingData.displayCurrency = forwardingData.metadata.displayCurrency || 'BTC';
      forwardingData.tipAmountDisplay = forwardingData.metadata.tipAmountDisplay || null;
    }

    console.log('📄 [Webhook] Forwarding data found:', {
      nwcActive: forwardingData.nwcActive,
      hasNwcConnectionUri: !!forwardingData.nwcConnectionUri,
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
      else if (forwardingData.nwcActive && forwardingData.nwcConnectionUri) {
        // Forward to NWC wallet using stored encrypted connection URI
        console.log('📱 [Webhook] Forwarding to NWC wallet');
        forwardResult = await forwardToNWCWallet(paymentHash, amount, forwardingData, hybridStore);
      }
      else if (forwardingData.nwcActive) {
        // NWC active but no URI stored (legacy invoice or error)
        console.log('⚠️ [Webhook] NWC payment but no connection URI - client must handle');
        // Release the claim so client can try
        await hybridStore.releaseFailedClaim(paymentHash, 'NWC requires client-side forwarding (no URI stored)');
        return res.status(200).json({
          status: 'nwc_requires_client',
          reason: 'NWC forwarding requires connection URI (not stored with invoice)'
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
  const displayCurrency = forwardingData.displayCurrency || 'BTC';
  const tipAmountDisplay = forwardingData.tipAmountDisplay || tipAmount;
  const forwardingMemo = generateEnhancedMemo(memo, baseAmount, tipAmount, tipRecipients, displayCurrency, tipAmountDisplay);

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
  const displayCurrency = forwardingData.displayCurrency || 'BTC';
  const tipAmountDisplay = forwardingData.tipAmountDisplay || tipAmount;
  const forwardingMemo = generateEnhancedMemo(memo, baseAmount, tipAmount, tipRecipients, displayCurrency, tipAmountDisplay);

  // Get invoice from npub.cash via LNURL-pay
  // Note: getInvoiceFromLightningAddress takes sats, not millisats
  const invoiceResult = await getInvoiceFromLightningAddress(recipientAddress, baseAmount, forwardingMemo);
  
  if (!invoiceResult.paymentRequest) {
    throw new Error(`Failed to get invoice from ${recipientAddress}: No payment request returned`);
  }

  console.log('✅ [Webhook] Got invoice from npub.cash:', {
    recipient: recipientAddress,
    amount: baseAmount,
    hasPaymentRequest: !!invoiceResult.paymentRequest
  });

  // Pay the invoice from BlinkPOS
  const paymentResult = await blinkposAPI.payLnInvoice(
    blinkposBtcWalletId,
    invoiceResult.paymentRequest,
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
 * Forward payment to NWC (Nostr Wallet Connect) wallet
 * This creates an invoice on the user's NWC wallet and pays it from BlinkPOS
 */
async function forwardToNWCWallet(paymentHash, amount, forwardingData, hybridStore) {
  const blinkposApiKey = process.env.BLINKPOS_API_KEY;
  const blinkposBtcWalletId = process.env.BLINKPOS_BTC_WALLET_ID;
  const blinkposAPI = new BlinkAPI(blinkposApiKey);

  // Decrypt the NWC connection URI
  const encryptedNwcUri = forwardingData.nwcConnectionUri;
  if (!encryptedNwcUri) {
    throw new Error('No NWC connection URI available');
  }
  
  const nwcUri = AuthManager.decryptApiKey(encryptedNwcUri);
  if (!nwcUri) {
    throw new Error('Failed to decrypt NWC connection URI');
  }

  const baseAmount = forwardingData.baseAmount || amount;
  const tipAmount = forwardingData.tipAmount || 0;
  const tipRecipients = forwardingData.tipRecipients || [];
  const memo = forwardingData.memo || `${baseAmount} sats`;
  const displayCurrency = forwardingData.displayCurrency || 'BTC';
  const tipAmountDisplay = forwardingData.tipAmountDisplay || tipAmount;
  const forwardingMemo = generateEnhancedMemo(memo, baseAmount, tipAmount, tipRecipients, displayCurrency, tipAmountDisplay);

  console.log('📱 [Webhook] Creating NWC invoice for forwarding:', {
    baseAmount,
    tipAmount,
    hasTipRecipients: tipRecipients.length > 0
  });

  // Create NWC client and invoice
  const nwcClient = new NWCClient(nwcUri);
  
  let invoiceResult;
  try {
    invoiceResult = await nwcClient.makeInvoice({
      amount: baseAmount * 1000, // NWC uses millisats
      description: forwardingMemo,
      expiry: 3600
    });
  } catch (nwcError) {
    console.error('❌ [Webhook] NWC makeInvoice threw error:', nwcError);
    nwcClient.close();
    throw new Error(`NWC invoice creation error: ${nwcError.message}`);
  }

  if (invoiceResult.error || !invoiceResult.result?.invoice) {
    const errorMsg = invoiceResult.error?.message || 'No invoice returned from NWC wallet';
    console.error('❌ [Webhook] NWC invoice creation failed:', errorMsg, invoiceResult);
    nwcClient.close();
    throw new Error(`NWC invoice creation failed: ${errorMsg}`);
  }

  console.log('✅ [Webhook] NWC invoice created:', {
    paymentHash: invoiceResult.result.payment_hash?.substring(0, 16) + '...',
    hasInvoice: !!invoiceResult.result.invoice
  });

  // Close NWC client - we have the invoice
  nwcClient.close();

  // Pay the invoice from BlinkPOS
  const paymentResult = await blinkposAPI.payLnInvoice(
    blinkposBtcWalletId,
    invoiceResult.result.invoice,
    forwardingMemo
  );

  if (paymentResult.status !== 'SUCCESS') {
    throw new Error(`Payment to NWC wallet failed: ${paymentResult.status}`);
  }

  console.log('✅ [Webhook] NWC base amount forwarded successfully');

  // Send tips if applicable
  let tipResult = null;
  if (tipAmount > 0 && tipRecipients.length > 0) {
    tipResult = await sendTips(blinkposAPI, blinkposBtcWalletId, tipAmount, tipRecipients, forwardingData);
  }

  // Clean up forwarding data
  await hybridStore.removeTipData(paymentHash);

  return {
    type: 'nwc',
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
  const displayCurrency = forwardingData.displayCurrency || 'BTC';
  const tipAmountDisplay = forwardingData.tipAmountDisplay || tipAmount;
  const forwardingMemo = generateEnhancedMemo(memo, baseAmount, tipAmount, tipRecipients, displayCurrency, tipAmountDisplay);

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
 * Supports both Blink usernames and npub.cash addresses
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
    // Distribute remainder evenly: first 'remainder' recipients get +1 sat each
    const recipientTipAmount = i < remainder ? tipPerRecipient + 1 : tipPerRecipient;
    
    // Skip recipients who would receive 0 sats (cannot create 0-sat invoice)
    if (recipientTipAmount <= 0) {
      console.log(`⏭️ [Webhook] Skipping tip to ${recipient.username}: amount is ${recipientTipAmount} sats (minimum 1 sat required)`);
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
        console.log(`🥜 [Webhook] Sending tip to npub.cash: ${recipient.username}`);
        
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
          console.log(`💰 [Webhook] Tip successfully sent to ${recipient.username}`);
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
          console.log(`💰 [Webhook] Tip successfully sent to ${recipient.username}@blink.sv`);
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
