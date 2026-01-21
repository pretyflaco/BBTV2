/**
 * ESC/POS Thermal Printing Module for Blink Bitcoin Terminal
 * 
 * This module provides thermal receipt printing capabilities for Blink vouchers.
 * It supports multiple connection methods to accommodate different devices and printers:
 * 
 * - Companion App: Deep links to mobile app for Bluetooth printing
 * - Web Serial: Direct USB connection on desktop Chrome/Edge
 * - WebSocket: Network printers via bridge daemon
 * - PDF Fallback: System print dialog when thermal isn't available
 * 
 * Quick Start:
 * ```javascript
 * import { getPrintService } from '@/lib/escpos';
 * 
 * const printer = getPrintService();
 * 
 * await printer.printVoucher({
 *   lnurl: 'LNURL1...',
 *   satsAmount: 5000,
 *   displayAmount: 100,
 *   displayCurrency: 'KES',
 *   voucherSecret: 'q6pvY79EftnZ',
 *   identifierCode: 'A1B2C3D4',
 * });
 * ```
 * 
 * @module lib/escpos
 */

// Core components
export { default as ESCPOSBuilder } from './ESCPOSBuilder.js';
export { default as VoucherReceipt, formatVoucherSecret, formatExpiry, formatSats } from './VoucherReceipt.js';
export { default as QRCodeRasterizer, imageDataToBitmap, matrixToBitmap } from './QRCodeRasterizer.js';
export { 
  loadLogoForPrint, 
  preloadLogo, 
  clearLogoCache, 
  getBlinkLogoUrl, 
  bitmapToESCPOS 
} from './LogoRasterizer.js';

// Connection management
export { default as ConnectionManager, getConnectionManager, Platform, Browser, DeviceType } from './ConnectionManager.js';

// Main service
export { default as PrintService, getPrintService, PrintStatus, ReceiptType } from './PrintService.js';

// Adapters
export { default as BaseAdapter, AdapterStatus, AdapterCapabilities } from './adapters/BaseAdapter.js';
export { default as CompanionAdapter, URL_SCHEMES } from './adapters/CompanionAdapter.js';
export { default as WebSerialAdapter, SERIAL_CONFIGS, PRINTER_VENDORS } from './adapters/WebSerialAdapter.js';
export { default as PDFAdapter } from './adapters/PDFAdapter.js';
export { default as LocalPrintAdapter } from './adapters/LocalPrintAdapter.js';

// React hooks
export { useThermalPrint } from './hooks/useThermalPrint.js';

// Re-export commonly used types
export const PaperWidth = {
  MM_58: 58,
  MM_80: 80,
};

/**
 * Quick print function - convenience wrapper
 * 
 * @param {object} voucher - Voucher data
 * @param {object} options - Print options
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function printVoucher(voucher, options = {}) {
  const service = getPrintService();
  return service.printVoucher(voucher, options);
}

/**
 * Get available printing methods
 * @returns {Promise<Array>}
 */
export async function getAvailablePrintMethods() {
  const service = getPrintService();
  return service.getAvailableMethods();
}

/**
 * Get platform-specific recommendations
 * @returns {Promise<object>}
 */
export async function getPrintRecommendations() {
  const service = getPrintService();
  return service.getRecommendations();
}
