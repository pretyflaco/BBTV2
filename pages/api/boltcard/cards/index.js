const boltcard = require('../../../../lib/boltcard');

/**
 * API endpoint to list user's Boltcards
 * 
 * GET /api/boltcard/cards?ownerPubkey=...
 * 
 * Query parameters:
 * - ownerPubkey: Owner's Nostr pubkey (required)
 * 
 * Returns:
 * {
 *   success: true,
 *   cards: [{ id, cardUid, name, balance, status, ... }]
 * }
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ownerPubkey } = req.query;

    if (!ownerPubkey) {
      return res.status(400).json({
        error: 'Missing required parameter: ownerPubkey'
      });
    }

    // Validate pubkey format (64 hex chars)
    if (!/^[0-9a-fA-F]{64}$/.test(ownerPubkey)) {
      return res.status(400).json({
        error: 'Invalid ownerPubkey format: expected 64 hex characters'
      });
    }

    // Check if UID should be included (default: no, for privacy)
    const includeUid = req.query.includeUid === 'true';

    // Get all cards for this owner
    const cards = await boltcard.store.getCardsByOwner(ownerPubkey);

    // Format cards for response (exclude sensitive data)
    const formattedCards = cards.map(card => {
      const cardResponse = {
        id: card.id,
        cardIdHash: card.cardIdHash, // Privacy-preserving identifier
        name: card.name,
        walletCurrency: card.walletCurrency,
        balance: card.balance,
        maxTxAmount: card.maxTxAmount,
        dailyLimit: card.dailyLimit,
        dailySpent: card.dailySpent,
        status: card.status,
        version: card.version,
        createdAt: card.createdAt,
        activatedAt: card.activatedAt,
        lastUsedAt: card.lastUsedAt,
        environment: card.environment,
      };
      
      // Only include raw UID if explicitly requested
      if (includeUid) {
        cardResponse.cardUid = card.cardUid;
      }
      
      return cardResponse;
    });

    res.status(200).json({
      success: true,
      cards: formattedCards,
      count: formattedCards.length,
    });

  } catch (error) {
    console.error('❌ List cards error:', error);
    res.status(500).json({
      error: 'Failed to list cards',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
