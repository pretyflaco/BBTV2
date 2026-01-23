/**
 * Transaction Sync Service
 * Fetches transaction data from Blink API for opted-in community members
 * Also captures wallet balance snapshots for Bitcoin Preference metric
 * 
 * IMPORTANT: This service uses DATABASE storage, not in-memory stores
 */

const BlinkAPI = require('../blink-api');
const db = require('./db');

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
 * Normalize transaction from Blink API format to our database format
 */
function normalizeTransaction(tx) {
  return {
    id: tx.id,
    direction: tx.direction,
    settlementAmount: Math.abs(tx.settlementAmount || 0),
    settlementCurrency: tx.settlementCurrency || 'BTC',
    status: tx.status,
    counterpartyUsername: tx.initiationVia?.counterPartyUsername || 
                          tx.settlementVia?.counterPartyUsername || null,
    counterpartyWalletId: tx.initiationVia?.counterPartyWalletId || 
                          tx.settlementVia?.counterPartyWalletId || null,
    initiationType: tx.initiationVia?.__typename?.replace('InitiationVia', '') || null,
    settlementType: tx.settlementVia?.__typename?.replace('SettlementVia', '') || null,
    createdAt: tx.createdAt,
    memo: tx.memo || null
  };
}

/**
 * Sync transactions for a single user/community with pagination
 * Fetches up to SYNC_CONFIG.DAYS_TO_SYNC days of history
 * @param {Object} consent - Consent object from database with encrypted API key
 * @returns {Object} Sync result
 */
async function syncUserTransactions(consent) {
  const { consent_id, user_npub, community_id, encrypted_api_key, blink_username } = consent;
  
  // Update sync status to 'syncing'
  await db.updateSyncStatus(consent_id, 'syncing', null, 0);
  
  try {
    // Decrypt API key
    const apiKey = decryptApiKey(encrypted_api_key);
    
    // Create Blink API client
    const blinkApi = new BlinkAPI(apiKey);
    
    // ===== FETCH WALLET BALANCES FOR BITCOIN PREFERENCE =====
    let btcBalanceSats = 0;
    let stablesatsBalanceSats = 0;
    
    try {
      const wallets = await blinkApi.getBalance();
      
      for (const wallet of wallets) {
        if (wallet.walletCurrency === 'BTC') {
          btcBalanceSats = Math.abs(wallet.balance || 0);
        } else if (wallet.walletCurrency === 'USD') {
          // StableSats (USD) balance is stored in cents, need to convert to sats equivalent
          // For Bitcoin Preference, we store the raw sats value
          stablesatsBalanceSats = Math.abs(wallet.balance || 0);
        }
      }
      
      // Store balance snapshot
      await db.insertBalanceSnapshot(consent_id, community_id, btcBalanceSats, stablesatsBalanceSats);
      console.log(`[SyncService] Balance snapshot for ${blink_username}: BTC=${btcBalanceSats} sats, StableSats=${stablesatsBalanceSats} sats`);
      
    } catch (balanceError) {
      console.warn(`[SyncService] Could not fetch balance for ${blink_username}:`, balanceError.message);
      // Continue with transaction sync even if balance fetch fails
    }
    
    // ===== FETCH TRANSACTIONS =====
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
        
        allTransactions.push(normalizeTransaction(tx));
        
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
      await db.updateSyncStatus(consent_id, 'synced', null, 0);
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
    
    // Store transactions in database
    const insertedCount = await db.insertMemberTransactions(consent_id, community_id, allTransactions);
    
    // Update sync status
    await db.updateSyncStatus(consent_id, 'synced', null, insertedCount);
    
    console.log(`[SyncService] Synced ${allTransactions.length} transactions for ${blink_username} (${insertedCount} new, ${pagesLoaded} API calls)`);
    
    return {
      success: true,
      user_npub,
      community_id,
      blink_username,
      transaction_count: allTransactions.length,
      new_transactions: insertedCount,
      pages_loaded: pagesLoaded,
      message: `Synced ${allTransactions.length} transactions (${insertedCount} new)`
    };
    
  } catch (error) {
    console.error(`[SyncService] Error syncing for ${blink_username || user_npub}:`, error.message);
    
    // Update sync status with error
    await db.updateSyncStatus(consent_id, 'error', error.message, 0);
    
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
  
  // Get all active consents for this community from DATABASE
  const consents = await db.getCommunityConsents(communityId);
  
  if (!consents || consents.length === 0) {
    console.log(`[SyncService] No opted-in members found for community ${communityId}`);
    return {
      success: true,
      community_id: communityId,
      message: 'No members have opted in for data sharing',
      members_synced: 0,
      total_members: 0,
      total_transactions: 0,
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
  
  // Mark internal transactions (transactions between community members)
  const internalMarked = await db.markInternalTransactions(communityId);
  console.log(`[SyncService] Marked ${internalMarked} internal transactions`);
  
  // Compute metrics for current period
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1); // First of current month
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last of current month
  
  try {
    await db.computeMetrics(
      communityId, 
      'monthly', 
      periodStart.toISOString().split('T')[0], 
      periodEnd.toISOString().split('T')[0]
    );
    console.log(`[SyncService] Computed metrics for ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}`);
  } catch (metricsError) {
    console.error(`[SyncService] Error computing metrics:`, metricsError.message);
  }
  
  // Get the computed metrics to return
  let metrics = null;
  try {
    metrics = await db.getLatestMetrics(communityId, 'monthly');
  } catch (err) {
    console.error(`[SyncService] Error fetching metrics:`, err.message);
  }
  
  const successCount = results.filter(r => r.success).length;
  const totalTxs = results.reduce((sum, r) => sum + (r.transaction_count || 0), 0);
  const newTxs = results.reduce((sum, r) => sum + (r.new_transactions || 0), 0);
  
  console.log(`[SyncService] Community sync complete: ${successCount}/${consents.length} members, ${totalTxs} transactions (${newTxs} new)`);
  
  return {
    success: true,
    community_id: communityId,
    members_synced: successCount,
    total_members: consents.length,
    total_transactions: totalTxs,
    new_transactions: newTxs,
    internal_transactions_marked: internalMarked,
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
  
  // Get all active communities from DATABASE
  const communities = await db.listCommunities({ status: 'active' });
  
  if (!communities || communities.length === 0) {
    console.log('[SyncService] No active communities found');
    return {
      success: true,
      communities_synced: 0,
      total_members: 0,
      total_transactions: 0,
      results: []
    };
  }
  
  console.log(`[SyncService] Found ${communities.length} active communities`);
  
  const results = [];
  
  for (const community of communities) {
    console.log(`[SyncService] Syncing community: ${community.name} (${community.id})`);
    const result = await syncCommunityTransactions(community.id);
    results.push(result);
  }
  
  const totalMembers = results.reduce((sum, r) => sum + (r.members_synced || 0), 0);
  const totalTxs = results.reduce((sum, r) => sum + (r.total_transactions || 0), 0);
  const newTxs = results.reduce((sum, r) => sum + (r.new_transactions || 0), 0);
  
  console.log(`[SyncService] Full sync complete: ${communities.length} communities, ${totalMembers} members, ${totalTxs} transactions (${newTxs} new)`);
  
  return {
    success: true,
    communities_synced: communities.length,
    total_members: totalMembers,
    total_transactions: totalTxs,
    new_transactions: newTxs,
    results
  };
}

module.exports = {
  syncUserTransactions,
  syncCommunityTransactions,
  syncAllCommunities,
  decryptApiKey
};
