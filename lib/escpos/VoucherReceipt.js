/**
 * VoucherReceipt - High-level voucher layout builder for ESC/POS thermal printers
 * 
 * Creates Blink voucher receipts that match the existing PDF design (VoucherPDF.js)
 * but optimized for 58mm and 80mm thermal paper.
 * 
 * Features:
 * - Matches Blink voucher branding and layout
 * - Native QR code printing with raster fallback
 * - Support for both 58mm and 80mm paper widths
 * - Logo printing (rasterized from SVG/PNG)
 * - Configurable options for different use cases
 */

import ESCPOSBuilder from './ESCPOSBuilder.js';
import { loadLogoForPrint, getBlinkLogoUrl, bitmapToESCPOS } from './LogoRasterizer.js';

/**
 * Default configuration for voucher receipts
 */
const DEFAULT_OPTIONS = {
  paperWidth: 80,           // Paper width in mm (58 or 80)
  qrSize: 8,                // QR code module size (1-16, higher = larger)
  qrErrorCorrection: 'M',   // QR error correction level (L, M, Q, H)
  useNativeQR: true,        // Try native QR first, fallback to raster
  showLogo: true,           // Include Blink logo (rasterized from SVG)
  logoUrl: null,            // Custom logo URL (uses default Blink logo if null)
  showCutLine: true,        // Print cut line after receipt
  autoCut: false,           // Send cut command (for printers with auto-cutter)
  partialCut: true,         // Use partial cut instead of full cut
  feedLinesAfter: 4,        // Lines to feed after receipt (for tear-off)
  compactMode: false,       // Reduce spacing for 58mm paper
};

/**
 * Format a voucher secret for display (e.g., "q6pv Y79E ftnZ")
 * @param {string} secret - Raw voucher secret
 * @returns {string} Formatted secret with spaces
 */
function formatVoucherSecret(secret) {
  if (!secret) return '';
  // Clean and split into groups of 4 characters
  const cleaned = secret.replace(/[^a-zA-Z0-9]/g, '');
  const groups = [];
  for (let i = 0; i < cleaned.length && groups.length < 3; i += 4) {
    groups.push(cleaned.slice(i, i + 4));
  }
  return groups.join(' ');
}

/**
 * Format expiry date for thermal receipt
 * @param {number|string|Date} expiresAt - Expiry timestamp or date
 * @returns {string|null} Formatted date or null
 */
