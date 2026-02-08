/**
 * Boltcard LNURL-pay - Handle card top-up via Lightning
 * 
 * Implements LNURL-pay (LUD-06) for Boltcard top-up:
 * - Users can top up their card by paying an LNURL-pay
 * - Similar to BTCPay Boltcards plugin top-up flow
 * - Supports both BTC and USD (Stablesats) cards
 * 
 * Flow:
 * 1. User scans card's top-up QR code (LNURL-pay)
 * 2. GET request to /api/boltcard/lnurlp/{cardId}
 * 3. We return LNURL-pay metadata (min/max amounts)
 * 4. User enters amount, wallet sends amount to callback
 * 5. We generate Blink invoice and return it
 * 6. User pays invoice
 * 7. Webhook or polling detects payment, credits card balance
 * 
 * References:
 * - LUD-06: https://github.com/lnurl/luds/blob/luds/06.md
 * - LUD-09: https://github.com/lnurl/luds/blob/luds/09.md (successAction)
 * - BTCPay Boltcards Plugin top-up
 */

const bech32 = require('bech32');
const boltcardStore = require('./store');
const { CardStatus, TxType } = require('./store');

/**
 * Encode URL to LNURL-bech32
 * @param {string} url - URL to encode
 * @returns {string} LNURL-bech32 string
 */
function encodeLnurl(url) {
  const words = bech32.bech32.toWords(Buffer.from(url, 'utf8'));
  return bech32.bech32.encode('lnurl', words, 2000);
}

/**
 * Generate the LNURL-pay URL for card top-up
 * @param {string} serverUrl - BlinkPOS server URL
 * @param {string} cardId - Card ID from database
 * @returns {string} Top-up URL
 */
function generateTopUpUrl(serverUrl, cardId) {
  const baseUrl = serverUrl.replace(/\/$/, '');
  return `${baseUrl}/api/boltcard/lnurlp/${cardId}`;
}

/**
 * Generate LNURL for card top-up
 * @param {string} serverUrl - BlinkPOS server URL
 * @param {string} cardId - Card ID
 * @returns {string} LNURL-bech32 encoded URL
 */
function generateTopUpLnurl(serverUrl, cardId) {
  const url = generateTopUpUrl(serverUrl, cardId);
  return encodeLnurl(url);
}

/**
 * Default limits for top-up (in sats/cents)
 */
const TopUpLimits = {
  BTC: {
    min: 100,        // 100 sats minimum
    max: 10000000,   // 10M sats (~$4000 at $40k/BTC)
  },
  USD: {
    min: 10,         // 10 cents minimum
    max: 100000,     // $1000 maximum
  },
};

/**
 * Process LNURL-pay GET request (top-up metadata)
 * Returns the LNURL-pay response
 * 
 * @param {string} cardId - Card ID from URL path
 * @param {string} serverUrl - Server URL for callback
 * @returns {Promise<object>} LNURL-pay response or error
 */
async function handleTopUpRequest(cardId, serverUrl) {
  // Get card (no keys needed for top-up)
  const card = await boltcardStore.getCard(cardId);
  
  if (!card) {
    return {
      status: 'ERROR',
      reason: 'Card not found',
    };
  }
  
  // Allow top-up for PENDING and ACTIVE cards
  if (card.status !== CardStatus.ACTIVE && card.status !== CardStatus.PENDING) {
    return {
      status: 'ERROR',
      reason: `Card is ${card.status.toLowerCase()}`,
    };
  }
  
  const limits = TopUpLimits[card.walletCurrency];
  const unit = card.walletCurrency === 'USD' ? 'cents' : 'sats';
  
  // Convert to millisats for LNURL
  const minSendable = limits.min * 1000;
  const maxSendable = limits.max * 1000;
  
  const callbackUrl = `${serverUrl.replace(/\/$/, '')}/api/boltcard/lnurlp/${cardId}/callback`;
  
  console.log(`[LNURLP] Top-up request for card ${cardId}. Balance: ${card.balance} ${unit}`);
  
  // Build metadata (required by LUD-06)
  const metadata = JSON.stringify([
    ['text/plain', `Top up ${card.name || 'Boltcard'}`],
    ['text/identifier', `card:${cardId.substring(0, 8)}`],
  ]);
  
  return {
    tag: 'payRequest',
    callback: callbackUrl,
    minSendable,
    maxSendable,
    metadata,
    // Optional: allow payer to specify comment
    commentAllowed: 100,
  };
}

