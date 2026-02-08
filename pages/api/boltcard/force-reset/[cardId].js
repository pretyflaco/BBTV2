/**
 * API endpoint for force-resetting a card when normal reset fails
 * 
 * This is used when a card was programmed with incorrect format and
 * the normal reset flow (which requires valid LNURLW with p&c params) fails.
 * 
 * The NFC Programmer app will POST { UID: "..." } and we return the keys
 * if the UID matches what we have stored for this card.
 * 
 * POST /api/boltcard/force-reset/[cardId]
 * Body: { UID: string } (7-byte UID from card)
 * 
 * Returns:
 * {
 *   LNURLW: string,   // For spec compliance
 *   K0: string,       // Current AppMasterKey
 *   K1: string,       // Current EncryptionKey  
 *   K2: string,       // Current AuthenticationKey
 *   K3: string,       // Reserved
 *   K4: string        // Reserved
 * }
 */

const boltcardStore = require('../../../../lib/boltcard/store');

export default async function handler(req, res) {
  // Set CORS headers for NFC Programmer app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      status: 'ERROR',
      reason: 'Method not allowed' 
    });
  }

  const { cardId } = req.query;
  
  if (!cardId) {
    return res.status(400).json({ 
      status: 'ERROR',
      reason: 'Missing card ID' 
    });
  }

  console.log(`[ForceResetAPI] Force reset request for card: ${cardId}`);
  console.log(`[ForceResetAPI] Request body:`, JSON.stringify(req.body));

  try {
    // Get the card with keys
    const card = await boltcardStore.getCard(cardId, true);
    
    if (!card) {
      console.log(`[ForceResetAPI] Card not found: ${cardId}`);
      return res.status(404).json({ 
        status: 'ERROR',
        reason: 'Card not found' 
      });
    }
    
    // Card must be in a valid state for reset
    if (card.status === 'WIPED') {
      return res.status(400).json({ 
        status: 'ERROR',
        reason: 'Card is already wiped' 
      });
    }

    // Get UID from request body - NFC Programmer sends this
    const { UID } = req.body;
    
    if (!UID) {
      console.log(`[ForceResetAPI] Missing UID in request body`);
      return res.status(400).json({ 
        status: 'ERROR',
        reason: 'Missing UID in request body' 
      });
    }

    // Normalize UIDs for comparison (uppercase, no spaces)
    const providedUid = UID.toUpperCase().replace(/\s/g, '');
    const storedUid = card.cardUid.toUpperCase().replace(/\s/g, '');

    console.log(`[ForceResetAPI] Comparing UIDs - provided: ${providedUid}, stored: ${storedUid}`);

    // Verify UID matches what we have stored
    if (providedUid !== storedUid) {
      console.log(`[ForceResetAPI] UID mismatch for card ${cardId}`);
      return res.status(401).json({ 
        status: 'ERROR',
        reason: 'UID does not match stored card' 
      });
    }

    console.log(`[ForceResetAPI] UID verified for card ${cardId}. Returning keys for reset.`);

    // Build the LNURLW URL
    const host = req.headers.host;
    const lnurlwUrl = `lnurlw://${host}/api/boltcard/lnurlw/${cardId}`;

    // Return current keys for reset operation
    // The NFC Programmer app needs these to authenticate with the card
    res.status(200).json({
      LNURLW: lnurlwUrl,
      K0: card.k0.toUpperCase(),
      K1: card.k1.toUpperCase(),
      K2: card.k2.toUpperCase(),
      K3: (card.k3 || card.k0).toUpperCase(),
      K4: (card.k4 || card.k0).toUpperCase(),
    });

  } catch (error) {
    console.error('[ForceResetAPI] Error:', error);

    res.status(500).json({ 
      status: 'ERROR',
      reason: 'Failed to process force reset request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
