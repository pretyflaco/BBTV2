/**
 * LocalPrintAdapter - Connects to local print server for Bluetooth/USB printing
 * 
 * This adapter sends ESC/POS data to a local print server running on the same
 * machine. The print server bridges the browser to local printers (Bluetooth,
 * USB, Serial) that can't be accessed directly from the browser.
 * 
 * Usage:
 * 1. Start the print server: `node print-server.js /dev/rfcomm0`
 * 2. The web app will automatically detect and use this adapter
 * 
 * The adapter communicates via:
 * - HTTP POST for printing (reliable)
 * - WebSocket for real-time status updates (optional)
 */

import BaseAdapter from './BaseAdapter.js';

const DEFAULT_OPTIONS = {
  serverUrl: 'http://localhost:9100',
  wsUrl: 'ws://localhost:9100',
  timeout: 10000,
  useWebSocket: true,
  retryAttempts: 0, // Disabled - PrintService handles retries
};

class LocalPrintAdapter extends BaseAdapter {
  constructor(options = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.ws = null;
    this.isServerAvailable = false;
    this.printerStatus = null;
    this.statusCallbacks = new Set();
  }

  /**
   * Get adapter type identifier
   * @returns {string}
   */
  get type() {
    return 'localprint';
  }

  /**
   * Get adapter name
   * @returns {string}
   */
  get name() {
    return 'Local Print Server';
  }

  /**
   * Check if the adapter is supported in current environment
   * @returns {boolean}
   */
  static isSupported() {
    // Always supported - requires print server to be running
    return true;
  }

  /**
   * Check if print server is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const response = await fetch(`${this.options.serverUrl}/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      
      if (response.ok) {
        this.printerStatus = await response.json();
        this.isServerAvailable = true;
        return this.printerStatus.connected;
      }
    } catch (err) {
      this.isServerAvailable = false;
      this.printerStatus = null;
    }
    return false;
  }

  /**
   * Connect to the print server
   * @returns {Promise<void>}
   */
  async connect() {
    // Check HTTP availability first
    const available = await this.isAvailable();
    
    if (!available) {
      throw new Error(
        'Print server not available. Start it with: node print-server.js /dev/rfcomm0'
      );
    }

    // Optionally connect WebSocket for real-time status
    if (this.options.useWebSocket && typeof WebSocket !== 'undefined') {
      try {
        await this._connectWebSocket();
      } catch (err) {
        // WebSocket is optional, don't fail if it doesn't connect
        console.warn('[LocalPrintAdapter] WebSocket connection failed:', err.message);
      }
    }

    this._setConnected(true);
  }

  /**
   * Connect WebSocket for real-time updates
   * @private
   */
  async _connectWebSocket() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);

      this.ws = new WebSocket(this.options.wsUrl);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        console.log('[LocalPrintAdapter] WebSocket connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this._handleServerMessage(data);
        } catch (err) {
          console.warn('[LocalPrintAdapter] Invalid WebSocket message');
        }
      };

      this.ws.onerror = (err) => {
        clearTimeout(timeout);
        reject(err);
      };

      this.ws.onclose = () => {
        console.log('[LocalPrintAdapter] WebSocket disconnected');
        this.ws = null;
      };
    });
  }

  /**
   * Handle messages from the print server
   * @private
   */
  _handleServerMessage(data) {
    switch (data.type) {
      case 'status':
        this.printerStatus = data;
        this.isServerAvailable = true;
        this._notifyStatusCallbacks(data);
        break;
      
      case 'print_success':
        console.log('[LocalPrintAdapter] Print successful:', data.bytesWritten, 'bytes');
        break;
      
      case 'print_error':
        console.error('[LocalPrintAdapter] Print error:', data.error);
        break;
    }
  }

  /**
   * Notify status callbacks
   * @private
   */
  _notifyStatusCallbacks(status) {
    this.statusCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (err) {
        console.error('[LocalPrintAdapter] Status callback error:', err);
      }
    });
  }

  /**
   * Subscribe to printer status updates
   * @param {function} callback - Called when status changes
   * @returns {function} Unsubscribe function
   */
  onStatusChange(callback) {
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  /**
   * Disconnect from print server
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._setConnected(false);
  }

  /**
   * Send ESC/POS data to the print server
   * @param {Uint8Array} data - ESC/POS command bytes
   * @returns {Promise<boolean>} True on success
   */
  async print(data) {
    if (!this.isServerAvailable) {
      throw new Error('Print server not available');
    }

    // Convert to Base64
    const base64 = this._arrayBufferToBase64(data);

    let lastError;
    for (let attempt = 0; attempt <= this.options.retryAttempts; attempt++) {
      try {
        const response = await fetch(`${this.options.serverUrl}/print`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ data: base64 }),
          signal: AbortSignal.timeout(this.options.timeout)
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Print failed');
        }

        console.log(`[LocalPrintAdapter] Printed ${result.bytesWritten} bytes`);
        return true; // Success!
        
      } catch (err) {
        lastError = err;
        console.warn(`[LocalPrintAdapter] Attempt ${attempt + 1} failed:`, err.message);
        
        if (attempt < this.options.retryAttempts) {
          await this._delay(500 * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  /**
   * Convert ArrayBuffer/Uint8Array to Base64
   * @private
   */
  _arrayBufferToBase64(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Delay helper
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current printer status
   * @returns {object|null}
   */
  getStatus() {
    return this.printerStatus;
  }

  /**
   * Request fresh status from server
   * @returns {Promise<object>}
   */
  async refreshStatus() {
    await this.isAvailable();
    return this.printerStatus;
  }
}

export default LocalPrintAdapter;
