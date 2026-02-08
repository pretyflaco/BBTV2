/**
 * Recovery Keys API - Retrieve derived card keys for manual card reset
 * 
 * This endpoint allows card owners to recover the keys that were derived
 * for a specific card UID, so they can manually enter them in the NFC Programmer
 * app's "Reset Card" / "Wipe Keys" screen to authenticate and reset the card.
 * 
 * Use Case:
 * - Card was programmed but keys don't match what's stored
 * - Card record was deleted but card still has keys programmed
 * - Need to manually reset a card when automated reset fails
 * 
 * Security:
 * - Requires the owner's pubkey that owns the IssuerKey
 * - Keys are derived using the stored IssuerKey + provided UID
 * - All requests are logged for audit
 * 
 * GET /api/boltcard/recovery-keys?uid=0429279A001990&ownerPubkey=4ffb87a974bbb52fcac737b79c295c047d91aced8923b0b858df7cad2281157f
 * 
 * Response:
 * {
 *   status: "OK",
 *   uid: "0429279A001990",
 *   ownerPubkey: "4ffb87a974bbb52fcac737b79c295c047d91aced8923b0b858df7cad2281157f",
 *   keys: {
 *     K0: "...",
 *     K1: "...",
 *     K2: "...",
 *     K3: "...",
 *     K4: "..."
 *   },
 *   instructions: [...]
 * }
 */

const boltcardStore = require('../../../lib/boltcard/store');
const boltcardCrypto = require('../../../lib/boltcard/crypto');

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({
      status: 'ERROR',
      reason: 'Method not allowed',
    });
  }

  const { uid, ownerPubkey } = req.query;

  // Validate required parameters
  if (!uid) {
    return res.status(400).json({
      status: 'ERROR',
      reason: 'Missing required parameter: uid',
      hint: 'Provide the card UID (14 hex characters, e.g., 0429279A001990)',
    });
  }

  if (!ownerPubkey) {
    return res.status(400).json({
      status: 'ERROR',
      reason: 'Missing required parameter: ownerPubkey',
      hint: 'Provide your Nostr pubkey (64 hex characters)',
    });
  }

  // Normalize and validate UID format
  const normalizedUid = uid.toUpperCase().replace(/[:\s-]/g, '');
  if (!/^[0-9A-F]{14}$/.test(normalizedUid)) {
    return res.status(400).json({
      status: 'ERROR',
      reason: 'Invalid UID format',
      hint: 'UID must be 14 hex characters (7 bytes), e.g., 0429279A001990',
      provided: uid,
    });
  }

  // Validate ownerPubkey format
  const normalizedPubkey = ownerPubkey.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalizedPubkey)) {
    return res.status(400).json({
      status: 'ERROR',
      reason: 'Invalid ownerPubkey format',
      hint: 'ownerPubkey must be 64 hex characters',
      provided: ownerPubkey,
    });
  }

  console.log(`[RecoveryKeysAPI] Recovery request for UID: ${normalizedUid}, owner: ${normalizedPubkey.substring(0, 16)}...`);

  try {
    // Get the IssuerKey for this owner
    const issuerKey = await boltcardStore.getIssuerKey(normalizedPubkey);

    if (!issuerKey) {
      console.log(`[RecoveryKeysAPI] No IssuerKey found for owner: ${normalizedPubkey.substring(0, 16)}...`);
      return res.status(404).json({
        status: 'ERROR',
        reason: 'No IssuerKey found for this owner',
        hint: 'Make sure you are using the correct Nostr pubkey that was used to register cards',
      });
    }

    console.log(`[RecoveryKeysAPI] Found IssuerKey for owner, deriving keys for UID: ${normalizedUid}`);

    // Derive all keys using the spec-compliant key derivation
    // Using version 1 (the default for newly programmed cards)
    const derivedKeys = boltcardCrypto.deriveAllKeys(issuerKey, normalizedUid.toLowerCase(), 1);

    console.log(`[RecoveryKeysAPI] Successfully derived keys for UID: ${normalizedUid}`);

    // Return keys in uppercase (NFC Programmer expects uppercase)
    res.status(200).json({
      status: 'OK',
      uid: normalizedUid,
      ownerPubkey: normalizedPubkey,
      version: 1,
      keys: {
        K0: derivedKeys.k0.toUpperCase(),
        K1: derivedKeys.k1.toUpperCase(),
        K2: derivedKeys.k2.toUpperCase(),
        K3: derivedKeys.k3.toUpperCase(),
        K4: derivedKeys.k4.toUpperCase(),
      },
      // Also include lowercase for reference
      keysLowercase: {
        k0: derivedKeys.k0,
        k1: derivedKeys.k1,
        k2: derivedKeys.k2,
        k3: derivedKeys.k3,
        k4: derivedKeys.k4,
      },
      cardIdHash: derivedKeys.cardIdHash,
      instructions: [
        '1. Open Bolt Card NFC Programmer app',
        '2. Go to "Reset Card" or "Wipe Keys" screen',
        '3. Enter K0 through K4 values from above',
        '4. Tap your card to authenticate and reset',
        '5. Card should return to factory state (key versions 00)',
        '6. You can then re-register and program the card fresh',
      ],
      warning: 'These are sensitive cryptographic keys. Do not share them publicly.',
    });

  } catch (error) {
    console.error('[RecoveryKeysAPI] Error:', error);

    res.status(500).json({
      status: 'ERROR',
      reason: 'Failed to derive recovery keys',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
