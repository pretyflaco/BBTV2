// Simple persistent store for tip metadata
// Uses file storage to survive development recompilations
const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(process.cwd(), '.tip-store.json');

class TipStore {
  constructor() {
    this.tipData = new Map();
    this.loadFromFile();
    // Clean up old entries periodically (24 hours)
    setInterval(() => this.cleanup(), 24 * 60 * 60 * 1000);
  }

  // Load data from file
  loadFromFile() {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
        this.tipData = new Map(Object.entries(data));
        console.log('📂 Loaded tip store from file:', this.tipData.size, 'entries');
      }
    } catch (error) {
      console.error('❌ Error loading tip store:', error);
      this.tipData = new Map();
    }
  }

  // Save data to file
  saveToFile() {
    try {
      const data = Object.fromEntries(this.tipData);
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Error saving tip store:', error);
    }
  }

  // Store tip metadata for an invoice
  storeTipData(paymentHash, tipData) {
    this.tipData.set(paymentHash, {
      ...tipData,
      timestamp: Date.now()
    });
    this.saveToFile(); // Persist to file
    console.log(`💾 Stored tip data for payment: ${paymentHash}`);
  }

  // Retrieve tip metadata for an invoice
  getTipData(paymentHash) {
    const data = this.tipData.get(paymentHash);
    if (data) {
      console.log(`📋 Retrieved tip data for payment: ${paymentHash}`);
    } else {
      console.log(`❌ No tip data found for payment hash: ${paymentHash}`);
    }
    return data;
  }

  // Remove tip metadata (after processing)
  removeTipData(paymentHash) {
    const removed = this.tipData.delete(paymentHash);
    if (removed) {
      this.saveToFile(); // Persist to file
      console.log('🗑️ Removed tip data for payment:', paymentHash);
    }
    return removed;
  }

  // Clean up old entries
  cleanup() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    for (const [hash, data] of this.tipData.entries()) {
      if (now - data.timestamp > oneDay) {
        this.tipData.delete(hash);
        console.log('🧹 Cleaned up old tip data:', hash);
      }
    }
  }

  // Get store stats
  getStats() {
    return {
      totalEntries: this.tipData.size,
      entries: Array.from(this.tipData.entries()).map(([hash, data]) => ({
        hash: hash.substring(0, 8) + '...',
        tipAmount: data.tipAmount,
        tipRecipient: data.tipRecipient,
        age: Math.round((Date.now() - data.timestamp) / 1000 / 60) + ' minutes'
      }))
    };
  }
}

// Export singleton instance
const tipStore = new TipStore();
module.exports = tipStore;
