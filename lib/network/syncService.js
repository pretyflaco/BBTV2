/**
 * Transaction Sync Service
 * Fetches transaction data from Blink API for opted-in community members
 */

const BlinkAPI = require('../blink-api');
const consentStore = require('./consentStore');
const transactionStore = require('./transactionStore');

// Sync configuration
const SYNC_CONFIG = {
  DAYS_TO_SYNC: 90,           // Fetch transactions from last 90 days
  MAX_TRANSACTIONS: 1000,      // Maximum transactions per member
  BATCH_SIZE: 100,             // Transactions per API call
};

// Decrypt API key (reverse of consent.js encryption)
function decryptApiKey(encryptedKey) {
  const reversed = encryptedKey.split('').reverse().join('');
  return Buffer.from(reversed, 'base64').toString('utf8');
}

/**
 * Parse transaction date to timestamp (milliseconds)
 */
function parseTxTimestamp(createdAt) {
  if (typeof createdAt === 'number') {
    // Unix timestamp in seconds
    return createdAt * 1000;
  }
  return new Date(createdAt).getTime();
}

/**
 * Sync transactions for a single user/community with pagination
 * Fetches up to SYNC_CONFIG.DAYS_TO_SYNC days of history
 * @param {Object} consent - Consent object with encrypted API key
 * @returns {Object} Sync result
 */
async function syncUserTransactions(consent) {
  const { user_npub, community_id, encrypted_api_key, blink_username } = consent;
  
  try {
    // Decrypt API key
    const apiKey = decryptApiKey(encrypted_api_key);
    
    // Create Blink API client
    const blinkApi = new BlinkAPI(apiKey);
    
    // Calculate cutoff date (90 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - SYNC_CONFIG.DAYS_TO_SYNC);
    const cutoffTimestamp = cutoffDate.getTime();
    
    console.log(`[SyncService] Fetching transactions for ${blink_username || user_npub.substring(0, 20)}...`);
    console.log(`[SyncService] Cutoff date: ${cutoffDate.toISOString()} (last ${SYNC_CONFIG.DAYS_TO_SYNC} days)`);
    
    let allTransactions = [];
    let cursor = null;
    let hasMore = true;
    let pagesLoaded = 0;
    
    // Paginate through transactions until we hit the cutoff date or max limit
    while (hasMore && allTransactions.length < SYNC_CONFIG.MAX_TRANSACTIONS) {
      const txData = await blinkApi.getTransactions(SYNC_CONFIG.BATCH_SIZE, cursor);
      pagesLoaded++;
      
      if (!txData || !txData.edges || txData.edges.length === 0) {
        hasMore = false;
        break;
      }
      
      // Extract transactions from edges
      const batchTransactions = txData.edges.map(edge => edge.node);
      
      // Check if we've reached transactions older than cutoff
      let reachedCutoff = false;
      for (const tx of batchTransactions) {
        const txTimestamp = parseTxTimestamp(tx.createdAt);
        
        if (txTimestamp < cutoffTimestamp) {
          reachedCutoff = true;
          break;
        }
        
        allTransactions.push(tx);
        
        if (allTransactions.length >= SYNC_CONFIG.MAX_TRANSACTIONS) {
          break;
        }
      }
      
      if (reachedCutoff) {
        console.log(`[SyncService] Reached ${SYNC_CONFIG.DAYS_TO_SYNC}-day cutoff after ${pagesLoaded} pages`);
        hasMore = false;
      } else if (txData.pageInfo?.hasNextPage && txData.pageInfo?.endCursor) {
        cursor = txData.pageInfo.endCursor;
      } else {
        hasMore = false;
      }
    }
    
    if (allTransactions.length === 0) {
      console.log(`[SyncService] No transactions found for ${blink_username}`);
      return {
        success: true,
        user_npub,
        community_id,
        blink_username,
        transaction_count: 0,
        pages_loaded: pagesLoaded,
        message: 'No transactions found'
      };
    }
    
    // Store transactions
    transactionStore.storeTransactions(user_npub, community_id, allTransactions);
    
    console.log(`[SyncService] Synced ${allTransactions.length} transactions for ${blink_username} (${pagesLoaded} API calls)`);
    
    return {
      success: true,
      user_npub,
      community_id,
      blink_username,
      transaction_count: allTransactions.length,
      pages_loaded: pagesLoaded,
      message: `Synced ${allTransactions.length} transactions`
    };
    
  } catch (error) {
    console.error(`[SyncService] Error syncing for ${blink_username || user_npub}:`, error.message);
    return {
      success: false,
      user_npub,
      community_id,
      blink_username,
      error: error.message
    };
  }
}

