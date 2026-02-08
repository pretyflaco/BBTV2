/**
 * Boltcard LNURL-withdraw - Handle card tap payments
 * 
 * Implements LNURL-withdraw (LUD-03) for Boltcard spending:
 * - Card tap generates LNURL-withdraw URL with encrypted PICCData + SunMAC
 * - Server verifies card authentication
 * - Server checks balance and spending limits
 * - Server pays the invoice from the card's wallet
 * 
 * Flow:
 * 1. Card tap -> NFC reader gets LNURL from card
 * 2. Wallet scans -> GET request to our /api/boltcard/lnurlw/{cardId}?p=...&c=...
 * 3. We verify and return LNURL-withdraw response
 * 4. Wallet sends invoice -> POST to callback URL
 * 5. We pay invoice from card's Blink wallet
 * 
 * References:
 * - LUD-03: https://github.com/lnurl/luds/blob/luds/03.md
 * - BTCPay Boltcards Plugin
 */

const bech32 = require('bech32');
const boltcardStore = require('./store');
const { CardStatus, TxType } = require('./store');
const boltcardCrypto = require('./crypto');

/**
 * Generate LNURL-bech32 encoding for a URL
 * @param {string} url - URL to encode
 * @returns {string} LNURL-bech32 encoded string
 */
function encodeLnurl(url) {
  const words = bech32.bech32.toWords(Buffer.from(url, 'utf8'));
  return bech32.bech32.encode('lnurl', words, 2000);
}

/**
 * Decode LNURL-bech32 to URL
 * @param {string} lnurl - LNURL-bech32 encoded string
 * @returns {string} Decoded URL
 */
function decodeLnurl(lnurl) {
  const { words } = bech32.bech32.decode(lnurl, 2000);
  return Buffer.from(bech32.bech32.fromWords(words)).toString('utf8');
}

/**
 * Generate the base LNURL-withdraw URL for a card
 * This URL is programmed into the card's NDEF record
 * 
 * @param {string} serverUrl - BlinkPOS server URL (e.g., https://pos.example.com)
 * @param {string} cardId - Card ID from database
 * @returns {string} Base URL (without p/c params, those are added by the card)
 */
function generateCardUrl(serverUrl, cardId) {
  // Remove trailing slash
  const baseUrl = serverUrl.replace(/\/$/, '');
  
  // The card will append ?p=...&c=... when tapped
  // The URL stored in the card's NDEF record
  return `${baseUrl}/api/boltcard/lnurlw/${cardId}`;
}

/**
 * Generate LNURL for card programming
 * @param {string} serverUrl - BlinkPOS server URL
 * @param {string} cardId - Card ID
 * @returns {string} LNURL-bech32 encoded URL
 */
function generateCardLnurl(serverUrl, cardId) {
  const url = generateCardUrl(serverUrl, cardId);
  return encodeLnurl(url);
}

/**
 * Process LNURL-withdraw GET request (card tap)
 * Returns the LNURL-withdraw response or error
 * 
 * @param {string} cardId - Card ID from URL path
 * @param {string} piccDataHex - 'p' query parameter (encrypted PICCData)
 * @param {string} sunMacHex - 'c' query parameter (SunMAC)
 * @param {string} callbackUrl - Callback URL for invoice submission
 * @returns {Promise<object>} LNURL-withdraw response or error
 */
