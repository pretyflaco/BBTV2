/**
 * In-memory transaction store for development
 * Stores synced transaction data from community members
 * In production, this would be replaced with database operations
 *
 * Uses global singleton to persist across Next.js hot reloads
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Blink API "via" sub-objects that appear on raw transactions */
interface BlinkVia {
  __typename?: string
  counterPartyUsername?: string
  counterPartyWalletId?: string
}

/** A raw transaction as received from the Blink GraphQL API */
interface BlinkRawTransaction {
  id: string
  direction: string
  settlementAmount?: number
  settlementCurrency?: string
  createdAt: string | number
  initiationVia?: BlinkVia
  settlementVia?: BlinkVia
  memo?: string
}

/** The format transactions are stored in within the in-memory store */
export interface StoredTransaction {
  id: string
  user_npub: string
  community_id: string
  direction: string
  amount: number
  currency: string
  created_at: string | number
  counterparty_username: string | null
  counterparty_wallet_id: string | null
  memo: string
  type: string
}

/** Aggregated metrics for a community */
export interface CommunityMetrics {
  community_id: string
  transaction_count: number
  total_volume_sats: number
  intra_community_count: number
  intra_volume_sats?: number
  unique_members: number
  closed_loop_ratio?: number
  velocity: number
  avg_tx_size?: number
  oldest_tx_date: string | null
  newest_tx_date: string | null
  period_days?: number
  last_updated: string
}

/** Period-filtered metrics (extends CommunityMetrics with period fields) */
export interface PeriodMetrics extends CommunityMetrics {
  period: string
  period_label: string
  period_start: string
  period_end: string
  total_synced_txs: number
}

/** A date range with human-readable label */
export interface DateRange {
  start: Date
  end: Date
  label: string
}

/** ISO week descriptor */
export interface WeekInfo {
  year: number
  week: number
}

/** Summary of how much historical transaction data is available */
export interface DataCoverage {
  oldest: string | null
  newest: string | null
  total_transactions: number
}

/** Shape of the global in-memory store */
export interface TransactionStoreData {
  transactions: Map<string, StoredTransaction[]>
  metrics: Map<string, CommunityMetrics>
  lastSync: Map<string, string>
}

// ---------------------------------------------------------------------------
// Global declaration for Next.js hot-reload persistence
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var _networkTransactionStore: TransactionStoreData | undefined
}

// ---------------------------------------------------------------------------
// Initialise the global store
// ---------------------------------------------------------------------------

if (!global._networkTransactionStore) {
  global._networkTransactionStore = {
    // Map of visitorId -> transactions array
    transactions: new Map(),
    // Map of communityId -> aggregated metrics
    metrics: new Map(),
    // Map of visitorId -> last sync timestamp
    lastSync: new Map(),
  }
}

const store: TransactionStoreData = global._networkTransactionStore

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Get date range for a period
 */
export function getDateRange(period: string): DateRange {
  const now = new Date()
  let start: Date
  let end: Date
  let label: string

  switch (period) {
    case "current_week": {
      // Monday of current week at 00:00:00
      const dayOfWeek = now.getDay()
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Monday = 0
      start = new Date(now)
      start.setDate(now.getDate() - diff)
      start.setHours(0, 0, 0, 0)
      // Sunday of current week at 23:59:59
      end = new Date(start)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      const weekNum = getWeekNumber(start)
      label = `Week ${weekNum.year}/${String(weekNum.week).padStart(2, "0")}`
      break
    }
    case "last_week": {
      // Monday of last week
      const dayOfWeek = now.getDay()
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      start = new Date(now)
      start.setDate(now.getDate() - diff - 7)
      start.setHours(0, 0, 0, 0)
      // Sunday of last week
      end = new Date(start)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      const weekNum = getWeekNumber(start)
      label = `Week ${weekNum.year}/${String(weekNum.week).padStart(2, "0")}`
      break
    }
    case "current_month": {
      // First day of current month
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      // Last day of current month
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      break
    }
    case "last_month": {
      // First day of last month
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
      // Last day of last month
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      break
    }
    case "all":
    default:
      start = new Date(0)
      end = new Date(8640000000000000) // Max date
      label = "All Time"
  }

  return { start, end, label }
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): WeekInfo {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: d.getUTCFullYear(), week: weekNo }
}