/**
 * Sync all transactions for a community
 * @param {string} communityId 
 * @returns {Object} Sync results
 */
async function syncCommunityTransactions(communityId) {
  console.log(`[SyncService] Starting sync for community ${communityId}`);
  
  // Get all active consents for this community
  const consents = consentStore.getCommunityConsents(communityId);
  
  if (consents.length === 0) {
    return {
      success: true,
      community_id: communityId,
      message: 'No members have opted in for data sharing',
      results: []
    };
  }
  
  console.log(`[SyncService] Found ${consents.length} opted-in members`);
  
  // Sync each member's transactions
  const results = [];
  const memberUsernames = [];
  
  for (const consent of consents) {
    const result = await syncUserTransactions(consent);
    results.push(result);
    
    if (consent.blink_username) {
      memberUsernames.push(consent.blink_username);
    }
  }
  
  // Calculate updated metrics for the community
  const metrics = transactionStore.calculateCommunityMetrics(communityId, memberUsernames);
  
  const successCount = results.filter(r => r.success).length;
  const totalTxs = results.reduce((sum, r) => sum + (r.transaction_count || 0), 0);
  
  console.log(`[SyncService] Community sync complete: ${successCount}/${consents.length} members, ${totalTxs} transactions`);
  
  return {
    success: true,
    community_id: communityId,
    members_synced: successCount,
    total_members: consents.length,
    total_transactions: totalTxs,
    metrics,
    results
  };
}

/**
 * Sync all transactions across all communities
 * @returns {Object} Sync results for all communities
 */
async function syncAllCommunities() {
  console.log('[SyncService] Starting full sync for all communities');
  
  // Get unique community IDs from all consents
  const allConsents = [];
  
  // We need to iterate through all consents to find unique communities
  // This is a bit hacky but works for the in-memory store
  const communityIds = new Set();
  
  // Get consents for known communities
  const knownCommunities = [
    'a1b2c3d4-e5f6-7890-abcd-ef1234567001', // Bitcoin Ekasi
    'a1b2c3d4-e5f6-7890-abcd-ef1234567002', // Bitcoin Victoria Falls
    'a1b2c3d4-e5f6-7890-abcd-ef1234567003', // Test Community
  ];
  
  for (const communityId of knownCommunities) {
    const consents = consentStore.getCommunityConsents(communityId);
    if (consents.length > 0) {
      communityIds.add(communityId);
    }
  }
  
  const results = [];
  
  for (const communityId of communityIds) {
    const result = await syncCommunityTransactions(communityId);
    results.push(result);
  }
  
  const totalMembers = results.reduce((sum, r) => sum + (r.members_synced || 0), 0);
  const totalTxs = results.reduce((sum, r) => sum + (r.total_transactions || 0), 0);
  
  console.log(`[SyncService] Full sync complete: ${communityIds.size} communities, ${totalMembers} members, ${totalTxs} transactions`);
  
  return {
    success: true,
    communities_synced: communityIds.size,
    total_members: totalMembers,
    total_transactions: totalTxs,
    results
  };
}

module.exports = {
  syncUserTransactions,
  syncCommunityTransactions,
  syncAllCommunities,
  decryptApiKey
};
