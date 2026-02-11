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
export const AdapterStatus = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  PRINTING: "printing",
  ERROR: "error",
} as const

export type AdapterStatusType = (typeof AdapterStatus)[keyof typeof AdapterStatus]

/**
 * Adapter capability flags
 */
export const AdapterCapabilities = {
  NATIVE_QR: "native_qr", // Supports native QR commands
  RASTER_IMAGE: "raster_image", // Supports raster image printing
  AUTO_CUT: "auto_cut", // Has paper cutter
  CASH_DRAWER: "cash_drawer", // Can open cash drawer
  STATUS_QUERY: "status_query", // Can query printer status
  BIDIRECTIONAL: "bidirectional", // Can receive data from printer
} as const

export type AdapterCapabilityType =
  (typeof AdapterCapabilities)[keyof typeof AdapterCapabilities]

export interface PrinterInfo {
  paperWidth?: number
  vendorId?: number
  productId?: number
  vendorName?: string
  [key: string]: unknown
}

export interface PrinterStatus {
  online: boolean
  paper: boolean
  cover: boolean
}

export interface DiscoveredPrinter {
  id: string
  name: string
  type: string
  [key: string]: unknown
}

type EventCallback = (data: Record<string, unknown>) => void

/**
 * BaseAdapter class - Abstract adapter interface
 *
 * @abstract
 */
class BaseAdapter {
  options: Record<string, unknown>
  status: string
  lastError: Error | null
  printerInfo: PrinterInfo | null
  _eventListeners: Map<string, Set<EventCallback>>
  capabilities: Set<string>

  /**
   * Create an adapter instance
   * @param {object} options - Adapter-specific options
   */
  constructor(options: Record<string, unknown> = {}) {
    this.options = options
    this.status = AdapterStatus.DISCONNECTED
    this.lastError = null
    this.printerInfo = null
    this._eventListeners = new Map()

    // Default capabilities (override in subclass)
    this.capabilities = new Set([
      AdapterCapabilities.NATIVE_QR,
      AdapterCapabilities.RASTER_IMAGE,
    ])
  }

  // ============================================================
  // ABSTRACT METHODS - Must be implemented by subclasses
  // ============================================================

  /**
   * Get the adapter type identifier
   * @abstract
   * @returns {string} Adapter type (e.g., 'companion', 'webserial', 'websocket')
   */
  get type(): string {
    throw new Error("BaseAdapter.type must be implemented by subclass")
  }

  /**
   * Get human-readable adapter name
   * @abstract
   * @returns {string} Display name
   */
  get name(): string {
    throw new Error("BaseAdapter.name must be implemented by subclass")
  }

  /**
   * Check if this adapter is available on the current platform
   * @abstract
   * @returns {Promise<boolean>}
   */
  async isAvailable(): Promise<boolean> {
    throw new Error("BaseAdapter.isAvailable() must be implemented by subclass")
  }

  /**
   * Connect to the printer
   * @abstract
   * @param {object} connectionOptions - Connection-specific options
   * @returns {Promise<boolean>} True if connected successfully
   */
  async connect(connectionOptions: Record<string, unknown> = {}): Promise<boolean> {
    throw new Error("BaseAdapter.connect() must be implemented by subclass")
  }

  /**
   * Disconnect from the printer
   * @abstract
   * @returns {Promise<void>}
   */
  async disconnect(): Promise<void> {
    throw new Error("BaseAdapter.disconnect() must be implemented by subclass")
  }

  /**
   * Send ESC/POS data to the printer
   * @abstract
   * @param {Uint8Array} data - ESC/POS command bytes
   * @returns {Promise<boolean>} True if printed successfully
   */
  async print(data: Uint8Array): Promise<boolean> {
    throw new Error("BaseAdapter.print() must be implemented by subclass")
  }

  // ============================================================
  // OPTIONAL METHODS - Override in subclass if supported
  // ============================================================

  /**
   * Discover available printers
   * Not all adapters support discovery
   * @returns {Promise<Array<{id: string, name: string, type: string}>>}
   */
  async discover(): Promise<DiscoveredPrinter[]> {
    return []
  }

  /**
   * Query printer status
   * Requires BIDIRECTIONAL capability
   * @returns {Promise<{online: boolean, paper: boolean, cover: boolean}|null>}
   */
  async queryPrinterStatus(): Promise<PrinterStatus | null> {
    if (!this.hasCapability(AdapterCapabilities.STATUS_QUERY)) {
      return null
    }
    return null
  }

