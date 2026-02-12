/**
 * In-memory membership store for development
 * Tracks approved members for communities
 * In production, this would be replaced with database operations
 *
 * Uses global singleton to persist across Next.js hot reloads
 */

export interface Membership {
  id: string
  community_id: string
  community_name: string | null
  user_npub: string
  role: string
  status: string
  approved_at: string
  approved_by: string
  consent_given: boolean
  member_count: number
}

declare global {
  // eslint-disable-next-line no-var
  var _networkMembershipStore: Map<string, Membership[]> | undefined
}

// Use global to persist across hot reloads in development
if (!global._networkMembershipStore) {
  global._networkMembershipStore = new Map<string, Membership[]>()
}
const communityMembers: Map<string, Membership[]> = global._networkMembershipStore

/**
 * Get or initialize community members array
 * @param communityId - Community ID
 * @returns Array of memberships for the community
 */
export function getCommunityMembers(communityId: string): Membership[] {
  if (!communityMembers.has(communityId)) {
    communityMembers.set(communityId, [])
  }
  return communityMembers.get(communityId)!
}

/**
 * Add an approved member to a community
 * @param communityId - Community ID
 * @param userNpub - User's npub
 * @param approvedBy - Npub of approver
 * @param communityName - Optional community name for display
 * @returns The membership record
 */
export function addMember(
  communityId: string,
  userNpub: string,
  approvedBy: string,
  communityName: string | null = null,
): Membership {
  const members = getCommunityMembers(communityId)

  // Check if already a member
  const existing = members.find((m) => m.user_npub === userNpub)
  if (existing) {
    return existing
  }

  const membership: Membership = {
    id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    community_id: communityId,
    community_name: communityName,
    user_npub: userNpub,
    role: "member",
    status: "approved",
    approved_at: new Date().toISOString(),
    approved_by: approvedBy,
    consent_given: false,
    member_count: members.length + 1,
  }

  members.push(membership)
  console.log(
    "[MembershipStore] Added member:",
    userNpub.substring(0, 20),
    "to community:",
    communityId,
  )
  return membership
}

/**
 * Get all memberships for a user
 * @param userNpub - User's npub
 * @returns List of user's memberships
 */
export function getUserMemberships(userNpub: string): Membership[] {
  const memberships: Membership[] = []
  for (const [, members] of communityMembers.entries()) {
    const membership = members.find((m) => m.user_npub === userNpub)
    if (membership) {
      memberships.push(membership)
    }
  }
  return memberships
}

/**
 * Check if user is a member of a community
 * @param communityId - Community ID
 * @param userNpub - User's npub
 * @returns Whether the user is a member
 */
export function isMember(communityId: string, userNpub: string): boolean {
  const members = getCommunityMembers(communityId)
  return members.some((m) => m.user_npub === userNpub)
}

/**
 * Get member count for a community
 * @param communityId - Community ID
 * @returns Number of members
 */
export function getMemberCount(communityId: string): number {
  return getCommunityMembers(communityId).length
}

/**
 * Remove a member from a community
 * @param communityId - Community ID
 * @param userNpub - User's npub
 * @returns True if removed
 */
export function removeMember(communityId: string, userNpub: string): boolean {
  const members = getCommunityMembers(communityId)
  const index = members.findIndex((m) => m.user_npub === userNpub)
  if (index > -1) {
    members.splice(index, 1)
    return true
  }
  return false
}
