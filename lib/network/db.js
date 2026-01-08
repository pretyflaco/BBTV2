/**
 * Database utilities for Network module
 * Handles all PostgreSQL operations for communities, memberships, and metrics
 */

const { Pool } = require('pg');

// Create connection pool
let pool = null;

function getPool() {
  if (!pool) {
    // Build connection config from environment variables
    // Prefer individual env vars to avoid URL encoding issues with special characters in passwords
    const config = process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: process.env.POSTGRES_PORT || 5432,
          database: process.env.POSTGRES_DB || 'blinkpos',
          user: process.env.POSTGRES_USER || 'blinkpos',
          password: process.env.POSTGRES_PASSWORD || 'blinkpos_dev_password',
        };
    
    pool = new Pool({
      ...config,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }
  return pool;
}

/**
 * Execute a query with parameters
 */
async function query(text, params) {
  const start = Date.now();
  const result = await getPool().query(text, params);
  const duration = Date.now() - start;
  
  if (duration > 1000) {
    console.warn(`Slow query (${duration}ms):`, text.substring(0, 100));
  }
  
  return result;
}

/**
 * Get a client for transactions
 */
async function getClient() {
  return await getPool().connect();
}

// ============================================
// SUPER ADMIN OPERATIONS
// ============================================

// Super admin npub - only this identity can whitelist new leaders
const SUPER_ADMIN_NPUB = 'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6';

async function isSuperAdmin(npub) {
  if (!npub) return false;
  
  // Check against hardcoded super admin first (fallback if DB not available)
  if (npub === SUPER_ADMIN_NPUB) return true;
  
  // Also check database in case we add more super admins later
  const result = await query(
    'SELECT id FROM super_admins WHERE npub = $1 AND status = $2',
    [npub, 'active']
  );
  return result.rows.length > 0;
}

async function getSuperAdmins() {
  const result = await query(
    `SELECT npub, display_name, added_at FROM super_admins WHERE status = 'active'`
  );
  return result.rows;
}

// ============================================
// LEADER WHITELIST OPERATIONS
// ============================================

async function isLeaderWhitelisted(npub) {
  if (!npub) return false;
  
  const result = await query(
    'SELECT id FROM community_leader_whitelist WHERE npub = $1 AND status = $2',
    [npub, 'active']
  );
  return result.rows.length > 0;
}

async function canCreateCommunity(npub) {
  // Only super admin can create new communities (whitelist new leaders)
  return await isSuperAdmin(npub);
}

async function addToWhitelist(npub, pubkeyHex, displayName, addedByNpub, reason) {
  // Verify the caller is a super admin
  const isAdmin = await isSuperAdmin(addedByNpub);
  if (!isAdmin) {
    throw new Error('Only super admins can whitelist community leaders');
  }
  
  const result = await query(
    `INSERT INTO community_leader_whitelist 
     (npub, pubkey_hex, display_name, added_by, reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [npub, pubkeyHex, displayName, addedByNpub, reason]
  );
  return result.rows[0];
}

async function removeFromWhitelist(npub, removedByNpub) {
  // Verify the caller is a super admin
  const isAdmin = await isSuperAdmin(removedByNpub);
  if (!isAdmin) {
    throw new Error('Only super admins can remove community leaders from whitelist');
  }
  
  const result = await query(
    `UPDATE community_leader_whitelist 
     SET status = 'revoked', updated_at = NOW()
     WHERE npub = $1
     RETURNING *`,
    [npub]
  );
  return result.rows[0];
}

async function getWhitelistedLeaders() {
  const result = await query(
    `SELECT * FROM community_leader_whitelist WHERE status = 'active' ORDER BY created_at DESC`
  );
  return result.rows;
}

// ============================================
// COMMUNITY OPERATIONS
// ============================================

async function createCommunity(data) {
  const {
    name, slug, description,
    countryCode, region, city, latitude, longitude,
    leaderNpub, leaderPubkeyHex,
    settings
  } = data;
  
  const result = await query(
    `INSERT INTO communities 
     (name, slug, description, country_code, region, city, latitude, longitude,
      leader_npub, leader_pubkey_hex, settings)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [name, slug, description, countryCode, region, city, latitude, longitude,
     leaderNpub, leaderPubkeyHex, settings ? JSON.stringify(settings) : null]
  );
  
  // Also create membership for leader
  await query(
    `INSERT INTO community_memberships 
     (community_id, user_npub, user_pubkey_hex, role, status, approved_at)
     VALUES ($1, $2, $3, 'leader', 'approved', NOW())`,
    [result.rows[0].id, leaderNpub, leaderPubkeyHex]
  );
  
  return result.rows[0];
}

async function getCommunityBySlug(slug) {
  const result = await query(
    'SELECT * FROM communities WHERE slug = $1',
    [slug]
  );
  return result.rows[0];
}

async function getCommunityById(id) {
  const result = await query(
    'SELECT * FROM communities WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

async function listCommunities(options = {}) {
  const { status = 'active', limit = 50, offset = 0 } = options;
  
  const result = await query(
    `SELECT c.*, 
            (SELECT COUNT(*) FROM community_memberships 
             WHERE community_id = c.id AND status = 'approved') as member_count_live
     FROM communities c
     WHERE c.status = $1
     ORDER BY c.member_count DESC, c.created_at DESC
     LIMIT $2 OFFSET $3`,
    [status, limit, offset]
  );
  return result.rows;
}

async function getCommunitiesForHeatmap() {
  const result = await query(`SELECT * FROM community_heatmap`);
  return result.rows;
}

async function getLeaderboard() {
  const result = await query(`SELECT * FROM community_leaderboard LIMIT 100`);
  return result.rows;
}

// ============================================
// MEMBERSHIP OPERATIONS
// ============================================

async function applyToJoinCommunity(communityId, userNpub, userPubkeyHex, applicationNote) {
  const result = await query(
    `INSERT INTO community_memberships 
     (community_id, user_npub, user_pubkey_hex, application_note, status)
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT (community_id, user_npub) 
     DO UPDATE SET 
       application_note = EXCLUDED.application_note,
       applied_at = NOW(),
       status = CASE 
         WHEN community_memberships.status = 'rejected' THEN 'pending'
         ELSE community_memberships.status
       END
     RETURNING *`,
    [communityId, userNpub, userPubkeyHex, applicationNote]
  );
  return result.rows[0];
}

async function getMembership(communityId, userNpub) {
  const result = await query(
    `SELECT cm.*, c.name as community_name, c.slug as community_slug
     FROM community_memberships cm
     JOIN communities c ON c.id = cm.community_id
     WHERE cm.community_id = $1 AND cm.user_npub = $2`,
    [communityId, userNpub]
  );
  return result.rows[0];
}

async function getUserMemberships(userNpub) {
  const result = await query(
    `SELECT cm.*, c.name as community_name, c.slug as community_slug,
            c.member_count, c.data_sharing_member_count
     FROM community_memberships cm
     JOIN communities c ON c.id = cm.community_id
     WHERE cm.user_npub = $1
     ORDER BY cm.approved_at DESC NULLS LAST`,
    [userNpub]
  );
  return result.rows;
}

async function getPendingApplications(communityId) {
  const result = await query(
    `SELECT * FROM pending_applications WHERE community_id = $1`,
    [communityId]
  );
  return result.rows;
}

async function reviewApplication(membershipId, approvedByNpub, approved, rejectionReason) {
  const result = await query(
    `UPDATE community_memberships 
     SET status = $1::varchar,
         reviewed_at = NOW(),
         approved_at = CASE WHEN $1::varchar = 'approved' THEN NOW() ELSE approved_at END,
         approved_by_npub = $2,
         rejection_reason = $3
     WHERE id = $4
     RETURNING *`,
    [approved ? 'approved' : 'rejected', approvedByNpub, rejectionReason, parseInt(membershipId, 10)]
  );
  return result.rows[0];
}

async function leaveCommunity(communityId, userNpub) {
  const result = await query(
    `UPDATE community_memberships 
     SET status = 'left', left_at = NOW()
     WHERE community_id = $1 AND user_npub = $2
     RETURNING *`,
    [communityId, userNpub]
  );
  return result.rows[0];
}

async function getCommunityMembers(communityId, options = {}) {
  const { status = 'approved', limit = 100, offset = 0 } = options;
  
  const result = await query(
    `SELECT cm.*, 
            dsc.consent_given,
            dsc.blink_username,
            dsc.total_transactions_synced
     FROM community_memberships cm
     LEFT JOIN data_sharing_consents dsc ON dsc.membership_id = cm.id
     WHERE cm.community_id = $1 AND cm.status = $2
     ORDER BY cm.approved_at DESC
     LIMIT $3 OFFSET $4`,
    [communityId, status, limit, offset]
  );
  return result.rows;
}

// ============================================
// DATA SHARING CONSENT OPERATIONS
// ============================================

async function createOrUpdateConsent(membershipId, userNpub, communityId, consentData) {
  const {
    consentGiven,
    blinkApiKeyEncrypted,
    blinkWalletIds,
    blinkUsername,
    syncFromDate
  } = consentData;
  
  const result = await query(
    `INSERT INTO data_sharing_consents 
     (membership_id, user_npub, community_id, consent_given, 
      blink_api_key_encrypted, blink_wallet_ids, blink_username,
      sync_from_date, consented_at, sync_status, next_sync_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 
             CASE WHEN $4 THEN NOW() ELSE NULL END,
             CASE WHEN $4 THEN 'pending' ELSE 'never' END,
             CASE WHEN $4 THEN NOW() ELSE NULL END)
     ON CONFLICT (membership_id) 
     DO UPDATE SET 
       consent_given = EXCLUDED.consent_given,
       blink_api_key_encrypted = COALESCE(EXCLUDED.blink_api_key_encrypted, data_sharing_consents.blink_api_key_encrypted),
       blink_wallet_ids = COALESCE(EXCLUDED.blink_wallet_ids, data_sharing_consents.blink_wallet_ids),
       blink_username = COALESCE(EXCLUDED.blink_username, data_sharing_consents.blink_username),
       sync_from_date = COALESCE(EXCLUDED.sync_from_date, data_sharing_consents.sync_from_date),
       consented_at = CASE WHEN EXCLUDED.consent_given AND NOT data_sharing_consents.consent_given THEN NOW() ELSE data_sharing_consents.consented_at END,
       revoked_at = CASE WHEN NOT EXCLUDED.consent_given AND data_sharing_consents.consent_given THEN NOW() ELSE data_sharing_consents.revoked_at END,
       sync_status = CASE WHEN EXCLUDED.consent_given THEN 'pending' ELSE 'never' END,
       next_sync_at = CASE WHEN EXCLUDED.consent_given THEN NOW() ELSE NULL END,
       updated_at = NOW()
     RETURNING *`,
    [membershipId, userNpub, communityId, consentGiven,
     blinkApiKeyEncrypted, blinkWalletIds, blinkUsername, syncFromDate]
  );
  return result.rows[0];
}

async function getConsent(membershipId) {
  const result = await query(
    `SELECT * FROM data_sharing_consents WHERE membership_id = $1`,
    [membershipId]
  );
  return result.rows[0];
}

async function getConsentByUser(communityId, userNpub) {
  const result = await query(
    `SELECT dsc.* 
     FROM data_sharing_consents dsc
     JOIN community_memberships cm ON cm.id = dsc.membership_id
     WHERE cm.community_id = $1 AND cm.user_npub = $2`,
    [communityId, userNpub]
  );
  return result.rows[0];
}

async function getConsentsForSync(limit = 10) {
  const result = await query(
    `SELECT * FROM data_sync_queue LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function getCommunityConsents(communityId) {
  // Get all active consents for a specific community with API keys for syncing
  const result = await query(
    `SELECT 
       dsc.id as consent_id,
       dsc.membership_id,
       dsc.user_npub,
       dsc.community_id,
       dsc.blink_api_key_encrypted as encrypted_api_key,
       dsc.blink_username,
       dsc.blink_wallet_ids,
       dsc.sync_status,
       dsc.last_sync_at,
       dsc.total_transactions_synced
     FROM data_sharing_consents dsc
     WHERE dsc.community_id = $1
       AND dsc.consent_given = true
       AND dsc.blink_api_key_encrypted IS NOT NULL`,
    [communityId]
  );
  return result.rows;
}

async function updateSyncStatus(consentId, status, error = null, transactionsSynced = 0) {
  const result = await query(
    `UPDATE data_sharing_consents 
     SET sync_status = $1::varchar,
         last_sync_at = NOW(),
         last_sync_error = $2,
         total_transactions_synced = total_transactions_synced + $3,
         next_sync_at = CASE 
           WHEN $1::varchar = 'synced' THEN NOW() + INTERVAL '24 hours'
           WHEN $1::varchar = 'error' THEN NOW() + INTERVAL '1 hour'
           ELSE next_sync_at
         END,
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [status, error, transactionsSynced, consentId]
  );
  return result.rows[0];
}

// ============================================
// TRANSACTION OPERATIONS
// ============================================

/**
 * Convert a transaction timestamp to a proper Date object
 * Handles Unix timestamps (seconds), milliseconds, and ISO strings
 */
function parseTransactionTimestamp(timestamp) {
  if (!timestamp) return null;
  
  // If it's already a Date object, return it
  if (timestamp instanceof Date) return timestamp;
  
  // If it's a number, check if it's seconds or milliseconds
  if (typeof timestamp === 'number') {
    // If timestamp is in seconds (typical Unix timestamp), convert to milliseconds
    // Unix timestamps from 2020-2030 are in the range 1577836800 to 1893456000
    if (timestamp < 10000000000) {
      return new Date(timestamp * 1000);
    }
    // Already in milliseconds
    return new Date(timestamp);
  }
  
  // If it's a string, parse it
  if (typeof timestamp === 'string') {
    return new Date(timestamp);
  }
  
  return null;
}

async function insertMemberTransactions(consentId, communityId, transactions) {
  if (!transactions || transactions.length === 0) {
    return 0;
  }
  
  const client = await getClient();
  let inserted = 0;
  
  try {
    await client.query('BEGIN');
    
    for (const tx of transactions) {
      try {
        // Convert timestamp to proper Date
        const txCreatedAt = parseTransactionTimestamp(tx.createdAt);
        
        if (!txCreatedAt || isNaN(txCreatedAt.getTime())) {
          console.warn(`[DB] Skipping transaction ${tx.id} - invalid timestamp: ${tx.createdAt}`);
          continue;
        }
        
        // Use a savepoint so individual insert failures don't abort the whole transaction
        await client.query('SAVEPOINT insert_tx');
        
        await client.query(
          `INSERT INTO member_transactions 
           (consent_id, community_id, tx_id, direction, settlement_amount, settlement_currency,
            status, counterparty_username, counterparty_wallet_id, initiation_type,
            settlement_type, tx_created_at, memo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (consent_id, tx_id) DO NOTHING`,
          [consentId, communityId, tx.id, tx.direction, tx.settlementAmount,
           tx.settlementCurrency, tx.status, tx.counterpartyUsername,
           tx.counterpartyWalletId, tx.initiationType, tx.settlementType,
           txCreatedAt, tx.memo]
        );
        
        await client.query('RELEASE SAVEPOINT insert_tx');
        inserted++;
      } catch (err) {
        // Rollback to savepoint and continue with next transaction
        await client.query('ROLLBACK TO SAVEPOINT insert_tx');
        
        // Only log if it's not a duplicate (which is handled by ON CONFLICT)
        if (err.code !== '23505') {
          console.error(`[DB] Error inserting transaction ${tx.id}:`, err.message);
        }
      }
    }
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  
  return inserted;
}

async function markInternalTransactions(communityId) {
  const result = await query(
    `SELECT mark_internal_transactions($1)`,
    [communityId]
  );
  return result.rows[0].mark_internal_transactions;
}

// ============================================
// METRICS OPERATIONS
// ============================================

async function computeMetrics(communityId, periodType, periodStart, periodEnd) {
  await query(
    `SELECT compute_community_metrics($1, $2, $3, $4)`,
    [communityId, periodType, periodStart, periodEnd]
  );
}

async function getLatestMetrics(communityId, periodType = 'monthly') {
  const result = await query(
    `SELECT * FROM community_metrics 
     WHERE community_id = $1 AND period_type = $2
     ORDER BY period_start DESC
     LIMIT 1`,
    [communityId, periodType]
  );
  return result.rows[0];
}

async function getMetricsHistory(communityId, periodType = 'monthly', limit = 12) {
  const result = await query(
    `SELECT * FROM community_metrics 
     WHERE community_id = $1 AND period_type = $2
     ORDER BY period_start DESC
     LIMIT $3`,
    [communityId, periodType, limit]
  );
  return result.rows;
}

/**
 * Calculate metrics for a specific time period from transactions
 * @param {string} communityId 
 * @param {Date} periodStart 
 * @param {Date} periodEnd 
 * @returns {Object} Calculated metrics
 */
async function calculateMetricsForPeriod(communityId, periodStart, periodEnd) {
  // Get member usernames for intra-community detection
  const consentsResult = await query(
    `SELECT blink_username FROM data_sharing_consents 
     WHERE community_id = $1 AND consent_given = true AND blink_username IS NOT NULL`,
    [communityId]
  );
  const memberUsernames = consentsResult.rows.map(r => r.blink_username.toLowerCase());
  const memberSet = new Set(memberUsernames);

  // Get transactions for the period
  const txResult = await query(
    `SELECT 
       mt.*,
       CASE WHEN LOWER(mt.counterparty_username) = ANY($4::text[]) THEN true ELSE mt.counterparty_in_community END as is_intra
     FROM member_transactions mt
     WHERE mt.community_id = $1 
       AND mt.tx_created_at >= $2 
       AND mt.tx_created_at <= $3
     ORDER BY mt.tx_created_at DESC`,
    [communityId, periodStart, periodEnd, memberUsernames]
  );
  
  const transactions = txResult.rows;
  
  if (transactions.length === 0) {
    return {
      transaction_count: 0,
      total_volume_sats: 0,
      intra_community_count: 0,
      intra_volume_sats: 0,
      unique_members: 0,
      closed_loop_ratio: 0,
      velocity: 0,
      avg_tx_size: 0
    };
  }
  
  // Calculate metrics
  const uniqueMembers = new Set(transactions.map(tx => tx.consent_id));
  const totalVolume = transactions.reduce((sum, tx) => sum + parseInt(tx.settlement_amount || 0), 0);
  
  // Count intra-community transactions
  const intraCommunityTxs = transactions.filter(tx => {
    if (tx.counterparty_in_community) return true;
    if (!tx.counterparty_username) return false;
    return memberSet.has(tx.counterparty_username.toLowerCase());
  });
  
  const intraVolume = intraCommunityTxs.reduce((sum, tx) => sum + parseInt(tx.settlement_amount || 0), 0);
  
  const closedLoopRatio = transactions.length > 0
    ? Math.round((intraCommunityTxs.length / transactions.length) * 100)
    : 0;
  
  const velocity = uniqueMembers.size > 0
    ? Math.round(transactions.length / uniqueMembers.size)
    : 0;
  
  const avgTxSize = transactions.length > 0
    ? Math.round(totalVolume / transactions.length)
    : 0;
  
  return {
    transaction_count: transactions.length,
    total_volume_sats: totalVolume,
    intra_community_count: intraCommunityTxs.length,
    intra_volume_sats: intraVolume,
    unique_members: uniqueMembers.size,
    closed_loop_ratio: closedLoopRatio,
    velocity: velocity,
    avg_tx_size: avgTxSize
  };
}

/**
 * Get data coverage (oldest and newest transaction dates) for a community
 * @param {string} communityId 
 * @returns {Object} Data coverage info
 */
async function getDataCoverage(communityId) {
  const result = await query(
    `SELECT 
       MIN(tx_created_at) as oldest,
       MAX(tx_created_at) as newest,
       COUNT(*) as total_transactions
     FROM member_transactions
     WHERE community_id = $1`,
    [communityId]
  );
  
  const row = result.rows[0];
  return {
    oldest: row.oldest ? row.oldest.toISOString() : null,
    newest: row.newest ? row.newest.toISOString() : null,
    total_transactions: parseInt(row.total_transactions || 0)
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get date range for a period type
 * @param {string} period - Period type: 'current_week', 'last_week', 'current_month', 'last_month', 'all'
 * @returns {Object} { start: Date, end: Date, label: string }
 */
function getDateRange(period) {
  const now = new Date();
  let start, end, label;
  
  switch (period) {
    case 'current_week': {
      const dayOfWeek = now.getDay();
      start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      label = 'This Week';
      break;
    }
    case 'last_week': {
      const dayOfWeek = now.getDay();
      start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek - 7);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      label = 'Last Week';
      break;
    }
    case 'current_month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now);
      label = now.toLocaleString('default', { month: 'long', year: 'numeric' });
      break;
    }
    case 'last_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      label = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        .toLocaleString('default', { month: 'long', year: 'numeric' });
      break;
    }
    case 'all':
    default: {
      start = new Date(2020, 0, 1); // Far in the past
      end = new Date(now);
      label = 'All Time';
      break;
    }
  }
  
  return { start, end, label };
}

/**
 * Get member count for a community (approved members)
 * @param {string} communityId
 * @returns {Promise<number>}
 */
async function getMemberCount(communityId) {
  const result = await query(
    `SELECT COUNT(*) as count FROM community_memberships 
     WHERE community_id = $1 AND status = 'approved'`,
    [communityId]
  );
  return parseInt(result.rows[0]?.count || 0, 10);
}

/**
 * Get count of members who have given data sharing consent
 * @param {string} communityId
 * @returns {Promise<number>}
 */
async function getConsentCount(communityId) {
  const result = await query(
    `SELECT COUNT(*) as count FROM data_sharing_consents 
     WHERE community_id = $1 AND consent_given = true`,
    [communityId]
  );
  return parseInt(result.rows[0]?.count || 0, 10);
}

/**
 * Get all communities with basic info for heatmap/leaderboard
 * @returns {Promise<Array>}
 */
async function getAllCommunities() {
  const result = await query(
    `SELECT 
       id, name, slug, 
       country_code, region, city, 
       latitude, longitude,
       leader_npub, member_count, data_sharing_member_count
     FROM communities 
     WHERE status = 'active'
     ORDER BY member_count DESC`
  );
  return result.rows;
}

// ============================================
// MILESTONE OPERATIONS
// ============================================

async function checkAndRecordMilestone(communityId, milestoneType, value) {
  const result = await query(
    `INSERT INTO community_milestones (community_id, milestone_type, milestone_value)
     VALUES ($1, $2, $3)
     ON CONFLICT (community_id, milestone_type) DO NOTHING
     RETURNING *`,
    [communityId, milestoneType, value]
  );
  return result.rows[0];
}

async function getCommunityMilestones(communityId) {
  const result = await query(
    `SELECT * FROM community_milestones 
     WHERE community_id = $1 
     ORDER BY achieved_at DESC`,
    [communityId]
  );
  return result.rows;
}

module.exports = {
  query,
  getClient,
  // Super admin
  SUPER_ADMIN_NPUB,
  isSuperAdmin,
  getSuperAdmins,
  // Leader whitelist
  isLeaderWhitelisted,
  canCreateCommunity,
  addToWhitelist,
  removeFromWhitelist,
  getWhitelistedLeaders,
  // Communities
  createCommunity,
  getCommunityBySlug,
  getCommunityById,
  listCommunities,
  getCommunitiesForHeatmap,
  getLeaderboard,
  getAllCommunities,
  // Memberships
  applyToJoinCommunity,
  getMembership,
  getUserMemberships,
  getPendingApplications,
  reviewApplication,
  leaveCommunity,
  getCommunityMembers,
  getMemberCount,
  // Consents
  createOrUpdateConsent,
  getConsent,
  getConsentByUser,
  getConsentsForSync,
  getCommunityConsents,
  getConsentCount,
  updateSyncStatus,
  // Transactions
  insertMemberTransactions,
  markInternalTransactions,
  // Metrics
  computeMetrics,
  getLatestMetrics,
  getMetricsHistory,
  calculateMetricsForPeriod,
  getDataCoverage,
  getDateRange,
  // Milestones
  checkAndRecordMilestone,
  getCommunityMilestones
};
