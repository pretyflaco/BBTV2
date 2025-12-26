// Simple persistent store for voucher charges
// Uses file storage to survive development recompilations
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_FILE = path.join(process.cwd(), '.voucher-store.json');
const VOUCHER_EXPIRY = 15 * 60 * 1000; // 15 minutes in milliseconds

class VoucherStore {
  constructor() {
    this.vouchers = new Map();
    this.loadFromFile();
    // Clean up expired vouchers every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  // Load data from file
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

  // Save data to file
  saveToFile() {
    try {
      const data = Object.fromEntries(this.vouchers);
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Error saving voucher store:', error);
    }
  }

  // Generate a unique charge ID
  generateChargeId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Create a new voucher charge
  createVoucher(amount, apiKey, walletId) {
    const chargeId = this.generateChargeId();
    const voucher = {
      id: chargeId,
      amount: amount,
      claimed: false,
      createdAt: Date.now(),
      apiKey: apiKey,
      walletId: walletId
    };
    
    this.vouchers.set(chargeId, voucher);
    this.saveToFile();
    console.log(`💳 Created voucher: ${chargeId} for ${amount} sats`);
    
    return voucher;
  }

  // Get voucher by charge ID
  getVoucher(chargeId) {
    // Always reload from file to handle Next.js hot reloading creating multiple instances
    this.loadFromFile();
    
    const voucher = this.vouchers.get(chargeId);
    
    if (!voucher) {
      console.log(`❌ Voucher not found: ${chargeId}`);
      return null;
    }

    // Check if expired
    if (Date.now() - voucher.createdAt > VOUCHER_EXPIRY) {
      console.log(`⏰ Voucher expired: ${chargeId}`);
      this.vouchers.delete(chargeId);
      this.saveToFile();
      return null;
    }

    return voucher;
  }

  // Mark voucher as claimed
  claimVoucher(chargeId) {
    // Always reload from file to handle Next.js hot reloading creating multiple instances
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

    voucher.claimed = true;
    this.vouchers.set(chargeId, voucher);
    this.saveToFile();
    console.log(`✅ Voucher claimed: ${chargeId}`);
    
    return true;
  }

  // Clean up expired and old claimed vouchers
  cleanup() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    for (const [chargeId, voucher] of this.vouchers.entries()) {
      // Remove expired unclaimed vouchers
      if (!voucher.claimed && now - voucher.createdAt > VOUCHER_EXPIRY) {
        this.vouchers.delete(chargeId);
        console.log('🧹 Cleaned up expired voucher:', chargeId);
      }
      // Remove old claimed vouchers (after 1 hour)
      else if (voucher.claimed && now - voucher.createdAt > oneHour) {
        this.vouchers.delete(chargeId);
        console.log('🧹 Cleaned up old claimed voucher:', chargeId);
      }
    }
    
    if (this.vouchers.size > 0) {
      this.saveToFile();
    }
  }

  // Get store stats
  getStats() {
    return {
      totalVouchers: this.vouchers.size,
      vouchers: Array.from(this.vouchers.entries()).map(([id, voucher]) => ({
        id: id.substring(0, 8) + '...',
        amount: voucher.amount,
        claimed: voucher.claimed,
        age: Math.round((Date.now() - voucher.createdAt) / 1000 / 60) + ' minutes'
      }))
    };
  }
}

// Export singleton instance
const voucherStore = new VoucherStore();
module.exports = voucherStore;

