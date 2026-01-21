/**
 * QRCodeRasterizer - Convert QR codes to 1-bit bitmaps for ESC/POS printers
 * 
 * Some cheap thermal printers don't support native QR code commands (GS ( k).
 * This module provides fallback by:
 * 1. Generating QR code as a matrix
 * 2. Converting to 1-bit raster bitmap
 * 3. Formatting for ESC/POS raster image command (GS v 0)
 * 
 * Uses the qrcode package for QR generation (isomorphic - works in browser & Node)
 * 
 * Design: No I/O dependencies - returns raw bitmap data ready for ESCPOSBuilder
 */

// QRCode library will be dynamically imported to avoid bundling issues
// in environments that don't need rasterization
let QRCodeLib = null;

/**
 * Dynamically load the qrcode library
 * @returns {Promise<object>} QRCode library
 */
async function getQRCodeLib() {
  if (QRCodeLib) return QRCodeLib;
  
  try {
    // Dynamic import for the qrcode package
    // This works in both Node.js and modern browsers with bundlers
    QRCodeLib = await import('qrcode');
    return QRCodeLib;
  } catch (e) {
    throw new Error(
      'QRCode library not available. Install with: npm install qrcode\n' +
      'Or use native QR printing (useNativeQR: true) if your printer supports it.'
    );
  }
}

/**
 * QR code error correction levels
 */
const ERROR_CORRECTION = {
  L: 'L', // 7% recovery
  M: 'M', // 15% recovery
  Q: 'Q', // 25% recovery
  H: 'H', // 30% recovery
};

/**
 * Default options for QR rasterization
 */
const DEFAULT_OPTIONS = {
  errorCorrection: 'M',
  moduleSize: 4,        // Pixels per QR module (minimum 2 for readability)
  margin: 2,            // Quiet zone in modules
  darkColor: true,      // true = print black modules
  maxWidth: 384,        // Maximum width in pixels (58mm paper)
};

/**
 * QRCodeRasterizer class
 */
