/**
 * Voucher Store - PostgreSQL-backed storage for voucher charges
 * 
 * Migrated from file-based storage to ensure vouchers persist across deployments.
 * Uses the same connection pool pattern as lib/network/db.js
 * 
 * Storage Interface Contract:
 * - createVoucher(amount, apiKey, walletId, options) -> voucher object
 * - getVoucher(chargeId) -> voucher object or null
 * - getVoucherWithStatus(chargeId) -> voucher object with status or null
 * - claimVoucher(chargeId) -> boolean success
 * - unclaimVoucher(chargeId) -> boolean success (for payment failure rollback)
 * - cancelVoucher(chargeId) -> boolean success
 * - getUnclaimedCountByWallet(walletId) -> number
 * - getAllVouchers() -> array of voucher objects
 * - getStats() -> stats object
 */

const crypto = require('crypto');
const { Pool } = require('pg');
const AuthManager = require('./auth');
const {
  MAX_UNCLAIMED_PER_WALLET,
  getExpiryMs,
  DEFAULT_EXPIRY_ID,
  getVoucherStatus,
} = require('./voucher-expiry');

// Database connection pool (singleton)
let pool = null;

function getPool() {
  if (!pool) {
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
      console.error('[VoucherStore] Unexpected pool error:', err);
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
    console.warn(`[VoucherStore] Slow query (${duration}ms):`, text.substring(0, 100));
  }
  
  return result;
}

class VoucherStore {
  constructor() {
    // Lazy cleanup flag - tracks when we last ran cleanup
    this.lastCleanup = 0;
    this.CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Run lazy cleanup if enough time has passed
   * Updates expired vouchers and removes old ones
   */
  async lazyCleanup() {
    const now = Date.now();
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL_MS) {
      return; // Skip cleanup, ran recently
    }
    
    this.lastCleanup = now;
    
    try {
      // Update expired vouchers
      const expiredResult = await query(`SELECT update_expired_vouchers()`);
      const expiredCount = expiredResult.rows[0]?.update_expired_vouchers || 0;
      
      // Cleanup old vouchers
      const cleanedResult = await query(`SELECT cleanup_old_vouchers()`);
      const cleanedCount = cleanedResult.rows[0]?.cleanup_old_vouchers || 0;
      
      if (expiredCount > 0 || cleanedCount > 0) {
        console.log(`[VoucherStore] Lazy cleanup: ${expiredCount} expired, ${cleanedCount} removed`);
      }
    } catch (error) {
      console.error('[VoucherStore] Lazy cleanup error:', error.message);
    }
  }

  /**
   * Generate a unique charge ID
   * @returns {string} 32-character hex string
   */
  generateChargeId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Get count of unclaimed vouchers for a wallet
   * Used to enforce MAX_UNCLAIMED_PER_WALLET limit
   * @param {string} walletId - Wallet identifier
   * @returns {Promise<number>} Count of unclaimed vouchers
   */
  async getUnclaimedCountByWallet(walletId) {
    try {
      const result = await query(
        `SELECT COUNT(*) as count FROM vouchers 
         WHERE wallet_id = $1 AND status = 'ACTIVE'`,
        [walletId]
      );
      return parseInt(result.rows[0]?.count || 0, 10);
    } catch (error) {
      console.error('[VoucherStore] getUnclaimedCountByWallet error:', error.message);
      return 0;
    }
  }