function formatExpiry(expiresAt) {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format satoshi amount with thousands separators
 * @param {number} sats - Satoshi amount
 * @returns {string} Formatted amount
 */
function formatSats(sats) {
  if (typeof sats !== 'number') return String(sats);
  return sats.toLocaleString('en-US');
}

/**
 * VoucherReceipt class - builds ESC/POS commands for Blink voucher receipts
 */
class VoucherReceipt {
  /**
   * Create a voucher receipt builder
   * @param {object} options - Receipt options (merged with defaults)
   */
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.builder = new ESCPOSBuilder({
      paperWidth: this.options.paperWidth
    });
    this._logoData = null; // Cached logo bitmap
  }

  /**
   * Pre-load the logo for faster build
   * Call this before build() to avoid async in build
   * @returns {Promise<void>}
   */
  async preloadLogo() {
    if (!this.options.showLogo) return;
    
    try {
      const logoUrl = this.options.logoUrl || getBlinkLogoUrl();
      this._logoData = await loadLogoForPrint(logoUrl, {
        paperWidth: this.options.paperWidth,
      });
    } catch (err) {
      console.warn('[VoucherReceipt] Failed to load logo:', err.message);
      this._logoData = null;
    }
  }

  /**
   * Build a complete voucher receipt
   * 
   * @param {object} voucher - Voucher data
   * @param {string} voucher.lnurl - LNURL for QR code
   * @param {number} voucher.displayAmount - Price in display currency
   * @param {string} voucher.displayCurrency - Display currency code (e.g., 'KES')
   * @param {number} voucher.satsAmount - Value in satoshis
   * @param {string} voucher.voucherSecret - 12-character voucher secret
   * @param {string} voucher.identifierCode - 8-character identifier
   * @param {number} voucher.commissionPercent - Commission percentage (optional)
   * @param {number|string} voucher.expiresAt - Expiry timestamp (optional)
   * @param {string} voucher.issuedBy - Username who issued voucher (optional)
   * @param {object} options - Override options for this receipt
   * @returns {VoucherReceipt} this (for chaining)
   */
  build(voucher, options = {}) {
    const opts = { ...this.options, ...options };
    const b = this.builder;
    const compact = opts.compactMode || opts.paperWidth === 58;
    const labelWidth = compact ? 12 : 14;

    // Initialize printer
    b.initialize();

    // ===== HEADER WITH LOGO =====
    b.align('center');
    
    // Print logo if available, otherwise text
    if (opts.showLogo && this._logoData) {
      this._printLogo(this._logoData);
      b.emptyLines(1);
    } else {
      // Fallback to text header
      b.bold(true);
      b.textSize(2, 2);
      b.line('blink');
      b.textSize(1, 1);
      b.bold(false);
      b.emptyLines(1);
    }

    // ===== INFO SECTION =====
    b.align('left');
    
    // Price (fiat amount) if available
    if (voucher.displayAmount && voucher.displayCurrency && voucher.displayCurrency !== 'BTC') {
      b.labelValue('Price:', `${voucher.displayCurrency} ${voucher.displayAmount}`, { labelWidth });
    }
    
    // Value in sats
    if (voucher.satsAmount) {
      b.labelValue('Value:', `${formatSats(voucher.satsAmount)} sats`, { labelWidth });
    }
    
    // Identifier
    if (voucher.identifierCode) {
      b.labelValue('Identifier:', voucher.identifierCode.toUpperCase(), { labelWidth });
    }
    
    // Commission (if applicable)
    if (voucher.commissionPercent !== undefined) {
      b.labelValue('Commission:', `${voucher.commissionPercent}%`, { labelWidth });
    }
    
    // Expires
    if (voucher.expiresAt) {
      b.labelValue('Expires:', formatExpiry(voucher.expiresAt), { labelWidth });
    }
    
    // Issued by
    if (voucher.issuedBy) {
      b.labelValue('Issued by:', voucher.issuedBy, { labelWidth });
    }
    
    b.emptyLines(1);

    // ===== QR CODE =====
    b.align('center');
    this._buildQRSection(voucher.lnurl, opts, compact);
    b.emptyLines(1);

    // ===== VOUCHER SECRET =====
    if (voucher.voucherSecret) {
      b.align('center');
      b.line('voucher secret');
      b.bold(true);
      b.line(formatVoucherSecret(voucher.voucherSecret));
      b.bold(false);
      b.emptyLines(1);
    }

    // ===== FOOTER =====
    b.align('center');
    b.line('voucher.blink.sv');

    // Paper feed and optional auto-cut
    if (opts.autoCut) {
      if (opts.partialCut) {
        b.partialCut();
      } else {
        b.cut();
      }
    } else {
      b.feed(opts.feedLinesAfter);
    }

    return this;
  }

  /**
   * Print a rasterized logo image
   * @private
   * @param {object} logoData - Logo bitmap data from LogoRasterizer
   */
  _printLogo(logoData) {
    if (!logoData || !logoData.bitmap) return;
    
    const { bitmap, width, height } = logoData;
    
    // Generate ESC/POS raster image commands
    const escposData = bitmapToESCPOS(bitmap, width, height, 0);
    
    // Append raw bytes to builder
    this.builder.raw(...escposData);
  }

  /**
   * Build header section with Blink branding
   * @private
   */
  _buildHeader(opts, compact) {
    const b = this.builder;

    b.emptyLines(1);
    b.align('center');

    // Print logo if available
    if (opts.showLogo && this._logoData) {
      this._printLogo(this._logoData);
    } else {
      // Fallback to text header
      b.bold(true);
      b.textSize(2, 2);
      b.line('BLINK');
      b.textSize(1, 1);
      b.bold(false);
    }

    b.emptyLines(compact ? 0 : 1);
    b.font('B');
    b.line('Bitcoin Voucher');
    b.font('A');
    b.align('left');

    b.emptyLines(compact ? 0 : 1);
  }

  /**
   * Build voucher information section
   * @private
   */
  _buildInfoSection(voucher, opts, compact) {
    const b = this.builder;
    const labelWidth = opts.paperWidth === 58 ? 10 : 14;

    b.emptyLines(compact ? 0 : 1);

    // Price (fiat amount)
    if (voucher.displayAmount && voucher.displayCurrency) {
      const fiatAmount = `${voucher.displayCurrency} ${voucher.displayAmount}`;
      b.labelValue('Price:', fiatAmount, { labelWidth, valueBold: true });
    }

    // Value in sats
    if (voucher.satsAmount) {
      const satsValue = `${formatSats(voucher.satsAmount)} sats`;
      b.labelValue('Value:', satsValue, { labelWidth, valueBold: true });
    }

    // Identifier code
    if (voucher.identifierCode) {
      const id = voucher.identifierCode.toUpperCase();
      b.labelValue('ID:', id, { labelWidth, valueBold: true });
    }

    // Commission (if applicable)
    if (voucher.commissionPercent && voucher.commissionPercent > 0) {
      b.labelValue('Commission:', `${voucher.commissionPercent}%`, { labelWidth });
    }

    // Expiry date
    const formattedExpiry = formatExpiry(voucher.expiresAt);
    if (formattedExpiry) {
      b.labelValue('Valid until:', formattedExpiry, { labelWidth });
    }

    // Issued by
    if (voucher.issuedBy) {
      b.labelValue('Issued by:', voucher.issuedBy, { labelWidth });
    }

    b.emptyLines(compact ? 0 : 1);
  }

  /**
   * Build QR code section
   * @private
   */
  _buildQRSection(lnurl, opts, compact) {
    const b = this.builder;

    if (!lnurl) {
      b.align('center');
      b.line('[QR CODE MISSING]');
      b.align('left');
      return;
    }

    b.emptyLines(compact ? 1 : 2);
    b.align('center');

    // Calculate QR size based on paper width and data length
    let qrSize = opts.qrSize;
    if (opts.paperWidth === 58) {
      qrSize = Math.min(qrSize, 6); // Smaller for 58mm
    }

    // Adjust for LNURL length (they can be long)
    if (lnurl.length > 300) {
      qrSize = Math.min(qrSize, 4);
    } else if (lnurl.length > 150) {
      qrSize = Math.min(qrSize, 5);
    }

    if (opts.useNativeQR) {
      // Native QR code (preferred - smaller data, faster print)
      b.qrCode(lnurl, {
        size: qrSize,
        errorCorrection: opts.qrErrorCorrection
      });
    } else {
      // Rasterized QR placeholder
      // Note: Actual rasterization requires QRCodeRasterizer
      b.line('[RASTER QR - Use QRCodeRasterizer]');
    }

    b.emptyLines(compact ? 1 : 2);
    b.align('left');
  }

  /**
   * Build voucher secret section
   * @private
   */
  _buildSecretSection(secret, compact) {
    const b = this.builder;
    const formattedSecret = formatVoucherSecret(secret);

    b.dashedLine();
    b.emptyLines(compact ? 0 : 1);

    b.align('center');
    b.font('B');
    b.line('voucher secret');
    b.font('A');

    b.bold(true);
    b.textSize(compact ? 1 : 2, compact ? 1 : 2);
    b.line(formattedSecret);
    b.textSize(1, 1);
    b.bold(false);

    b.emptyLines(compact ? 0 : 1);
    b.dashedLine();
    b.align('left');
  }

  /**
   * Build footer section
   * @private
   */
  _buildFooter(opts, compact) {
    const b = this.builder;

    b.emptyLines(compact ? 1 : 2);
    b.align('center');
    b.line('blink.sv');
    b.align('left');
    b.emptyLines(1);
  }

  /**
   * Build a minimal receipt (just QR and essential info)
   * Useful for high-volume printing or when paper is limited
   * 
   * @param {object} voucher - Voucher data
   * @param {object} options - Override options
   * @returns {VoucherReceipt}
   */
  buildMinimal(voucher, options = {}) {
    const opts = { ...this.options, ...options, compactMode: true };
    const b = this.builder;

    b.initialize();

    // Minimal header
    b.align('center');
    b.bold(true);
    b.line('BLINK VOUCHER');
    b.bold(false);

    // Value only
    if (voucher.satsAmount) {
      b.line(`${formatSats(voucher.satsAmount)} sats`);
    }

    b.dashedLine();

    // QR code
    this._buildQRSection(voucher.lnurl, opts, true);

    // Secret
    if (voucher.voucherSecret) {
      const formattedSecret = formatVoucherSecret(voucher.voucherSecret);
      b.line(formattedSecret);
    }

    // ID for reference
    if (voucher.identifierCode) {
      b.font('B');
      b.line(`ID: ${voucher.identifierCode.toUpperCase()}`);
      b.font('A');
    }

    b.dashedLine();
    b.line('blink.sv');
    b.align('left');

    b.feed(opts.feedLinesAfter);

    return this;
  }

  /**
   * Build a reissue receipt with full LNURL text
   * For replacement vouchers where user may need to manually enter LNURL
   * 
   * @param {object} voucher - Voucher data
   * @param {object} options - Override options
   * @returns {VoucherReceipt}
   */
  buildReissue(voucher, options = {}) {
    const opts = { ...this.options, ...options };
    const b = this.builder;
    const compact = opts.compactMode || opts.paperWidth === 58;

    b.initialize();

    // Header with logo or text
    b.emptyLines(1);
    b.align('center');
    
    if (opts.showLogo && this._logoData) {
      this._printLogo(this._logoData);
    } else {
      b.bold(true);
      b.textSize(2, 2);
      b.line('BLINK');
      b.textSize(1, 1);
      b.bold(false);
    }
    
    b.emptyLines(1);
    
    // Inverted "REISSUED" label
    b.invert(true);
    b.line(' REISSUED VOUCHER ');
    b.invert(false);
    b.align('left');
    b.emptyLines(1);

    // Standard info and QR
    b.dashedLine();
    this._buildInfoSection(voucher, opts, compact);
    b.dashedLine();
    this._buildQRSection(voucher.lnurl, opts, compact);

    // Secret
    if (voucher.voucherSecret) {
      this._buildSecretSection(voucher.voucherSecret, compact);
    }

    // Full LNURL text for manual entry
    if (voucher.lnurl && opts.paperWidth === 80) {
      b.emptyLines(1);
      b.align('center');
      b.font('B');
      b.line('LNURL (for manual entry):');
      b.font('A');
      b.emptyLines(1);

      // Print LNURL in chunks that fit the paper width
      const chunkSize = this.builder.charsPerLine - 2;
      for (let i = 0; i < voucher.lnurl.length; i += chunkSize) {
        b.line(voucher.lnurl.slice(i, i + chunkSize));
      }
      b.align('left');
    }

    // Footer
    this._buildFooter(opts, compact);

    if (opts.autoCut) {
      opts.partialCut ? b.partialCut() : b.cut();
    } else {
      b.feed(opts.feedLinesAfter);
    }

    return this;
  }

  /**
   * Get the built ESC/POS commands as Uint8Array
   * @returns {Uint8Array}
   */
  getBytes() {
    return this.builder.build();
  }

  /**
   * Get the built ESC/POS commands as Base64 string
   * Useful for deep links to companion app
   * @returns {string}
   */
  toBase64() {
    return this.builder.toBase64();
  }

  /**
   * Get the underlying ESCPOSBuilder for advanced customization
   * @returns {ESCPOSBuilder}
   */
  getBuilder() {
    return this.builder;
  }

  /**
   * Get the byte count of the built receipt
   * @returns {number}
   */
  get byteCount() {
    return this.builder.length;
  }

  /**
   * Create a new VoucherReceipt with the same options
   * @returns {VoucherReceipt}
   */
  clone() {
    return new VoucherReceipt(this.options);
  }
}