  /**
   * Get paper width if known
   * @returns {number|null} Paper width in mm (58, 80) or null if unknown
   */
  getPaperWidth(): number | null {
    return this.printerInfo?.paperWidth || null
  }

  // ============================================================
  // CAPABILITY MANAGEMENT
  // ============================================================

  /**
   * Check if adapter has a specific capability
   * @param {string} capability - Capability from AdapterCapabilities
   * @returns {boolean}
   */
  hasCapability(capability: string): boolean {
    return this.capabilities.has(capability)
  }

  /**
   * Add a capability
   * @param {string} capability
   */
  addCapability(capability: string): void {
    this.capabilities.add(capability)
  }

  /**
   * Remove a capability
   * @param {string} capability
   */
  removeCapability(capability: string): void {
    this.capabilities.delete(capability)
  }

  /**
   * Get all capabilities
   * @returns {string[]}
   */
  getCapabilities(): string[] {
    return Array.from(this.capabilities)
  }

  // ============================================================
  // STATUS MANAGEMENT
  // ============================================================

  /**
   * Get current connection status
   * Subclasses may override to return richer status objects or async printer status.
   * @returns Status from AdapterStatus, printer-specific status object, or a Promise thereof
   */
  getStatus():
    | string
    | PrinterStatus
    | Record<string, unknown>
    | Promise<PrinterStatus | null>
    | null {
    return this.status
  }

  /**
   * Check if currently connected
   * @returns {boolean}
   */
  isConnected(): boolean {
    return this.status === AdapterStatus.CONNECTED
  }

  /**
   * Set status and emit event
   * @protected
   * @param {string} status
   * @param {object} data - Additional event data
   */
  _setStatus(status: string, data: Record<string, unknown> = {}): void {
    const oldStatus = this.status
    this.status = status
    this._emit(status, { ...data, previousStatus: oldStatus })
  }

  /**
   * Set error status
   * @protected
   * @param {Error|string} error
   */
  _setError(error: Error | string): void {
    this.lastError = error instanceof Error ? error : new Error(error)
    this._setStatus(AdapterStatus.ERROR, { error: this.lastError })
  }

  /**
   * Get last error
   * @returns {Error|null}
   */
  getLastError(): Error | null {
    return this.lastError
  }

  /**
   * Clear last error
   */
  clearError(): void {
    this.lastError = null
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
  on(event: string, callback: EventCallback): () => void {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set())
    }
    this._eventListeners.get(event)!.add(callback)

    // Return unsubscribe function
    return () => this.off(event, callback)
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {function} callback - Event handler to remove
   */
  off(event: string, callback: EventCallback): void {
    const listeners = this._eventListeners.get(event)
    if (listeners) {
      listeners.delete(callback)
    }
  }

  /**
   * Add one-time event listener
   * @param {string} event - Event name
   * @param {function} callback - Event handler
   */
  once(event: string, callback: EventCallback): void {
    const wrapper: EventCallback = (data) => {
      this.off(event, wrapper)
      callback(data)
    }
    this.on(event, wrapper)
  }

  /**
   * Emit event to listeners
   * @protected
   * @param {string} event - Event name
   * @param {object} data - Event data
   */
  _emit(event: string, data: Record<string, unknown> = {}): void {
    const listeners = this._eventListeners.get(event)
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback({ event, adapter: this.type, ...data })
        } catch (e: unknown) {
          console.error(`Error in ${this.type} adapter event handler:`, e)
        }
      })
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
  async waitForStatus(targetStatus: string, timeout: number = 10000): Promise<boolean> {
    if (this.status === targetStatus) return true

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.off(targetStatus, handler)
        resolve(false)
      }, timeout)

      const handler: EventCallback = () => {
        clearTimeout(timeoutId)
        resolve(true)
      }

      this.once(targetStatus, handler)
    })
  }

  /**
   * Sleep utility
   * @protected
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Get adapter info for debugging
   * @returns {object}
   */
  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      name: this.name,
      status: this.status,
      capabilities: this.getCapabilities(),
      printerInfo: this.printerInfo,
      lastError: this.lastError?.message || null,
    }
  }

  /**
   * String representation
   * @returns {string}
   */
  toString(): string {
    return `${this.name} (${this.type}) - ${this.status}`
  }
}

export default BaseAdapter
export { BaseAdapter }