  /**
   * Create a new voucher
   * @param {number} amount - Amount in sats
   * @param {string} apiKey - Blink API key (will be encrypted)
   * @param {string} walletId - Wallet ID
   * @param {object} options - Additional options
   * @param {string} options.expiryId - Expiry preset ID (default: '6mo')
   * @param {number} options.commissionPercent - Commission percentage
   * @param {string} options.displayAmount - Display amount for fiat
   * @param {string} options.displayCurrency - Display currency code
   * @param {string} options.environment - API environment ('production' or 'staging')
   * @returns {Promise<object>} Created voucher object
   * @throws {Error} If wallet limit exceeded
   */
  async createVoucher(amount, apiKey, walletId, options = {}) {
    // Check wallet limit
    const unclaimedCount = await this.getUnclaimedCountByWallet(walletId);
    if (unclaimedCount >= MAX_UNCLAIMED_PER_WALLET) {
      throw new Error(`Maximum unclaimed vouchers (${MAX_UNCLAIMED_PER_WALLET}) reached for this wallet`);
    }
    
    const chargeId = this.generateChargeId();
    const now = Date.now();
    const expiryId = options.expiryId || DEFAULT_EXPIRY_ID;
    const expiryMs = getExpiryMs(expiryId);
    const expiresAt = now + expiryMs;
    const environment = options.environment || 'production';
    
    // Encrypt API key for storage
    const apiKeyEncrypted = AuthManager.encryptApiKey(apiKey);
    
    try {
      const result = await query(
        `INSERT INTO vouchers 
         (id, amount_sats, wallet_id, api_key_encrypted, status, claimed,
          created_at, expires_at, expiry_id, display_amount, display_currency, commission_percent, environment)
         VALUES ($1, $2, $3, $4, 'ACTIVE', false, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [chargeId, amount, walletId, apiKeyEncrypted, now, expiresAt, expiryId,
         options.displayAmount || null, options.displayCurrency || null, 
         options.commissionPercent || 0, environment]
      );
      
      const row = result.rows[0];
      const voucher = this._rowToVoucher(row, apiKey); // Pass original apiKey to avoid decryption
      
      const expiryDate = new Date(voucher.expiresAt).toISOString();
      console.log(`[VoucherStore] Created voucher: ${chargeId} for ${amount} sats, expires: ${expiryDate}${options.commissionPercent ? ` (${options.commissionPercent}% commission)` : ''}${environment !== 'production' ? ` [${environment}]` : ''}`);
      
      return voucher;
    } catch (error) {
      console.error('[VoucherStore] createVoucher error:', error.message);
      throw error;
    }
  }

  /**
   * Convert database row to voucher object
   * @param {object} row - Database row
   * @param {string} decryptedApiKey - Optional pre-decrypted API key
   * @returns {object} Voucher object
   */
  _rowToVoucher(row, decryptedApiKey = null) {
    if (!row) return null;
    
    return {
      id: row.id,
      amount: parseInt(row.amount_sats, 10),
      claimed: row.claimed,
      claimedAt: row.claimed_at ? parseInt(row.claimed_at, 10) : null,
      createdAt: parseInt(row.created_at, 10),
      expiresAt: parseInt(row.expires_at, 10),
      expiryId: row.expiry_id,
      cancelledAt: row.cancelled_at ? parseInt(row.cancelled_at, 10) : null,
      apiKey: decryptedApiKey || AuthManager.decryptApiKey(row.api_key_encrypted),
      walletId: row.wallet_id,
      commissionPercent: parseFloat(row.commission_percent) || 0,
      displayAmount: row.display_amount,
      displayCurrency: row.display_currency,
      status: row.status,
      environment: row.environment || 'production',
    };
  }

  /**
   * Get voucher by charge ID
   * Returns null for expired, cancelled, or non-existent vouchers
   * @param {string} chargeId - Voucher charge ID
   * @returns {Promise<object|null>} Voucher object or null
   */
  async getVoucher(chargeId) {
    try {
      // Run lazy cleanup
      await this.lazyCleanup();
      
      const now = Date.now();
      
      // Get active, non-expired voucher
      const result = await query(
        `SELECT * FROM vouchers 
         WHERE id = $1 
           AND status = 'ACTIVE' 
           AND NOT claimed
           AND expires_at > $2`,
        [chargeId, now]
      );
      
      if (result.rows.length === 0) {
        console.log(`[VoucherStore] Voucher not found or not active: ${chargeId}`);
        return null;
      }
      
      return this._rowToVoucher(result.rows[0]);
    } catch (error) {
      console.error('[VoucherStore] getVoucher error:', error.message);
      return null;
    }
  }

  /**
   * Get voucher by charge ID (including cancelled/expired for history)
   * @param {string} chargeId - Voucher charge ID
   * @returns {Promise<object|null>} Voucher object with status or null
   */
  async getVoucherWithStatus(chargeId) {
    try {
      const result = await query(
        `SELECT * FROM vouchers WHERE id = $1`,
        [chargeId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const voucher = this._rowToVoucher(result.rows[0]);
      
      // Recalculate status in case it's stale (e.g., expired but not updated)
      voucher.status = getVoucherStatus(voucher);
      
      return voucher;
    } catch (error) {
      console.error('[VoucherStore] getVoucherWithStatus error:', error.message);
      return null;
    }
  }

  /**
   * Mark voucher as claimed (atomic operation)
   * @param {string} chargeId - Voucher charge ID
   * @returns {Promise<boolean>} Success
   */
  async claimVoucher(chargeId) {
    try {
      const now = Date.now();
      
      // Atomic update - only claims if ACTIVE and not already claimed
      const result = await query(
        `UPDATE vouchers 
         SET claimed = true, claimed_at = $2, status = 'CLAIMED'
         WHERE id = $1 
           AND status = 'ACTIVE' 
           AND NOT claimed
           AND expires_at > $2
         RETURNING id`,
        [chargeId, now]
      );
      
      if (result.rowCount === 0) {
        console.log(`[VoucherStore] Cannot claim voucher: ${chargeId}`);
        return false;
      }
      
      console.log(`[VoucherStore] Voucher claimed: ${chargeId}`);
      return true;
    } catch (error) {
      console.error('[VoucherStore] claimVoucher error:', error.message);
      return false;
    }
  }

  /**
   * Unclaim voucher (rollback after payment failure)
   * @param {string} chargeId - Voucher charge ID
   * @returns {Promise<boolean>} Success
   */
  async unclaimVoucher(chargeId) {
    try {
      const now = Date.now();
      
      // Only unclaim if recently claimed and not expired
      const result = await query(
        `UPDATE vouchers 
         SET claimed = false, claimed_at = NULL, status = 'ACTIVE'
         WHERE id = $1 
           AND status = 'CLAIMED'
           AND expires_at > $2
         RETURNING id`,
        [chargeId, now]
      );
      
      if (result.rowCount === 0) {
        console.log(`[VoucherStore] Cannot unclaim voucher: ${chargeId}`);
        return false;
      }
      
      console.log(`[VoucherStore] Voucher unclaimed (payment failed): ${chargeId}`);
      return true;
    } catch (error) {
      console.error('[VoucherStore] unclaimVoucher error:', error.message);
      return false;
    }
  }

  /**
   * Cancel a voucher (mark as cancelled, keep in history)
   * @param {string} chargeId - Voucher charge ID
   * @returns {Promise<boolean>} Success
   */
  async cancelVoucher(chargeId) {
    try {
      const now = Date.now();
      
      const result = await query(
        `UPDATE vouchers 
         SET cancelled_at = $2, status = 'CANCELLED'
         WHERE id = $1 
           AND status = 'ACTIVE' 
           AND NOT claimed
         RETURNING id`,
        [chargeId, now]
      );
      
      if (result.rowCount === 0) {
        console.log(`[VoucherStore] Cannot cancel voucher: ${chargeId}`);
        return false;
      }
      
      console.log(`[VoucherStore] Voucher cancelled: ${chargeId}`);
      return true;
    } catch (error) {
      console.error('[VoucherStore] cancelVoucher error:', error.message);
      return false;
    }
  }

  /**
   * Get all vouchers (for listing/management)
   * @returns {Promise<Array>} Array of voucher objects with status
   */
  async getAllVouchers() {
    try {
      // Run lazy cleanup first
      await this.lazyCleanup();
      
      const result = await query(
        `SELECT * FROM vouchers ORDER BY created_at DESC`
      );
      
      return result.rows.map(row => {
        const voucher = this._rowToVoucher(row);
        // Recalculate status in case it's stale
        voucher.status = getVoucherStatus(voucher);
        return voucher;
      });
    } catch (error) {
      console.error('[VoucherStore] getAllVouchers error:', error.message);
      return [];
    }
  }

  /**
   * Get store statistics
   * @returns {Promise<object>} Stats object
   */
  async getStats() {
    try {
      // Update expired vouchers first
      await query(`SELECT update_expired_vouchers()`);
      
      const result = await query(`SELECT * FROM voucher_stats`);
      
      if (result.rows.length === 0) {
        return { total: 0, active: 0, claimed: 0, cancelled: 0, expired: 0, expiringSoon: 0 };
      }
      
      const row = result.rows[0];
      return {
        total: parseInt(row.total, 10),
        active: parseInt(row.active, 10),
        claimed: parseInt(row.claimed, 10),
        cancelled: parseInt(row.cancelled, 10),
        expired: parseInt(row.expired, 10),
        expiringSoon: parseInt(row.expiring_soon, 10),
      };
    } catch (error) {
      console.error('[VoucherStore] getStats error:', error.message);
      return { total: 0, active: 0, claimed: 0, cancelled: 0, expired: 0, expiringSoon: 0 };
    }
  }

  /**
   * Cleanup old vouchers based on retention policies
   * Called lazily, not on interval
   * @returns {Promise<number>} Number of vouchers cleaned up
   */
  async cleanup() {
    try {
      const result = await query(`SELECT cleanup_old_vouchers()`);
      const cleaned = result.rows[0]?.cleanup_old_vouchers || 0;
      
      if (cleaned > 0) {
        console.log(`[VoucherStore] Cleanup: removed ${cleaned} old voucher(s)`);
      }
      
      return cleaned;
    } catch (error) {
      console.error('[VoucherStore] cleanup error:', error.message);
      return 0;
    }
  }
}

// Export singleton instance
const voucherStore = new VoucherStore();
module.exports = voucherStore;