/**
 * Process LNURL-pay callback (invoice request)
 * Generates a Blink invoice for the top-up amount
 * 
 * @param {string} cardId - Card ID from URL path
 * @param {number} amountMsats - Amount in millisats from query
 * @param {string} comment - Optional comment from payer
 * @param {function} createInvoice - Function to create invoice (amount, memo, walletId, apiKey, environment) -> { invoice, paymentHash, error }
 * @returns {Promise<object>} LNURL-pay callback response
 */
async function handleTopUpCallback(cardId, amountMsats, comment, createInvoice) {
  // Get card with keys (need apiKey for invoice creation)
  const card = await boltcardStore.getCard(cardId, true);
  
  if (!card) {
    return {
      status: 'ERROR',
      reason: 'Card not found',
    };
  }
  
  if (card.status !== CardStatus.ACTIVE && card.status !== CardStatus.PENDING) {
    return {
      status: 'ERROR',
      reason: `Card is ${card.status.toLowerCase()}`,
    };
  }
  
  const limits = TopUpLimits[card.walletCurrency];
  const amountSats = Math.floor(amountMsats / 1000);
  
  // Validate amount
  if (amountSats < limits.min) {
    return {
      status: 'ERROR',
      reason: `Minimum top-up is ${limits.min} ${card.walletCurrency === 'USD' ? 'cents' : 'sats'}`,
    };
  }
  
  if (amountSats > limits.max) {
    return {
      status: 'ERROR',
      reason: `Maximum top-up is ${limits.max} ${card.walletCurrency === 'USD' ? 'cents' : 'sats'}`,
    };
  }
  
  // Create memo for invoice
  const memo = comment 
    ? `Boltcard top-up: ${comment}`
    : `Top up ${card.name || 'Boltcard'}`;
  
  // Create invoice via Blink
  // Note: For USD cards, the invoice is still in sats but settles to USD wallet
  const invoiceResult = await createInvoice(
    amountSats,
    memo,
    card.walletId,
    card.apiKey,
    card.environment
  );
  
  if (invoiceResult.error) {
    return {
      status: 'ERROR',
      reason: invoiceResult.error,
    };
  }
  
  // Store pending top-up for webhook processing
  // We'll credit the card when the invoice is paid
  // For now, we'll use the payment hash to track this
  await storePendingTopUp(cardId, invoiceResult.paymentHash, amountSats, card.walletCurrency);
  
  console.log(`[LNURLP] Generated invoice for card ${cardId} top-up: ${amountSats} sats`);
  
  return {
    pr: invoiceResult.invoice,
    // Success action - show message when paid
    successAction: {
      tag: 'message',
      message: `Card topped up with ${amountSats} ${card.walletCurrency === 'USD' ? 'cents' : 'sats'}!`,
    },
    // Routes for MPP (optional)
    routes: [],
  };
}

/**
 * Store a pending top-up for webhook processing
 * Uses database storage for persistence across server restarts
 * Also maintains in-memory cache for fast lookups
 * 
 * @param {string} cardId - Card ID
 * @param {string} paymentHash - Payment hash from invoice
 * @param {number} amount - Amount in sats/cents
 * @param {string} currency - 'BTC' or 'USD'
 */
// In-memory cache for fast lookups (populated from DB on miss)
const pendingTopUpsCache = new Map();