async function handleWithdrawRequest(cardId, piccDataHex, sunMacHex, callbackUrl) {
  // Get card with keys
  const card = await boltcardStore.getCard(cardId, true);
  
  if (!card) {
    return {
      status: 'ERROR',
      reason: 'Card not found',
    };
  }
  
  if (card.status !== CardStatus.ACTIVE) {
    return {
      status: 'ERROR',
      reason: `Card is ${card.status.toLowerCase()}`,
    };
  }
  
  // Verify card tap (SunMAC + PICCData decryption + counter)
  const verifyResult = boltcardCrypto.verifyCardTap(
    piccDataHex,
    sunMacHex,
    card.k1,
    card.k2,
    card.cardUid,
    card.lastCounter
  );
  
  if (!verifyResult.valid) {
    console.log(`[LNURLW] Card verification failed for ${cardId}: ${verifyResult.error}`);
    return {
      status: 'ERROR',
      reason: verifyResult.error,
    };
  }
  
  // Update counter for replay protection
  await boltcardStore.updateLastCounter(cardId, verifyResult.counter);
  
  // Check balance
  if (card.balance <= 0) {
    return {
      status: 'ERROR',
      reason: 'Card has no balance',
    };
  }
  
  // Calculate available amount (considering limits)
  let maxWithdrawable = card.balance;
  
  // Apply per-transaction limit
  if (card.maxTxAmount && card.maxTxAmount < maxWithdrawable) {
    maxWithdrawable = card.maxTxAmount;
  }
  
  // Apply daily limit
  if (card.dailyLimit) {
    const remainingDaily = card.dailyLimit - card.dailySpent;
    if (remainingDaily < maxWithdrawable) {
      maxWithdrawable = remainingDaily;
    }
  }
  
  if (maxWithdrawable <= 0) {
    return {
      status: 'ERROR',
      reason: 'Daily spending limit reached',
    };
  }
  
  // Convert to millisats for LNURL (1 sat = 1000 msats)
  const unit = card.walletCurrency === 'USD' ? 'cents' : 'sats';
  const maxWithdrawableMsats = maxWithdrawable * 1000;
  const minWithdrawableMsats = 1000; // Minimum 1 sat/cent
  
  console.log(`[LNURLW] Card ${cardId} tap verified. Max withdrawable: ${maxWithdrawable} ${unit}`);
  
  // Return LNURL-withdraw response
  return {
    tag: 'withdrawRequest',
    callback: callbackUrl,
    k1: cardId, // Use cardId as k1 for simplicity (identifies the withdrawal session)
    defaultDescription: `Boltcard payment (${card.name || 'Card'})`,
    minWithdrawable: minWithdrawableMsats,
    maxWithdrawable: maxWithdrawableMsats,
    // Extension fields
    balanceCheck: `${callbackUrl.replace('/callback', '/balance')}`,
    payLink: `${callbackUrl.replace('/lnurlw/', '/lnurlp/')}`, // For top-up
  };
}

/**
 * Process LNURL-withdraw callback (invoice submission)
 * Pays the invoice from the card's Blink wallet
 * 
 * @param {string} cardId - Card ID (from k1 parameter)
 * @param {string} invoice - BOLT11 invoice to pay
 * @param {function} payInvoice - Function to pay invoice (amount, invoice, apiKey, environment) -> { success, paymentHash, error }
 * @returns {Promise<object>} Result { status, paymentHash? }
 */
async function handleWithdrawCallback(cardId, invoice, payInvoice) {
  // Get card with keys
  const card = await boltcardStore.getCard(cardId, true);
  
  if (!card) {
    return {
      status: 'ERROR',
      reason: 'Card not found',
    };
  }
  
  if (card.status !== CardStatus.ACTIVE) {
    return {
      status: 'ERROR',
      reason: `Card is ${card.status.toLowerCase()}`,
    };
  }
  
  // Decode invoice to get amount
  const invoiceAmount = parseInvoiceAmount(invoice);
  if (!invoiceAmount || invoiceAmount.sats <= 0) {
    return {
      status: 'ERROR',
      reason: 'Invalid invoice amount',
    };
  }
  
  const amount = card.walletCurrency === 'USD' ? invoiceAmount.cents : invoiceAmount.sats;
  
  // Try to deduct from card balance (atomic operation with limit checks)
  const deductResult = await boltcardStore.incrementDailySpent(cardId, amount);
  
  if (!deductResult.success) {
    return {
      status: 'ERROR',
      reason: deductResult.error || 'Failed to process payment',
    };
  }
  
  // Pay the invoice
  const payResult = await payInvoice(invoiceAmount.sats, invoice, card.apiKey, card.environment);
  
  if (!payResult.success) {
    // Rollback: restore balance
    await boltcardStore.rollbackSpend(cardId, amount);
    
    console.log(`[LNURLW] Payment failed for card ${cardId}, rolled back ${amount}`);
    
    return {
      status: 'ERROR',
      reason: payResult.error || 'Payment failed',
    };
  }
  
  // Record the transaction
  await boltcardStore.recordTransaction(cardId, {
    type: TxType.WITHDRAW,
    amount: amount,
    balanceAfter: deductResult.balance,
    paymentHash: payResult.paymentHash,
    description: 'Card payment',
  });
  
  console.log(`[LNURLW] Card ${cardId} payment successful: ${amount} ${card.walletCurrency === 'USD' ? 'cents' : 'sats'}`);
  
  return {
    status: 'OK',
    paymentHash: payResult.paymentHash,
  };
}

