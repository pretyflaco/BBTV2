/**
 * Challenge Generation API
 * 
 * Generates a time-limited challenge for pubkey ownership verification.
 * Used by external signers (Amber, Nostash) that can't do inline NIP-98.
 * 
 * The challenge must be signed by the user's nsec and returned to
 * /api/auth/verify-ownership to establish a session.
 * 
 * Flow:
 * 1. Client requests challenge: GET /api/auth/challenge
 * 2. Server generates and stores challenge with expiry
 * 3. Client asks external signer to sign the challenge
 * 4. Client submits signed challenge to /api/auth/verify-ownership
 * 5. Server verifies and creates session
 * 
 * @see /api/auth/verify-ownership for the verification endpoint
 */

const { generateChallenge, storeChallenge } = require('../../../lib/auth/challengeStore');

export default async function handler(req, res) {
  // Only accept GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Generate a new challenge
    const challenge = generateChallenge();
    
    // Store it for verification (5 minute expiry)
    storeChallenge(challenge, 300);
    
    // Get the app URL for the relay tag
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const appUrl = `${protocol}://${host}`;
    
    console.log('[auth/challenge] Generated challenge:', challenge.substring(0, 30) + '...');
    
    return res.status(200).json({
      challenge,
      expiresIn: 300, // seconds
      // Provide the event structure the client should sign
      eventTemplate: {
        kind: 22242, // NIP-42 AUTH event kind
        content: challenge,
        tags: [
          ['relay', appUrl],
          ['challenge', challenge]
        ]
      }
    });
  } catch (error) {
    console.error('[auth/challenge] Error:', error);
    return res.status(500).json({ error: 'Failed to generate challenge' });
  }
}
