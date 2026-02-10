/**
 * Boltcard Balance API - Public cardholder balance check
 * 
 * This endpoint allows cardholders to check their card balance WITHOUT logging in.
 * They authenticate by tapping their physical card (p/c parameters from SUN feature).
 * 
 * GET /api/boltcard/balance/{cardId}?p={piccData}&c={sunMac}
 * 
 * Returns:
 * {
 *   "card": {
 *     "name": "My Card",
 *     "balance": 6200,
 *     "currency": "BTC",
 *     "displayBalance": "6,200 sats",
 *     "dailyLimit": 50000,
 *     "dailyRemaining": 43800,
 *     "status": "ACTIVE"
 *   },
 *   "transactions": [
 *     { "type": "WITHDRAW", "amount": 500, "description": "...", "createdAt": 1234567890 },
 *     ...
 *   ],
 *   "topUp": {
 *     "lnurl": "LNURL1...",
 *     "url": "https://..."
 *   }
 * }
 * 
 * Security:
 * - Card tap required (p/c params verified via SunMAC)
 * - Counter replay protection (each tap increments counter)
 * - No sensitive data exposed (no keys, no owner info)
 */

const boltcard = require('../../../../lib/boltcard');

export default async function handler(req, res) {
  const { cardId } = req.query;

  if (!cardId) {
    return res.status(400).json({ status: 'ERROR', reason: 'Missing cardId' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'ERROR', reason: 'Method not allowed' });
  }

  return handleBalanceGet(req, res, cardId);
}

/**
 * Handle GET request - card tap verification and balance response
 */
async function handleBalanceGet(req, res, cardId) {
  try {
    const { p: piccData, c: sunMac } = req.query;

    console.log(`[BALANCE] Balance request for card: ${cardId}`);

    // Require p/c params for authentication
    if (!piccData || !sunMac) {
      return res.status(400).json({
        status: 'ERROR',
        reason: 'Missing authentication parameters. Tap your card to check balance.',
      });
    }

    // Validate parameter formats
    if (!/^[0-9a-fA-F]{32}$/.test(piccData)) {
      return res.status(400).json({
        status: 'ERROR',
        reason: `Invalid PICCData format: expected 32 hex characters`,
      });
    }

    if (!/^[0-9a-fA-F]{16}$/.test(sunMac)) {
      return res.status(400).json({
        status: 'ERROR',
        reason: `Invalid SunMAC format: expected 16 hex characters`,
      });
    }

    // Get card with keys (need keys for tap verification)
    const card = await boltcard.store.getCard(cardId, true);

    if (!card) {
      return res.status(404).json({ status: 'ERROR', reason: 'Card not found' });
    }

    // Check card status
    if (card.status === 'WIPED') {
      return res.status(400).json({ status: 'ERROR', reason: 'Card has been wiped' });
    }

    // Verify card tap using crypto module
    const tapResult = boltcard.crypto.verifyCardTap(
      piccData,
      sunMac,
      card.k1,
      card.k2,
      card.cardUid,
      card.lastCounter
    );

    if (!tapResult.valid) {
      console.log(`[BALANCE] Card tap verification failed: ${tapResult.error}`);
      return res.status(400).json({
        status: 'ERROR',
        reason: tapResult.error || 'Card authentication failed',
      });
    }

    // Update last counter for replay protection
    await boltcard.store.updateLastCounter(cardId, tapResult.counter);

    // Get last 5 transactions
    const transactions = await boltcard.store.getCardTransactions(cardId, 5);

    // Generate top-up QR data
    const serverUrl = getServerUrl(req);
    const topUpData = boltcard.lnurlp.generateTopUpQR(serverUrl, cardId);

    // Format balance for display
    const displayBalance = formatBalance(card.balance, card.walletCurrency);
    
    // Calculate daily remaining
    const dailyRemaining = card.dailyLimit 
      ? Math.max(0, card.dailyLimit - card.dailySpent)
      : null;

    console.log(`[BALANCE] Card ${cardId} balance: ${displayBalance}`);

    // Return balance response (no sensitive data)
    return res.status(200).json({
      card: {
        name: card.name || 'Boltcard',
        balance: card.balance,
        currency: card.walletCurrency,
        displayBalance,
        dailyLimit: card.dailyLimit,
        dailyRemaining,
        dailySpent: card.dailySpent,
        status: card.status,
        lastUsedAt: card.lastUsedAt,
      },
      transactions: transactions.map(tx => ({
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        createdAt: tx.createdAt,
      })),
      topUp: {
        lnurl: topUpData.qrData,
        url: topUpData.url,
      },
    });

  } catch (error) {
    console.error('[BALANCE] Error:', error);
    return res.status(500).json({
      status: 'ERROR',
      reason: 'Internal server error',
    });
  }
}

/**
 * Format balance for display based on currency
 * @param {number} balance - Balance in smallest unit (sats or cents)
 * @param {string} currency - 'BTC' or 'USD'
 * @returns {string} Formatted display string
 */
function formatBalance(balance, currency) {
  if (currency === 'USD') {
    // Format as dollars with 2 decimal places
    const dollars = (balance / 100).toFixed(2);
    return `$${dollars}`;
  } else {
    // Format as sats with thousands separator
    const formatted = balance.toLocaleString('en-US');
    return `${formatted} sats`;
  }
}

/**
 * Get the server URL from the request
 */
function getServerUrl(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  
  const host = req.headers.host;
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  
  return `${protocol}://${host}`;
}
