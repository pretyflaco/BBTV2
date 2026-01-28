/**
 * Challenge Store for Pubkey Ownership Verification
 * 
 * Shared module for generating, storing, and verifying challenges.
 * Used by both /api/auth/challenge and /api/auth/verify-ownership
 * 
 * In production, consider Redis for multi-instance deployments.
 */

const crypto = require('crypto');

// In-memory challenge store with automatic cleanup
const challengeStore = new Map();

// Clean up expired challenges periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of challengeStore.entries()) {
    if (data.expiresAt < now) {
      challengeStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Generate a cryptographically secure challenge
 * Format: blinkpos:{timestamp}:{random_nonce}
 */
function generateChallenge() {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');
  return `blinkpos:${timestamp}:${nonce}`;
}

/**
 * Store a challenge for later verification
 * @param {string} challenge - The challenge string
 * @param {number} ttlSeconds - Time to live in seconds
 */
function storeChallenge(challenge, ttlSeconds = 300) {
  const expiresAt = Date.now() + (ttlSeconds * 1000);
  challengeStore.set(challenge, {
    createdAt: Date.now(),
    expiresAt,
    used: false
  });
}

/**
 * Verify and consume a challenge
 * @param {string} challenge - The challenge to verify
 * @returns {{valid: boolean, error?: string}}
 */
function verifyChallenge(challenge) {
  const data = challengeStore.get(challenge);
  
  if (!data) {
    return { valid: false, error: 'Challenge not found or expired' };
  }
  
  if (data.expiresAt < Date.now()) {
    challengeStore.delete(challenge);
    return { valid: false, error: 'Challenge expired' };
  }
  
  if (data.used) {
    return { valid: false, error: 'Challenge already used' };
  }
  
  // Mark as used (one-time use)
  data.used = true;
  
  // Delete after short grace period (in case of retries)
  setTimeout(() => challengeStore.delete(challenge), 30000);
  
  return { valid: true };
}

module.exports = { generateChallenge, storeChallenge, verifyChallenge };
