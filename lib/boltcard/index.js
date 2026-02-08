/**
 * Boltcard - Native Boltcard support for BlinkPOS
 * 
 * Implements spec-compliant Boltcard functionality per:
 * - https://github.com/boltcard/boltcard/blob/main/docs/DETERMINISTIC.md
 * - https://github.com/boltcard/boltcard/blob/main/docs/DEEPLINK.md
 * 
 * This module provides:
 * - Card registration and management (store.js)
 * - NTAG424DNA spec-compliant cryptographic operations (crypto.js)
 * - LNURL-withdraw for card payments (lnurlw.js)
 * - LNURL-pay for card top-up (lnurlp.js)
 * 
 * Features:
 * - Per-user IssuerKey for deterministic key derivation
 * - Spec-compliant AES-CMAC PRF key derivation
 * - Privacy-preserving card_id_hash
 * - Deeplink flow for NFC Programmer app
 * - Version rotation on card re-programming
 * - Both BTC and USD (Stablesats) wallet support
 * - Server-side balance tracking with spending limits
 * - Replay protection via counter verification
 * 
 * Usage:
 * 
 * ```javascript
 * const boltcard = require('./lib/boltcard');
 * 
 * // Create a new card (spec-compliant, keys derived from IssuerKey)
 * const card = await boltcard.store.createCard({
 *   cardUid,
 *   ownerPubkey,
 *   walletId,
 *   apiKey,
 * }, {
 *   name: 'My Card',
 *   walletCurrency: 'BTC',
 *   maxTxAmount: 100000,
 *   dailyLimit: 500000,
 * });
 * 
 * // Or use deeplink flow (card UID unknown until programming)
 * const pending = await boltcard.store.createPendingRegistration({
 *   ownerPubkey, walletId, apiKey
 * }, { name: 'My Card' });
 * const deeplink = boltcard.crypto.generateProgramDeeplink(keysUrl);
 * 
 * // Handle LNURL-withdraw (card tap)
 * const response = await boltcard.lnurlw.handleWithdrawRequest(
 *   cardId, piccData, sunMac, callbackUrl
 * );
 * 
 * // Handle LNURL-pay (top-up)
 * const response = await boltcard.lnurlp.handleTopUpRequest(
 *   cardId, serverUrl
 * );
 * ```
 * 
 * References:
 * - GitHub Issue: https://github.com/blinkbitcoin/blink-wip/issues/383
 * - BTCPay BoltCardTools: https://github.com/btcpayserver/BTCPayServer.BoltCardTools
 * - Boltcard Spec: https://github.com/boltcard/boltcard/blob/main/docs/SPEC.md
 */

const store = require('./store');
const crypto = require('./crypto');
const lnurlw = require('./lnurlw');
const lnurlp = require('./lnurlp');

// Re-export constants
const { CardStatus, TxType, PendingStatus } = require('./store');
const { KeySlot, PICCDATA_TAG_BOLTCARD } = require('./crypto');
const { TopUpLimits } = require('./lnurlp');

/**
 * Create and register a new Boltcard (high-level helper)
 * Uses spec-compliant key derivation from user's IssuerKey
 * 
 * @param {object} params - Card parameters
 * @param {string} params.cardUid - Card UID from NTAG424DNA (14 hex chars)
 * @param {string} params.ownerPubkey - Owner's Nostr pubkey
 * @param {string} params.walletId - Blink wallet ID
 * @param {string} params.apiKey - Blink API key
 * @param {object} options - Optional settings
 * @param {string} options.name - Card name
 * @param {string} options.walletCurrency - 'BTC' or 'USD'
 * @param {number} options.maxTxAmount - Per-transaction limit
 * @param {number} options.dailyLimit - Daily spending limit
 * @param {number} options.initialBalance - Initial balance
 * @param {string} options.environment - 'production' or 'staging'
 * @returns {Promise<object>} Created card with keys
 */
async function createCard(params, options = {}) {
  const { cardUid, ownerPubkey, walletId, apiKey } = params;
  
  // Create card in database (keys derived automatically from IssuerKey)
  const card = await store.createCard({
    cardUid,
    ownerPubkey,
    walletId,
    apiKey,
  }, options);
  
  // Return card with keys for programming
  const cardWithKeys = await store.getCard(card.id, true);
  
  return {
    ...cardWithKeys,
    keys: {
      k0: cardWithKeys.k0,
      k1: cardWithKeys.k1,
      k2: cardWithKeys.k2,
      k3: cardWithKeys.k3,
      k4: cardWithKeys.k4,
    },
  };
}