/**
 * Parse invoice amount from BOLT11 invoice
 * @param {string} invoice - BOLT11 invoice string
 * @returns {object|null} { sats, msats, cents } or null
 */
function parseInvoiceAmount(invoice) {
  try {
    // BOLT11 invoice amount is encoded in the human-readable part
    // Format: ln{network}{amount}{multiplier}...
    const lower = invoice.toLowerCase();
    
    // Find the amount part after 'ln' prefix
    let amountPart = '';
    let multiplier = 1;
    
    // Extract network and amount
    const match = lower.match(/^ln(bc|tb|tbs)(\d+)([munp])?/);
    if (!match) {
      // No amount in invoice (amountless invoice)
      return null;
    }
    
    const amountStr = match[2];
    const mult = match[3];
    
    let msats = BigInt(amountStr);
    
    // Apply multiplier
    switch (mult) {
      case 'm': // milli-bitcoin (0.001 BTC)
        msats = msats * BigInt(100000000000); // 1 mBTC = 100,000,000,000 msats
        break;
      case 'u': // micro-bitcoin (0.000001 BTC)
        msats = msats * BigInt(100000000); // 1 uBTC = 100,000,000 msats
        break;
      case 'n': // nano-bitcoin (0.000000001 BTC)
        msats = msats * BigInt(100000); // 1 nBTC = 100,000 msats
        break;
      case 'p': // pico-bitcoin (0.000000000001 BTC)
        msats = msats * BigInt(100); // 1 pBTC = 100 msats
        break;
      default:
        // No multiplier means BTC
        msats = msats * BigInt(100000000000000); // 1 BTC = 100,000,000,000,000 msats
    }
    
    const sats = Number(msats / BigInt(1000));
    
    // Estimate cents (rough conversion, actual rate would need to be fetched)
    // For USD wallet, we'll need the actual BTC/USD rate from Blink
    const cents = sats; // Placeholder - actual conversion happens in Blink API
    
    return {
      msats: Number(msats),
      sats,
      cents, // Note: This is a placeholder, actual USD conversion needs exchange rate
    };
  } catch (error) {
    console.error('[LNURLW] parseInvoiceAmount error:', error.message);
    return null;
  }
}

/**
 * Get card balance for LNURL balance check
 * @param {string} cardId - Card ID
 * @returns {Promise<object>} Balance info
 */
async function getCardBalance(cardId) {
  const card = await boltcardStore.getCard(cardId);
  
  if (!card) {
    return { error: 'Card not found' };
  }
  
  const unit = card.walletCurrency === 'USD' ? 'cents' : 'sats';
  
  return {
    balance: card.balance,
    unit,
    currency: card.walletCurrency,
    dailyLimit: card.dailyLimit,
    dailySpent: card.dailySpent,
    dailyRemaining: card.dailyLimit ? card.dailyLimit - card.dailySpent : null,
    maxTxAmount: card.maxTxAmount,
  };
}

module.exports = {
  encodeLnurl,
  decodeLnurl,
  generateCardUrl,
  generateCardLnurl,
  handleWithdrawRequest,
  handleWithdrawCallback,
  parseInvoiceAmount,
  getCardBalance,
};
