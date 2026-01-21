/**
 * LogoRasterizer - Converts logo images to 1-bit bitmaps for thermal printers
 * 
 * Thermal printers print in 1-bit (black/white) mode. This utility:
 * - Loads a logo image (PNG, SVG, etc.)
 * - Scales it to appropriate size for paper width
 * - Converts to 1-bit monochrome bitmap
 * - Returns ESC/POS compatible raster data
 * 
 * The resulting bitmap is cached to avoid re-processing on each print.
 */

// Cache for processed logo bitmaps
const logoCache = new Map();

/**
 * Configuration for different paper widths
 */
const PAPER_CONFIGS = {
  80: {
    maxLogoWidth: 384,    // ~67% of 576 dots, centered nicely
    maxLogoHeight: 120,   // Keep logo relatively compact
    dotsPerLine: 576,
  },
  58: {
    maxLogoWidth: 256,    // ~67% of 384 dots
    maxLogoHeight: 80,
    dotsPerLine: 384,
  },
};

/**
 * Load and process a logo image for thermal printing
 * 
 * @param {string} logoUrl - URL to the logo image (PNG, SVG, etc.)
 * @param {object} options - Processing options
 * @param {number} options.paperWidth - Paper width in mm (58 or 80)
 * @param {number} options.threshold - Black/white threshold (0-255, default 128)
 * @param {boolean} options.invert - Invert colors (default false)
 * @returns {Promise<{bitmap: Uint8Array, width: number, height: number, bytesPerRow: number}>}
 */
export async function loadLogoForPrint(logoUrl, options = {}) {
  const paperWidth = options.paperWidth || 80;
  const threshold = options.threshold || 128;
  const invert = options.invert || false;
  
  // Check cache
  const cacheKey = `${logoUrl}-${paperWidth}-${threshold}-${invert}`;
  if (logoCache.has(cacheKey)) {
    return logoCache.get(cacheKey);
  }
  
  // Get paper config
  const config = PAPER_CONFIGS[paperWidth] || PAPER_CONFIGS[80];
  
  // Load image
  const img = await loadImage(logoUrl);
  
  // Calculate scaled dimensions (maintain aspect ratio)
  const scale = Math.min(
    config.maxLogoWidth / img.width,
    config.maxLogoHeight / img.height,
    1 // Don't scale up
  );
  
  const scaledWidth = Math.floor(img.width * scale);
  const scaledHeight = Math.floor(img.height * scale);
  
  // Width must be multiple of 8 for ESC/POS
  const alignedWidth = Math.ceil(scaledWidth / 8) * 8;
  
  // Draw to canvas
  const canvas = createCanvas(alignedWidth, scaledHeight);
  const ctx = canvas.getContext('2d');
  
  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, alignedWidth, scaledHeight);
  
  // Center the logo horizontally
  const offsetX = Math.floor((alignedWidth - scaledWidth) / 2);
  ctx.drawImage(img, offsetX, 0, scaledWidth, scaledHeight);
  
  // Get pixel data
  const imageData = ctx.getImageData(0, 0, alignedWidth, scaledHeight);
  
  // Convert to 1-bit bitmap
  const result = convertTo1Bit(imageData, alignedWidth, scaledHeight, threshold, invert);
  
  // Cache the result
  logoCache.set(cacheKey, result);
  
  return result;
}

/**
 * Load an image from URL
 * @private
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    
    img.src = url;
  });
}

/**
 * Create a canvas element (browser) or canvas-like object
 * @private
 */
function createCanvas(width, height) {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  
  // For Node.js, would need node-canvas
  throw new Error('Canvas not available in this environment');
}

/**
 * Convert RGBA image data to 1-bit bitmap
 * @private
 */
function convertTo1Bit(imageData, width, height, threshold, invert) {
  const { data } = imageData;
  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = new Uint8Array(bytesPerRow * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * 4;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];
      const a = data[pixelIndex + 3];
      
      // Convert to grayscale (considering alpha)
      // For transparent pixels, treat as white (no print)
      let gray;
      if (a < 128) {
        gray = 255; // Transparent = white
      } else {
        gray = (r * 0.299 + g * 0.587 + b * 0.114);
      }
      
      // Apply threshold
      let isBlack = gray < threshold;
      if (invert) isBlack = !isBlack;
      
      // Set bit in bitmap (MSB is leftmost pixel)
      if (isBlack) {
        const byteIndex = y * bytesPerRow + Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);
        bitmap[byteIndex] |= (1 << bitIndex);
      }
    }
  }
  
  return {
    bitmap,
    width,
    height,
    bytesPerRow,
  };
}

/**
 * Pre-load and cache logo for faster printing
 * Call this during app initialization
 * 
 * @param {string} logoUrl - URL to the logo
 * @param {number[]} paperWidths - Paper widths to pre-cache (default: [58, 80])
 */
export async function preloadLogo(logoUrl, paperWidths = [58, 80]) {
  const promises = paperWidths.map(width => 
    loadLogoForPrint(logoUrl, { paperWidth: width }).catch(err => {
      console.warn(`[LogoRasterizer] Failed to preload logo for ${width}mm:`, err.message);
      return null;
    })
  );
  
  await Promise.all(promises);
}

/**
 * Clear the logo cache
 */
export function clearLogoCache() {
  logoCache.clear();
}

/**
 * Get the default Blink logo URL for printing
 * Uses the black version optimized for thermal printing
 */
export function getBlinkLogoUrl() {
  return '/blink-logo-black.svg';
}

/**
 * Generate ESC/POS raster image commands from bitmap data
 * 
 * @param {Uint8Array} bitmap - 1-bit bitmap data
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels  
 * @param {number} mode - Print mode (0=normal, 1=double width, 2=double height, 3=quad)
 * @returns {Uint8Array} ESC/POS command bytes
 */
export function bitmapToESCPOS(bitmap, width, height, mode = 0) {
  // GS v 0 - Print raster bit image
  // Format: GS v 0 m xL xH yL yH d1...dk
  const bytesPerLine = Math.ceil(width / 8);
  
  const xL = bytesPerLine & 0xFF;
  const xH = (bytesPerLine >> 8) & 0xFF;
  const yL = height & 0xFF;
  const yH = (height >> 8) & 0xFF;
  
  // Build command
  const header = new Uint8Array([0x1D, 0x76, 0x30, mode, xL, xH, yL, yH]);
  
  // Combine header and bitmap
  const result = new Uint8Array(header.length + bitmap.length);
  result.set(header, 0);
  result.set(bitmap, header.length);
  
  return result;
}

export default {
  loadLogoForPrint,
  preloadLogo,
  clearLogoCache,
  getBlinkLogoUrl,
  bitmapToESCPOS,
};
