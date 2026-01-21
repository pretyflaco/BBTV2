#!/usr/bin/env node
/**
 * Standalone ESC/POS Thermal Printer Test Script
 * 
 * Self-contained test that doesn't depend on ES modules.
 * 
 * Usage:
 *   node test-thermal-standalone.js [device] [test]
 * 
 * Examples:
 *   node test-thermal-standalone.js /dev/rfcomm0           # Run all tests
 *   node test-thermal-standalone.js /dev/rfcomm0 basic     # Basic text only
 *   node test-thermal-standalone.js /dev/rfcomm0 qr        # QR code only
 *   node test-thermal-standalone.js /dev/rfcomm0 voucher   # Voucher only
 */

const fs = require('fs');

// Default device
const device = process.argv[2] || '/dev/rfcomm0';
const testType = process.argv[3] || 'all';

// ESC/POS Commands
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

class SimpleESCPOS {
  constructor(paperWidth = 80) {
    this.buffer = [];
    this.charsPerLine = paperWidth === 58 ? 32 : 48;
  }

  // Add bytes to buffer
  raw(...bytes) {
    this.buffer.push(...bytes);
    return this;
  }

  // Initialize printer
  initialize() {
    return this.raw(ESC, 0x40); // ESC @
  }

  // Line feed
  feed(lines = 1) {
    for (let i = 0; i < lines; i++) {
      this.raw(LF);
    }
    return this;
  }

  // Set alignment: 'left', 'center', 'right'
  align(alignment) {
    const n = { left: 0, center: 1, right: 2 }[alignment] || 0;
    return this.raw(ESC, 0x61, n); // ESC a n
  }

  // Bold on/off
  bold(on) {
    return this.raw(ESC, 0x45, on ? 1 : 0); // ESC E n
  }

  // Text size multiplier (1-8 for width and height)
  textSize(width, height) {
    const n = ((width - 1) << 4) | (height - 1);
    return this.raw(GS, 0x21, n); // GS ! n
  }

  // Print text
  text(str) {
    const bytes = Buffer.from(str, 'utf8');
    this.buffer.push(...bytes);
    return this;
  }

  // Print line (text + line feed)
  line(str) {
    return this.text(str).feed(1);
  }

  // Empty lines
  emptyLines(count) {
    return this.feed(count);
  }

  // Separator line
  separator(char = '-') {
    return this.line(char.repeat(this.charsPerLine));
  }

  // Dashed line
  dashedLine() {
    return this.separator('-');
  }

  // Double line
  doubleLine() {
    return this.separator('=');
  }

  // Label: Value format
  labelValue(label, value, { labelWidth = 16 } = {}) {
    const valueWidth = this.charsPerLine - labelWidth;
    const paddedLabel = label.padEnd(labelWidth);
    const paddedValue = String(value).slice(0, valueWidth);
    return this.line(paddedLabel + paddedValue);
  }

  // Centered text with padding
  centered(str) {
    const padding = Math.max(0, Math.floor((this.charsPerLine - str.length) / 2));
    return this.line(' '.repeat(padding) + str);
  }