/**
 * Static factory methods for common receipt types
 */

/**
 * Create a standard voucher receipt
 * @param {object} voucher - Voucher data
 * @param {object} options - Receipt options
 * @returns {Uint8Array} ESC/POS command bytes
 */
VoucherReceipt.createStandard = function(voucher, options = {}) {
  return new VoucherReceipt(options).build(voucher).getBytes();
};

/**
 * Create a minimal voucher receipt
 * @param {object} voucher - Voucher data
 * @param {object} options - Receipt options
 * @returns {Uint8Array} ESC/POS command bytes
 */
VoucherReceipt.createMinimal = function(voucher, options = {}) {
  return new VoucherReceipt(options).buildMinimal(voucher).getBytes();
};

/**
 * Create a reissue voucher receipt
 * @param {object} voucher - Voucher data
 * @param {object} options - Receipt options
 * @returns {Uint8Array} ESC/POS command bytes
 */
VoucherReceipt.createReissue = function(voucher, options = {}) {
  return new VoucherReceipt(options).buildReissue(voucher).getBytes();
};

/**
 * Create receipt and return as Base64 for deep links
 * @param {object} voucher - Voucher data
 * @param {object} options - Receipt options
 * @returns {string} Base64 encoded ESC/POS commands
 */
VoucherReceipt.createBase64 = function(voucher, options = {}) {
  return new VoucherReceipt(options).build(voucher).toBase64();
};

export default VoucherReceipt;
export { DEFAULT_OPTIONS, formatVoucherSecret, formatExpiry, formatSats };