async function storePendingTopUp(cardId, paymentHash, amount, currency) {
  // Store in database for persistence
  const stored = await boltcardStore.storePendingTopUp(cardId, paymentHash, amount, currency);
  
  if (stored) {
    // Also cache in memory for fast lookups
    pendingTopUpsCache.set(paymentHash, {
      cardId,
      amount,
      currency,
      createdAt: Date.now(),
    });
    
    // Clean up old cache entries (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [hash, data] of pendingTopUpsCache.entries()) {
      if (data.createdAt < oneHourAgo) {
        pendingTopUpsCache.delete(hash);
      }
    }
  }
  
  return stored;
}

/**
 * Process a paid top-up (called from webhook or polling)
 * Credits the card balance
 * 
 * @param {string} paymentHash - Payment hash that was paid
 * @returns {Promise<object>} Result { success, cardId, amount, error }
 */
async function processTopUpPayment(paymentHash) {
  // Try cache first, then database
  let pending = pendingTopUpsCache.get(paymentHash);
  
  if (!pending) {
    // Not in cache, try database
    pending = await boltcardStore.getPendingTopUp(paymentHash);
    
    if (!pending) {
      console.log(`[LNURLP] No pending top-up found for payment hash: ${paymentHash}`);
      return { success: false, error: 'No pending top-up found' };
    }
  }
  
  const { cardId, amount, currency } = pending;
  
  // Credit the card
  const result = await boltcardStore.topUpCard(
    cardId,
    amount,
    paymentHash,
    `Top-up via LNURL-pay`
  );
  
  if (!result.success) {
    return { success: false, error: result.error };
  }
  
  // Mark as processed in database and remove from cache
  await boltcardStore.markTopUpProcessed(paymentHash);
  pendingTopUpsCache.delete(paymentHash);
  
  // If card was PENDING, activate it on first top-up
  const card = await boltcardStore.getCard(cardId);
  if (card && card.status === CardStatus.PENDING) {
    await boltcardStore.activateCard(cardId);
    console.log(`[LNURLP] Card ${cardId} activated on first top-up`);
  }
  
  console.log(`[LNURLP] Processed top-up for card ${cardId}: +${amount} ${currency === 'USD' ? 'cents' : 'sats'}`);
  
  return {
    success: true,
    cardId,
    amount,
    balance: result.balance,
  };
}

/**
 * Check if a payment hash has a pending top-up
 * Checks both cache and database
 * @param {string} paymentHash - Payment hash
 * @returns {Promise<object|null>} Pending top-up data or null
 */
async function getPendingTopUp(paymentHash) {
  // Try cache first
  const cached = pendingTopUpsCache.get(paymentHash);
  if (cached) {
    return cached;
  }
  
  // Try database
  return await boltcardStore.getPendingTopUp(paymentHash);
}

/**
 * Get all pending top-ups (for debugging/admin)
 * @returns {Promise<Array>} Array of pending top-ups
 */
async function getAllPendingTopUps() {
  // Get from database (authoritative source)
  return await boltcardStore.getAllPendingTopUps();
}

/**
 * Generate a QR code data for card top-up
 * Returns both the URL and LNURL-bech32 encoded version
 * 
 * @param {string} serverUrl - BlinkPOS server URL
 * @param {string} cardId - Card ID
 * @returns {object} { url, lnurl }
 */
function generateTopUpQR(serverUrl, cardId) {
  const url = generateTopUpUrl(serverUrl, cardId);
  const lnurl = encodeLnurl(url);
  
  return {
    url,
    lnurl,
    // For display: LNURL is what wallets scan
    qrData: lnurl.toUpperCase(), // Uppercase is more QR-efficient
  };
}

module.exports = {
  encodeLnurl,
  generateTopUpUrl,
  generateTopUpLnurl,
  handleTopUpRequest,
  handleTopUpCallback,
  processTopUpPayment,
  getPendingTopUp,
  getAllPendingTopUps,
  generateTopUpQR,
  TopUpLimits,
};
