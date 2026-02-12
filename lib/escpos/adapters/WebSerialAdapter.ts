/**
 * WebSerialAdapter - Desktop USB printing via Web Serial API
 *
 * Uses the Web Serial API to communicate with USB thermal printers directly
 * from the browser. This is the preferred method for desktop Chrome/Edge.
 *
 * Requirements:
 * - Chrome 89+ or Edge 89+ on desktop
 * - User must grant permission to access serial port
 * - Printer must have USB-Serial interface (most thermal printers do)
 *
 * Note: Web Serial is NOT available on:
 * - iOS Safari (any version)
 * - Android Chrome (Web Serial not implemented)
 * - Firefox (behind flag only)
 *
 * Common baud rates for thermal printers:
 * - 9600 (older/cheaper printers)
 * - 19200
 * - 38400
 * - 115200 (most common for modern printers)
 */

import {
  BaseAdapter,
  AdapterStatus,
  AdapterCapabilities,
  PrinterStatus,
} from "./BaseAdapter"

interface SerialConfig {
  baudRate: number
  dataBits: number
  stopBits: number
  parity: string
  flowControl: string
}

/**
 * Common serial port configurations for thermal printers
 */
export const SERIAL_CONFIGS: Record<string, SerialConfig> = {
  default: {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    flowControl: "none",
  },
  legacy: {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    flowControl: "none",
  },
  epson: {
    baudRate: 38400,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    flowControl: "none",
  },
}

interface PrinterVendor {
  vendorId: number
  name: string
}

/**
 * USB Vendor IDs for common thermal printer manufacturers
 * Used for filtering in port selection dialog
 */
export const PRINTER_VENDORS: PrinterVendor[] = [
  { vendorId: 0x04b8, name: "Epson" },
  { vendorId: 0x0519, name: "Star Micronics" },
  { vendorId: 0x0dd4, name: "Custom" },
  { vendorId: 0x154f, name: "SNBC" },
  { vendorId: 0x0fe6, name: "ICS/Kontron" },
  { vendorId: 0x0416, name: "Winbond" },
  { vendorId: 0x1504, name: "NCR" },
  { vendorId: 0x0483, name: "STMicroelectronics" }, // Many Chinese printers
  { vendorId: 0x1a86, name: "QinHeng/CH340" }, // Common USB-Serial chip
  { vendorId: 0x067b, name: "Prolific PL2303" }, // Common USB-Serial chip
  { vendorId: 0x10c4, name: "Silicon Labs CP210x" }, // Common USB-Serial chip
  { vendorId: 0x0403, name: "FTDI" }, // Common USB-Serial chip
]

interface WebSerialOptions {
  serialConfig?: SerialConfig
  autoConnect?: boolean
  chunkSize?: number
  chunkDelay?: number
  writeTimeout?: number
  filterVendors?: boolean
}

interface SerialConnectionOptions {
  port?: any // SerialPort from Web Serial API
  serialConfig?: SerialConfig
}

interface DiscoveredSerialPrinter {
  id: string
  name: string
  type: string
  port: any // SerialPort
  vendorId?: number
  productId?: number
  [key: string]: unknown
}

/**
 * Default options for WebSerialAdapter
 */
const DEFAULT_OPTIONS: Required<WebSerialOptions> = {
  serialConfig: SERIAL_CONFIGS.default,
  autoConnect: false, // Auto-connect to last used printer
  chunkSize: 1024, // Bytes per write chunk
  chunkDelay: 50, // ms delay between chunks
  writeTimeout: 10000, // Timeout for write operations
  filterVendors: true, // Show only known printer vendors in picker
}

/**
 * WebSerialAdapter class
 */
class WebSerialAdapter extends BaseAdapter {
  declare options: Required<WebSerialOptions>
  private _port: any // SerialPort
  private _writer: any // WritableStreamDefaultWriter
  private _reader: any // ReadableStreamDefaultReader

  /**
   * Create a WebSerial adapter
   * @param {object} options - Adapter options
   */
  constructor(options: WebSerialOptions = {}) {
    super(options as Record<string, unknown>)
    this.options = { ...DEFAULT_OPTIONS, ...options }

    // Serial port reference
    this._port = null
    this._writer = null
    this._reader = null

    // Capabilities
    this.capabilities = new Set([
      AdapterCapabilities.NATIVE_QR,
      AdapterCapabilities.RASTER_IMAGE,
      AdapterCapabilities.AUTO_CUT,
      AdapterCapabilities.CASH_DRAWER,
      AdapterCapabilities.STATUS_QUERY,
      AdapterCapabilities.BIDIRECTIONAL,
    ])
  }

