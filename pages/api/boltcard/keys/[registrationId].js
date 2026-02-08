/**
 * API endpoint for NFC Programmer app to request card keys
 * 
 * This endpoint implements the deeplink flow per DEEPLINK.md:
 * 1. User initiates card registration in BlinkPOS
 * 2. BlinkPOS shows QR code with boltcard://program?url=...
 * 3. NFC Programmer app scans QR and POSTs { UID } to this endpoint
 * 4. This endpoint derives keys and returns { LNURLW, K0, K1, K2, K3, K4 }
 * 5. App programs the card with these values
 * 
 * POST /api/boltcard/keys/[registrationId]
 * Body: { UID: string } (7 bytes = 14 hex chars)
 * 
 * Returns:
 * {
 *   LNURLW: string,  // URL to program into card's NDEF
 *   K0: string,      // AppMasterKey (uppercase hex)
 *   K1: string,      // EncryptionKey (uppercase hex)
 *   K2: string,      // AuthenticationKey (uppercase hex)
 *   K3: string,      // Reserved
 *   K4: string       // Reserved
 * }
 * 
 * References:
 * - https://github.com/boltcard/boltcard/blob/main/docs/DEEPLINK.md
 */

const boltcardStore = require('../../../../lib/boltcard/store');
const boltcardCrypto = require('../../../../lib/boltcard/crypto');
const lnurlw = require('../../../../lib/boltcard/lnurlw');

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

  const { registrationId } = req.query;
  
  if (!registrationId) {
    return res.status(400).json({ 
      status: 'ERROR',
      reason: 'Missing registration ID' 
    });
  }

  try {
    // Get UID from request body
    // NFC Programmer app sends uppercase hex, but we normalize to lowercase
    const { UID } = req.body;
    
    if (!UID) {
      return res.status(400).json({ 
        status: 'ERROR',
        reason: 'Missing UID in request body' 
      });
    }
    
    // Normalize UID (remove any separators, lowercase)
    const cardUid = UID.replace(/[:\s-]/g, '').toLowerCase();
    
    // Validate UID format (14 hex chars = 7 bytes)
    if (!/^[0-9a-fA-F]{14}$/.test(cardUid)) {
      return res.status(400).json({ 
        status: 'ERROR',
        reason: 'Invalid UID format: expected 14 hex characters (7 bytes)' 
      });
    }

    // Get the pending registration
    const registration = await boltcardStore.getPendingRegistration(registrationId);
    
    if (!registration) {
      return res.status(404).json({ 
        status: 'ERROR',
        reason: 'Registration not found' 
      });
    }
    
    if (registration.status !== 'PENDING') {
      return res.status(400).json({ 
        status: 'ERROR',
        reason: `Registration is ${registration.status.toLowerCase()}` 
      });
    }
    
    if (registration.expiresAt < Date.now()) {
      return res.status(400).json({ 
        status: 'ERROR',
        reason: 'Registration has expired' 
      });
    }

    // Complete the registration (creates the card with derived keys)
    const card = await boltcardStore.completePendingRegistration(registrationId, cardUid);
    
    if (!card) {
      return res.status(500).json({ 
        status: 'ERROR',
        reason: 'Failed to create card' 
      });
    }

    // Generate LNURL-withdraw URL for the card
    const serverUrl = getServerUrl(req);
    const lnurlwUrl = lnurlw.generateCardUrl(serverUrl, card.id);

    // Build response in format expected by NFC Programmer app
    const keysResponse = boltcardCrypto.generateKeysResponse(lnurlwUrl, {
      k0: card.k0,
      k1: card.k1,
      k2: card.k2,
      k3: card.k3,
      k4: card.k4,
    });

    console.log(`[KeysAPI] Card programmed: ${card.id} (UID: ${cardUid})`);

    res.status(200).json(keysResponse);

  } catch (error) {
    console.error('[KeysAPI] Error:', error);

    // Handle specific errors
    if (error.message.includes('already registered')) {
      return res.status(409).json({ 
        status: 'ERROR',
        reason: error.message 
      });
    }

    res.status(500).json({ 
      status: 'ERROR',
      reason: 'Failed to process key request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Get the server URL from the request
 */
function getServerUrl(req) {
  // Check for X-Forwarded headers (common with proxies/load balancers)
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  
  // Use Host header
  const host = req.headers.host;
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  
  return `${protocol}://${host}`;
}