/**
 * Parse transaction date to timestamp (milliseconds)
 */
function parseTxDate(created_at: string | number): number {
  if (typeof created_at === "number") {
    // Unix timestamp in seconds
    return created_at * 1000
  }
  return new Date(created_at).getTime()
}

// ---------------------------------------------------------------------------
// Transaction type helper
// ---------------------------------------------------------------------------

/**
 * Determine transaction type from Blink transaction data
 */
function getTransactionType(tx: BlinkRawTransaction): string {
  const initType: string | undefined = tx.initiationVia?.__typename
  const settleType: string | undefined = tx.settlementVia?.__typename

  if (
    initType === "InitiationViaIntraLedger" ||
    settleType === "SettlementViaIntraLedger"
  ) {
    return "intraledger"
  }
  if (initType === "InitiationViaOnChain" || settleType === "SettlementViaOnChain") {
    return "onchain"
  }
  return "lightning"
}

// ---------------------------------------------------------------------------
// Store operations
// ---------------------------------------------------------------------------

/**
 * Store transactions for a user
 */
export function storeTransactions(
  userNpub: string,
  communityId: string,
  transactions: BlinkRawTransaction[],
): StoredTransaction[] {
  const key = `${userNpub}:${communityId}`

  // Transform and store transactions
  const storedTxs: StoredTransaction[] = transactions.map((tx: BlinkRawTransaction) => {
    const amount: number = Math.abs(tx.settlementAmount || 0)
    return {
      id: tx.id,
      user_npub: userNpub,
      community_id: communityId,
      direction: tx.direction,
      amount: amount,
      currency: tx.settlementCurrency || "BTC",
      created_at: tx.createdAt,
      counterparty_username:
        tx.initiationVia?.counterPartyUsername ||
        tx.settlementVia?.counterPartyUsername ||
        null,
      counterparty_wallet_id:
        tx.initiationVia?.counterPartyWalletId ||
        tx.settlementVia?.counterPartyWalletId ||
        null,
      memo: tx.memo || "",
      type: getTransactionType(tx),
    }
  })

  store.transactions.set(key, storedTxs)
  store.lastSync.set(key, new Date().toISOString())

  // Debug: log sample transaction and totals
  const totalAmount: number = storedTxs.reduce(
    (sum: number, tx: StoredTransaction) => sum + tx.amount,
    0,
  )
  console.log(
    `[TransactionStore] Stored ${storedTxs.length} transactions for ${userNpub.substring(0, 20)}... in community ${communityId}`,
  )
  console.log(`[TransactionStore] Total amount: ${totalAmount} sats`)
  if (storedTxs.length > 0) {
    console.log(
      `[TransactionStore] Sample transaction:`,
      JSON.stringify(storedTxs[0], null, 2),
    )
  }

  return storedTxs
}

/**
 * Get transactions for a user in a community
 */
export function getUserTransactions(
  userNpub: string,
  communityId: string,
): StoredTransaction[] {
  const key = `${userNpub}:${communityId}`
  return store.transactions.get(key) || []
}

/**
 * Get all transactions for a community
 */
export function getCommunityTransactions(communityId: string): StoredTransaction[] {
  const allTxs: StoredTransaction[] = []
  console.log(`[TransactionStore] Getting transactions for community ${communityId}`)
  console.log(`[TransactionStore] Store has ${store.transactions.size} entries`)

  for (const [key, txs] of store.transactions.entries()) {
    console.log(`[TransactionStore] Checking key: ${key.substring(0, 40)}...`)
    if (key.endsWith(`:${communityId}`)) {
      console.log(`[TransactionStore] Match! Adding ${txs.length} transactions`)
      allTxs.push(...txs)
    }
  }

  console.log(`[TransactionStore] Total transactions for community: ${allTxs.length}`)
  return allTxs
}

