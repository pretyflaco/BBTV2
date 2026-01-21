/**
 * PrintService - Main orchestrator for ESC/POS thermal printing
 * 
 * This is the primary entry point for printing vouchers from the Blink app.
 * It coordinates between:
 * - VoucherReceipt: Builds ESC/POS commands for voucher layout
 * - ConnectionManager: Detects platform and selects adapter
 * - Adapters: Handle actual printing via different methods
 * 
 * Usage:
 * ```javascript
 * import { PrintService } from '@/lib/escpos';
 * 
 * const printService = new PrintService();
 * 
 * // Print a voucher
 * await printService.printVoucher(voucherData, {
 *   paperWidth: 80,
 *   autoCut: true,
 * });
 * 
 * // Or get available print methods
 * const methods = await printService.getAvailableMethods();
 * ```
 */

import VoucherReceipt from './VoucherReceipt.js';
import { getConnectionManager } from './ConnectionManager.js';
import { AdapterStatus } from './adapters/BaseAdapter.js';
import { preloadLogo, getBlinkLogoUrl } from './LogoRasterizer.js';

/**
 * Print job status
 */
const PrintStatus = {
  PENDING: 'pending',
  PREPARING: 'preparing',
  SENDING: 'sending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/**
 * Receipt types
 */
const ReceiptType = {
  STANDARD: 'standard',
  MINIMAL: 'minimal',
  REISSUE: 'reissue',
};

/**
 * Default print options
 */
const DEFAULT_PRINT_OPTIONS = {
  paperWidth: 80,           // 58 or 80
  receiptType: ReceiptType.STANDARD,
  qrSize: 8,
  useNativeQR: true,
  autoCut: false,
  feedLinesAfter: 4,
  copies: 1,
  timeout: 30000,           // ms
  retryOnFail: false,       // Disabled - adapter handles errors
  maxRetries: 0,
};

/**
 * PrintService class
 */
class PrintService {
  /**
   * Create a PrintService instance
   * @param {object} options - Default options for all print jobs
   */
  constructor(options = {}) {
    this.options = { ...DEFAULT_PRINT_OPTIONS, ...options };
    this.connectionManager = getConnectionManager();
    
    // Print job tracking
    this._printQueue = [];
    this._currentJob = null;
    this._jobIdCounter = 0;
    
    // Event listeners
    this._eventListeners = new Map();
  }

  // ============================================================
  // MAIN PRINT METHODS
  // ============================================================

  /**
   * Print a voucher
   * 
   * @param {object} voucher - Voucher data
   * @param {string} voucher.lnurl - LNURL for QR code
   * @param {number} voucher.satsAmount - Value in satoshis
   * @param {number} voucher.displayAmount - Price in display currency
   * @param {string} voucher.displayCurrency - Display currency code
   * @param {string} voucher.voucherSecret - 12-char voucher secret
   * @param {string} voucher.identifierCode - 8-char identifier
   * @param {number} voucher.commissionPercent - Commission (optional)
   * @param {number} voucher.expiresAt - Expiry timestamp (optional)
   * @param {string} voucher.issuedBy - Issuer username (optional)
   * @param {object} options - Print options (merged with defaults)
   * @returns {Promise<{success: boolean, jobId: string, error?: string}>}
   */
  async printVoucher(voucher, options = {}) {
    const opts = { ...this.options, ...options };
    const jobId = this._createJobId();

    this._emit('jobStarted', { jobId, voucher });

    try {
      // Validate voucher data
      this._validateVoucher(voucher);

      // Build ESC/POS receipt (async to support logo loading)
      this._emit('jobStatus', { jobId, status: PrintStatus.PREPARING });
      const escposData = await this._buildReceipt(voucher, opts);

      // Get adapter and print
      this._emit('jobStatus', { jobId, status: PrintStatus.SENDING });
      const adapter = await this.connectionManager.getActiveAdapter();

      // Attempt to print
      let success = false;
      let lastError = null;
      let attempts = 0;
      const maxAttempts = opts.retryOnFail ? opts.maxRetries + 1 : 1;

      while (!success && attempts < maxAttempts) {
        attempts++;
        
        try {
          success = await adapter.print(escposData, {
            voucher,
            paperWidth: opts.paperWidth,
            qrMode: opts.useNativeQR ? 'native' : 'raster',
          });
        } catch (e) {
          lastError = e;
          if (attempts < maxAttempts) {
            // Wait before retry
            await this._sleep(1000);
          }
        }
      }

      if (success) {
        this._emit('jobStatus', { jobId, status: PrintStatus.COMPLETED });
        this._emit('jobCompleted', { jobId, adapter: adapter.type });
        return { success: true, jobId, adapter: adapter.type };
      } else {
        const error = lastError?.message || 'Print failed';
        this._emit('jobStatus', { jobId, status: PrintStatus.FAILED, error });
        this._emit('jobFailed', { jobId, error });
        return { success: false, jobId, error };
      }
    } catch (error) {
      const errorMsg = error.message || 'Unknown error';
      this._emit('jobStatus', { jobId, status: PrintStatus.FAILED, error: errorMsg });
      this._emit('jobFailed', { jobId, error: errorMsg });
      return { success: false, jobId, error: errorMsg };
    }
  }

  /**
   * Print multiple vouchers
   * @param {object[]} vouchers - Array of voucher data
   * @param {object} options - Print options
   * @returns {Promise<{results: Array, successCount: number, failCount: number}>}
   */
  async printVouchers(vouchers, options = {}) {
    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const voucher of vouchers) {
      const result = await this.printVoucher(voucher, options);
      results.push(result);
      
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }

      // Small delay between prints
      if (vouchers.indexOf(voucher) < vouchers.length - 1) {
        await this._sleep(500);
      }
    }

    return { results, successCount, failCount, total: vouchers.length };
  }

  /**
   * Print using a specific adapter type
   * @param {object} voucher - Voucher data
   * @param {string} adapterType - Adapter type ('companion', 'webserial', 'pdf')
   * @param {object} options - Print options
   * @returns {Promise<{success: boolean, jobId: string, error?: string}>}
   */
  async printWithAdapter(voucher, adapterType, options = {}) {
    const adapter = this.connectionManager.getAdapter(adapterType);
    
    if (!adapter) {
      return { success: false, jobId: null, error: `Unknown adapter: ${adapterType}` };
    }

    if (!await adapter.isAvailable()) {
      return { success: false, jobId: null, error: `Adapter not available: ${adapterType}` };
    }

    // Temporarily set as active adapter
    await this.connectionManager.setActiveAdapter(adapter);
    
    return this.printVoucher(voucher, options);
  }

  // ============================================================
  // RECEIPT BUILDING
  // ============================================================

  /**
   * Build ESC/POS receipt from voucher
   * @private
   */
  async _buildReceipt(voucher, options) {
    const receipt = new VoucherReceipt({
      paperWidth: options.paperWidth,
      qrSize: options.qrSize,
      useNativeQR: options.useNativeQR,
      autoCut: options.autoCut,
      feedLinesAfter: options.feedLinesAfter,
      showLogo: options.showLogo !== false, // Default to true
    });

    // Preload logo for non-minimal receipts
    if (options.receiptType !== ReceiptType.MINIMAL) {
      await receipt.preloadLogo();
    }

    switch (options.receiptType) {
      case ReceiptType.MINIMAL:
        receipt.buildMinimal(voucher);
        break;
      case ReceiptType.REISSUE:
        receipt.buildReissue(voucher);
        break;
      case ReceiptType.STANDARD:
      default:
        receipt.build(voucher);
        break;
    }

    return receipt.getBytes();
  }

  /**
   * Get ESC/POS data without printing (for preview/debugging)
   * @param {object} voucher - Voucher data
   * @param {object} options - Receipt options
   * @returns {Promise<Uint8Array>}
   */
  async getReceiptData(voucher, options = {}) {
    return this._buildReceipt(voucher, { ...this.options, ...options });
  }

  /**
   * Get receipt as Base64 (for deep links)
   * @param {object} voucher - Voucher data
   * @param {object} options - Receipt options
   * @returns {Promise<string>}
   */
  async getReceiptBase64(voucher, options = {}) {
    const receipt = new VoucherReceipt({
      paperWidth: options.paperWidth || this.options.paperWidth,
      showLogo: options.showLogo !== false,
      ...options,
    });
    
    const type = options.receiptType || ReceiptType.STANDARD;
    
    // Preload logo for non-minimal receipts
    if (type !== ReceiptType.MINIMAL) {
      await receipt.preloadLogo();
    }
    
    switch (type) {
      case ReceiptType.MINIMAL:
        receipt.buildMinimal(voucher);
        break;
      case ReceiptType.REISSUE:
        receipt.buildReissue(voucher);
        break;
      default:
        receipt.build(voucher);
    }
    
    return receipt.toBase64();
  }

  // ============================================================
  // CONNECTION & ADAPTER MANAGEMENT
  // ============================================================

  /**
   * Get available print methods for current platform
   * @returns {Promise<Array<{type: string, name: string, available: boolean, recommended: boolean}>>}
   */
  async getAvailableMethods() {
    const adapters = await this.connectionManager.getAvailableAdapters();
    return adapters.map(({ adapter, available, recommended }) => ({
      type: adapter.type,
      name: adapter.name,
      available,
      recommended,
    }));
  }

  /**
   * Get printing recommendations for current platform
   * @returns {Promise<object>}
   */
  async getRecommendations() {
    return this.connectionManager.getRecommendations();
  }

  /**
   * Set preferred print method
   * @param {string} adapterType
   * @returns {Promise<boolean>}
   */
  async setPreferredMethod(adapterType) {
    return this.connectionManager.setActiveAdapter(adapterType);
  }

  /**
   * Get current printer connection status
   * @returns {string}
   */
  async getConnectionStatus() {
    const adapter = await this.connectionManager.getActiveAdapter();
    return adapter.getStatus();
  }

  /**
   * Connect to printer
   * @returns {Promise<boolean>}
   */
  async connect() {
    const adapter = await this.connectionManager.getActiveAdapter();
    return adapter.connect();
  }

  /**
   * Disconnect from printer
   * @returns {Promise<void>}
   */
  async disconnect() {
    const adapter = await this.connectionManager.getActiveAdapter();
    return adapter.disconnect();
  }

  // ============================================================
  // DEEP LINK HELPERS (for mobile companion app)
  // ============================================================

  /**
   * Get deep link URL for printing voucher
   * Useful for generating QR codes or links to open companion app
   * 
   * @param {object} voucher - Voucher data
   * @param {object} options - Options
   * @returns {Promise<string>}
   */
  async getDeepLinkUrl(voucher, options = {}) {
    const CompanionAdapter = this.connectionManager.getAdapter('companion');
    if (!CompanionAdapter) {
      throw new Error('Companion adapter not available');
    }

    const escposData = await this._buildReceipt(voucher, { ...this.options, ...options });
    return CompanionAdapter.getDeepLinkUrl(escposData, {
      voucher,
      paperWidth: options.paperWidth || this.options.paperWidth,
    });
  }

  /**
   * Check if companion app is likely installed
   * @returns {boolean}
   */
  isCompanionAppLikely() {
    const adapter = this.connectionManager.getAdapter('companion');
    return adapter?.isMobile() || false;
  }

  /**
   * Get app store link for companion app
   * @returns {string|null}
   */
  getCompanionAppLink() {
    const adapter = this.connectionManager.getAdapter('companion');
    return adapter?.getAppStoreLink() || null;
  }

  // ============================================================
  // VALIDATION
  // ============================================================

  /**
   * Validate voucher data
   * @private
   */
  _validateVoucher(voucher) {
    if (!voucher) {
      throw new Error('Voucher data is required');
    }
    
    if (!voucher.lnurl) {
      throw new Error('Voucher must have an LNURL');
    }
    
    if (!voucher.satsAmount && voucher.satsAmount !== 0) {
      throw new Error('Voucher must have satsAmount');
    }
  }

  // ============================================================
  // JOB MANAGEMENT
  // ============================================================

  /**
   * Create unique job ID
   * @private
   */
  _createJobId() {
    return `print-${Date.now()}-${++this._jobIdCounter}`;
  }

  // ============================================================
  // EVENTS
  // ============================================================

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {function} callback - Handler
   * @returns {function} Unsubscribe function
   */
  on(event, callback) {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set());
    }
    this._eventListeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  /**
   * Remove event listener
   * @param {string} event
   * @param {function} callback
   */
  off(event, callback) {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emit event
   * @private
   */
  _emit(event, data = {}) {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error('Error in PrintService event handler:', e);
        }
      });
    }
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get debug info
   * @returns {object}
   */
  getDebugInfo() {
    return {
      options: this.options,
      connectionManager: this.connectionManager.getDebugInfo(),
      pendingJobs: this._printQueue.length,
    };
  }
}

// Singleton instance
let _instance = null;

/**
 * Get singleton PrintService instance
 * @param {object} options - Options (only used on first call)
 * @returns {PrintService}
 */
function getPrintService(options = {}) {
  if (!_instance) {
    _instance = new PrintService(options);
  }
  return _instance;
}

export default PrintService;
export { PrintService, getPrintService, PrintStatus, ReceiptType };
