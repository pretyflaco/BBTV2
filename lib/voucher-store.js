/**
 * Voucher Store - Persistent storage for voucher charges
 * 
 * Uses file storage for simplicity. Designed with clean interfaces
 * to enable easy migration to PostgreSQL when needed.
 * 
 * Storage Interface Contract:
 * - createVoucher(amount, apiKey, walletId, options) -> voucher object
 * - getVoucher(chargeId) -> voucher object or null
 * - claimVoucher(chargeId) -> boolean success
 * - cancelVoucher(chargeId) -> boolean success
 * - getUnclaimedCountByWallet(walletId) -> number
 * - getAllVouchers() -> array of voucher objects
 * - cleanup() -> void (removes old vouchers)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  MAX_UNCLAIMED_PER_WALLET,
  CLAIMED_RETENTION_MS,
  CANCELLED_RETENTION_MS,
  EXPIRED_RETENTION_MS,
  getExpiryMs,
  DEFAULT_EXPIRY_ID,
  getVoucherStatus,
} = require('./voucher-expiry');

const STORE_FILE = path.join(process.cwd(), '.voucher-store.json');

class VoucherStore {
  constructor() {
    this.vouchers = new Map();
    this.loadFromFile();
    // Clean up old vouchers every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Load vouchers from file storage
   * Called on startup and before operations to handle hot reloading
   */
  loadFromFile() {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
        this.vouchers = new Map(Object.entries(data));
        console.log('📂 Loaded voucher store from file:', this.vouchers.size, 'entries');
      }
    } catch (error) {
      console.error('❌ Error loading voucher store:', error);
      this.vouchers = new Map();
    }
  }

  /**
   * Save vouchers to file storage
   */
  saveToFile() {
    try {
      const data = Object.fromEntries(this.vouchers);
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Error saving voucher store:', error);
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
   * @returns {number} Count of unclaimed vouchers
   */
  getUnclaimedCountByWallet(walletId) {
    this.loadFromFile();
    let count = 0;
    const now = Date.now();
    
    for (const voucher of this.vouchers.values()) {
      if (voucher.walletId === walletId && 
          !voucher.claimed && 
          !voucher.cancelledAt &&
          (!voucher.expiresAt || voucher.expiresAt > now)) {
        count++;
      }
    }
    
    return count;
  }

  /**
   * Create a new voucher
   * @param {number} amount - Amount in sats
   * @param {string} apiKey - Blink API key
   * @param {string} walletId - Wallet ID
   * @param {object} options - Additional options
   * @param {string} options.expiryId - Expiry preset ID (default: '6mo')
   * @param {number} options.commissionPercent - Commission percentage
   * @param {string} options.displayAmount - Display amount for fiat
   * @param {string} options.displayCurrency - Display currency code
   * @returns {object} Created voucher object
   * @throws {Error} If wallet limit exceeded
   */
  createVoucher(amount, apiKey, walletId, options = {}) {
    this.loadFromFile();
    
    // Check wallet limit
    const unclaimedCount = this.getUnclaimedCountByWallet(walletId);
    if (unclaimedCount >= MAX_UNCLAIMED_PER_WALLET) {
      throw new Error(`Maximum unclaimed vouchers (${MAX_UNCLAIMED_PER_WALLET}) reached for this wallet`);
    }
    
    const chargeId = this.generateChargeId();
    const now = Date.now();
    const expiryId = options.expiryId || DEFAULT_EXPIRY_ID;
    const expiryMs = getExpiryMs(expiryId);
    
    const voucher = {
      id: chargeId,
      amount: amount,
      claimed: false,
      claimedAt: null,
      createdAt: now,
      expiresAt: now + expiryMs,
      expiryId: expiryId,
      cancelledAt: null,
      apiKey: apiKey,
      walletId: walletId,
      // Optional fields
      commissionPercent: options.commissionPercent || 0,
      displayAmount: options.displayAmount || null,
      displayCurrency: options.displayCurrency || null,
    };
    
    this.vouchers.set(chargeId, voucher);
    this.saveToFile();
    
    const expiryDate = new Date(voucher.expiresAt).toISOString();
    console.log(`💳 Created voucher: ${chargeId} for ${amount} sats, expires: ${expiryDate}${options.commissionPercent ? ` (${options.commissionPercent}% commission)` : ''}`);
    
    return voucher;
  }

  /**
   * Get voucher by charge ID
   * Returns null for expired, cancelled, or non-existent vouchers
   * @param {string} chargeId - Voucher charge ID
   * @returns {object|null} Voucher object or null
   */
  getVoucher(chargeId) {
    this.loadFromFile();
    
    const voucher = this.vouchers.get(chargeId);
    
    if (!voucher) {
      console.log(`❌ Voucher not found: ${chargeId}`);
      return null;
    }

    // Return null for cancelled vouchers (can't be redeemed)
    if (voucher.cancelledAt) {
      console.log(`❌ Voucher cancelled: ${chargeId}`);
      return null;
    }

    // Check if expired (only for unclaimed vouchers)
    if (!voucher.claimed && voucher.expiresAt && voucher.expiresAt < Date.now()) {
      console.log(`⏰ Voucher expired: ${chargeId}`);
      return null;
    }

    return voucher;
  }

  /**
   * Get voucher by charge ID (including cancelled/expired for history)
   * @param {string} chargeId - Voucher charge ID
   * @returns {object|null} Voucher object with status or null
   */
  getVoucherWithStatus(chargeId) {
    this.loadFromFile();
    
    const voucher = this.vouchers.get(chargeId);
    
    if (!voucher) {
      return null;
    }

    return {
      ...voucher,
      status: getVoucherStatus(voucher),
    };
  }

  /**
   * Mark voucher as claimed
   * @param {string} chargeId - Voucher charge ID
   * @returns {boolean} Success
   */
  claimVoucher(chargeId) {
    this.loadFromFile();
    
    const voucher = this.vouchers.get(chargeId);
    
    if (!voucher) {
      console.log(`❌ Cannot claim - voucher not found: ${chargeId}`);
      return false;
    }

    if (voucher.claimed) {
      console.log(`❌ Voucher already claimed: ${chargeId}`);
      return false;
    }

    if (voucher.cancelledAt) {
      console.log(`❌ Cannot claim - voucher cancelled: ${chargeId}`);
      return false;
    }

    if (voucher.expiresAt && voucher.expiresAt < Date.now()) {
      console.log(`❌ Cannot claim - voucher expired: ${chargeId}`);
      return false;
    }

    voucher.claimed = true;
    voucher.claimedAt = Date.now();
    this.vouchers.set(chargeId, voucher);
    this.saveToFile();
    console.log(`✅ Voucher claimed: ${chargeId}`);
    
    return true;
  }

  /**
   * Cancel a voucher (mark as cancelled, keep in history)
   * @param {string} chargeId - Voucher charge ID
   * @returns {boolean} Success
   */
  cancelVoucher(chargeId) {
    this.loadFromFile();
    
    const voucher = this.vouchers.get(chargeId);
    
    if (!voucher) {
      console.log(`❌ Cannot cancel - voucher not found: ${chargeId}`);
      return false;
    }

    if (voucher.claimed) {
      console.log(`❌ Cannot cancel - voucher already claimed: ${chargeId}`);
      return false;
    }

    if (voucher.cancelledAt) {
      console.log(`❌ Voucher already cancelled: ${chargeId}`);
      return false;
    }

    voucher.cancelledAt = Date.now();
    this.vouchers.set(chargeId, voucher);
    this.saveToFile();
    console.log(`🚫 Voucher cancelled: ${chargeId}`);
    
    return true;
  }

  /**
   * Get all vouchers (for listing/management)
   * @returns {Array} Array of voucher objects with status
   */
  getAllVouchers() {
    this.loadFromFile();
    
    const vouchers = [];
    
    for (const voucher of this.vouchers.values()) {
      vouchers.push({
        ...voucher,
        status: getVoucherStatus(voucher),
      });
    }
    
    // Sort by creation time, newest first
    vouchers.sort((a, b) => b.createdAt - a.createdAt);
    
    return vouchers;
  }

  /**
   * Clean up old vouchers based on retention policies
   * - Claimed vouchers: 30 days
   * - Cancelled vouchers: 30 days
   * - Expired unclaimed: 7 days
   */
  cleanup() {
    this.loadFromFile();
    const now = Date.now();
    let cleaned = 0;
    
    for (const [chargeId, voucher] of this.vouchers.entries()) {
      const status = getVoucherStatus(voucher);
      
      // Remove old claimed vouchers
      if (status === 'CLAIMED' && voucher.claimedAt) {
        if (now - voucher.claimedAt > CLAIMED_RETENTION_MS) {
          this.vouchers.delete(chargeId);
          console.log('🧹 Cleaned up old claimed voucher:', chargeId);
          cleaned++;
          continue;
        }
      }
      
      // Remove old cancelled vouchers
      if (status === 'CANCELLED' && voucher.cancelledAt) {
        if (now - voucher.cancelledAt > CANCELLED_RETENTION_MS) {
          this.vouchers.delete(chargeId);
          console.log('🧹 Cleaned up old cancelled voucher:', chargeId);
          cleaned++;
          continue;
        }
      }
      
      // Remove old expired vouchers (grace period for history viewing)
      if (status === 'EXPIRED' && voucher.expiresAt) {
        if (now - voucher.expiresAt > EXPIRED_RETENTION_MS) {
          this.vouchers.delete(chargeId);
          console.log('🧹 Cleaned up old expired voucher:', chargeId);
          cleaned++;
          continue;
        }
      }
    }
    
    if (cleaned > 0) {
      this.saveToFile();
      console.log(`🧹 Cleanup complete: removed ${cleaned} voucher(s)`);
    }
  }

  /**
   * Get store statistics
   * @returns {object} Stats object
   */
  getStats() {
    this.loadFromFile();
    
    let active = 0;
    let claimed = 0;
    let cancelled = 0;
    let expired = 0;
    
    for (const voucher of this.vouchers.values()) {
      const status = getVoucherStatus(voucher);
      switch (status) {
        case 'ACTIVE': active++; break;
        case 'CLAIMED': claimed++; break;
        case 'CANCELLED': cancelled++; break;
        case 'EXPIRED': expired++; break;
      }
    }
    
    return {
      total: this.vouchers.size,
      active,
      claimed,
      cancelled,
      expired,
    };
  }
}

// Export singleton instance
const voucherStore = new VoucherStore();
module.exports = voucherStore;