  /**
   * Adapter type identifier
   * @returns {string}
   */
  get type(): string {
    return "webserial"
  }

  /**
   * Human-readable name
   * @returns {string}
   */
  get name(): string {
    return "USB Printer (Web Serial)"
  }

  /**
   * Check if Web Serial API is available
   * @returns {Promise<boolean>}
   */
  async isAvailable(): Promise<boolean> {
    return typeof navigator !== "undefined" && "serial" in navigator
  }

  /**
   * Get list of already-granted serial ports
   * @returns {Promise<any[]>}
   */
  async getPorts(): Promise<any[]> {
    if (!(await this.isAvailable())) {
      return []
    }
    return navigator.serial.getPorts()
  }

  /**
   * Request user to select a serial port
   * @param {object} options - Port request options
   * @returns {Promise<any|null>}
   */
  async requestPort(options: Record<string, unknown> = {}): Promise<any | null> {
    if (!(await this.isAvailable())) {
      throw new Error("Web Serial API not available")
    }

    const filters: Array<{ usbVendorId: number }> = []

    // Add vendor filters if enabled
    if (this.options.filterVendors) {
      PRINTER_VENDORS.forEach((vendor) => {
        filters.push({ usbVendorId: vendor.vendorId })
      })
    }

    try {
      const port = await navigator.serial.requestPort({
        filters: filters.length > 0 ? filters : undefined,
      })
      return port
    } catch (e: unknown) {
      if ((e as Error).name === "NotFoundError") {
        // User cancelled selection
        return null
      }
      throw e
    }
  }

  /**
   * Connect to a serial port
   * @param {object} connectionOptions - Connection options
   * @param {SerialPort} connectionOptions.port - Specific port to connect to
   * @param {object} connectionOptions.serialConfig - Serial config override
   * @returns {Promise<boolean>}
   */
  async connect(connectionOptions: SerialConnectionOptions = {}): Promise<boolean> {
    if (!(await this.isAvailable())) {
      this._setError("Web Serial API not available in this browser")
      return false
    }

    this._setStatus(AdapterStatus.CONNECTING)

    try {
      // Get port (use provided, or request new)
      let port = connectionOptions.port

      if (!port) {
        // Try to get previously granted port
        const ports = await this.getPorts()
        if (ports.length > 0 && this.options.autoConnect) {
          port = ports[0]
        } else {
          // Request new port selection
          port = await this.requestPort()
        }
      }

      if (!port) {
        this._setError("No serial port selected")
        return false
      }

      // Open the port
      const serialConfig = connectionOptions.serialConfig || this.options.serialConfig
      await port.open(serialConfig)

      this._port = port

      // Get port info if available
      const info = port.getInfo()
      this.printerInfo = {
        vendorId: info.usbVendorId,
        productId: info.usbProductId,
        vendorName:
          PRINTER_VENDORS.find((v: PrinterVendor) => v.vendorId === info.usbVendorId)
            ?.name || "Unknown",
      }

      // Set up disconnect handler
      port.addEventListener("disconnect", () => {
        this._handleDisconnect()
      })

      this._setStatus(AdapterStatus.CONNECTED)
      this._emit("connected", { printerInfo: this.printerInfo })

      return true
    } catch (err: unknown) {
      this._setError(err instanceof Error ? err : new Error(String(err)))
      return false
    }
  }

  /**
   * Disconnect from serial port
   * @returns {Promise<void>}
   */
  async disconnect(): Promise<void> {
    try {
      if (this._writer) {
        await this._writer.close()
        this._writer = null
      }
      if (this._reader) {
        await this._reader.cancel()
        this._reader = null
      }
      if (this._port) {
        await this._port.close()
        this._port = null
      }
    } catch (e: unknown) {
      console.warn("Error during disconnect:", e)
    }

    this._setStatus(AdapterStatus.DISCONNECTED)
  }

  /**
   * Handle unexpected disconnect
   * @private
   */
  private _handleDisconnect(): void {
    this._port = null
    this._writer = null
    this._reader = null
    this._setStatus(AdapterStatus.DISCONNECTED)
    this._emit("disconnected", { reason: "device_removed" })
  }

