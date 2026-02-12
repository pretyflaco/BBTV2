/**
 * In-memory application store for development
 * In production, this would be replaced with database operations
 *
 * Uses global singleton to persist across Next.js hot reloads
 */

export interface Application {
  id: string
  status: string
  applied_at: string
  reviewed_by?: string
  reviewed_at?: string
  [key: string]: unknown
}

declare global {
  // eslint-disable-next-line no-var
  var _networkApplicationStore: Map<string, Application> | undefined
}

// Use global to persist across hot reloads in development
if (!global._networkApplicationStore) {
  global._networkApplicationStore = new Map<string, Application>()
}
const applications: Map<string, Application> = global._networkApplicationStore

/**
 * Add a new application
 * @param application - The application data
 * @returns The stored application with ID
 */
export function addApplication(application: Record<string, unknown>): Application {
  const id = `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const storedApp: Application = {
    id,
    ...application,
    status: "pending",
    applied_at: new Date().toISOString(),
  }

  applications.set(id, storedApp)
  console.log("[ApplicationStore] Added application:", id, "Total:", applications.size)
  return storedApp
}

/**
 * Get application by ID
 * @param id - Application ID
 * @returns The application or null
 */
export function getApplication(id: string): Application | null {
  return applications.get(id) || null
}

/**
 * Check if user already has a pending application for a community
 * @param userNpub - User's npub
 * @param communityId - Community ID
 * @returns Existing application or null
 */
export function getExistingApplication(
  userNpub: string,
  communityId: string,
): Application | null {
  for (const app of applications.values()) {
    if (app.user_npub === userNpub && app.community_id === communityId) {
      return app
    }
  }
  return null
}

/**
 * Get all pending applications for a community
 * @param communityId - Community ID
 * @returns List of pending applications
 */
export function getPendingApplicationsForCommunity(communityId: string): Application[] {
  const pending: Application[] = []
  for (const app of applications.values()) {
    if (app.community_id === communityId && app.status === "pending") {
      pending.push(app)
    }
  }
  console.log(
    "[ApplicationStore] Pending for community",
    communityId,
    ":",
    pending.length,
  )
  return pending
}

/**
 * Get all applications by user
 * @param userNpub - User's npub
 * @returns List of user's applications
 */
export function getApplicationsByUser(userNpub: string): Application[] {
  const userApps: Application[] = []
  for (const app of applications.values()) {
    if (app.user_npub === userNpub) {
      userApps.push(app)
    }
  }
  return userApps
}

/**
 * Update application status
 * @param id - Application ID
 * @param status - New status ('approved', 'rejected')
 * @param reviewedBy - Npub of reviewer
 * @returns Updated application or null
 */
export function updateApplicationStatus(
  id: string,
  status: string,
  reviewedBy: string,
): Application | null {
  const app = applications.get(id)
  if (!app) return null

  app.status = status
  app.reviewed_by = reviewedBy
  app.reviewed_at = new Date().toISOString()

  applications.set(id, app)
  console.log("[ApplicationStore] Updated application:", id, "to", status)
  return app
}

/**
 * Get all applications (for debugging)
 * @returns All applications
 */
export function getAllApplications(): Application[] {
  return Array.from(applications.values())
}
