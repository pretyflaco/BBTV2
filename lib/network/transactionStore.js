/**
 * In-memory transaction store for development
 * Stores synced transaction data from community members
 * In production, this would be replaced with database operations
 * 
 * Uses global singleton to persist across Next.js hot reloads
 */

// Use global to persist across hot reloads in development
if (!global._networkTransactionStore) {
  global._networkTransactionStore = {
    // Map of visitorId -> transactions array
    transactions: new Map(),
    // Map of communityId -> aggregated metrics
    metrics: new Map(),
    // Map of visitorId -> last sync timestamp
    lastSync: new Map()
  };
}

const store = global._networkTransactionStore;

/**
 * Get date range for a period
 * @param {string} period - 'current_week' | 'last_week' | 'current_month' | 'last_month' | 'all'
 * @returns {{start: Date, end: Date, label: string}}
 */
function getDateRange(period) {
  const now = new Date();
  let start, end, label;
  
  switch (period) {
    case 'current_week': {
      // Monday of current week at 00:00:00
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
      start = new Date(now);
      start.setDate(now.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      // Sunday of current week at 23:59:59
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      const weekNum = getWeekNumber(start);
      label = `Week ${weekNum.year}/${String(weekNum.week).padStart(2, '0')}`;
      break;
    }
    case 'last_week': {
      // Monday of last week
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      start = new Date(now);
      start.setDate(now.getDate() - diff - 7);
      start.setHours(0, 0, 0, 0);
      // Sunday of last week
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      const weekNum = getWeekNumber(start);
      label = `Week ${weekNum.year}/${String(weekNum.week).padStart(2, '0')}`;
      break;
    }
    case 'current_month': {
      // First day of current month
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      // Last day of current month
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      break;
    }
    case 'last_month': {
      // First day of last month
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      // Last day of last month
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      break;
    }
    case 'all':
    default:
      start = new Date(0);
      end = new Date(8640000000000000); // Max date
      label = 'All Time';
  }
  
  return { start, end, label };
}

/**
 * Get ISO week number
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

/**
 * Parse transaction date to timestamp
 */
function parseTxDate(created_at) {
  if (typeof created_at === 'number') {
    // Unix timestamp in seconds
    return created_at * 1000;
  }
  return new Date(created_at).getTime();
}

/**
 * @typedef {Object} Transaction
 * @property {string} id - Transaction ID
 * @property {string} user_npub - User's npub
 * @property {string} community_id - Community ID
 * @property {string} direction - 'RECEIVE' | 'SEND'
 * @property {number} amount - Amount in sats
 * @property {string} currency - 'BTC' | 'USD'
 * @property {string} created_at - ISO timestamp
 * @property {string} [counterparty_username] - For intra-ledger transactions
 * @property {string} [counterparty_wallet_id] - For intra-ledger transactions
 * @property {string} memo - Transaction memo
 * @property {string} type - 'lightning' | 'onchain' | 'intraledger'
 */

/**
 * @typedef {Object} CommunityMetrics
 * @property {string} community_id
 * @property {number} transaction_count - Total transactions
 * @property {number} total_volume_sats - Total volume in sats
 * @property {number} intra_community_count - Transactions between members
 * @property {number} unique_members - Members with transactions
 * @property {number} velocity - Average times BTC changes hands
 * @property {string} last_updated - ISO timestamp
 */

/**
 * Store transactions for a user
 * @param {string} userNpub 
 * @param {string} communityId 
 * @param {Transaction[]} transactions 
 */
function storeTransactions(userNpub, communityId, transactions) {
  const key = `${userNpub}:${communityId}`;
  
  // Transform and store transactions
  const storedTxs = transactions.map(tx => {
    const amount = Math.abs(tx.settlementAmount || 0);
    return {
      id: tx.id,
      user_npub: userNpub,
      community_id: communityId,
      direction: tx.direction,
      amount: amount,
      currency: tx.settlementCurrency || 'BTC',
      created_at: tx.createdAt,
      counterparty_username: tx.initiationVia?.counterPartyUsername || 
                             tx.settlementVia?.counterPartyUsername || null,
      counterparty_wallet_id: tx.initiationVia?.counterPartyWalletId || 
                              tx.settlementVia?.counterPartyWalletId || null,
      memo: tx.memo || '',
      type: getTransactionType(tx)
    };
  });
  
  store.transactions.set(key, storedTxs);
  store.lastSync.set(key, new Date().toISOString());
  
  // Debug: log sample transaction and totals
  const totalAmount = storedTxs.reduce((sum, tx) => sum + tx.amount, 0);
  console.log(`[TransactionStore] Stored ${storedTxs.length} transactions for ${userNpub.substring(0, 20)}... in community ${communityId}`);
  console.log(`[TransactionStore] Total amount: ${totalAmount} sats`);
  if (storedTxs.length > 0) {
    console.log(`[TransactionStore] Sample transaction:`, JSON.stringify(storedTxs[0], null, 2));
  }
  
  return storedTxs;
}

/**
 * Determine transaction type from Blink transaction data
 */
function getTransactionType(tx) {
  const initType = tx.initiationVia?.__typename;
  const settleType = tx.settlementVia?.__typename;
  
  if (initType === 'InitiationViaIntraLedger' || settleType === 'SettlementViaIntraLedger') {
    return 'intraledger';
  }
  if (initType === 'InitiationViaOnChain' || settleType === 'SettlementViaOnChain') {
    return 'onchain';
  }
  return 'lightning';
}

/**
 * Get transactions for a user in a community
 * @param {string} userNpub 
 * @param {string} communityId 
 * @returns {Transaction[]}
 */
function getUserTransactions(userNpub, communityId) {
  const key = `${userNpub}:${communityId}`;
  return store.transactions.get(key) || [];
}

/**
 * Get all transactions for a community
 * @param {string} communityId 
 * @returns {Transaction[]}
 */
function getCommunityTransactions(communityId) {
  const allTxs = [];
  console.log(`[TransactionStore] Getting transactions for community ${communityId}`);
  console.log(`[TransactionStore] Store has ${store.transactions.size} entries`);
  
  for (const [key, txs] of store.transactions.entries()) {
    console.log(`[TransactionStore] Checking key: ${key.substring(0, 40)}...`);
    if (key.endsWith(`:${communityId}`)) {
      console.log(`[TransactionStore] Match! Adding ${txs.length} transactions`);
      allTxs.push(...txs);
    }
  }
  
  console.log(`[TransactionStore] Total transactions for community: ${allTxs.length}`);
  return allTxs;
}

/**
 * Get last sync time for a user/community
 * @param {string} userNpub 
 * @param {string} communityId 
 * @returns {string|null}
 */
function getLastSyncTime(userNpub, communityId) {
  const key = `${userNpub}:${communityId}`;
  return store.lastSync.get(key) || null;
}

/**
 * Calculate and store metrics for a community
 * @param {string} communityId 
 * @param {string[]} memberUsernames - List of Blink usernames of community members
 * @returns {CommunityMetrics}
 */
function calculateCommunityMetrics(communityId, memberUsernames = []) {
  const transactions = getCommunityTransactions(communityId);
  
  if (transactions.length === 0) {
    const emptyMetrics = {
      community_id: communityId,
      transaction_count: 0,
      total_volume_sats: 0,
      intra_community_count: 0,
      unique_members: 0,
      velocity: 0,
      oldest_tx_date: null,
      newest_tx_date: null,
      last_updated: new Date().toISOString()
    };
    store.metrics.set(communityId, emptyMetrics);
    return emptyMetrics;
  }
  
  // Create a Set of member usernames for fast lookup
  const memberSet = new Set(memberUsernames.map(u => u?.toLowerCase()).filter(Boolean));
  
  // Calculate metrics
  const uniqueMembers = new Set(transactions.map(tx => tx.user_npub));
  const totalVolume = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  
  // Count intra-community transactions (where counterparty is also a member)
  const intraCommunityTxs = transactions.filter(tx => {
    if (!tx.counterparty_username) return false;
    return memberSet.has(tx.counterparty_username.toLowerCase());
  });
  
  // Calculate intra-community volume
  const intraVolume = intraCommunityTxs.reduce((sum, tx) => sum + tx.amount, 0);
  
  // Circular Economy Metrics:
  
  // 1. Closed-loop ratio: % of transactions staying within community
  // Higher = more circular, money staying local
  const closedLoopRatio = transactions.length > 0
    ? Math.round((intraCommunityTxs.length / transactions.length) * 100)
    : 0;
  
  // 2. Velocity: Average transactions per member
  // Higher = more active community
  const velocity = uniqueMembers.size > 0
    ? Math.round(transactions.length / uniqueMembers.size)
    : 0;
  
  // 3. Average transaction size in sats
  const avgTxSize = transactions.length > 0
    ? Math.round(totalVolume / transactions.length)
    : 0;
  
  // Calculate date range of transactions
  // created_at can be a Unix timestamp (seconds) or ISO string
  const txDates = transactions.map(tx => {
    const created = tx.created_at;
    if (typeof created === 'number') {
      // Unix timestamp in seconds
      return created * 1000;
    }
    return new Date(created).getTime();
  }).filter(d => !isNaN(d));
  
  const oldestTxDate = txDates.length > 0 ? new Date(Math.min(...txDates)).toISOString() : null;
  const newestTxDate = txDates.length > 0 ? new Date(Math.max(...txDates)).toISOString() : null;
  
  // Calculate period in days
  const periodDays = txDates.length > 0 
    ? Math.ceil((Math.max(...txDates) - Math.min(...txDates)) / (1000 * 60 * 60 * 24))
    : 0;
  
  const metrics = {
    community_id: communityId,
    transaction_count: transactions.length,
    total_volume_sats: totalVolume,
    intra_community_count: intraCommunityTxs.length,
    intra_volume_sats: intraVolume,
    unique_members: uniqueMembers.size,
    closed_loop_ratio: closedLoopRatio,  // % of txs within community
    velocity: velocity,                   // avg txs per member
    avg_tx_size: avgTxSize,              // avg sats per tx
    oldest_tx_date: oldestTxDate,        // earliest transaction
    newest_tx_date: newestTxDate,        // latest transaction
    period_days: periodDays,             // span in days
    last_updated: new Date().toISOString()
  };
  
  store.metrics.set(communityId, metrics);
  console.log(`[TransactionStore] Updated metrics for community ${communityId}:`, metrics);
  
  return metrics;
}

/**
 * Get cached metrics for a community
 * @param {string} communityId 
 * @returns {CommunityMetrics|null}
 */
function getCommunityMetrics(communityId) {
  return store.metrics.get(communityId) || null;
}

/**
 * Get all community metrics
 * @returns {Map<string, CommunityMetrics>}
 */
function getAllMetrics() {
  return new Map(store.metrics);
}

/**
 * Calculate metrics for a community with period filtering
 * @param {string} communityId 
 * @param {string[]} memberUsernames - List of Blink usernames of community members
 * @param {string} period - 'current_week' | 'last_week' | 'current_month' | 'last_month' | 'all'
 * @returns {CommunityMetrics}
 */
function calculateMetricsForPeriod(communityId, memberUsernames = [], period = 'current_week') {
  const allTransactions = getCommunityTransactions(communityId);
  const { start, end, label } = getDateRange(period);
  
  // Filter transactions by date
  const transactions = allTransactions.filter(tx => {
    const txTime = parseTxDate(tx.created_at);
    return txTime >= start.getTime() && txTime <= end.getTime();
  });
  
  const emptyResult = {
    community_id: communityId,
    period: period,
    period_label: label,
    period_start: start.toISOString(),
    period_end: end.toISOString(),
    transaction_count: 0,
    total_volume_sats: 0,
    intra_community_count: 0,
    intra_volume_sats: 0,
    unique_members: 0,
    closed_loop_ratio: 0,
    velocity: 0,
    avg_tx_size: 0,
    total_synced_txs: allTransactions.length
  };
  
  if (transactions.length === 0) {
    return emptyResult;
  }
  
  // Create a Set of member usernames for fast lookup
  const memberSet = new Set(memberUsernames.map(u => u?.toLowerCase()).filter(Boolean));
  
  // Calculate metrics
  const uniqueMembers = new Set(transactions.map(tx => tx.user_npub));
  const totalVolume = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  
  // Count intra-community transactions
  const intraCommunityTxs = transactions.filter(tx => {
    if (!tx.counterparty_username) return false;
    return memberSet.has(tx.counterparty_username.toLowerCase());
  });
  
  const intraVolume = intraCommunityTxs.reduce((sum, tx) => sum + tx.amount, 0);
  
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
    community_id: communityId,
    period: period,
    period_label: label,
    period_start: start.toISOString(),
    period_end: end.toISOString(),
    transaction_count: transactions.length,
    total_volume_sats: totalVolume,
    intra_community_count: intraCommunityTxs.length,
    intra_volume_sats: intraVolume,
    unique_members: uniqueMembers.size,
    closed_loop_ratio: closedLoopRatio,
    velocity: velocity,
    avg_tx_size: avgTxSize,
    total_synced_txs: allTransactions.length
  };
}