  /**
   * Send ESC/POS data to printer
   * @param {Uint8Array} data - ESC/POS command bytes
   * @returns {Promise<boolean>}
   */
  async print(data: Uint8Array): Promise<boolean> {
    if (!this._port || !this._port.writable) {
      if (!(await this.connect())) {
        return false
      }
    }

    this._setStatus(AdapterStatus.PRINTING)
    this._emit("printing", { dataSize: data.length })

    try {
      const writer = this._port.writable.getWriter()

      try {
        // Send data in chunks to avoid overwhelming printer buffer
        const chunkSize = this.options.chunkSize
        const chunkDelay = this.options.chunkDelay

        for (let offset = 0; offset < data.length; offset += chunkSize) {
          const chunk = data.slice(offset, offset + chunkSize)
          await writer.write(chunk)

          // Small delay between chunks
          if (offset + chunkSize < data.length && chunkDelay > 0) {
            await this._sleep(chunkDelay)
          }
        }
      } finally {
        writer.releaseLock()
      }

      this._setStatus(AdapterStatus.CONNECTED)
      this._emit("printed", { dataSize: data.length })
      return true
    } catch (err: unknown) {
      this._setError(err instanceof Error ? err : new Error(String(err)))
      return false
    }
  }

  /**
   * Read response from printer (for bidirectional communication)
   * @param {number} timeout - Read timeout in ms
   * @returns {Promise<Uint8Array|null>}
   */
  async read(timeout: number = 1000): Promise<Uint8Array | null> {
    if (!this._port || !this._port.readable) {
      return null
    }

    const reader = this._port.readable.getReader()

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Read timeout")), timeout)
      })

      const readPromise: Promise<{ done: boolean; value: Uint8Array }> = reader.read()

      const result = await Promise.race([readPromise, timeoutPromise])

      if (result.done) {
        return null
      }

      return result.value
    } catch (e: unknown) {
      if ((e as Error).message !== "Read timeout") {
        console.warn("Read error:", e)
      }
      return null
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Query printer status using DLE EOT command
   * Overrides base getStatus() to return printer hardware status
   * @returns {Promise<PrinterStatus | null>}
   */
  async getStatus(): Promise<PrinterStatus | null> {
    if (!this.isConnected()) {
      return null
    }

    try {
      // DLE EOT 1 - Transmit real-time status
      const statusRequest = new Uint8Array([0x10, 0x04, 0x01])

      const writer = this._port.writable.getWriter()
      try {
        await writer.write(statusRequest)
      } finally {
        writer.releaseLock()
      }

      // Read response
      const response = await this.read(500)

      if (!response || response.length === 0) {
        return null
      }

      // Parse status byte
      // Bit 3: Offline (0=online, 1=offline)
      // Bit 5: Cover open (0=closed, 1=open)
      // Bit 6: Paper feed (0=not feeding, 1=feeding)
      const status = response[0]

      return {
        online: !(status & 0x08),
        cover: !!(status & 0x20),
        paper: true, // Would need DLE EOT 4 to check paper
      }
    } catch (e: unknown) {
      console.warn("Status query failed:", e)
      return null
    }
  }

  /**
   * Discover printers (list available ports)
   * @returns {Promise<Array>}
   */
  async discover(): Promise<DiscoveredSerialPrinter[]> {
    const ports = await this.getPorts()

    return ports.map((port: any, index: number) => {
      const info = port.getInfo()
      const vendor = PRINTER_VENDORS.find(
        (v: PrinterVendor) => v.vendorId === info.usbVendorId,
      )

      return {
        id: `serial-${index}`,
        name: vendor ? `${vendor.name} Printer` : `USB Printer ${index + 1}`,
        type: "webserial",
        port: port,
        vendorId: info.usbVendorId,
        productId: info.usbProductId,
      }
    })
  }

  /**
   * Get supported serial configurations
   * @returns {object}
   */
  static getSerialConfigs(): Record<string, SerialConfig> {
    return { ...SERIAL_CONFIGS }
  }

  /**
   * Get known printer vendors
   * @returns {Array}
   */
  static getPrinterVendors(): PrinterVendor[] {
    return [...PRINTER_VENDORS]
  }
}

export default WebSerialAdapter
export { WebSerialAdapter }
