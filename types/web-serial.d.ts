/**
 * Type definitions for Web Serial API
 * https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API
 */

interface SerialPortFilter {
  usbVendorId?: number
  usbProductId?: number
}

interface SerialPortRequestOptions {
  filters?: SerialPortFilter[]
}

interface SerialPort {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: SerialOptions): Promise<void>
  close(): Promise<void>
  getInfo(): SerialPortInfo
}

interface SerialOptions {
  baudRate: number
  dataBits?: number
  stopBits?: number
  parity?: "none" | "even" | "odd"
  bufferSize?: number
  flowControl?: "none" | "hardware"
}

interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

interface Serial extends EventTarget {
  getPorts(): Promise<SerialPort[]>
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>
}

interface Navigator {
  readonly serial: Serial
}