/**
 * Get data coverage for a community
 * Returns the date range of all synced transactions
 * @param {string} communityId 
 * @returns {{oldest: string|null, newest: string|null, total_transactions: number}}
 */
function getDataCoverage(communityId) {
  const transactions = getCommunityTransactions(communityId);
  
  if (transactions.length === 0) {
    return {
      oldest: null,
      newest: null,
      total_transactions: 0
    };
  }
  
  const txDates = transactions.map(tx => parseTxDate(tx.created_at)).filter(d => !isNaN(d));
  
  if (txDates.length === 0) {
    return {
      oldest: null,
      newest: null,
      total_transactions: transactions.length
    };
  }
  
  return {
    oldest: new Date(Math.min(...txDates)).toISOString(),
    newest: new Date(Math.max(...txDates)).toISOString(),
    total_transactions: transactions.length
  };
}

/**
 * Clear all data (for testing)
 */
function clearAll() {
  store.transactions.clear();
  store.metrics.clear();
  store.lastSync.clear();
}

module.exports = {
  storeTransactions,
  getUserTransactions,
  getCommunityTransactions,
  getLastSyncTime,
  calculateCommunityMetrics,
  calculateMetricsForPeriod,
  getCommunityMetrics,
  getAllMetrics,
  getDateRange,
  getDataCoverage,
  clearAll
};