/**
 * Create a pending registration for deeplink flow
 * Used when card UID is not known until NFC Programmer scans the card
 * 
 * @param {object} params - Registration parameters
 * @param {string} params.ownerPubkey - Owner's Nostr pubkey
 * @param {string} params.walletId - Blink wallet ID
 * @param {string} params.apiKey - Blink API key
 * @param {object} options - Optional settings
 * @param {string} serverUrl - Server URL for generating deeplink
 * @returns {Promise<object>} { pendingRegistration, deeplink, keysRequestUrl }
 */
async function createPendingRegistration(params, options = {}, serverUrl) {
  const { ownerPubkey, walletId, apiKey } = params;
  
  // Create pending registration
  const pending = await store.createPendingRegistration({
    ownerPubkey,
    walletId,
    apiKey,
  }, options);
  
  // Generate deeplink
  const keysRequestUrl = `${serverUrl}/api/boltcard/keys/${pending.id}`;
  const deeplink = crypto.generateProgramDeeplink(keysRequestUrl);
  
  return {
    pendingRegistration: pending,
    deeplink,
    keysRequestUrl,
    qrPayload: deeplink,
  };
}

/**
 * Generate QR code data for card programming
 * Returns data that can be scanned by the Bolt Card NFC Programmer app
 * 
 * @param {string} serverUrl - BlinkPOS server URL
 * @param {string} cardId - Card ID
 * @param {object} keys - Card keys (k0, k1, k2, k3, k4)
 * @returns {object} { programming, topUp, card }
 */
function generateCardQRs(serverUrl, cardId, keys) {
  // LNURL-withdraw URL for the card
  const lnurlwUrl = lnurlw.generateCardUrl(serverUrl, cardId);
  
  // Keys response for NFC programmer app
  const keysResponse = crypto.generateKeysResponse(lnurlwUrl, keys);
  
  // QR for top-up (LNURL-pay)
  const topUpQR = lnurlp.generateTopUpQR(serverUrl, cardId);
  
  // LNURL-bech32 encoded
  const cardLnurl = lnurlw.generateCardLnurl(serverUrl, cardId);
  
  return {
    programming: {
      keysJson: JSON.stringify(keysResponse),
      keys: keysResponse,
    },
    topUp: topUpQR,
    card: {
      url: lnurlwUrl,
      lnurl: cardLnurl,
    },
  };
}

/**
 * Verify a card tap and return available withdrawal amount
 * 
 * @param {string} cardId - Card ID
 * @param {string} piccData - PICCData from URL (p parameter)
 * @param {string} sunMac - SunMAC from URL (c parameter)
 * @returns {Promise<object>} { valid, cardUid, counter, maxWithdrawable, error }
 */
async function verifyCardTap(cardId, piccData, sunMac) {
  // Get card with keys
  const card = await store.getCard(cardId, true);
  
  if (!card) {
    return { valid: false, error: 'Card not found' };
  }
  
  if (card.status !== CardStatus.ACTIVE) {
    return { valid: false, error: `Card is ${card.status.toLowerCase()}` };
  }
  
  // Verify cryptographic authentication
  const verifyResult = crypto.verifyCardTap(
    piccData,
    sunMac,
    card.k1,
    card.k2,
    card.cardUid,
    card.lastCounter
  );
  
  if (!verifyResult.valid) {
    return verifyResult;
  }
  
  // Update counter
  await store.updateLastCounter(cardId, verifyResult.counter);
  
  // Calculate available amount
  let maxWithdrawable = card.balance;
  
  if (card.maxTxAmount && card.maxTxAmount < maxWithdrawable) {
    maxWithdrawable = card.maxTxAmount;
  }
  
  if (card.dailyLimit) {
    const remainingDaily = card.dailyLimit - card.dailySpent;
    if (remainingDaily < maxWithdrawable) {
      maxWithdrawable = remainingDaily;
    }
  }
  
  return {
    valid: true,
    cardUid: verifyResult.cardUid,
    counter: verifyResult.counter,
    balance: card.balance,
    maxWithdrawable: Math.max(0, maxWithdrawable),
    walletCurrency: card.walletCurrency,
  };
}

/**
 * Validate the crypto implementation against spec test vectors
 * Call this during startup or tests to ensure correctness
 * 
 * @returns {boolean} True if all test vectors pass
 */
function validateCrypto() {
  return crypto.validateTestVectors();
}

module.exports = {
  // High-level helpers
  createCard,
  createPendingRegistration,
  generateCardQRs,
  verifyCardTap,
  validateCrypto,
  
  // Sub-modules
  store,
  crypto,
  lnurlw,
  lnurlp,
  
  // Constants
  CardStatus,
  TxType,
  PendingStatus,
  KeySlot,
  PICCDATA_TAG_BOLTCARD,
  TopUpLimits,
};
