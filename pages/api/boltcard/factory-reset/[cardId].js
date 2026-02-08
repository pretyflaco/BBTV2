/**
 * API endpoint for factory-resetting a card using default keys
 * 
 * This is the NUCLEAR option when:
 * 1. Normal reset fails (malformed NDEF, missing c= param)
 * 2. Force reset with stored keys fails (keys don't match what's on card)
 * 
 * This returns FACTORY DEFAULT KEYS (all zeros) which is what NTAG424DNA
 * cards ship with. If the card was never properly programmed, or if the
 * NFC Programmer failed to write keys, this should work.
 * 
 * POST /api/boltcard/factory-reset/[cardId]
 * Body: { UID: string } (7-byte UID from card)
 * 
 * Returns:
 * {
 *   LNURLW: string,   // For spec compliance
 *   K0: string,       // Factory default = all zeros
 *   K1: string,       // Factory default = all zeros
 *   K2: string,       // Factory default = all zeros
 *   K3: string,       // Factory default = all zeros
 *   K4: string        // Factory default = all zeros
 * }
 */

const boltcardStore = require('../../../../lib/boltcard/store');

// Factory default key for NTAG424DNA - all zeros (16 bytes = 32 hex chars)
const FACTORY_DEFAULT_KEY = '00000000000000000000000000000000';

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

  console.log(`[FactoryResetAPI] Factory reset request for card: ${cardId}`);
  console.log(`[FactoryResetAPI] Request body:`, JSON.stringify(req.body));

  try {
    // Get the card (without keys - we don't need them)
    const card = await boltcardStore.getCard(cardId, false);
    
    if (!card) {
      console.log(`[FactoryResetAPI] Card not found: ${cardId}`);
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
      console.log(`[FactoryResetAPI] Missing UID in request body`);
      return res.status(400).json({ 
        status: 'ERROR',
        reason: 'Missing UID in request body' 
      });
    }

    // Normalize UIDs for comparison (uppercase, no spaces)
    const providedUid = UID.toUpperCase().replace(/\s/g, '');
    const storedUid = card.cardUid.toUpperCase().replace(/\s/g, '');

    console.log(`[FactoryResetAPI] Comparing UIDs - provided: ${providedUid}, stored: ${storedUid}`);

    // Verify UID matches what we have stored
    if (providedUid !== storedUid) {
      console.log(`[FactoryResetAPI] UID mismatch for card ${cardId}`);
      return res.status(401).json({ 
        status: 'ERROR',
        reason: 'UID does not match stored card' 
      });
    }

    console.log(`[FactoryResetAPI] UID verified for card ${cardId}. Returning FACTORY DEFAULT keys for reset.`);

    // Build the LNURLW URL
    const host = req.headers.host;
    const lnurlwUrl = `lnurlw://${host}/api/boltcard/lnurlw/${cardId}`;

    // Return FACTORY DEFAULT keys (all zeros)
    // This works if the card was never properly programmed or still has factory keys
    res.status(200).json({
      LNURLW: lnurlwUrl,
      K0: FACTORY_DEFAULT_KEY,
      K1: FACTORY_DEFAULT_KEY,
      K2: FACTORY_DEFAULT_KEY,
      K3: FACTORY_DEFAULT_KEY,
      K4: FACTORY_DEFAULT_KEY,
    });

  } catch (error) {
    console.error('[FactoryResetAPI] Error:', error);

    res.status(500).json({ 
      status: 'ERROR',
      reason: 'Failed to process factory reset request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
