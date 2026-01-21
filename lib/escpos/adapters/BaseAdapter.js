/**
 * BaseAdapter - Abstract base class for ESC/POS printer adapters
 * 
 * All printer adapters must extend this class and implement the required methods.
 * The adapter pattern allows the PrintService to work with different connection
 * types (Bluetooth, USB, Network, etc.) through a unified interface.
 * 
 * Adapter lifecycle:
 * 1. isAvailable() - Check if this adapter can be used on current platform
 * 2. connect() - Establish connection to printer
 * 3. print() - Send ESC/POS data to printer
 * 4. disconnect() - Clean up connection
 * 
 * Events emitted:
 * - 'connecting' - Starting connection
 * - 'connected' - Successfully connected
 * - 'disconnected' - Connection closed
 * - 'error' - Error occurred
 * - 'printing' - Starting to print
 * - 'printed' - Successfully printed
 */

/**
 * Adapter status constants
 */
const AdapterStatus = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  PRINTING: 'printing',
  ERROR: 'error',
};

/**
 * Adapter capability flags
 */
const AdapterCapabilities = {
  NATIVE_QR: 'native_qr',           // Supports native QR commands
  RASTER_IMAGE: 'raster_image',      // Supports raster image printing
  AUTO_CUT: 'auto_cut',              // Has paper cutter
  CASH_DRAWER: 'cash_drawer',        // Can open cash drawer
  STATUS_QUERY: 'status_query',      // Can query printer status
  BIDIRECTIONAL: 'bidirectional',    // Can receive data from printer
};

/**
 * BaseAdapter class - Abstract adapter interface
 * 
 * @abstract
 */
class BaseAdapter {
  /**
   * Create an adapter instance
   * @param {object} options - Adapter-specific options
   */
  constructor(options = {}) {
    this.options = options;
    this.status = AdapterStatus.DISCONNECTED;
    this.lastError = null;
    this.printerInfo = null;
    this._eventListeners = new Map();
    
    // Default capabilities (override in subclass)
    this.capabilities = new Set([
      AdapterCapabilities.NATIVE_QR,
      AdapterCapabilities.RASTER_IMAGE,
    ]);
  }

  // ============================================================
  // ABSTRACT METHODS - Must be implemented by subclasses
  // ============================================================

  /**
   * Get the adapter type identifier
   * @abstract
   * @returns {string} Adapter type (e.g., 'companion', 'webserial', 'websocket')
   */
  get type() {
    throw new Error('BaseAdapter.type must be implemented by subclass');
  }

  /**
   * Get human-readable adapter name
   * @abstract
   * @returns {string} Display name
   */
  get name() {
    throw new Error('BaseAdapter.name must be implemented by subclass');
  }

  /**
   * Check if this adapter is available on the current platform
   * @abstract
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    throw new Error('BaseAdapter.isAvailable() must be implemented by subclass');
  }

  /**
   * Connect to the printer
   * @abstract
   * @param {object} connectionOptions - Connection-specific options
   * @returns {Promise<boolean>} True if connected successfully
   */
  async connect(connectionOptions = {}) {
    throw new Error('BaseAdapter.connect() must be implemented by subclass');
  }

  /**
   * Disconnect from the printer
   * @abstract
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('BaseAdapter.disconnect() must be implemented by subclass');
  }

  /**
   * Send ESC/POS data to the printer
   * @abstract
   * @param {Uint8Array} data - ESC/POS command bytes
   * @returns {Promise<boolean>} True if printed successfully
   */
  async print(data) {
    throw new Error('BaseAdapter.print() must be implemented by subclass');
  }

  // ============================================================
  // OPTIONAL METHODS - Override in subclass if supported
  // ============================================================

  /**
   * Discover available printers
   * Not all adapters support discovery
   * @returns {Promise<Array<{id: string, name: string, type: string}>>}
   */
  async discover() {
    return [];
  }