/**
 * Get last sync time for a user/community
 */
export function getLastSyncTime(userNpub: string, communityId: string): string | null {
  const key = `${userNpub}:${communityId}`
  return store.lastSync.get(key) || null
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * Calculate and store metrics for a community
 */
export function calculateCommunityMetrics(
  communityId: string,
  memberUsernames: string[] = [],
): CommunityMetrics {
  const transactions: StoredTransaction[] = getCommunityTransactions(communityId)

  if (transactions.length === 0) {
    const emptyMetrics: CommunityMetrics = {
      community_id: communityId,
      transaction_count: 0,
      total_volume_sats: 0,
      intra_community_count: 0,
      unique_members: 0,
      velocity: 0,
      oldest_tx_date: null,
      newest_tx_date: null,
      last_updated: new Date().toISOString(),
    }
    store.metrics.set(communityId, emptyMetrics)
    return emptyMetrics
  }

  // Create a Set of member usernames for fast lookup
  const memberSet: Set<string> = new Set(
    memberUsernames.map((u: string) => u?.toLowerCase()).filter(Boolean),
  )

  // Calculate metrics
  const uniqueMembers: Set<string> = new Set(
    transactions.map((tx: StoredTransaction) => tx.user_npub),
  )
  const totalVolume: number = transactions.reduce(
    (sum: number, tx: StoredTransaction) => sum + tx.amount,
    0,
  )

  // Count intra-community transactions (where counterparty is also a member)
  const intraCommunityTxs: StoredTransaction[] = transactions.filter(
    (tx: StoredTransaction) => {
      if (!tx.counterparty_username) return false
      return memberSet.has(tx.counterparty_username.toLowerCase())
    },
  )

  // Calculate intra-community volume
  const intraVolume: number = intraCommunityTxs.reduce(
    (sum: number, tx: StoredTransaction) => sum + tx.amount,
    0,
  )

  // Circular Economy Metrics:

  // 1. Closed-loop ratio: % of transactions staying within community
  // Higher = more circular, money staying local
  const closedLoopRatio: number =
    transactions.length > 0
      ? Math.round((intraCommunityTxs.length / transactions.length) * 100)
      : 0

  // 2. Velocity: Average transactions per member
  // Higher = more active community
  const velocity: number =
    uniqueMembers.size > 0 ? Math.round(transactions.length / uniqueMembers.size) : 0

  // 3. Average transaction size in sats
  const avgTxSize: number =
    transactions.length > 0 ? Math.round(totalVolume / transactions.length) : 0

  // Calculate date range of transactions
  // created_at can be a Unix timestamp (seconds) or ISO string
  const txDates: number[] = transactions
    .map((tx: StoredTransaction) => {
      const created = tx.created_at
      if (typeof created === "number") {
        // Unix timestamp in seconds
        return created * 1000
      }
      return new Date(created).getTime()
    })
    .filter((d: number) => !isNaN(d))

  const oldestTxDate: string | null =
    txDates.length > 0 ? new Date(Math.min(...txDates)).toISOString() : null
  const newestTxDate: string | null =
    txDates.length > 0 ? new Date(Math.max(...txDates)).toISOString() : null

  // Calculate period in days
  const periodDays: number =
    txDates.length > 0
      ? Math.ceil((Math.max(...txDates) - Math.min(...txDates)) / (1000 * 60 * 60 * 24))
      : 0

  const metrics: CommunityMetrics = {
    community_id: communityId,
    transaction_count: transactions.length,
    total_volume_sats: totalVolume,
    intra_community_count: intraCommunityTxs.length,
    intra_volume_sats: intraVolume,
    unique_members: uniqueMembers.size,
    closed_loop_ratio: closedLoopRatio, // % of txs within community
    velocity: velocity, // avg txs per member
    avg_tx_size: avgTxSize, // avg sats per tx
    oldest_tx_date: oldestTxDate, // earliest transaction
    newest_tx_date: newestTxDate, // latest transaction
    period_days: periodDays, // span in days
    last_updated: new Date().toISOString(),
  }

  store.metrics.set(communityId, metrics)
  console.log(`[TransactionStore] Updated metrics for community ${communityId}:`, metrics)

  return metrics
}

/**
 * Get cached metrics for a community
 */
export function getCommunityMetrics(communityId: string): CommunityMetrics | null {
  return store.metrics.get(communityId) || null
}

/**
 * Get all community metrics
 */
export function getAllMetrics(): Map<string, CommunityMetrics> {
  return new Map(store.metrics)
}

/**
 * Calculate metrics for a community with period filtering
 */
export function calculateMetricsForPeriod(
  communityId: string,
  memberUsernames: string[] = [],
  period: string = "current_week",
): PeriodMetrics {
  const allTransactions: StoredTransaction[] = getCommunityTransactions(communityId)
  const { start, end, label }: DateRange = getDateRange(period)

  // Filter transactions by date
  const transactions: StoredTransaction[] = allTransactions.filter(
    (tx: StoredTransaction) => {
      const txTime: number = parseTxDate(tx.created_at)
      return txTime >= start.getTime() && txTime <= end.getTime()
    },
  )

  const emptyResult: PeriodMetrics = {
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
    total_synced_txs: allTransactions.length,
    oldest_tx_date: null,
    newest_tx_date: null,
    last_updated: new Date().toISOString(),
  }

  if (transactions.length === 0) {
    return emptyResult
  }

  // Create a Set of member usernames for fast lookup
  const memberSet: Set<string> = new Set(
    memberUsernames.map((u: string) => u?.toLowerCase()).filter(Boolean),
  )

  // Calculate metrics
  const uniqueMembers: Set<string> = new Set(
    transactions.map((tx: StoredTransaction) => tx.user_npub),
  )
  const totalVolume: number = transactions.reduce(
    (sum: number, tx: StoredTransaction) => sum + tx.amount,
    0,
  )

  // Count intra-community transactions
  const intraCommunityTxs: StoredTransaction[] = transactions.filter(
    (tx: StoredTransaction) => {
      if (!tx.counterparty_username) return false
      return memberSet.has(tx.counterparty_username.toLowerCase())
    },
  )

  const intraVolume: number = intraCommunityTxs.reduce(
    (sum: number, tx: StoredTransaction) => sum + tx.amount,
    0,
  )

  const closedLoopRatio: number =
    transactions.length > 0
      ? Math.round((intraCommunityTxs.length / transactions.length) * 100)
      : 0

  const velocity: number =
    uniqueMembers.size > 0 ? Math.round(transactions.length / uniqueMembers.size) : 0

  const avgTxSize: number =
    transactions.length > 0 ? Math.round(totalVolume / transactions.length) : 0

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
    total_synced_txs: allTransactions.length,
    oldest_tx_date: null,
    newest_tx_date: null,
    last_updated: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Data coverage
// ---------------------------------------------------------------------------

/**
 * Get data coverage for a community.
 * Returns the date range of all synced transactions.
 */
export function getDataCoverage(communityId: string): DataCoverage {
  const transactions: StoredTransaction[] = getCommunityTransactions(communityId)

  if (transactions.length === 0) {
    return {
      oldest: null,
      newest: null,
      total_transactions: 0,
    }
  }

  const txDates: number[] = transactions
    .map((tx: StoredTransaction) => parseTxDate(tx.created_at))
    .filter((d: number) => !isNaN(d))

  if (txDates.length === 0) {
    return {
      oldest: null,
      newest: null,
      total_transactions: transactions.length,
    }
  }

  return {
    oldest: new Date(Math.min(...txDates)).toISOString(),
    newest: new Date(Math.max(...txDates)).toISOString(),
    total_transactions: transactions.length,
  }
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/**
 * Clear all data (for testing)
 */
export function clearAll(): void {
  store.transactions.clear()
  store.metrics.clear()
  store.lastSync.clear()
}