class QRCodeRasterizer {
  /**
   * Create a QR code rasterizer
   * @param {object} options - Default options for all operations
   */
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Generate a QR code bitmap from data
   * 
   * @param {string} data - Data to encode (LNURL, URL, text)
   * @param {object} options - Override options
   * @returns {Promise<{bitmap: Uint8Array, width: number, height: number}>}
   */
  async generateBitmap(data, options = {}) {
    const opts = { ...this.options, ...options };
    
    // Get QR matrix
    const matrix = await this.generateMatrix(data, opts);
    
    // Calculate dimensions with scaling
    const moduleSize = opts.moduleSize;
    const margin = opts.margin * moduleSize;
    const qrSize = matrix.length * moduleSize;
    let width = qrSize + (margin * 2);
    let height = width; // QR codes are square

    // Enforce max width (scale down if needed)
    if (width > opts.maxWidth) {
      const scale = opts.maxWidth / width;
      const newModuleSize = Math.max(2, Math.floor(moduleSize * scale));
      return this.generateBitmap(data, { ...opts, moduleSize: newModuleSize });
    }

    // Ensure width is multiple of 8 for byte alignment
    const paddedWidth = Math.ceil(width / 8) * 8;
    const bytesPerRow = paddedWidth / 8;

    // Create 1-bit bitmap
    const bitmap = new Uint8Array(bytesPerRow * height);

    // Fill bitmap
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < paddedWidth; x++) {
        // Check if this pixel should be black
        let isBlack = false;

        // Calculate which QR module this pixel belongs to
        const qrX = Math.floor((x - margin) / moduleSize);
        const qrY = Math.floor((y - margin) / moduleSize);

        // Check if within QR code bounds and if module is dark
        if (
          qrX >= 0 && qrX < matrix.length &&
          qrY >= 0 && qrY < matrix.length &&
          x >= margin && x < margin + qrSize &&
          y >= margin && y < margin + qrSize
        ) {
          isBlack = matrix[qrY][qrX] === (opts.darkColor ? 1 : 0);
        }

        // Set bit in bitmap (MSB first)
        if (isBlack) {
          const byteIndex = y * bytesPerRow + Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);
          bitmap[byteIndex] |= (1 << bitIndex);
        }
      }
    }

    return {
      bitmap,
      width: paddedWidth,
      height,
      bytesPerRow,
      originalWidth: width,
      moduleSize: opts.moduleSize,
      qrModules: matrix.length,
    };
  }

  /**
   * Generate QR code matrix (array of arrays with 1=dark, 0=light)
   * 
   * @param {string} data - Data to encode
   * @param {object} options - QR options
   * @returns {Promise<number[][]>} 2D array of module values
   */
  async generateMatrix(data, options = {}) {
    const opts = { ...this.options, ...options };
    const QRCode = await getQRCodeLib();

    // Create QR code as array
    const qr = await QRCode.create(data, {
      errorCorrectionLevel: opts.errorCorrection,
    });

    // Convert to simple 2D matrix
    const size = qr.modules.size;
    const matrix = [];
    
    for (let y = 0; y < size; y++) {
      const row = [];
      for (let x = 0; x < size; x++) {
        row.push(qr.modules.get(x, y) ? 1 : 0);
      }
      matrix.push(row);
    }

    return matrix;
  }

  /**
   * Generate QR bitmap for a specific paper width
   * Auto-calculates optimal module size
   * 
   * @param {string} data - Data to encode
   * @param {number} paperWidth - Paper width in mm (58 or 80)
   * @param {object} options - Additional options
   * @returns {Promise<{bitmap: Uint8Array, width: number, height: number}>}
   */
  async generateForPaper(data, paperWidth = 80, options = {}) {
    // Calculate max width in dots (8 dots/mm standard, with margins)
    const maxDots = paperWidth === 58 ? 360 : 550; // Leave some margin

    // Get QR size to calculate optimal module size
    const matrix = await this.generateMatrix(data, options);
    const qrModules = matrix.length;
    
    // Calculate module size to fit paper
    // Account for 2 modules of quiet zone on each side
    const totalModules = qrModules + 4;
    let moduleSize = Math.floor(maxDots / totalModules);
    
    // Clamp module size
    moduleSize = Math.max(2, Math.min(8, moduleSize));

    return this.generateBitmap(data, {
      ...options,
      moduleSize,
      maxWidth: maxDots,
    });
  }

  /**
   * Generate QR code as ESC/POS raster command bytes
   * Ready to append to ESCPOSBuilder
   * 
   * @param {string} data - Data to encode
   * @param {object} options - Rasterization options
   * @returns {Promise<Uint8Array>} Complete GS v 0 command with image data
   */
  async generateRasterCommand(data, options = {}) {
    const { bitmap, width, height } = await this.generateBitmap(data, options);
    const bytesPerLine = Math.ceil(width / 8);

    // Build GS v 0 command
    // GS v 0 m xL xH yL yH d1...dk
    const command = new Uint8Array(8 + bitmap.length);
    command[0] = 0x1D; // GS
    command[1] = 0x76; // v
    command[2] = 0x30; // 0
    command[3] = 0x00; // m = 0 (normal density)
    command[4] = bytesPerLine & 0xFF; // xL
    command[5] = (bytesPerLine >> 8) & 0xFF; // xH
    command[6] = height & 0xFF; // yL
    command[7] = (height >> 8) & 0xFF; // yH
    command.set(bitmap, 8);

    return command;
  }

  /**
   * Check if QR rasterization is available
   * (qrcode library is installed)
   * 
   * @returns {Promise<boolean>}
   */
  static async isAvailable() {
    try {
      await getQRCodeLib();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Calculate estimated QR code size for given data
   * Useful for layout planning
   * 
   * @param {string} data - Data to encode
   * @param {object} options - Options
   * @returns {Promise<{modules: number, estimatedPixels: number}>}
   */
  async estimateSize(data, options = {}) {
    const opts = { ...this.options, ...options };
    const matrix = await this.generateMatrix(data, opts);
    const modules = matrix.length;
    const pixels = (modules + opts.margin * 2) * opts.moduleSize;

    return {
      modules,
      estimatedPixels: pixels,
      estimatedMm: Math.ceil(pixels / 8), // At 203 DPI (8 dots/mm)
    };
  }
}

/**
 * Utility: Convert Canvas ImageData to 1-bit bitmap for ESC/POS
 * Useful if you have a pre-rendered QR code image
 * 
 * @param {ImageData} imageData - Canvas ImageData
 * @param {number} threshold - Grayscale threshold (0-255, default 128)
 * @returns {{bitmap: Uint8Array, width: number, height: number}}
 */
function imageDataToBitmap(imageData, threshold = 128) {
  const { data, width, height } = imageData;
  const paddedWidth = Math.ceil(width / 8) * 8;
  const bytesPerRow = paddedWidth / 8;
  const bitmap = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      // Convert to grayscale and threshold
      const gray = (r + g + b) / 3;
      const isBlack = gray < threshold;

      if (isBlack) {
        const byteIndex = y * bytesPerRow + Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);
        bitmap[byteIndex] |= (1 << bitIndex);
      }
    }
  }

  return { bitmap, width: paddedWidth, height, bytesPerRow };
}

/**
 * Utility: Convert a simple boolean/number matrix to 1-bit bitmap
 * 
 * @param {(boolean|number)[][]} matrix - 2D array (truthy = black)
 * @param {number} scale - Scale factor per cell
 * @returns {{bitmap: Uint8Array, width: number, height: number}}
 */
function matrixToBitmap(matrix, scale = 1) {
  const srcHeight = matrix.length;
  const srcWidth = matrix[0]?.length || 0;
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  const paddedWidth = Math.ceil(width / 8) * 8;
  const bytesPerRow = paddedWidth / 8;
  const bitmap = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcY = Math.floor(y / scale);
      const srcX = Math.floor(x / scale);
      const isBlack = !!matrix[srcY]?.[srcX];

      if (isBlack) {
        const byteIndex = y * bytesPerRow + Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);
        bitmap[byteIndex] |= (1 << bitIndex);
      }
    }
  }

  return { bitmap, width: paddedWidth, height, bytesPerRow };
}

export default QRCodeRasterizer;
export {
  QRCodeRasterizer,
  imageDataToBitmap,
  matrixToBitmap,
  ERROR_CORRECTION,
  DEFAULT_OPTIONS,
};