  /**
   * Query printer status
   * Requires BIDIRECTIONAL capability
   * @returns {Promise<{online: boolean, paper: boolean, cover: boolean}|null>}
   */
  async getStatus() {
    if (!this.hasCapability(AdapterCapabilities.STATUS_QUERY)) {
      return null;
    }
    return null;
  }

  /**
   * Get paper width if known
   * @returns {number|null} Paper width in mm (58, 80) or null if unknown
   */
  getPaperWidth() {
    return this.printerInfo?.paperWidth || null;
  }

  // ============================================================
  // CAPABILITY MANAGEMENT
  // ============================================================

  /**
   * Check if adapter has a specific capability
   * @param {string} capability - Capability from AdapterCapabilities
   * @returns {boolean}
   */
  hasCapability(capability) {
    return this.capabilities.has(capability);
  }

  /**
   * Add a capability
   * @param {string} capability
   */
  addCapability(capability) {
    this.capabilities.add(capability);
  }

  /**
   * Remove a capability
   * @param {string} capability
   */
  removeCapability(capability) {
    this.capabilities.delete(capability);
  }

  /**
   * Get all capabilities
   * @returns {string[]}
   */
  getCapabilities() {
    return Array.from(this.capabilities);
  }

  // ============================================================
  // STATUS MANAGEMENT
  // ============================================================

  /**
   * Get current connection status
   * @returns {string} Status from AdapterStatus
   */
  getStatus() {
    return this.status;
  }

  /**
   * Check if currently connected
   * @returns {boolean}
   */
  isConnected() {
    return this.status === AdapterStatus.CONNECTED;
  }

  /**
   * Set status and emit event
   * @protected
   * @param {string} status
   * @param {object} data - Additional event data
   */
  _setStatus(status, data = {}) {
    const oldStatus = this.status;
    this.status = status;
    this._emit(status, { ...data, previousStatus: oldStatus });
  }

  /**
   * Set error status
   * @protected
   * @param {Error|string} error
   */
  _setError(error) {
    this.lastError = error instanceof Error ? error : new Error(error);
    this._setStatus(AdapterStatus.ERROR, { error: this.lastError });
  }

  /**
   * Get last error
   * @returns {Error|null}
   */
  getLastError() {
    return this.lastError;
  }

  /**
   * Clear last error
   */
  clearError() {
    this.lastError = null;
  }

  // ============================================================
  // EVENT SYSTEM
  // ============================================================

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {function} callback - Event handler
   * @returns {function} Unsubscribe function
   */
  on(event, callback) {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set());
    }
    this._eventListeners.get(event).add(callback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {function} callback - Event handler to remove
   */
  off(event, callback) {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Add one-time event listener
   * @param {string} event - Event name
   * @param {function} callback - Event handler
   */
  once(event, callback) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    this.on(event, wrapper);
  }

  /**
   * Emit event to listeners
   * @protected
   * @param {string} event - Event name
   * @param {object} data - Event data
   */
  _emit(event, data = {}) {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback({ event, adapter: this.type, ...data });
        } catch (e) {
          console.error(`Error in ${this.type} adapter event handler:`, e);
        }
      });
    }
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  /**
   * Wait for a specific status
   * @param {string} targetStatus - Status to wait for
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<boolean>} True if status reached, false if timeout
   */
  async waitForStatus(targetStatus, timeout = 10000) {
    if (this.status === targetStatus) return true;

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.off(targetStatus, handler);
        resolve(false);
      }, timeout);

      const handler = () => {
        clearTimeout(timeoutId);
        resolve(true);
      };

      this.once(targetStatus, handler);
    });
  }

  /**
   * Sleep utility
   * @protected
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get adapter info for debugging
   * @returns {object}
   */
  toJSON() {
    return {
      type: this.type,
      name: this.name,
      status: this.status,
      capabilities: this.getCapabilities(),
      printerInfo: this.printerInfo,
      lastError: this.lastError?.message || null,
    };
  }

  /**
   * String representation
   * @returns {string}
   */
  toString() {
    return `${this.name} (${this.type}) - ${this.status}`;
  }
}

export default BaseAdapter;
export { BaseAdapter, AdapterStatus, AdapterCapabilities };
