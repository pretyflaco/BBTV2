/**
 * In-memory consent store for development
 * Tracks data sharing consents from community members
 * In production, this would be replaced with database operations
 * 
 * Uses global singleton to persist across Next.js hot reloads
 */

// Use global to persist across hot reloads in development
if (!global._networkConsentStore) {
  global._networkConsentStore = new Map();
}
const consents = global._networkConsentStore;

/**
 * @typedef {Object} DataConsent
 * @property {string} id - Unique consent ID
 * @property {string} user_npub - User's npub
 * @property {string} community_id - Community ID
 * @property {string} encrypted_api_key - Encrypted Blink API key
 * @property {string} blink_username - Blink username associated with the API key
 * @property {string} status - 'active' | 'revoked'
 * @property {string} consented_at - ISO timestamp
 * @property {string} [revoked_at] - ISO timestamp if revoked
 */

/**
 * Create a consent key for lookup
 */
function getConsentKey(userNpub, communityId) {
  return `${userNpub}:${communityId}`;
}

/**
 * Add or update data sharing consent
 * @param {string} userNpub 
 * @param {string} communityId 
 * @param {string} encryptedApiKey - Already encrypted API key
 * @param {string} blinkUsername - Blink username associated with the API key
 * @returns {DataConsent}
 */
function addConsent(userNpub, communityId, encryptedApiKey, blinkUsername) {
  const key = getConsentKey(userNpub, communityId);
  
  const consent = {
    id: `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    user_npub: userNpub,
    community_id: communityId,
    encrypted_api_key: encryptedApiKey,
    blink_username: blinkUsername,
    status: 'active',
    consented_at: new Date().toISOString()
  };
  
  consents.set(key, consent);
  console.log('[ConsentStore] Added consent for', userNpub.substring(0, 20), 'in community', communityId, 'with Blink username:', blinkUsername);
  return consent;
}

/**
 * Get consent for a user in a community
 * @param {string} userNpub 
 * @param {string} communityId 
 * @returns {DataConsent|null}
 */
function getConsent(userNpub, communityId) {
  const key = getConsentKey(userNpub, communityId);
  return consents.get(key) || null;
}

/**
 * Check if user has active consent for a community
 * @param {string} userNpub 
 * @param {string} communityId 
 * @returns {boolean}
 */
function hasActiveConsent(userNpub, communityId) {
  const consent = getConsent(userNpub, communityId);
  return consent?.status === 'active';
}

/**
 * Get all consents for a user
 * @param {string} userNpub 
 * @returns {DataConsent[]}
 */
function getUserConsents(userNpub) {
  const userConsents = [];
  for (const consent of consents.values()) {
    if (consent.user_npub === userNpub) {
      userConsents.push(consent);
    }
  }
  return userConsents;
}

/**
 * Get all active consents for a community
 * @param {string} communityId 
 * @returns {DataConsent[]}
 */
function getCommunityConsents(communityId) {
  const communityConsents = [];
  for (const consent of consents.values()) {
    if (consent.community_id === communityId && consent.status === 'active') {
      communityConsents.push(consent);
    }
  }
  return communityConsents;
}

/**
 * Count active consents for a community
 * @param {string} communityId 
 * @returns {number}
 */
function getConsentCount(communityId) {
  return getCommunityConsents(communityId).length;
}

/**
 * Revoke consent
 * @param {string} userNpub 
 * @param {string} communityId 
 * @returns {DataConsent|null}
 */
function revokeConsent(userNpub, communityId) {
  const key = getConsentKey(userNpub, communityId);
  const consent = consents.get(key);
  
  if (!consent) return null;
  
  consent.status = 'revoked';
  consent.revoked_at = new Date().toISOString();
  consent.encrypted_api_key = null; // Clear the key
  
  consents.set(key, consent);
  console.log('[ConsentStore] Revoked consent for', userNpub.substring(0, 20), 'in community', communityId);
  return consent;
}

module.exports = {
  addConsent,
  getConsent,
  hasActiveConsent,
  getUserConsents,
  getCommunityConsents,
  getConsentCount,
  revokeConsent
};
