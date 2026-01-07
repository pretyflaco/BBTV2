/**
 * In-memory application store for development
 * In production, this would be replaced with database operations
 * 
 * Uses global singleton to persist across Next.js hot reloads
 */

// Use global to persist across hot reloads in development
if (!global._networkApplicationStore) {
  global._networkApplicationStore = new Map();
}
const applications = global._networkApplicationStore;

/**
 * Add a new application
 * @param {Object} application - The application data
 * @returns {Object} The stored application with ID
 */
function addApplication(application) {
  const id = `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const storedApp = {
    id,
    ...application,
    status: 'pending',
    applied_at: new Date().toISOString()
  };
  
  applications.set(id, storedApp);
  console.log('[ApplicationStore] Added application:', id, 'Total:', applications.size);
  return storedApp;
}

/**
 * Get application by ID
 * @param {string} id - Application ID
 * @returns {Object|null}
 */
function getApplication(id) {
  return applications.get(id) || null;
}

/**
 * Check if user already has a pending application for a community
 * @param {string} userNpub - User's npub
 * @param {string} communityId - Community ID
 * @returns {Object|null} Existing application or null
 */
function getExistingApplication(userNpub, communityId) {
  for (const app of applications.values()) {
    if (app.user_npub === userNpub && app.community_id === communityId) {
      return app;
    }
  }
  return null;
}

/**
 * Get all pending applications for a community
 * @param {string} communityId - Community ID
 * @returns {Array} List of pending applications
 */
function getPendingApplicationsForCommunity(communityId) {
  const pending = [];
  for (const app of applications.values()) {
    if (app.community_id === communityId && app.status === 'pending') {
      pending.push(app);
    }
  }
  console.log('[ApplicationStore] Pending for community', communityId, ':', pending.length);
  return pending;
}

/**
 * Get all applications by user
 * @param {string} userNpub - User's npub
 * @returns {Array} List of user's applications
 */
function getApplicationsByUser(userNpub) {
  const userApps = [];
  for (const app of applications.values()) {
    if (app.user_npub === userNpub) {
      userApps.push(app);
    }
  }
  return userApps;
}

/**
 * Update application status
 * @param {string} id - Application ID
 * @param {string} status - New status ('approved', 'rejected')
 * @param {string} reviewedBy - Npub of reviewer
 * @returns {Object|null} Updated application or null
 */
function updateApplicationStatus(id, status, reviewedBy) {
  const app = applications.get(id);
  if (!app) return null;
  
  app.status = status;
  app.reviewed_by = reviewedBy;
  app.reviewed_at = new Date().toISOString();
  
  applications.set(id, app);
  console.log('[ApplicationStore] Updated application:', id, 'to', status);
  return app;
}

/**
 * Get all applications (for debugging)
 * @returns {Array}
 */
function getAllApplications() {
  return Array.from(applications.values());
}

module.exports = {
  addApplication,
  getApplication,
  getExistingApplication,
  getPendingApplicationsForCommunity,
  getApplicationsByUser,
  updateApplicationStatus,
  getAllApplications
};