  // Print QR code (native command - Model 2)
  qrCode(data, { size = 6 } = {}) {
    const bytes = Buffer.from(data, 'utf8');
    const len = bytes.length + 3;
    const pL = len & 0xFF;
    const pH = (len >> 8) & 0xFF;

    // Select model 2
    this.raw(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    
    // Set size (1-16, typically 3-8)
    this.raw(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size);
    
    // Set error correction level (L=48, M=49, Q=50, H=51)
    this.raw(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31); // M level
    
    // Store data
    this.raw(GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);
    this.buffer.push(...bytes);
    
    // Print
    this.raw(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
    
    return this;
  }

  // Cut paper (partial cut)
  cut() {
    return this.raw(GS, 0x56, 0x01); // GS V 1
  }

  // Get buffer as Uint8Array
  build() {
    return new Uint8Array(this.buffer);
  }
}

// Test voucher data
const testVoucher = {
  lnurl: 'LNURL1DP68GURN8GHJ7MRWW4EXCTNXD9SHG6NPVCHXXMMD9AKXUATJDSKHW6T5DPJ8YCTH8AEK2UMND9HKU0FKVESNZWP3X5UNWWF5XSEK2DPEXGMNJV35XVMKYV35VVNXYVE3VDNRXV3JX5MXXW34V9SNVD33VYMNXC33VVEXGCE4XCU',
  satsAmount: 5000,
  displayAmount: 100,
  displayCurrency: 'KES',
  voucherSecret: 'q6pvY79EftnZ',
  identifierCode: 'A1B2C3D4',
  commissionPercent: 2,
  expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000),
  issuedBy: 'testuser',
};

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function formatSats(sats) {
  return sats.toLocaleString('en-US');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test functions
function buildBasicTest() {
  console.log('Building basic text test...');
  const basic = new SimpleESCPOS(80);
  basic
    .initialize()
    .align('center')
    .bold(true)
    .textSize(2, 2)
    .line('BLINK')
    .textSize(1, 1)
    .line('Bitcoin Lightning Voucher')
    .bold(false)
    .emptyLines(1)
    .dashedLine()
    .align('left')
    .labelValue('Status:', 'Working!')
    .labelValue('Date:', new Date().toLocaleDateString())
    .labelValue('Time:', new Date().toLocaleTimeString())
    .dashedLine()
    .emptyLines(1)
    .align('center')
    .line('Basic test complete')
    .feed(4);
  return basic.build();
}

function buildQRTest() {
  console.log('Building QR code test...');
  const qr = new SimpleESCPOS(80);
  qr
    .initialize()
    .align('center')
    .bold(true)
    .line('QR CODE TEST')
    .bold(false)
    .emptyLines(1)
    .qrCode('https://blink.sv', { size: 6 })
    .emptyLines(1)
    .line('Scan to visit Blink')
    .feed(4);
  return qr.build();
}

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

function buildVoucherTest() {
  console.log('Building voucher receipt (clean design)...');
  const labelWidth = 14;
  const voucher = new SimpleESCPOS(80);
  
  voucher
    .initialize()
    
    // ===== HEADER =====
    .align('center')
    .bold(true)
    .textSize(2, 2)
    .line('blink')
    .textSize(1, 1)
    .bold(false)
    .emptyLines(1)
    
    // ===== INFO SECTION =====
    .align('left')
    
    // Price (fiat) - only if we have one
    .labelValue('Price:', '$100.00', { labelWidth })
    .labelValue('Value:', `${formatSats(testVoucher.satsAmount)} sats`, { labelWidth })
    .labelValue('Identifier:', testVoucher.identifierCode, { labelWidth })
    .labelValue('Commission:', `${testVoucher.commissionPercent}%`, { labelWidth })
    .labelValue('Expires:', formatDate(testVoucher.expiresAt), { labelWidth })
    .labelValue('Issued by:', testVoucher.issuedBy, { labelWidth })
    .emptyLines(1)
    
    // ===== QR CODE =====
    .align('center')
    .qrCode(testVoucher.lnurl, { size: 8 })
    .emptyLines(1)
    
    // ===== VOUCHER SECRET =====
    .align('center')
    .line('voucher secret')
    .bold(true)
    .line(formatVoucherSecret(testVoucher.voucherSecret))
    .bold(false)
    .emptyLines(1)
    
    // ===== FOOTER =====
    .align('center')
    .line('voucher.blink.sv')
    .feed(4);
    
  return voucher.build();
}

async function runTests() {
  console.log('');
  console.log('ESC/POS Thermal Print Test');
  console.log('==========================');
  console.log(`Device: ${device}`);
  console.log(`Test:   ${testType}`);
  console.log('');

  // Check device
  if (!fs.existsSync(device)) {
    console.error(`Device not found: ${device}`);
    console.log('');
    console.log('Make sure your Bluetooth printer is paired and bound.');
    console.log('  bluetoothctl devices');
    console.log('  sudo rfcomm bind 0 <MAC_ADDRESS>');
    process.exit(1);
  }

  try {
    const tests = [];
    
    if (testType === 'all' || testType === 'basic') {
      tests.push({ name: 'Basic text', data: buildBasicTest() });
    }
    if (testType === 'all' || testType === 'qr') {
      tests.push({ name: 'QR code', data: buildQRTest() });
    }
    if (testType === 'all' || testType === 'voucher') {
      tests.push({ name: 'Voucher receipt', data: buildVoucherTest() });
    }

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      console.log(`[${i + 1}/${tests.length}] ${test.name}...`);
      fs.writeFileSync(device, Buffer.from(test.data));
      console.log(`    Sent ${test.data.length} bytes`);
      
      if (i < tests.length - 1) {
        await sleep(3000);
      }
    }

    console.log('');
    console.log('All tests complete! Check printer output.');

  } catch (error) {
    console.error('Error:', error.message);
    if (error.code === 'EACCES') {
      console.log('');
      console.log('Permission denied. Try:');
      console.log(`  sudo chmod 666 ${device}`);
    }
    process.exit(1);
  }
}

runTests();
