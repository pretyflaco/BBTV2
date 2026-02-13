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

import BaseAdapter, { AdapterStatus } from "./BaseAdapter"

interface LocalPrintOptions {
  serverUrl?: string
  wsUrl?: string
  timeout?: number
  useWebSocket?: boolean
  retryAttempts?: number
}

interface PrinterServerStatus {
  connected: boolean
  [key: string]: unknown
}

interface ServerMessage {
  type: string
  bytesWritten?: number
  error?: string
  connected?: boolean
  [key: string]: unknown
}

const DEFAULT_OPTIONS: Required<LocalPrintOptions> = {
  serverUrl: "http://localhost:9100",
  wsUrl: "ws://localhost:9100",
  timeout: 10000,
  useWebSocket: true,
  retryAttempts: 0, // Disabled - PrintService handles retries
}

class LocalPrintAdapter extends BaseAdapter {
  declare options: Required<LocalPrintOptions>
  ws: WebSocket | null
  isServerAvailable: boolean
  printerStatus: PrinterServerStatus | null
  statusCallbacks: Set<(status: PrinterServerStatus) => void>

  constructor(options: LocalPrintOptions = {}) {
    super()
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.ws = null
    this.isServerAvailable = false
    this.printerStatus = null
    this.statusCallbacks = new Set()
  }

  /**
   * Get adapter type identifier
   * @returns {string}
   */
  get type(): string {
    return "localprint"
  }

  /**
   * Get adapter name
   * @returns {string}
   */
  get name(): string {
    return "Local Print Server"
  }

  /**
   * Check if the adapter is supported in current environment
   * @returns {boolean}
   */
  static isSupported(): boolean {
    // Always supported - requires print server to be running
    return true
  }

  /**
   * Check if print server is available
   * @returns {Promise<boolean>}
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.options.serverUrl}/status`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      })

      if (response.ok) {
        this.printerStatus = await response.json()
        this.isServerAvailable = true
        return this.printerStatus!.connected
      }
    } catch (_err: unknown) {
      this.isServerAvailable = false
      this.printerStatus = null
    }
    return false
  }

  /**
   * Set connected state by mapping to adapter status
   * @private
   * @param {boolean} connected - Whether the adapter is connected
   */
  private _setConnected(connected: boolean): void {
    this._setStatus(connected ? AdapterStatus.CONNECTED : AdapterStatus.DISCONNECTED)
  }

  /**
   * Connect to the print server
   * @returns {Promise<boolean>} True if connected successfully
   */
  async connect(): Promise<boolean> {
    // Check HTTP availability first
    const available = await this.isAvailable()

    if (!available) {
      throw new Error(
        "Print server not available. Start it with: node print-server.js /dev/rfcomm0",
      )
    }

    // Optionally connect WebSocket for real-time status
    if (this.options.useWebSocket && typeof WebSocket !== "undefined") {
      try {
        await this._connectWebSocket()
      } catch (err: unknown) {
        // WebSocket is optional, don't fail if it doesn't connect
        console.warn(
          "[LocalPrintAdapter] WebSocket connection failed:",
          (err as Error).message,
        )
      }
    }

    this._setConnected(true)
    return true
  }

  /**
   * Connect WebSocket for real-time updates
   * @private
   */
  private async _connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timeout"))
      }, 5000)

      this.ws = new WebSocket(this.options.wsUrl)

      this.ws.onopen = () => {
        clearTimeout(timeout)
        console.log("[LocalPrintAdapter] WebSocket connected")
        resolve()
      }

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data: ServerMessage = JSON.parse(event.data as string)
          this._handleServerMessage(data)
        } catch (_err: unknown) {
          console.warn("[LocalPrintAdapter] Invalid WebSocket message")
        }
      }

      this.ws.onerror = (err: Event) => {
        clearTimeout(timeout)
        reject(err)
      }

      this.ws.onclose = () => {
        console.log("[LocalPrintAdapter] WebSocket disconnected")
        this.ws = null
      }
    })
  }

  /**
   * Handle messages from the print server
   * @private
   */
  private _handleServerMessage(data: ServerMessage): void {
    switch (data.type) {
      case "status":
        this.printerStatus = data as PrinterServerStatus
        this.isServerAvailable = true
        this._notifyStatusCallbacks(data as PrinterServerStatus)
        break

      case "print_success":
        console.log("[LocalPrintAdapter] Print successful:", data.bytesWritten, "bytes")
        break

      case "print_error":
        console.error("[LocalPrintAdapter] Print error:", data.error)
        break
    }
  }

  /**
   * Notify status callbacks
   * @private
   */
  private _notifyStatusCallbacks(status: PrinterServerStatus): void {
    this.statusCallbacks.forEach((callback) => {
      try {
        callback(status)
      } catch (err: unknown) {
        console.error("[LocalPrintAdapter] Status callback error:", err)
      }
    })
  }

  /**
   * Subscribe to printer status updates
   * @param {function} callback - Called when status changes
   * @returns {function} Unsubscribe function
   */
  onStatusChange(callback: (status: PrinterServerStatus) => void): () => void {
    this.statusCallbacks.add(callback)
    return () => this.statusCallbacks.delete(callback)
  }

  /**
   * Disconnect from print server
   * @returns {Promise<void>}
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this._setConnected(false)
  }

  /**
   * Send ESC/POS data to the print server
   * @param {Uint8Array} data - ESC/POS command bytes
   * @returns {Promise<boolean>} True on success
   */
  async print(data: Uint8Array): Promise<boolean> {
    if (!this.isServerAvailable) {
      throw new Error("Print server not available")
    }

    // Convert to Base64
    const base64 = this._arrayBufferToBase64(data)

    let lastError: unknown
    for (let attempt = 0; attempt <= this.options.retryAttempts; attempt++) {
      try {
        const response = await fetch(`${this.options.serverUrl}/print`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ data: base64 }),
          signal: AbortSignal.timeout(this.options.timeout),
        })

        const result: { bytesWritten?: number; error?: string } = await response.json()

        if (!response.ok) {
          throw new Error(result.error || "Print failed")
        }

        console.log(`[LocalPrintAdapter] Printed ${result.bytesWritten} bytes`)
        return true // Success!
      } catch (err: unknown) {
        lastError = err
        console.warn(
          `[LocalPrintAdapter] Attempt ${attempt + 1} failed:`,
          (err as Error).message,
        )

        if (attempt < this.options.retryAttempts) {
          await this._delay(500 * (attempt + 1))
        }
      }
    }

    throw lastError
  }

  /**
   * Convert ArrayBuffer/Uint8Array to Base64
   * @private
   */
  private _arrayBufferToBase64(buffer: Uint8Array | ArrayBuffer): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    let binary = ""
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    return btoa(binary)
  }

  /**
   * Delay helper
   * @private
   */
  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Get current printer status
   * @returns {object|null}
   */
  getStatus(): PrinterServerStatus | null {
    return this.printerStatus
  }

  /**
   * Request fresh status from server
   * @returns {Promise<object>}
   */
  async refreshStatus(): Promise<PrinterServerStatus | null> {
    await this.isAvailable()
    return this.printerStatus
  }
}

export default LocalPrintAdapter
