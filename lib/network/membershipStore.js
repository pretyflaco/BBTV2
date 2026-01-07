/**
 * In-memory membership store for development
 * Tracks approved members for communities
 * In production, this would be replaced with database operations
 * 
 * Uses global singleton to persist across Next.js hot reloads
 */

// Use global to persist across hot reloads in development
if (!global._networkMembershipStore) {
  global._networkMembershipStore = new Map();
}
const communityMembers = global._networkMembershipStore;

/**
 * Get or initialize community members array
 * @param {string} communityId 
 * @returns {Array}
 */
function getCommunityMembers(communityId) {
  if (!communityMembers.has(communityId)) {
    communityMembers.set(communityId, []);
  }
  return communityMembers.get(communityId);
}

/**
 * Add an approved member to a community
 * @param {string} communityId 
 * @param {string} userNpub 
 * @param {string} approvedBy 
 * @param {string} communityName - Optional community name for display
 * @returns {Object} The membership record
 */
function addMember(communityId, userNpub, approvedBy, communityName = null) {
  const members = getCommunityMembers(communityId);
  
  // Check if already a member
  const existing = members.find(m => m.user_npub === userNpub);
  if (existing) {
    return existing;
  }
  
  const membership = {
    id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    community_id: communityId,
    community_name: communityName,
    user_npub: userNpub,
    role: 'member',
    status: 'approved',
    approved_at: new Date().toISOString(),
    approved_by: approvedBy,
    consent_given: false,
    member_count: members.length + 1
  };
  
  members.push(membership);
  console.log('[MembershipStore] Added member:', userNpub.substring(0, 20), 'to community:', communityId);
  return membership;
}

/**
 * Get all memberships for a user
 * @param {string} userNpub 
 * @returns {Array}
 */
function getUserMemberships(userNpub) {
  const memberships = [];
  for (const [communityId, members] of communityMembers.entries()) {
    const membership = members.find(m => m.user_npub === userNpub);
    if (membership) {
      memberships.push(membership);
    }
  }
  return memberships;
}

/**
 * Check if user is a member of a community
 * @param {string} communityId 
 * @param {string} userNpub 
 * @returns {boolean}
 */
function isMember(communityId, userNpub) {
  const members = getCommunityMembers(communityId);
  return members.some(m => m.user_npub === userNpub);
}

/**
 * Get member count for a community
 * @param {string} communityId 
 * @returns {number}
 */
function getMemberCount(communityId) {
  return getCommunityMembers(communityId).length;
}

/**
 * Remove a member from a community
 * @param {string} communityId 
 * @param {string} userNpub 
 * @returns {boolean} True if removed
 */
function removeMember(communityId, userNpub) {
  const members = getCommunityMembers(communityId);
  const index = members.findIndex(m => m.user_npub === userNpub);
  if (index > -1) {
    members.splice(index, 1);
    return true;
  }
  return false;
}

module.exports = {
  getCommunityMembers,
  addMember,
  getUserMemberships,
  isMember,
  getMemberCount,
  removeMember
};
